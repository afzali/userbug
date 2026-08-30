import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');

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
