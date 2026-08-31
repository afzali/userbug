/**
 * ماسک کردن مقادیر حساس پیش از رفتن به مدل.
 *
 * ── چرا این باید پیش از ساخت prompt باشد، نه بعدش ──
 *
 * ریگ با رمزهای تست کار می‌کند و متنِ صفحه را برای مدل می‌فرستد. هر رمزی که
 * در یک فیلد نشسته باشد، در همان snapshot می‌آید و در transcript ارائه‌دهنده
 * می‌ماند — جایی که ما دیگر کنترلی رویش نداریم.
 *
 * پس ماسک در لحظهٔ ساختِ prompt انجام می‌شود و مقادیر واقعی هرگز از این مرز
 * رد نمی‌شوند.
 */

/** الگوهایی که همیشه ماسک می‌شوند، حتی اگر کسی صریح نگفته باشد. */
const ALWAYS = [
  { rx: /\bsk-[A-Za-z0-9_-]{16,}\b/g, as: '<api-key>' },
  { rx: /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, as: 'Bearer <token>' },
  { rx: /\beyJ[A-Za-z0-9._-]{20,}\b/g, as: '<jwt>' },
];

/**
 * @param {string} text
 * @param {string[]} secrets مقادیر مشخصِ همین اجرا — رمز، توکن، کد بازیابی
 */
export function redact(text, secrets = []) {
  let out = String(text ?? '');

  // اول مقادیر مشخص. بلندترها اول، وگرنه ماسکِ یک رشتهٔ کوتاه‌تر ممکن است
  // وسط رشتهٔ بلندتر بیفتد و بقیه‌اش لو برود.
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
    out = out.split(secret).join('<حذف‌شده>');
  }

  for (const { rx, as } of ALWAYS) out = out.replace(rx, as);
  return out;
}

/** همان کار روی هر ساختار — snapshot صفحه شیء است نه رشته. */
export function redactDeep(value, secrets = []) {
  if (typeof value === 'string') return redact(value, secrets);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, secrets));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v, secrets)]));
  }
  return value;
}

/**
 * مقادیری که در هر اجرا حساس‌اند.
 *
 * ── چرا حساب‌های ذخیره‌شده هم باید بیایند ──
 *
 * تا امروز فقط `identity` وجود داشت: یک کاربرِ تصادفی که خودمان ساخته بودیم.
 * حالا کاربر می‌تواند حسابِ **واقعیِ خودش** را ثبت کند، و آن رمز اگر ماسک
 * نشود در نخستین snapshot به مدل می‌رود و در transcript ارائه‌دهنده می‌ماند —
 * جایی که دیگر پس گرفتنش ممکن نیست.
 *
 * فراخوانی با یک آرایهٔ دوم انجام می‌شود نه با خواندنِ مستقیم از دیسک: این
 * ماژول باید خالص بماند و در هر بستری (از جمله خودآزما) قابل استفاده باشد.
 *
 * @param {object} identity هویتِ همین اجرا
 * @param {string[]} [extra] رازهای دیگر — مثلاً خروجی `accountSecrets()`
 */
export function secretsOf(identity, extra = []) {
  return [identity?.password, identity?.email, ...extra].filter(Boolean);
}
