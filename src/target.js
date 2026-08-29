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
  t.isolation ??= { mode: 'fresh-signup' };
  t.key = name;
  return t;
}

/**
 * آیا قلاب مخرب روی این هدف مجاز است؟
 *
 * قلاب‌های shell و http می‌توانند دیتابیس پاک کنند. یک اشتباه تایپی در آدرس
 * نباید به دادهٔ واقعی برسد، پس پیش‌فرضِ ندانستن، «نه» است.
 */
export function mayRunDestructiveHooks(target) {
  return target.environment === 'local' || target.environment === 'staging';
}
