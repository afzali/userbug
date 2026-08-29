/**
 * هدف: نپی — اپ وب، توسعه لوکال.
 *
 * هیچ دستور بالاآوردنی اینجا نیست. ابزار فقط آدرس و دسترسی می‌گیرد؛ اینکه
 * سرور توسعه چطور بالا آمده، مسئلهٔ خودِ پروژه است.
 */
export default {
  name: 'nepi',
  baseURL: 'http://localhost:5173',

  // سرور واقعی نپی، لوکال روی SQLite. راه‌اندازی: پیکربندی `nepi-api-local`
  // در `.claude/launch.json` نپی.
  apiURL: 'http://127.0.0.1:8081',

  // دروازهٔ ایمنی. قلاب مخرب فقط روی local و staging اجرا می‌شود.
  environment: 'local',

  // از فهرست دستگاه‌های Playwright. 'desktop' یعنی بدون emulation.
  device: 'desktop',

  locale: 'fa',
  dir: 'rtl',

  /**
   * لاگ سرور.
   *
   * ثبت‌نام و بازیابی رمزِ نپی کاملاً سمت کلاینت است و به این سرور کاری ندارد.
   * ولی سناریوهایی که مستقیم API را می‌زنند (فعل `request`) هم هستند، و
   * همان‌ها بودند که نخستین باگ سمت سرور را بیرون کشیدند.
   */
  logs: [
    { type: 'file', name: 'php', path: 'D:/Projects/nepi/nepi-data/php-error.log' },
  ],

  /**
   * فضای شخصی.
   *
   * ثبت‌نام نپی باز است و هر اجرا کاربر تازهٔ خودش را می‌سازد، پس ریست
   * دیتابیس لازم نیست. قلاب مرورگری هم هست چون نپی service worker و OPFS
   * دارد و context تازهٔ Playwright به‌تنهایی پاکشان نمی‌کند.
   */
  isolation: {
    mode: 'both',
    identity: { strategy: 'fresh-signup' },
    reset: {
      beforeScenario: [
        { type: 'browser', clear: ['cookies', 'localStorage', 'indexedDB', 'cache', 'serviceWorker'] },
      ],
    },

    /**
     * خاموش کردنِ مزاحمی که یافته‌اش ثبت شده.
     *
     * پنجرهٔ «محافظت از داده‌ها» دیرهنگام و در زمانی نامعلوم می‌آید و کلیک را
     * می‌گیرد — یافتهٔ ۱ در `findings/nepi.md`. تا وقتی در نپی درست نشده، هر
     * سناریوی دیگری را هم ناپایدار می‌کند و یافته‌های تازه زیر نویزش گم
     * می‌شوند. پس یک بار ثبتش کردیم و اینجا خاموشش می‌کنیم.
     *
     * اگر روزی یافتهٔ ۱ رفع شد، این کلید باید برداشته شود.
     */
    seed: {
      localStorage: {
        nepi_storage_permission_dismissed: 'true',

      // اپ را به سرور لوکال وصل کن، نه به nepi.ir. بدون این، سناریوهای
      // همگام‌سازی به محیط تولیدی می‌خوردند — چیزی که قانون ۸ اجازه‌اش را
      // نمی‌دهد.
      'nepi:sync-base-url:v1': 'http://127.0.0.1:8081',
      },
    },
  },

  /**
   * خطاهایی که نباید قدم را قرمز کنند.
   *
   * این فهرست باید کوتاه بماند و هر خطش دلیل داشته باشد. allowlist بلند یعنی
   * داریم مشکل را زیر فرش می‌کنیم.
   */
  allowlist: [
    /favicon/i,
    /Download the (React|Svelte) DevTools/i,
    // ویت در حالت توسعه فایل‌های خام را با 404 می‌آزماید
    /\[vite\] connecting/i,
  ],

  source: { root: 'D:/Projects/nepi' },
};
