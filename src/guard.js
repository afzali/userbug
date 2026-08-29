/**
 * دروازهٔ ایمنی — قانون ۸.
 *
 * ── چرا این فایل تا امروز لازم نبود و حالا هست ──
 *
 * تا وقتی ابزار فقط مرورگر را می‌راند، بدترین کارِ ممکن روی یک هدفِ اشتباه،
 * ساختن چند حساب زائد بود. با آمدنِ فعل `request` و قلاب‌های `shell`، حالا
 * می‌شود با یک اشتباه تایپی در `apiURL` روی دادهٔ واقعیِ کاربران نوشت.
 *
 * پس هر کارِ نویسنده از اینجا رد می‌شود، و پیش‌فرضِ ندانستن «نه» است:
 * هدفی که `environment` اعلام نکرده، تولیدی فرض می‌شود.
 */

const SAFE = new Set(['local', 'staging']);
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isSafeEnvironment(target) {
  return SAFE.has(target?.environment);
}

/**
 * آیا این کارِ نویسنده مجاز است؟ اگر نه، با پیام روشن می‌شکند.
 *
 * @param {object} target
 * @param {string} what توصیف کاری که می‌خواست انجام شود — در پیام خطا می‌آید
 */
export function assertMayMutate(target, what) {
  if (isSafeEnvironment(target)) return;

  throw new Error(
    `${what} روی هدف «${target.name}» رد شد.\n` +
      `  محیط: ${target.environment}\n` +
      `  کارِ نویسنده فقط روی local و staging مجاز است.\n` +
      `  اگر این هدف واقعاً محیط توسعه است، environment را در کانفیگش تصحیح کنید.`
  );
}

/** درخواست HTTP: خواندن همیشه آزاد است، نوشتن نه. */
export function assertMayRequest(target, method, path) {
  if (READ_ONLY_METHODS.has(String(method).toUpperCase())) return;
  assertMayMutate(target, `درخواست ${method} به ${path}`);
}
