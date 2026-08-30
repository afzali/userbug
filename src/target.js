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

/** کانفیگ یک هدف را بخوان و پیش‌فرض‌های نبود را پر کن. */
export async function loadTarget(name) {
  const file = path.join(ROOT, 'targets', `${name}.config.js`);
  const mod = await import(pathToFileURL(file).href);
  const t = mod.default;

  if (!t.baseURL) throw new Error(`هدف «${name}»: baseURL ندارد`);

  // نبودِ environment یعنی نمی‌دانیم — پس محافظه‌کارانه تولیدی فرض می‌شود.
  t.environment ??= 'production';
  t.device ??= 'desktop';
  t.allowlist ??= [];
  t.logs ??= [];
  // نبودِ isolation یعنی «هیچ» — نه «ثبت‌نام تازه». این مقدار در `run.json`
  // می‌نشیند و گزارش می‌شود، پس ادعای جداسازی‌ای که وجود ندارد، خواننده را
  // گمراه می‌کند. هدفِ جعبه‌سیاه دقیقاً همین حالت است.
  t.isolation ??= { mode: 'none' };
  t.key = name;
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
