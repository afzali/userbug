/**
 * خواندنِ محصورِ سورس پروژهٔ تحت تست.
 *
 * ── چرا این فایل با بقیه فرق دارد ──
 *
 * بقیهٔ ابزار با اپِ در حال اجرا کار می‌کند. این یکی با **دیسکِ کاربر** کار
 * می‌کند و محتوایش را به یک مدلِ بیرونی می‌فرستد. پس اینجا تنها جایی است که
 * پیش‌فرض باید «نه» باشد و هر «بله» صریح نوشته شود.
 *
 * چهار قاعده که هیچ‌کدام اختیاری نیستند:
 *
 *   ۱. **بدون اعلام، خبری نیست.** پروژه‌ای که `source: { root }` ندارد، سورسش
 *      خوانده نمی‌شود. نبودِ کلید یعنی «اجازه نداده‌ام».
 *   ۲. **فقط خواندن.** هیچ تابعی در این فایل نمی‌نویسد.
 *   ۳. **بیرون از ریشه، هرگز.** هم مسیرِ درخواستی و هم مقصدِ واقعیِ پیوندهای
 *      نمادین بررسی می‌شوند. `..` و symlink هر دو راه فرارند.
 *   ۴. **فایلِ رازدار خوانده نمی‌شود.** `.env` و کلیدها حتی اگر داخل ریشه
 *      باشند رد می‌شوند، چون این محتوا به مدل می‌رود.
 *
 * ── چرا محصورسازیِ رابط بازاستفاده نشد ──
 *
 * `ui/src/lib/server/paths.js` محصور به ریشهٔ خودِ userbug است و باید هم بماند:
 * آن یکی دربارهٔ فایل‌های خودِ ابزار است. این یکی ریشه‌اش از کانفیگِ هدف می‌آید
 * و برای هر پروژه فرق می‌کند. یکی کردنشان یعنی یک باگ در آن یکی، سورسِ پروژهٔ
 * کاربر را هم باز می‌کرد.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';

/** فایل‌هایی که خواندنشان معنا دارد. بقیه (تصویر، فونت، باینری) رد می‌شوند. */
export const SOURCE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.svelte', '.vue', '.html', '.htm',
  '.css', '.scss', '.less',
  '.php', '.py', '.rb', '.go', '.java', '.cs',
  '.json', '.yml', '.yaml', '.toml',
  '.md', '.txt', '.sql',
]);

/**
 * پوشه‌هایی که پیمایش نمی‌شوند.
 *
 * `node_modules` تنها دلیلش حجم نیست: سورسِ وابستگی‌ها دربارهٔ اپ چیزی
 * نمی‌گوید و فقط بودجهٔ مدل را می‌خورد.
 */
export const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg',
  'build', 'dist', 'out', 'target', 'vendor',
  '.svelte-kit', '.next', '.nuxt', '.cache', '.turbo', '.vite',
  'coverage', '__pycache__', '.venv', 'venv',
  'android', 'ios', 'test-results', 'playwright-report',
]);

/**
 * چیزهایی که هرگز خوانده نمی‌شوند.
 *
 * این فهرست دربارهٔ حجم نیست، دربارهٔ راز است. محتوای این فایل‌ها به یک سرویسِ
 * بیرونی می‌رفت و پس گرفتنش ممکن نبود.
 */
export const SECRET_PATTERNS = [
  /(^|[/\\])\.env($|\.)/i,
  /(^|[/\\])(id_rsa|id_dsa|id_ecdsa|id_ed25519)($|\.)/i,
  /\.(pem|key|pfx|p12|jks|keystore|ppk)$/i,
  /(^|[/\\])(credentials|secrets?|htpasswd)([./\\]|$)/i,
  /(^|[/\\])\.npmrc$/i,
  /(^|[/\\])\.netrc$/i,
  /(^|[/\\])\.git-credentials$/i,
];

/** سقف اندازهٔ یک فایل. بزرگ‌تر از این، احتمالاً داده است نه کد. */
const MAX_FILE_BYTES = 400_000;
/** سقف تعداد فایلی که پیمایش می‌شود. جلوگیری از پیمایشِ بی‌پایانِ یک درختِ عظیم. */
const MAX_WALK_FILES = 4000;

export function isSecretPath(relative) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(String(relative)));
}

function comparable(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function assertInside(root, candidate) {
  const rootKey = comparable(root);
  const candidateKey = comparable(candidate);
  if (candidateKey !== rootKey && !candidateKey.startsWith(rootKey + path.sep)) {
    throw new Error('مسیر بیرون از پوشهٔ سورس پروژه است');
  }
}

/**
 * ریشهٔ سورس یک هدف، اگر اعلام شده باشد.
 *
 * `realpath` می‌شود تا بعداً مقایسه‌ها روی مسیرِ واقعی باشد نه روی پیوند.
 *
 * @param {{name?: string, key?: string, source?: {root?: string}}} target
 */
export async function resolveSourceRoot(target) {
  const declared = target?.source?.root;
  if (!declared) {
    throw new Error(
      `هدف «${target?.key || target?.name || '؟'}» کلید source.root ندارد.\n` +
        '  خواندن سورس فقط با اعلامِ صریح در کانفیگ همان پروژه ممکن است.'
    );
  }

  let real;
  try {
    real = await fsp.realpath(path.resolve(declared));
  } catch {
    throw new Error(`پوشهٔ سورس پیدا نشد: ${declared}`);
  }

  const stat = await fsp.stat(real);
  if (!stat.isDirectory()) throw new Error(`source.root پوشه نیست: ${declared}`);
  return real;
}

/**
 * فهرست فایل‌های سورس، به‌شکل مسیرِ نسبی با اسلش رو به جلو.
 *
 * پیوندهای نمادین دنبال نمی‌شوند: یک symlink به `C:\Users` کلِ محصورسازی را
 * بی‌معنا می‌کرد.
 */
export async function listSourceFiles(root, { limit = MAX_WALK_FILES } = {}) {
  const files = [];

  async function walk(dir) {
    if (files.length >= limit) return;

    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return; // پوشهٔ بی‌اجازه، اجرا را نمی‌شکند
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= limit) return;
      if (entry.name.startsWith('.') && entry.isDirectory()) continue;
      if (entry.isSymbolicLink()) continue;

      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full);
      } else if (entry.isFile()) {
        const relative = path.relative(root, full).split(path.sep).join('/');
        if (!SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
        if (isSecretPath(relative)) continue;
        files.push(relative);
      }
    }
  }

  await walk(root);
  return files;
}

/**
 * محتوای یک فایل سورس.
 *
 * @param {string} root ریشهٔ خروجیِ `resolveSourceRoot`
 * @param {string} relative مسیر نسبی
 */
export async function readSourceFile(root, relative, { maxBytes = MAX_FILE_BYTES } = {}) {
  const text = String(relative || '').replace(/\\/g, '/');
  if (!text || text.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('مسیر فایل سورس نامعتبر است');
  }
  if (isSecretPath(text)) throw new Error(`این فایل خوانده نمی‌شود چون ممکن است راز داشته باشد: ${text}`);
  if (!SOURCE_EXTENSIONS.has(path.extname(text).toLowerCase())) {
    throw new Error(`پسوند این فایل خواندنی نیست: ${text}`);
  }

  const candidate = path.resolve(root, text);
  assertInside(root, candidate);

  // پیوند نمادین می‌تواند داخلِ ریشه باشد ولی به بیرون اشاره کند، پس مقصدِ
  // واقعی هم بررسی می‌شود.
  const real = await fsp.realpath(candidate);
  assertInside(root, real);

  const stat = await fsp.stat(real);
  if (!stat.isFile()) throw new Error('مسیر، فایل نیست');
  if (stat.size > maxBytes) throw new Error(`فایل بزرگ‌تر از ${maxBytes} بایت است: ${text}`);

  return { relative: text, bytes: stat.size, content: await fsp.readFile(real, 'utf8') };
}

/**
 * نیم‌فاصله برداشته می‌شود تا «یادداشت‌ها» و «یادداشتها» یکی شمرده شوند.
 *
 * بدون این، تطبیقِ فارسی به شکلِ تایپِ کاربر بند بود: همان واژه با و بدون
 * نیم‌فاصله دو رشتهٔ مختلف است.
 */
function normalize(value) {
  return String(value ?? '').replace(/\u200c/g, '');
}

/** واژه‌های معنادارِ متن. کوتاه‌ها و واژه‌های پرتکرارِ فارسی کنار می‌روند. */
const STOP_WORDS = new Set([
  'که', 'این', 'آن', 'برای', 'باید', 'شود', 'است', 'های', 'کن', 'کند', 'کرد',
  'بعد', 'سپس', 'یک', 'می', 'را', 'با', 'از', 'به', 'در', 'and', 'the', 'for',
  'then', 'should', 'must', 'with', 'from', 'into',
]);

export function keywords(text) {
  const words = normalize(text)
    .split(/[^\p{L}\p{N}_]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  return [...new Set(words)].slice(0, 25);
}

/**
 * وزنِ یک فایل، پیش از دیدنِ محتوایش.
 *
 * دنبالِ **برچسب‌هایی که کاربر روی صفحه می‌بیند** هستیم، و آن‌ها در قالب‌های
 * رابط زندگی می‌کنند. بدون این وزن، نخستین اجرای واقعی روی نپی
 * `docs/CODE-AUDIT.md` و `src/lib/db/database.js` را انتخاب کرد — فایل‌هایی که
 * واژه‌ها را زیاد داشتند ولی یک برچسبِ قابل کلیک در آن‌ها نبود.
 */
function fileWeight(relative) {
  const lower = relative.toLowerCase();
  if (/\.(test|spec)\.[jt]sx?$/.test(lower) || lower.includes('__tests__')) return 0.15;
  if (lower.endsWith('.md') || lower.startsWith('docs/')) return 0.2;
  if (/\.(svelte|vue|html?|jsx|tsx)$/.test(lower)) return 2;
  if (lower.includes('/routes/') || lower.includes('/components/') || lower.includes('/pages/')) return 1.5;
  return 1;
}

/**
 * تکه‌های مرتبطِ سورس برای دادن به مدل.
 *
 * ── چرا جست‌وجوی واژه‌ای و نه چیزی هوشمندتر ──
 *
 * برچسب‌های دیده‌شده روی صفحه، در سورس هم رشتهٔ فارسی‌اند. پس واژه‌های خودِ
 * کاربر («یادداشت»، «ذخیره») مستقیم در فایل پیدا می‌شوند. جست‌وجوی برداری
 * دقیق‌تر بود ولی به یک ایندکس و یک فراخوانی دیگر مدل نیاز داشت — برای چیزی که
 * قرار است هزینه را کم کند.
 *
 * @returns {Promise<{files: string[], tree: string[], snippets: string, matched: number}>}
 */
export async function findRelevantSource({
  root,
  text,
  budget = 6000,
  maxFiles = 4,
  treeLimit = 60,
} = {}) {
  const words = keywords(text);
  const all = await listSourceFiles(root);
  if (!words.length) return { files: [], tree: [], snippets: '', matched: 0, scanned: all.length };

  const scored = [];
  for (const relative of all) {
    const weight = fileWeight(relative);
    let content;
    try {
      ({ content } = await readSourceFile(root, relative));
    } catch {
      continue; // بزرگ، بی‌اجازه، یا رازدار — همه رد می‌شوند
    }

    const lines = content.split(/\r?\n/);
    const hits = [];
    const distinct = new Set();

    lines.forEach((line, index) => {
      const normalized = normalize(line);
      const found = words.filter((word) => normalized.includes(word));
      if (!found.length) return;
      for (const word of found) distinct.add(word);
      hits.push({ index, found: found.length });
    });

    if (!distinct.size) continue;

    /**
     * پوشش، نه تکرار.
     *
     * فایلی که چهار واژهٔ مختلف را دارد بر فایلی که یک واژه را چهل بار دارد
     * می‌چربد. پیش‌تر جمعِ ساده بود و فایل‌های بزرگِ پرتکرار برنده می‌شدند.
     */
    scored.push({
      relative,
      score: distinct.size * weight + Math.min(hits.length, 10) * 0.05 * weight,
      lines,
      hits,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.relative.localeCompare(b.relative));
  const chosen = scored.slice(0, maxFiles);

  // سقفِ هر فایل، تا یک فایلِ شلوغ کلِ بودجه را نخورد و بقیه جا بمانند.
  const perFile = Math.max(600, Math.floor(budget / Math.max(1, chosen.length)));
  const parts = [];
  let used = 0;

  for (const file of chosen) {
    const wanted = new Set();
    for (const hit of file.hits.slice(0, 8)) {
      for (let i = Math.max(0, hit.index - 2); i <= Math.min(file.lines.length - 1, hit.index + 2); i++) {
        wanted.add(i);
      }
    }

    const body = [];
    let previous = -2;
    let size = 0;
    for (const index of [...wanted].sort((a, b) => a - b)) {
      const line = `    ${index + 1}: ${file.lines[index].slice(0, 200)}`;
      if (size + line.length > perFile) break;
      if (index !== previous + 1) body.push('    …');
      body.push(line);
      size += line.length;
      previous = index;
    }
    if (!body.length) continue;

    const block = `# ${file.relative}\n${body.join('\n')}`;
    if (used + block.length > budget) break;
    parts.push(block);
    used += block.length;
  }

  /**
   * درخت هم فیلتر می‌شود.
   *
   * فرستادنِ ۷۷۱ مسیر بیشترش نویز بود و بودجهٔ مدل را می‌خورد. فقط مسیرهایی
   * می‌روند که خودشان واژه‌ای از متن دارند، یا صفحهٔ روت‌اند — همان چیزی که
   * برای ساختنِ `go:` لازم است.
   */
  const tree = all
    .filter((relative) => {
      const lower = normalize(relative).toLowerCase();
      if (/(^|\/)(\+page\.svelte|index\.(html|js|jsx|tsx|vue|php))$/.test(lower)) return true;
      return words.some((word) => lower.includes(normalize(word).toLowerCase()));
    })
    .slice(0, treeLimit);

  return {
    files: chosen.map((file) => file.relative),
    tree,
    snippets: parts.join('\n\n'),
    matched: scored.length,
    scanned: all.length,
  };
}
