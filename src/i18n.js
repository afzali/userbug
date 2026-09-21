/**
 * زبانِ خروجیِ ترمینال.
 *
 * ── چرا لازم شد ──
 *
 * `cmd.exe` فارسی را جدا و وارونه نشان می‌دهد، حتی با `chcp 65001`. این
 * نقصِ کنسولِ قدیمیِ ویندوز است و از داخلِ برنامه درست‌شدنی نیست: bidi را
 * اصلاً پیاده نکرده. راهنمایی که خوانده نشود راهنمایی نیست.
 *
 * همین قاعده از قبل در این مخزن بود — `scripts/serve.mjs` نوشته بود
 * «متنِ چاپ‌شده اینجا انگلیسی است… چون در پنجرهٔ cmd.exe دیده می‌شود و
 * آنجا فارسی درست نمایش داده نمی‌شود». حالا همان تصمیم برای کلِ CLI.
 *
 * ── چه چیزی ترجمه می‌شود و چه چیزی نه ──
 *
 * **پوستهٔ ابزار** ترجمه می‌شود: راهنما، برچسب‌ها، پیام‌ها. این متنِ ماست.
 *
 * **محتوای کاربر** هرگز: نامِ صفحه‌ای که خودتان نوشتید، یادداشتتان، عنوانِ
 * تست. آن حرفِ شماست و دست نمی‌خورد — حتی اگر ترمینال بدنمایشش دهد، شما
 * می‌دانید چه نوشته‌اید.
 */

/**
 * ترمینال bidi می‌فهمد؟
 *
 * `WT_SESSION` را فقط Windows Terminal می‌گذارد — سیگنالِ قابلِ اعتمادی
 * است و حدس نیست. کنسولِ قدیمی چنین متغیری ندارد.
 *
 * غیرِ ویندوز فرض می‌شود درست است: ترمینال‌های لینوکس و مک bidi دارند.
 */
export function terminalHandlesRTL() {
  if (process.platform !== 'win32') return true;
  return Boolean(process.env.WT_SESSION);
}

/**
 * زبانِ انتخاب‌شده.
 *
 * ترتیب عمدی است: خواستهٔ صریحِ کاربر، بعد توانِ ترمینال.
 *
 * @returns {'fa'|'en'}
 */
export function lang() {
  const asked = String(process.env.UB_LANG || '').trim().toLowerCase();
  if (asked === 'fa' || asked === 'en') return asked;
  return terminalHandlesRTL() ? 'fa' : 'en';
}

/**
 * انتخاب بین دو متن.
 *
 * @param {string} fa
 * @param {string} en
 * @returns {string}
 */
export function pick(fa, en) {
  return lang() === 'fa' ? fa : en;
}

/**
 * یادآوری، یک بار در هر اجرا.
 *
 * وقتی به انگلیسی افتاده‌ایم، کاربر باید بداند چرا و چطور برش گرداند —
 * وگرنه فکر می‌کند ابزار فارسی بلد نیست.
 */
let warned = false;
export function noteLanguageFallback() {
  if (warned || lang() === 'fa' || process.env.UB_LANG) return;
  warned = true;

  console.log('');
  console.log('  Output is English: this console does not render right-to-left text.');
  console.log('  Windows Terminal does. To force Persian anyway: set UB_LANG=fa');
}
