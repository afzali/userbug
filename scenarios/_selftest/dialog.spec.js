/**
 * خودآزمای پنجره‌های مرورگر.
 *
 * رصدگر به‌طور پیش‌فرض هر dialog را می‌بندد، وگرنه تست تا timeout معلق می‌ماند.
 * ولی همین کار بی‌صدا رفتار اپ را عوض می‌کند: صفحه‌ای که رمزش را با `prompt()`
 * می‌گیرد، زیر userbug همیشه خالی می‌ماند — و یک بار همین باعث شد یافتهٔ اشتباه
 * ثبت کنیم.
 *
 * این تست هر دو حالت را می‌سنجد: پیش‌فرضِ بستن، و جوابِ سناریو.
 */
import { test, expect } from '../../src/fixtures.js';

test.use({ probe: true });

test('پنجره‌ها: پیش‌فرض بسته می‌شوند، ولی سناریو می‌تواند جواب بگذارد', async ({ page, ub }) => {
  await ub.step('باز کردن اپ', async () => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  await ub.step('پیش‌فرض: prompt بسته می‌شود و null برمی‌گرداند', async () => {
    const value = await page.evaluate(() => window.prompt('رمز؟'));
    expect(value, 'بدون جواب، prompt باید null بدهد').toBeNull();
  });

  await ub.step('با answerDialog، جواب به اپ می‌رسد', async () => {
    ub.answerDialog('رمزِ درست');
    const value = await page.evaluate(() => window.prompt('رمز؟'));
    expect(value, 'جوابِ گذاشته‌شده باید به اپ برسد').toBe('رمزِ درست');
  });

  await ub.step('confirm هم قابل تأیید است', async () => {
    ub.answerDialog(true);
    const ok = await page.evaluate(() => window.confirm('ادامه؟'));
    expect(ok).toBe(true);

    // و بدون جواب، پیش‌فرض همان ردکردن است
    const cancelled = await page.evaluate(() => window.confirm('ادامه؟'));
    expect(cancelled).toBe(false);
  });

  await ub.step('صف است، نه یک مقدار', async () => {
    ub.answerDialog('اول');
    ub.answerDialog('دوم');
    const a = await page.evaluate(() => window.prompt('؟'));
    const b = await page.evaluate(() => window.prompt('؟'));
    expect([a, b]).toEqual(['اول', 'دوم']);
  });
});
