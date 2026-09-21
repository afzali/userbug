import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ریشهٔ مخزن.
 *
 * ── چرا «یک پوشه بالاتر از این فایل» کافی نبود ──
 *
 * وقتی رابط گرافیکی این ماژول را import می‌کند، SvelteKit آن را در
 * `ui/build/server/chunks/` باندل می‌کند. آن‌جا `import.meta.dirname` دیگر
 * `src/` نیست، پس ریشه به `ui/build/server` می‌افتاد و `.env` پیدا نمی‌شد —
 * یعنی رابط می‌گفت «کلید مدل نیست» در حالی که کلید سر جایش بود.
 *
 * پس ریشه *پیدا* می‌شود نه حدس زده: از محل این فایل و از پوشهٔ کاری بالا
 * می‌رویم تا `package.json` با نام `userbug` پیدا شود. برای CLI نتیجه دقیقاً
 * همان قبلی است. همین قاعده در `ui/src/lib/server/paths.js` هم هست.
 */
function findRoot() {
  if (process.env.USERBUG_ROOT) return path.resolve(process.env.USERBUG_ROOT);

  for (const start of [import.meta.dirname, process.cwd()]) {
    let current = path.resolve(start);
    while (true) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(current, 'package.json'), 'utf8'));
        if (pkg.name === 'userbug') return current;
      } catch {
        // این پوشه ریشه نیست؛ یکی بالاتر
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  // نبودِ package.json نباید import را بشکند؛ همان رفتار قبلی می‌ماند.
  return path.resolve(import.meta.dirname, '..');
}

export const ROOT = findRoot();

/**
 * ریشه، هر بار حساب‌شده.
 *
 * ── چرا در کنارِ `ROOT` و نه به‌جایش ──
 *
 * `ROOT` لحظهٔ import ثابت می‌شود. برای CLI و رابط درست است و ده‌ها جا از آن
 * استفاده می‌کنند. ولی یعنی `USERBUG_ROOT`ی که **بعد از** import تنظیم شود
 * بی‌اثر است — و همین یک بار در انبارِ شناخت به‌سختی معلوم شد: خودآزما ریشهٔ
 * موقت گذاشت و ابزار در پوشهٔ واقعیِ مخزن نوشت، بی‌آنکه چیزی بشکند.
 *
 * پس هر مسیری که **نوشتنی** است باید از این تابع بیاید، نه از ثابت. مسیرِ
 * خواندنیِ غلط یک خطای روشن می‌دهد؛ مسیرِ نوشتنیِ غلط، فایلِ کاربر را
 * خراب می‌کند.
 */
export function rootDir() {
  return process.env.USERBUG_ROOT ? path.resolve(process.env.USERBUG_ROOT) : ROOT;
}

/**
 * هدف، یا یک جانشینِ بی‌ضرر — فقط وقتی **هیچ** هدفی تعریف نشده.
 *
 * ── چرا لازم شد ──
 *
 * روی یک clone تازه، یا بعد از پاکسازیِ کامل، هیچ `targets/*.config.js`
 * نیست. سه نقطهٔ ورودیِ خودآزما (`playwright.config.js`، `global-setup` و
 * `fixtures`) همگی `loadTarget` صدا می‌زنند و همان‌جا می‌مردند — یعنی سیصد
 * آزمونِ خالص که ریشهٔ موقتِ خودشان را می‌سازند، به‌خاطر نبودِ فایلی بی‌ربط
 * اجرا نمی‌شدند.
 *
 * ── و چرا شرطش «هیچ هدفی نیست» است، نه «این هدف نیست» ──
 *
 * اگر هر نبودی جانشین می‌گرفت، `userbug run <غلطِ‌تایپی>` بی‌صدا روی یک
 * هدفِ خیالی اجرا می‌شد و سبز هم تمام می‌شد. پوشه‌ای که هدف دارد ولی این
 * یکی را ندارد، یعنی اشتباهِ تایپی — و آن باید بلند بشکند.
 */
export async function loadTargetOrPlaceholder(name) {
  try {
    return await loadTarget(name);
  } catch (cause) {
    if (cause?.code !== 'ERR_MODULE_NOT_FOUND') throw cause;

    const dir = path.join(rootDir(), 'targets');
    const defined = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((file) => file.endsWith('.config.js'))
      : [];
    if (defined.length) throw cause;

    return { name, baseURL: 'http://localhost:5173', environment: 'local', device: 'desktop' };
  }
}

/**
 * بسطِ `${VAR}` — تا کانفیگِ هدف به یک ماشین گره نخورد.
 *
 * ── چرا لازم شد ──
 *
 * مسیرِ لاگ و ریشهٔ سورس مطلق نوشته می‌شدند: `D:/Projects/nepi/...`. روی
 * ماشینِ دوم، روی CI، یا در بسته‌ای که هم‌تیمی باز می‌کند، همان کانفیگ
 * بی‌صدا به فایلی می‌رسد که نیست — و «لاگی نبود» شبیهِ «چیزی نشکست» است.
 *
 * مقدارها از `.env` می‌آیند که در گیت نیست و مالِ همان ماشین است. پس
 * کانفیگِ هدف قابلِ حمل می‌ماند و تفاوتِ ماشین‌ها یک‌جا جمع می‌شود.
 *
 * مسیرِ مطلق هم کار می‌کند؛ این بسط اختیاری است نه اجباری.
 */
function expandVars(value, targetName) {
  if (typeof value !== 'string') return value;

  return value.replace(/\$\{([A-Za-z0-9_]+)\}/g, (whole, key) => {
    const found = process.env[key];
    if (found === undefined) {
      throw new Error(
        `هدف «${targetName}»: «${whole}» در محیط نیست.\n` +
          `  یک خطِ «${key}=...» در .env بگذارید — آن فایل در گیت نیست و مالِ همین ماشین است.`,
      );
    }
    return found;
  });
}

/** نامِ فایلِ کانفیگ وقتی داخلِ خودِ پروژه زندگی می‌کند. */
export const PROJECT_CONFIG = path.join('tests', 'userbug', 'userbug.config.mjs');

/**
 * کانفیگِ پروژه، با بالا رفتن از پوشهٔ جاری.
 *
 * ── چرا داخلِ پروژه، و نه فقط `targets/` ──
 *
 * `targets/*.config.js` از دورانی مانده که userbug یک میزکارِ مرکزی بود و
 * چند پروژه را با هم می‌گرداند. با رفتنِ تست‌ها و شناخت به ریپوی اپ، آن
 * مدل نیمه‌کاره ماند: همه‌چیزِ پروژه آنجا بود جز آدرس و لاگش.
 *
 * حالا کانفیگ هم می‌تواند در خودِ پروژه باشد. آن‌وقت داخلِ پوشهٔ اپ، هیچ
 * نامی لازم نیست تایپ شود — `userbug test` می‌داند کجاست، مثل هر ابزارِ
 * دیگری که از `package.json` بالا می‌رود.
 *
 * `targets/` هم کار می‌کند و نمی‌شکند: پروژه‌های موجود دست نمی‌خورند.
 *
 * @param {string} [from] پوشهٔ شروع؛ پیش‌فرض `process.cwd()`
 * @returns {string} مسیرِ مطلق، یا رشتهٔ خالی
 */
export function findProjectConfig(from = process.cwd()) {
  let current = path.resolve(from);

  while (true) {
    const candidate = path.join(current, PROJECT_CONFIG);
    if (fs.existsSync(candidate)) return candidate;

    // خودِ پوشهٔ `tests/userbug` هم نقطهٔ شروعِ معتبری است
    if (path.basename(current) === 'userbug') {
      const inside = path.join(current, path.basename(PROJECT_CONFIG));
      if (fs.existsSync(inside)) return inside;
    }

    const parent = path.dirname(current);
    if (parent === current) return '';
    current = parent;
  }
}

/**
 * کانفیگ یک هدف را بخوان و پیش‌فرض‌های نبود را پر کن.
 *
 * بی نام، کانفیگِ پروژه‌ای که در آن ایستاده‌اید خوانده می‌شود.
 */
export async function loadTarget(name, { from } = {}) {
  const file = name
    ? path.join(rootDir(), 'targets', `${name}.config.js`)
    : findProjectConfig(from) ||
      (() => {
        throw Object.assign(
          new Error(
            'نه نامِ هدف دادید و نه در پروژه‌ای با کانفیگِ userbug ایستاده‌اید.\n' +
              `  در پوشهٔ اپتان یک بار: userbug setup`
          ),
          { code: 'ENOTARGET' }
        );
      })();
  const mod = await import(pathToFileURL(file).href);
  const t = mod.default;

  // `.env` همین‌جا بار می‌شود چون مقدارهای زیر ممکن است `${VAR}` داشته
  // باشند. ایمپورتِ پویا است تا حلقهٔ ایمپورت نسازد: `env.js` خودش `ROOT`
  // را از همین فایل می‌گیرد.
  const { loadEnv } = await import('./env.js');
  loadEnv();

  if (!t.baseURL) throw new Error(`هدف «${name}»: baseURL ندارد`);

  t.baseURL = expandVars(t.baseURL, name);
  if (t.apiURL) t.apiURL = expandVars(t.apiURL, name);
  if (t.source?.root) t.source = { ...t.source, root: expandVars(t.source.root, name) };

  // نبودِ environment یعنی نمی‌دانیم — پس محافظه‌کارانه تولیدی فرض می‌شود.
  t.environment ??= 'production';
  t.device ??= 'desktop';
  t.allowlist ??= [];
  t.logs ??= [];
  t.logs = t.logs.map((log) => ({ ...log, path: expandVars(log.path, name) }));
  // نبودِ isolation یعنی «هیچ» — نه «ثبت‌نام تازه». این مقدار در `run.json`
  // می‌نشیند و گزارش می‌شود، پس ادعای جداسازی‌ای که وجود ندارد، خواننده را
  // گمراه می‌کند. هدفِ جعبه‌سیاه دقیقاً همین حالت است.
  t.isolation ??= { mode: 'none' };

  /**
   * کلید — شناسه‌ای که شناخت و اجراها زیرش ذخیره می‌شوند.
   *
   * با نام، همان نام. بی نام (کانفیگِ داخلِ پروژه)، از خودِ کانفیگ یا از
   * نامِ پوشهٔ پروژه. ثابت بودنش مهم است: عوض شدنش یعنی شناختِ جمع‌شده
   * یتیم می‌شود.
   */
  t.key = name || t.key || t.name || path.basename(path.resolve(path.dirname(file), '..', '..'));

  /**
   * کانفیگِ داخلِ پروژه، ریشهٔ سورس را خودش می‌داند.
   *
   * `tests/userbug/userbug.config.js` دو پوشه پایین‌ترِ ریشهٔ پروژه است.
   * نوشتنِ دوبارهٔ آن در کانفیگ، جایی است که می‌تواند غلط شود.
   */
  if (!name) {
    const projectRoot = path.resolve(path.dirname(file), '..', '..');
    t.source = { root: projectRoot, ...(t.source || {}) };
    t.workspace ??= path.dirname(file);
  }

  return t;
}

/**
 * دروازهٔ ایمنی اینجا نیست — در `src/guard.js` است.
 *
 * یک بار همین تصمیم دو جا نوشته شده بود: `mayRunDestructiveHooks` اینجا و
 * `isSafeEnvironment` آنجا. دومی به‌کار می‌رفت و اولی کدِ مرده بود. دو منبعِ
 * حقیقت برای یک تصمیمِ ایمنی، دیر یا زود واگرا می‌شوند و آن‌وقت کسی نمی‌داند
 * کدام معتبر است. پس فقط یکی ماند.
 */
