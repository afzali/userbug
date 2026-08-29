/**
 * نپیِ تولیدی — فقط خواندنی.
 *
 * ── چرا این فایل وجود دارد ──
 *
 * دروازهٔ ایمنی (قانون ۸) تا وقتی امتحان نشده باشد، فقط یک ادعاست. این هدف
 * عمداً `environment: 'production'` دارد تا خودآزمای دروازه بتواند ثابت کند
 * کارِ نویسنده روی آن رد می‌شود.
 *
 * هیچ سناریوی معمولی این هدف را نمی‌گیرد؛ فقط با `UB_TARGET=nepi-prod` صدا
 * زده می‌شود.
 *
 * توجه: قلاب ریست عمداً ندارد و نباید بگیرد.
 */
export default {
  name: 'nepi-prod',
  baseURL: 'https://nepi.ir',
  apiURL: 'https://nepi.ir/api',

  environment: 'production',
  device: 'desktop',
  locale: 'fa',
  dir: 'rtl',

  logs: [],
  allowlist: [/favicon/i],
};
