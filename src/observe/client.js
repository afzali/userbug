/**
 * رصد کلاینت.
 *
 * هرچه مرورگر می‌داند و کاربر نمی‌بیند: خطای جاوااسکریپت، promise رهاشده،
 * console.error، درخواست شکست‌خورده و پاسخ ۴xx/۵xx.
 *
 * همه به یک شکل بیرون می‌آیند تا داور لازم نباشد بداند رخداد از کجا آمده.
 */

/**
 * اسکریپتی که پیش از کد اپ اجرا می‌شود.
 *
 * `unhandledrejection` رویدادی است که Playwright به‌طور مستقیم نمی‌دهد؛
 * `page.on('pageerror')` فقط استثناهای پرتاب‌شده را می‌گیرد. بدون این، هر
 * promise رهاشده‌ای بی‌صدا رد می‌شد — و دقیقاً همان‌جاست که باگ‌های async
 * پنهان می‌شوند.
 */
export const INIT_SCRIPT = () => {
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    const text = r?.stack || r?.message || String(r);
    console.error('[unhandledrejection] ' + text);
  });
};

/**
 * @param {import('@playwright/test').Page} page
 * @param {(event: object) => void} sink مقصد رخدادها
 * @param {object} [opts]
 * @param {(d: import('@playwright/test').Dialog) => Promise<boolean>} [opts.onDialog]
 *   اگر `true` برگرداند یعنی خودش پنجره را بست؛ وگرنه dismiss می‌شود.
 * @param {(call: {method: string, url: string, status: number}) => void} [opts.onCall]
 *   هر تماسِ API که **موفق** بود. جدا از `sink` است چون یافته نیست.
 */
export function attachClientObservers(page, sink, { onDialog, onCall } = {}) {
  page.on('console', (m) => {
    const type = m.type();
    if (type !== 'error' && type !== 'warning') return;
    sink({
      source: 'console',
      severity: type === 'error' ? 'error' : 'warn',
      message: m.text(),
      location: m.location(),
    });
  });

  page.on('pageerror', (e) => {
    sink({
      source: 'pageerror',
      severity: 'error',
      message: e.message,
      stack: e.stack,
    });
  });

  page.on('requestfailed', (r) => {
    const failure = r.failure()?.errorText || '';
    // لغو شدن درخواست هنگام ناوبری، خطا نیست
    if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(failure)) return;
    sink({
      source: 'network',
      severity: 'error',
      message: `${failure} — ${r.method()} ${r.url()}`,
      url: r.url(),
    });
  });

  page.on('response', (r) => {
    const status = r.status();

    /**
     * تماسِ **موفق** هم ثبت می‌شود — ولی به‌عنوان فکت، نه یافته.
     *
     * ── چرا این خط تا امروز نبود ──
     *
     * `if (status < 400) return` یعنی هر پاسخِ سالم دور ریخته می‌شد. منطقی
     * به نظر می‌رسید («خطا نیست، پس خبری نیست») ولی دقیقاً همان‌ها ثابت
     * می‌کنند **کجا را آزموده‌ایم**. پوشش یک تفریق است و این نیمه‌اش گم بود:
     * روی نپی ۲۱ endpointِ بک‌اند داریم و هیچ راهی نبود بفهمیم کدامشان
     * واقعاً صدا زده شده.
     *
     * فقط `xhr`/`fetch`/`document`: عکس و فونت و CSS پوششِ رفتاری نیستند و
     * فقط فایل را بزرگ می‌کنند.
     */
    if (onCall) {
      const kind = r.request().resourceType();
      if (kind === 'xhr' || kind === 'fetch' || kind === 'document') {
        onCall({ method: r.request().method(), url: r.url(), status });
      }
    }

    if (status < 400) return;
    sink({
      source: 'http',
      severity: status >= 500 ? 'error' : 'warn',
      message: `${status} ${r.request().method()} ${r.url()}`,
      url: r.url(),
      status,
    });
  });

  /**
   * پنجرهٔ alert/confirm/prompt.
   *
   * ── چرا این قابل تنظیم است ──
   *
   * بستن خودکارِ همهٔ dialogها لازم است، چون پنجره‌ای که کسی نبنددش تست را تا
   * timeout معلق می‌گذارد. ولی بی‌صدا رفتار اپ را هم عوض می‌کند: صفحهٔ `/sqlite`
   * نپی رمزش را با `prompt()` می‌گیرد، و چون ما همیشه dismiss می‌کردیم، آن صفحه
   * زیر userbug همیشه خالی می‌ماند. یک بار همین باعث شد نتیجه بگیریم نپی باگ
   * دارد، در حالی که ابزار خودش جواب را بلعیده بود.
   *
   * پس سناریو می‌تواند برای dialog بعدی جواب بگذارد؛ پیش‌فرض همان dismiss است.
   */
  page.on('dialog', async (d) => {
    sink({
      source: 'dialog',
      severity: 'warn',
      message: `${d.type()}: ${d.message()}`,
    });
    if (onDialog) {
      const handled = await onDialog(d).catch(() => false);
      if (handled) return;
    }
    await d.dismiss().catch(() => {});
  });
}
