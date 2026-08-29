/**
 * برش عمودی فاز ۰ — نپی.
 *
 * مسیری که یک کاربر واقعی طی می‌کند و بیشترین چیز برایش در خطر است:
 * ثبت‌نام، گرفتن کد بازیابی، دانلودش، خروج، فراموشی رمز، و بازگشت با همان فایل.
 *
 * نکتهٔ مهم: assertهای صریحِ اینجا فقط نیمی از کارند. نیمهٔ دیگر داورِ خودکار
 * است که در پس‌زمینه هر خطای کلاینت و سرور را می‌گیرد، حتی اگر هیچ assert‌ی
 * ننوشته باشیم.
 */
import fs from 'node:fs/promises';
import { test, expect } from '../../src/fixtures.js';
import { logout } from './_helpers.js';

test('ثبت‌نام تا بازیابی رمز', async ({ page, ub, identity }) => {
  let recoveryCode = '';
  let downloadedCode = '';

  await ub.step('پاکسازی و باز کردن اپ', async () => {
    await ub.clearBrowserState();
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await page.waitForTimeout(2000);
    await ub.dismissBlockers();
  });

  await ub.step('ثبت‌نام با هویت تازه', async () => {
    await page.getByLabel('ایمیل').fill(identity.email);
    await page.getByLabel('رمز عبور').fill(identity.password);
    await page.getByRole('button', { name: 'ورود / ثبت‌نام' }).click();
    await expect(page.getByRole('heading', { name: 'کد بازیابی شما' })).toBeVisible({ timeout: 30_000 });
  });

  await ub.step('کد بازیابی روی صفحه', async () => {
    const code = await page.locator('code.select-all').innerText();
    recoveryCode = code.trim();
    expect(recoveryCode.length, 'کد بازیابی نباید خالی باشد').toBeGreaterThan(8);
  });

  await ub.step('پنجره‌های ناخوانده روی صفحهٔ کد بازیابی', async () => {
    // صفحهٔ کد بازیابی تنها جایی است که کاربر *باید* کاری بکند و اگر نکند
    // داده‌اش برای همیشه می‌رود. هر پنجره‌ای که اینجا روی آن بنشیند، یافته است.
    const seen = await ub.dismissBlockers();
    console.log('    پنجره‌های باز روی این صفحه:', seen.length ? seen.join(' | ') : 'هیچ');
  });

  await ub.step('دکمهٔ ادامه پیش از تأیید قفل است', async () => {
    // این تنها چیزی است که کاربر را از رد شدن بی‌کد بازیابی نگه می‌دارد
    await expect(page.getByRole('button', { name: 'ادامه' })).toBeDisabled();
  });

  await ub.step('دانلود فایل کد بازیابی', async () => {
    const waitForDownload = page.waitForEvent('download', { timeout: 20_000 });
    await page.getByRole('button', { name: 'دانلود به‌شکل فایل' }).click();
    const download = await waitForDownload;

    expect(download.suggestedFilename()).toBe('nepi-recovery-code.txt');

    const file = await download.path();
    const text = await fs.readFile(file, 'utf8');
    // فایل: عنوان، خط خالی، کد، خط خالی، هشدار
    downloadedCode = text.split(/\r?\n/)[2]?.trim() || '';

    expect(downloadedCode, 'کد داخل فایل باید همان کد روی صفحه باشد').toBe(recoveryCode);
  });

  await ub.step('تأیید و عبور به فهرست', async () => {
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'ادامه' }).click();
    await expect(page).toHaveURL(/\/contents/, { timeout: 30_000 });
  });

  await ub.step('خروج از حساب', async () => {
    await logout(page, ub, identity.email);
  });

  await ub.step('باز کردن پنجرهٔ فراموشی رمز', async () => {
    await page.getByRole('button', { name: 'فراموشی رمز عبور؟' }).click();
    await expect(page.getByRole('heading', { name: 'بازنشانی رمز با کد بازیابی' })).toBeVisible();
  });

  const newPassword = identity.password + 'X2!';

  await ub.step('بازنشانی رمز با کد دانلودشده', async () => {
    await page.getByLabel('ایمیل حساب').fill(identity.email);
    await page.getByLabel('کد بازیابی', { exact: true }).fill(downloadedCode);
    await page.getByLabel('رمز عبور جدید').fill(newPassword);
    await page.getByLabel('تکرار رمز جدید').fill(newPassword);
    await page.getByRole('button', { name: 'بازنشانی رمز و ورود' }).click();

    await expect(page).toHaveURL(/\/contents/, { timeout: 30_000 });
  });

  await ub.step('رمز قدیمی پس از بازنشانی نباید کار کند', async () => {
    await logout(page, ub, identity.email);

    await page.getByLabel('ایمیل').fill(identity.email);
    await page.getByLabel('رمز عبور').fill(identity.password); // رمز قدیمی
    await page.getByRole('button', { name: 'ورود / ثبت‌نام' }).click();
    await page.waitForTimeout(2500);
    await ub.dismissBlockers();

    if (/\/contents/.test(page.url())) {
      await ub.note({
        message: 'رمز قدیمی پس از بازنشانی هنوز کار می‌کند',
        detail: 'بازنشانی باید بستهٔ کلید را با رمز تازه دوباره ببندد؛ اگر رمز قبلی هم باز می‌کند، بازنشانی کامل نشده.',
      });
    }
  });
});
