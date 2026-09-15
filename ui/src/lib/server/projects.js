import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import YAML from 'yaml';
import { countExpects } from '../../../../src/scenario/expect.js';
import {
  ROOT,
  RUNS_DIR,
  SCENARIOS_DIR,
  TARGETS_DIR,
  TRIAGE_DIR,
  assertSafeSegment,
  ensureWritableInside,
  existingDirectoryInside,
  existingFileInside,
} from './paths.js';

const execFileAsync = promisify(execFile);
const SCENARIO_EXTENSIONS = ['.yml', '.yaml', '.js'];

async function walk(dir, base = dir) {
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (cause) {
    if (cause?.code === 'ENOENT') return [];
    throw cause;
  }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'fa'))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full, base)));
    } else if (entry.isFile()) {
      files.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return files;
}

/**
 * تنظیماتِ واقعیِ پروژه، با `import` نه با regex.
 *
 * ── چرا regex کافی نبود ──
 *
 * خواندنِ متنِ فایل با الگو فقط رشته‌های تک‌خطیِ داخل کوتیشن را می‌گیرد. یعنی
 * `apiURL` و `logs` و `source` اصلاً دیده نمی‌شدند، و اگر کسی `baseURL` را
 * با بک‌تیک یا متغیر می‌نوشت، رابط خالی نشانش می‌داد **بدون هیچ خطایی** —
 * همان شکستِ خاموشی که این ابزار برای گرفتنش ساخته شده.
 *
 * حالا همان `loadTarget` موتور صدا زده می‌شود: یک منبعِ حقیقت، و پیش‌فرض‌ها
 * دقیقاً همان‌هایی‌اند که هنگام اجرا اعمال می‌شوند. فایل خراب هم خطا
 * برمی‌گرداند، که از فهرستِ خالی خیلی بهتر است.
 */
async function projectSettings(key) {
  try {
    const { loadTarget } = await import('../../../../src/target.js');
    const target = await loadTarget(key);
    return {
      ok: true,
      name: target.name || key,
      baseURL: target.baseURL || '',
      apiURL: target.apiURL || '',
      environment: target.environment,
      device: target.device,
      locale: target.locale || '',
      dir: target.dir || '',
      logs: (target.logs || []).map((log) => ({
        name: log.name || log.type || 'log',
        path: log.path || log.url || '',
      })),
      sourceRoot: target.source?.root || target.source?.roots?.[0]?.path || '',
      sourceRoots: (target.source?.roots || []).map((item) => ({
        name: item?.name || '',
        path: item?.path || item?.root || '',
      })),
      isolation: target.isolation?.mode || '',
      allowlist: (target.allowlist || []).length,
      hasStateProbe: Boolean(target.state?.sql),
      exploreAvoid: (target.explore?.avoid || []).length,
    };
  } catch (cause) {
    return { ok: false, error: cause.message };
  }
}

function sourceField(source, field) {
  const match = source.match(new RegExp(`\\b${field}\\s*:\\s*['\"]([^'\"]+)['\"]`));
  return match?.[1] || '';
}

/**
 * `source: { root: '…' }` از متنِ کانفیگ.
 *
 * الگو عمداً به بلوکِ `source` بسته است و نه هر `root:`ی در فایل. ریشهٔ اشتباه
 * یعنی محصورسازی روی پوشهٔ اشتباه بسته می‌شود — و این تنها جایی است که ابزار
 * بیرون از مخزن خودش می‌خواند.
 */
function sourceRootField(source) {
  return source.match(/\bsource\s*:\s*\{[^}]*\broot\s*:\s*['"]([^'"]+)['"]/)?.[1] || '';
}

async function scenarioMetadata(directory, relative) {
  const { file } = await existingFileInside(directory, relative);
  const source = await fsp.readFile(file, 'utf8');
  const extension = path.extname(relative).toLowerCase();
  if (extension === '.yml' || extension === '.yaml') {
    try {
      const doc = YAML.parse(source);
      const status = String(doc?.status || (relative.startsWith('_drafts/') ? 'draft' : 'approved'));
      return {
        path: relative,
        kind: 'yaml',
        name: String(doc?.name || relative),
        status,
        runnable: status !== 'draft' && Boolean(doc?.name) && Array.isArray(doc?.steps),
        /**
         * «واقعاً اجرا می‌شود» ≠ «رگرسیون شمرده می‌شود».
         *
         * ── چرا این دو از هم جدا شدند ──
         *
         * `runnable` پیش‌نویس را کنار می‌گذارد، و درست هم هست: پیش‌نویس
         * تأیید نشده و نباید معیارِ سلامت باشد. ولی `yaml.spec.js`
         * اجرایش **می‌کند** و فقط در عنوان علامتش می‌زند.
         *
         * تا امروز فرقی نداشت. با آمدنِ انتخابِ چندتایی فرق کرد: فهرستِ
         * تیک‌ها از `runnable` ساخته شد و پروژه‌ای که همهٔ سناریوهایش
         * پیش‌نویس بودند، «سناریوی اجراشدنی‌ای نیست» نشان داد — در حالی که
         * دکمهٔ «شروع اجرا» همان‌ها را می‌برد.
         *
         * ── و چرا زیرپوشه بیرون است ──
         *
         * `loadScenarios` فقط ریشهٔ پوشه را می‌خواند، نه بازگشتی. پس
         * `_drafts/` و `_quests/` در فهرستِ فایل‌ها دیده می‌شوند ولی
         * اجراگر هرگز به آن‌ها نمی‌رسد. تیک زدنشان یعنی اجرایی با «۰ تست»
         * که سبز تمام می‌شود — بدترین نوعِ شکست.
         */
        executable: Boolean(doc?.name) && Array.isArray(doc?.steps) && !relative.includes('/'),
        persona: String(doc?.persona || 'novice'),
        steps: Array.isArray(doc?.steps) ? doc.steps.length : 0,
        /**
         * چند بندِ سنجش دارد — و چرا این عدد مهم است.
         *
         * سناریوی بی‌انتظار اجرا می‌شود، سبز تمام می‌شود، و **هیچ‌چیز را
         * نسنجیده**: فقط می‌گوید «چیزی نشکست». تا وقتی این عدد جایی دیده
         * نشود، فرقِ آن با سناریویی که واقعاً چیزی را تضمین می‌کند از هیچ
         * فهرستی معلوم نیست.
         */
        expects: countExpects(doc?.steps),
      };
    } catch (cause) {
      return {
        path: relative,
        kind: 'yaml',
        name: relative,
        status: 'invalid',
        runnable: false,
        executable: false,
        persona: '',
        steps: 0,
        error: cause.message,
      };
    }
  }
  const title = source.match(/\b(?:test|scenario)\s*\(\s*['"`]([^'"`]+)/)?.[1];
  return {
    path: relative,
    kind: 'javascript',
    name: title || relative,
    status: 'approved',
    runnable: relative.toLowerCase().endsWith('.spec.js') && Boolean(title),
    executable: relative.toLowerCase().endsWith('.spec.js') && Boolean(title) && !relative.includes('/'),
    persona: '',
    steps: null,
  };
}

export async function listScenarios(target) {
  const key = assertSafeSegment(target, 'هدف');
  let directory;
  try {
    ({ dir: directory } = await existingDirectoryInside(SCENARIOS_DIR, key));
  } catch (cause) {
    if (cause?.code === 'ENOENT') return [];
    throw cause;
  }

  const files = (await walk(directory)).filter((relative) => {
    const lower = relative.toLowerCase();
    return SCENARIO_EXTENSIONS.some((extension) => lower.endsWith(extension));
  });
  return Promise.all(files.map((relative) => scenarioMetadata(directory, relative)));
}

export async function listProjects() {
  let entries = [];
  try {
    entries = await fsp.readdir(TARGETS_DIR, { withFileTypes: true });
  } catch (cause) {
    if (cause?.code === 'ENOENT') return [];
    throw cause;
  }

  const projects = [];
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith('.config.js')).sort((a, b) => a.name.localeCompare(b.name))) {
    const key = entry.name.replace(/\.config\.js$/, '');
    const source = await fsp.readFile(path.join(TARGETS_DIR, entry.name), 'utf8');
    const scenarios = await listScenarios(key);
    // regex فقط سقفِ سقوط است: اگر کانفیگ import نشود، دست‌کم چیزی نشان بدهیم.
    const settings = await projectSettings(key);
    projects.push({
      key,
      name: settings.ok ? settings.name : sourceField(source, 'name') || key,
      baseURL: settings.ok ? settings.baseURL : sourceField(source, 'baseURL'),
      environment: settings.ok ? settings.environment : sourceField(source, 'environment') || 'production',
      device: settings.ok ? settings.device : sourceField(source, 'device') || 'desktop',
      sourceRoot: settings.ok ? settings.sourceRoot : sourceRootField(source),
      configFile: entry.name,
      settings,
      scenarios,
    });
  }
  return projects;
}

function assertScenarioPath(relative) {
  const normalized = String(relative || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('مسیر سناریو نامعتبر است');
  }
  const lower = normalized.toLowerCase();
  if (!SCENARIO_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
    throw new Error('فقط فایل YAML یا JavaScript سناریو قابل ویرایش است');
  }
  return normalized;
}

export async function readProjectFile({ kind, target, relative }) {
  const key = assertSafeSegment(target, 'هدف');
  if (kind === 'target') {
    const name = `${key}.config.js`;
    const { file } = await existingFileInside(TARGETS_DIR, name);
    return { kind, target: key, relative: name, content: await fsp.readFile(file, 'utf8') };
  }
  if (kind === 'scenario') {
    const safeRelative = assertScenarioPath(relative);
    const { file } = await existingFileInside(SCENARIOS_DIR, key, safeRelative);
    return { kind, target: key, relative: safeRelative, content: await fsp.readFile(file, 'utf8') };
  }
  throw new Error('نوع فایل نامعتبر است');
}

async function validateJavaScript(file, targetConfig) {
  await execFileAsync(process.execPath, ['--check', file], { cwd: ROOT, windowsHide: true, timeout: 15_000 });
  if (!targetConfig) return;
  /**
   * سورس هم همین‌جا سنجیده می‌شود، نه بعداً.
   *
   * ── چرا لازم شد ──
   *
   * نخستین کاربری که فرمِ «دو پوشهٔ جدا» را پر کرد، `D:/Projects/nepi` و
   * `D:/Projects/nepi/nepi-server` را داد — که تودرتوست. کانفیگ **با موفقیت
   * ذخیره شد**، در فهرست ظاهر شد، «سورس دارد» نشان داد، و تازه وقتی چیزی
   * می‌خواست کد را بخواند می‌شکست.
   *
   * این بدترین جنسِ خرابی است: کاربر فکر می‌کند کار کرده و ساعت‌ها بعد
   * می‌فهمد نکرده. اعتبارسنجی باید نزدیک‌ترین جا به اشتباه بایستد.
   *
   * در زیرپروسه انجام می‌شود چون کانفیگ کدِ کاربر است و نباید در پروسهٔ
   * رابط اجرا شود — همان دلیلی که این تابع از اول زیرپروسه داشت.
   */
  const check = [
    "import { pathToFileURL } from 'node:url';",
    "import { resolveSourceRoots, declaredRoots } from " +
      JSON.stringify(pathToFileURL(path.join(ROOT, 'src', 'source-access.js')).href) +
      ';',
    'const mod = await import(pathToFileURL(process.argv[1]).href + `?check=${Date.now()}`);',
    "if (!mod.default || !mod.default.baseURL) throw new Error('default export با baseURL لازم است');",
    'if (declaredRoots(mod.default).length) await resolveSourceRoots(mod.default);',
  ].join(' ');
  await execFileAsync(process.execPath, ['--input-type=module', '-e', check, file], {
    cwd: ROOT,
    windowsHide: true,
    timeout: 15_000,
  });
}

async function validateScenarioYaml(file) {
  const source = await fsp.readFile(file, 'utf8');
  const doc = YAML.parse(source);
  if (!doc || typeof doc !== 'object') throw new Error('سند YAML باید object باشد');
  if (!doc.name) throw new Error('سناریو «name» ندارد');
  if (!Array.isArray(doc.steps)) throw new Error('سناریو «steps» معتبر ندارد');
}

function fileExistsError(kind) {
  const error = new Error(`${kind === 'target' ? 'پروژه' : 'سناریو'} از قبل وجود دارد`);
  error.code = 'FILE_EXISTS';
  error.status = 409;
  return error;
}


/**
 * رسمی کردنِ یک پیش‌نویس.
 *
 * ── چرا یک دکمه لازم بود ──
 *
 * پیش‌نویس دو چیز دارد که نمی‌گذارد اجرا شود، و هر دو باید با هم عوض شوند:
 *
 *   ۱. `status: draft` — تا هست، رگرسیون شمرده نمی‌شود
 *   ۲. جایش در `_drafts/` — زیرپوشه است و `loadScenarios` نمی‌بیندش
 *
 * کاربر می‌توانست وضعیت را دستی عوض کند و «ذخیره» بزند، ولی فایل همان‌جا
 * می‌ماند و هیچ‌وقت اجرا نمی‌شد — بدترین حالت: کاری که به نظر انجام شده و
 * نشده. پس هر دو با هم انجام می‌شوند یا هیچ‌کدام.
 *
 * فایل تازه با `wx` نوشته می‌شود، پس اگر نامی با همان عنوان از قبل باشد،
 * چیزی بازنویسی نمی‌شود.
 */
export async function promoteScenario({ target, relative }) {
  const key = assertSafeSegment(target, "هدف");
  const safeRelative = assertScenarioPath(relative);

  const { file } = await existingFileInside(SCENARIOS_DIR, key, safeRelative);
  const source = await fsp.readFile(file, "utf8");

  const doc = YAML.parse(source);
  if (!doc || typeof doc !== "object") throw new Error("این فایل سناریوی معتبری نیست");

  // فقط همین یک کلید عوض می‌شود؛ بقیهٔ فایل — کامنت‌ها هم — دست‌نخورده می‌ماند.
  const promoted = /^status:\s*\S+\s*$/m.test(source)
    ? source.replace(/^status:\s*\S+\s*$/m, "status: approved")
    : `status: approved${eolOf(source)}${source}`;


  // پیشوندِ «[پیش‌نویس]» هم می‌رود: همین نام است که در فهرست اجرا و در
  // گزارش دیده می‌شود، و سناریوی رسمی نباید پیش‌نویس صدا زده شود.
  const named = promoted.replace(
    /^(name:\s*["']?)\s*\[پیش‌نویس\]\s*/m,
    "$1"
  );

  const targetRelative = safeRelative.replace(/^_drafts\//, "");
  if (targetRelative === safeRelative && doc.status !== "draft") {
    throw new Error("این سناریو از قبل رسمی است");
  }

  const destination = await ensureWritableInside(SCENARIOS_DIR, key, targetRelative);
  if (destination !== file) {
    await fsp.writeFile(destination, named, { encoding: "utf8", flag: "wx" });
    await fsp.rm(file, { force: true });
  } else {
    await fsp.writeFile(destination, named, "utf8");
  }

  return { relative: targetRelative, movedFrom: destination === file ? null : safeRelative };
}

/** پایان‌خطِ همان فایل، تا سطر تازه با بقیه هم‌شکل باشد. */
function eolOf(source) {
  return source.includes("\r\n") ? "\r\n" : "\n";
}

export async function writeProjectFile({ kind, target, relative, content, createOnly = false }) {
  const key = assertSafeSegment(target, 'هدف');
  const source = String(content ?? '');
  if (Buffer.byteLength(source, 'utf8') > 2_000_000) throw new Error('فایل بیش از حد بزرگ است');

  let file;
  let scenario = false;
  if (kind === 'target') {
    file = await ensureWritableInside(TARGETS_DIR, `${key}.config.js`);
  } else if (kind === 'scenario') {
    scenario = true;
    const safeRelative = assertScenarioPath(relative);
    file = await ensureWritableInside(SCENARIOS_DIR, key, safeRelative);
  } else {
    throw new Error('نوع فایل نامعتبر است');
  }

  const extension = path.extname(file);
  const temporary = path.join(
    path.dirname(file),
    `${path.basename(file, extension)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp${extension}`
  );
  await fsp.writeFile(temporary, source, { encoding: 'utf8', flag: 'wx' });
  try {
    if (file.endsWith('.yml') || file.endsWith('.yaml')) await validateScenarioYaml(temporary);
    else await validateJavaScript(temporary, !scenario);

    if (createOnly === true) {
      try {
        await fsp.link(temporary, file);
      } catch (cause) {
        if (cause?.code === 'EEXIST') throw fileExistsError(kind);
        throw cause;
      }
    } else {
      await fsp.rename(temporary, file);
    }
  } finally {
    await fsp.rm(temporary, { force: true }).catch(() => {});
  }
  return { kind, target: key, relative: kind === 'target' ? `${key}.config.js` : assertScenarioPath(relative), savedAt: new Date().toISOString() };
}

/**
 * کلید `source` به شکلی که موتور می‌فهمد.
 *
 * رابط پروژه را به‌شکل تخت نگه می‌دارد (`sourceRoot`، `sourceRoots`) چون
 * فرم‌ها با ساختار تخت راحت‌ترند. موتور ولی همان شکلِ کانفیگ را می‌خواهد.
 * تبدیل یک جا انجام می‌شود تا سه فراخوان‌کننده سه‌جور نسازندش.
 */
export function sourceOf(project) {
  if (project?.sourceRoots?.length > 1) return { roots: project.sourceRoots };
  const root = project?.sourceRoots?.[0]?.path || project?.sourceRoot || '';
  return root ? { root } : {};
}

/**
 * هرچه از یک پروژه روی دیسک هست.
 *
 * ── چرا پیش از حذف، شمرده می‌شود ──
 *
 * حذفِ کانفیگ به‌تنهایی ساده است و غلط: سناریوها، پروندهٔ شناخت، اجراها و
 * زمان‌بندی سرِ جایشان می‌مانند و پروژه‌ای که «حذف شده» با همان کلید دوباره
 * ساخته می‌شود و ناگهان تاریخچهٔ یک پروژهٔ دیگر را دارد.
 *
 * و حذفِ همه‌چیز بی‌آنکه گفته شود هم غلط است. اجراها و پروندهٔ شناخت ساعت‌ها
 * کار آدم و مدل‌اند. پس اول شمرده می‌شود، کاربر می‌بیند، بعد تصمیم می‌گیرد.
 */
export async function projectFootprint(key) {
  const target = assertSafeSegment(key);

  const count = async (dir) => {
    let total = 0;
    const walk = async (current) => {
      let entries;
      try {
        entries = await fsp.readdir(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) await walk(path.join(current, entry.name));
        else total += 1;
      }
    };
    await walk(dir);
    return total;
  };

  const exists = async (file) => {
    try {
      await fsp.stat(file);
      return true;
    } catch {
      return false;
    }
  };

  /** اجراهای همین هدف. نامِ پوشه هدف را دارد، ولی تکیه بر نام کافی نیست. */
  const runs = [];
  let names = [];
  try {
    names = await fsp.readdir(RUNS_DIR);
  } catch {
    names = [];
  }
  for (const name of names) {
    const meta = await readJsonOrNull(path.join(RUNS_DIR, name, 'run.json'));
    if (meta?.target === target) runs.push(name);
  }

  return {
    target,
    config: await exists(path.join(TARGETS_DIR, `${target}.config.js`)),
    scenarios: await count(path.join(SCENARIOS_DIR, target)),
    knowledge: await count(path.join(ROOT, 'knowledge', target)),
    runs: runs.length,
    runDirs: runs,
    triage: await exists(path.join(TRIAGE_DIR, `${target}.json`)),
    schedule: await exists(path.join(ROOT, 'schedules', `${target}.json`)),
    findings: await exists(path.join(ROOT, 'findings', `${target}.md`)),
  };
}

async function readJsonOrNull(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * حذف پروژه.
 *
 * @param {string} key کلید پروژه
 * @param {{keepHistory?: boolean}} [options] `keepHistory` اجراها و تریاژ و
 *   یافته‌ها را نگه می‌دارد — برای وقتی که فقط تعریفِ پروژه غلط بوده.
 */
export async function deleteProject(key, { keepHistory = false } = {}) {
  const footprint = await projectFootprint(key);
  const target = footprint.target;
  if (!footprint.config) throw new Error(`پروژهٔ «${target}» وجود ندارد`);

  const removed = [];

  /**
   * فقط چیزی که واقعاً بود، گزارش می‌شود.
   *
   * `fs.rm` با `force` روی مسیرِ ناموجود هم موفق برمی‌گردد. نسخهٔ اول همین
   * را «حذف شد» می‌شمرد و گزارش می‌گفت «زمان‌بندی حذف شد» برای پروژه‌ای که
   * هیچ‌وقت زمان‌بندی نداشت.
   *
   * ضرری نداشت و دقیقاً همان چیزی است که این ابزار برای گرفتنش ساخته شده:
   * گزارشی که راست به نظر می‌رسد و نیست. اگر اینجا اهمیت ندهیم، جای دیگر
   * هم نمی‌دهیم.
   */
  const drop = async (file, label) => {
    let existed = true;
    try {
      await fsp.stat(file);
    } catch {
      existed = false;
    }
    if (!existed) return;

    try {
      await fsp.rm(file, { recursive: true, force: true });
      removed.push(label);
    } catch (cause) {
      throw new Error(`${label} حذف نشد: ${cause.message}`);
    }
  };

  /**
   * کانفیگ آخر از همه حذف می‌شود.
   *
   * اگر وسطِ کار چیزی بشکند، پروژه هنوز در فهرست هست و کاربر می‌بیند که
   * ناقص مانده. برعکسش یعنی پروژه ناپدید می‌شود و بقایایش نامرئی می‌ماند —
   * و همان بقایا با کلیدِ تکراری بعداً برمی‌گردند.
   */
  await drop(path.join(SCENARIOS_DIR, target), 'سناریوها');
  await drop(path.join(ROOT, 'knowledge', target), 'شناخت');
  await drop(path.join(ROOT, 'schedules', `${target}.json`), 'زمان‌بندی');
  await drop(path.join(ROOT, 'schedules', `${target}.cmd`), 'راه‌انداز زمان‌بندی');
  await drop(path.join(ROOT, 'schedules', `${target}.log`), 'لاگ زمان‌بندی');

  if (!keepHistory) {
    for (const name of footprint.runDirs) {
      await fsp.rm(path.join(RUNS_DIR, name), { recursive: true, force: true });
    }
    if (footprint.runDirs.length) removed.push(`${footprint.runDirs.length} اجرا`);
    await drop(path.join(TRIAGE_DIR, `${target}.json`), 'تریاژ');
    await drop(path.join(ROOT, 'findings', `${target}.md`), 'یافته‌ها');
  }

  await drop(path.join(TARGETS_DIR, `${target}.config.js`), 'کانفیگ پروژه');

  return { target, removed, keptHistory: keepHistory };
}
