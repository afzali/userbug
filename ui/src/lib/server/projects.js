import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import YAML from 'yaml';
import {
  ROOT,
  SCENARIOS_DIR,
  TARGETS_DIR,
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
      sourceRoot: target.source?.root || '',
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
        persona: String(doc?.persona || 'novice'),
        steps: Array.isArray(doc?.steps) ? doc.steps.length : 0,
      };
    } catch (cause) {
      return {
        path: relative,
        kind: 'yaml',
        name: relative,
        status: 'invalid',
        runnable: false,
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
  const check = [
    "import { pathToFileURL } from 'node:url';",
    'const mod = await import(pathToFileURL(process.argv[1]).href + `?check=${Date.now()}`);',
    "if (!mod.default || !mod.default.baseURL) throw new Error('default export با baseURL لازم است');",
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
