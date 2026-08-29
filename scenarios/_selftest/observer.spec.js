/**
 * خودآزمای رصدگر.
 *
 * ── چرا این فایل هست ──
 *
 * اجرای اول روی نپی صفر رخداد کلاینت ثبت کرد. این می‌تواند دو معنا داشته باشد:
 * یا اپ تمیز است، یا رصدگر بی‌صدا کار نمی‌کند. تفاوتشان همه‌چیز است — رصدگرِ
 * خاموش دقیقاً همان «تستِ سبزِ دروغ‌گو»یی است که این ابزار قرار بود جلویش را
 * بگیرد.
 *
 * پس عمداً خطا می‌سازیم و می‌سنجیم که گرفته شده باشد.
 */
import { test, expect } from '../../src/fixtures.js';

test.use({ probe: true });

test('رصدگر کلاینت واقعاً می‌گیرد', async ({ page, ub }) => {
  const probe = `userbug-probe-${Date.now()}`;

  await ub.step('باز کردن اپ', async () => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  await ub.step('تزریق خطای عمدی', async () => {
    await page.evaluate((tag) => {
      console.error(tag + ' console');
      // promise رهاشده: چیزی که pageerror نمی‌گیرد و بدون اسکریپت اولیه گم می‌شود
      Promise.reject(new Error(tag + ' rejection'));
      // پاسخ ۴۰۴ روی مسیری که قطعاً نیست
      fetch('/' + tag + '-missing').catch(() => {});
    }, probe);
    await page.waitForTimeout(1200);
  });

  await ub.step('سنجش', async () => {
    const messages = ub.events.map((e) => `${e.source}:${e.message}`);

    expect(messages.some((m) => m.startsWith('console:') && m.includes(probe + ' console')),
      'console.error باید گرفته شود').toBe(true);

    expect(messages.some((m) => m.includes('unhandledrejection') && m.includes(probe)),
      'promise رهاشده باید گرفته شود').toBe(true);

    expect(messages.some((m) => m.startsWith('http:') && m.includes(probe + '-missing')),
      'پاسخ ۴۰۴ باید گرفته شود').toBe(true);

    // خطاهای این تست عمدی بودند؛ با `probe: true` به‌عنوان synthetic علامت
    // می‌خورند و از گزارش اصلی بیرون می‌مانند.
  });
});
