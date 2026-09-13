/**
 * هدف: تست نپی
 *
 * از فرمِ «پروژهٔ تازه» ساخته شده. هیچ دستور بالاآوردنی اینجا نیست: ابزار
 * فقط آدرس و دسترسی می‌گیرد، و اینکه سرورها چطور بالا می‌آیند مسئلهٔ خودِ
 * پروژه است.
 */
export default {
  name: 'تست نپی',
  baseURL: 'http://localhost:5173',

  // فعل `request` سناریو به این آدرس می‌خورد.
  apiURL: 'http://127.0.0.1:8081',

  /**
   * دروازهٔ ایمنی (قانون ۸).
   *
   * قلاب مخرب، درخواستِ نویسنده و SQL نویسنده فقط روی local و staging
   * اجرا می‌شوند. نبودِ این کلید یعنی production فرض می‌شود.
   */
  environment: 'local',

  // از فهرست دستگاه‌های Playwright. 'desktop' یعنی بدون emulation.
  device: 'desktop',

  locale: 'fa',
  dir: 'rtl',

  /**
   * لاگ سرور.
   *
   * خطاهای کنسول مرورگر خودکار گرفته می‌شوند و مسیر نمی‌خواهند؛ این فهرست
   * برای لاگ‌هایی است که سرور روی دیسک می‌نویسد. فقط `type: 'file'`
   * پشتیبانی می‌شود.
   */
  logs: [
    { type: 'file', name: 'front', path: 'D:/Projects/nepi/nepi-data/nepi.log' },
    { type: 'file', name: 'api', path: 'D:/Projects/nepi/nepi-data/api.log' },
    { type: 'file', name: 'back', path: 'D:/Projects/nepi/nepi-data/php-error.log' },
  ],

  /**
   * فضای شخصی هر اجرا.
   *
   * `mode: 'browser'` یعنی پیش از هر سناریو، حالتِ مرورگر پاک می‌شود ولی
   * دادهٔ سرور دست نمی‌خورد. اگر ثبت‌نام پروژه باز است، `identity` را روشن
   * کنید تا هر اجرا کاربر تازهٔ خودش را بسازد و اجراها به هم کار نداشته
   * باشند.
   */
  isolation: {
    mode: 'browser',
    reset: {
      beforeScenario: [
        { type: 'browser', clear: ['cookies', 'localStorage', 'indexedDB', 'cache'] },
      ],
    },
    // identity: { strategy: 'fresh-signup' },
  },

  /**
   * خطاهایی که نباید قدم را قرمز کنند.
   *
   * کوتاه بماند و هر خطش دلیل داشته باشد. allowlist بلند یعنی داریم مشکل
   * را زیر فرش می‌کنیم.
   */
  allowlist: [
    /favicon/i,
  ],

  // پوشهٔ سورس پروژه — برای وقتی که مدل باید کد را بخواند.
  source: { root: 'D:/Projects/nepi/' },
};
