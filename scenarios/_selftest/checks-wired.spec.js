/**
 * خودآزمای **اتصال** چک‌ها، نه خودِ چک‌ها.
 *
 * ── چرا جدا از `checks.spec.js` ──
 *
 * آن فایل ثابت می‌کند قاعده‌ها درست‌اند. این یکی ثابت می‌کند که واقعاً **صدا
 * زده می‌شوند** — و این دو یکی نیستند.
 *
 * همان درسِ `observer.spec.js`: اجرای اول روی نپی صفر رخداد ثبت کرد، و
 * «رصدگر خاموش» با «اپِ تمیز» از بیرون یک شکل داشتند. چکی که در `ub.step`
 * وصل نشده باشد هم دقیقاً همین‌طور دیده می‌شود: گزارشِ سبز.
 */
import { test, expect } from '../../src/fixtures.js';

test.use({ probe: true });

const BROKEN = `<!doctype html><html lang="fa" dir="rtl"><head><title>کتابخانه</title></head><body>
  <h1>کتابخانه</h1>
  <p>نویسنده: [object Object]</p>
  <button>سند جدید</button>
</body></html>`;

const HEALTHY = `<!doctype html><html lang="fa" dir="rtl"><head><title>کتابخانه</title></head><body>
  <h1>کتابخانه</h1>
  <p>اینجا فهرست اسناد شما دیده می‌شود.</p>
  <button>سند جدید</button>
</body></html>`;

test('چک در پایانِ قدم اجرا می‌شود و یافته ثبت می‌کند', async ({ page, ub }) => {
  await ub.step('صفحه‌ای که یک شیء را به‌جای متن رندر کرده', async () => {
    await page.setContent(BROKEN);
  });

  const fromChecks = ub.findings.filter((f) => f.source === 'check');
  expect(fromChecks.map((f) => f.checkId)).toContain('object-literal');

  // یافته باید بداند در کدام قدم بود، وگرنه گزارش نمی‌تواند نشانش بدهد
  const hit = fromChecks.find((f) => f.checkId === 'object-literal');
  expect(hit.step).toBe('صفحه‌ای که یک شیء را به‌جای متن رندر کرده');
  expect(hit.severity).toBe('error');
});

test('قدمِ سالم هیچ یافتهٔ چکی نمی‌سازد', async ({ page, ub }) => {
  await ub.step('صفحهٔ سالم', async () => {
    await page.setContent(HEALTHY);
  });

  expect(ub.findings.filter((f) => f.source === 'check')).toEqual([]);
});

test('چکِ خطادار قدم را نمی‌شکند', async ({ page, ub }) => {
  /**
   * بلوکِ چک در `finally` نشسته. پرتاب از آنجا خطای اصلیِ قدم را می‌بلعد و
   * گزارش می‌گوید «چک شکست» در حالی که واقعاً کلیک شکسته بود. اینجا با
   * بستنِ صفحه همان حالت ساخته می‌شود: چک نمی‌تواند اجرا شود، ولی خطایی که
   * خودِ قدم داشت باید سالم بیرون بیاید.
   */
  await expect(
    ub.step('قدمی که خودش می‌شکند', async () => {
      await page.setContent(HEALTHY);
      await page.close();
      throw new Error('خطای عمدیِ قدم');
    })
  ).rejects.toThrow('خطای عمدیِ قدم');
});
