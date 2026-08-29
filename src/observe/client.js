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
 */
export function attachClientObservers(page, sink) {
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
    if (status < 400) return;
    sink({
      source: 'http',
      severity: status >= 500 ? 'error' : 'warn',
      message: `${status} ${r.request().method()} ${r.url()}`,
      url: r.url(),
      status,
    });
  });

  // پنجرهٔ alert/confirm که کسی نبندد، تست را تا timeout معلق می‌گذارد
  page.on('dialog', async (d) => {
    sink({
      source: 'dialog',
      severity: 'warn',
      message: `${d.type()}: ${d.message()}`,
    });
    await d.dismiss().catch(() => {});
  });
}
