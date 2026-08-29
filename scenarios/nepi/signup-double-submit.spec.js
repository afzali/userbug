/**
 * دوبار زدن روی دکمهٔ ثبت‌نام.
 *
 * چرا این سناریو ارزش دارد: `handleSubmit` اول `isLoading = true` می‌گذارد و
 * بعد `await` می‌کند. بین آن دو، اگر رندر نرسیده باشد، کلیک دوم هم رد می‌شود و
 * هر دو اجرا `SELECT ... WHERE email = ?` را خالی می‌بینند و هر دو `INSERT`
 * می‌کنند. آن‌وقت دو حساب با یک ایمیل ساخته می‌شود و هنگام ورود، `users[0]`
 * انتخاب می‌شود — یعنی کد بازیابی‌ای که کاربر ذخیره کرده ممکن است به ردیفی
 * بخورد که هیچ‌وقت باز نمی‌شود.
 *
 * assert روی صفحه اینجا کافی نیست: صفحه در هر دو حالت یک‌شکل است. پس داورِ
 * وضعیت (`sql`) لازم است.
 */
import { test, expect } from '../../src/fixtures.js';
import { sql } from './_helpers.js';

/** چند حسابِ واقعی با این ایمیل در دیتابیس هست؟ */
async function countUsers(page, email) {
  const rows = await sql(page, 'SELECT COUNT(*) AS n FROM users WHERE email = ?', [email]);
  return Number(rows[0]?.n ?? 0);
}

test('دوبار کلیک روی ورود / ثبت‌نام', async ({ page, ub, identity }) => {
  await ub.step('پاکسازی و باز کردن فرم', async () => {
    await ub.clearBrowserState();
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await page.waitForTimeout(2000);
    await ub.dismissBlockers();
  });

  await ub.step('پر کردن فرم', async () => {
    await page.getByLabel('ایمیل').fill(identity.email);
    await page.getByLabel('رمز عبور').fill(identity.password);
  });

  await ub.step('دوبار کلیک بی‌حوصله روی دکمه', async () => {
    // کاربری که دکمه‌اش «کاری نکرد» دوباره می‌زند. این را با dblclick می‌زنیم
    // چون همان توالی رخدادی است که مرورگر از انگشتِ عجول تولید می‌کند.
    await page.getByRole('button', { name: 'ورود / ثبت‌نام' }).dblclick({ delay: 20 });
    await expect(page.getByRole('heading', { name: 'کد بازیابی شما' })).toBeVisible({ timeout: 30_000 });
  });

  await ub.step('چند حساب ساخته شد؟', async () => {
    const n = await countUsers(page, identity.email);
    console.log(`    ردیف کاربر با این ایمیل: ${n}`);

    if (n > 1) {
      await ub.note({
        message: `دوبار کلیک روی «ورود / ثبت‌نام» ${n} حساب با یک ایمیل ساخت`,
        detail:
          'هنگام ورود، اپ users[0] را برمی‌دارد. کد بازیابی‌ای که به کاربر نشان داده شد مالِ ردیف دیگری است، ' +
          'پس بازنشانی رمز با آن کد ممکن است هرگز کار نکند. ستون email قید یکتایی ندارد.',
      });
    }
  });
});

test('دوبار Enter روی فرم ثبت‌نام', async ({ page, ub, identity }) => {
  await ub.step('پاکسازی و پر کردن فرم', async () => {
    await ub.clearBrowserState();
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await page.waitForTimeout(2000);
    await ub.dismissBlockers();

    await page.getByLabel('ایمیل').fill(identity.email);
    await page.getByLabel('رمز عبور').fill(identity.password);
  });

  await ub.step('دو Enter پشت‌سرهم', async () => {
    // کاربر حرفه‌ای با کیبورد کار می‌کند و Enter دوم را پیش از هر بازخوردی می‌زند
    const password = page.getByLabel('رمز عبور');
    await password.press('Enter');
    await password.press('Enter').catch(() => {});
    await expect(page.getByRole('heading', { name: 'کد بازیابی شما' })).toBeVisible({ timeout: 30_000 });
  });

  await ub.step('چند حساب ساخته شد؟', async () => {
    const n = await countUsers(page, identity.email);
    console.log(`    ردیف کاربر با این ایمیل: ${n}`);

    if (n > 1) {
      await ub.note({
        message: `دو Enter پشت‌سرهم ${n} حساب با یک ایمیل ساخت`,
        detail: 'همان نقصِ دوبار-فرستادن، این بار از راه کیبورد.',
      });
    }
  });
});
