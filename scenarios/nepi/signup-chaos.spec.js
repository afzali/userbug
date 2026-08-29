/**
 * پرسونای آشوب روی جریان ثبت‌نام.
 *
 * هیچ‌کدام از این‌ها AI نمی‌خواهد. کارهایی است که کاربر واقعی از سرِ عادت
 * می‌کند — رفرش می‌زند، ایمیلش را با حرف بزرگ می‌نویسد، فاصله جا می‌گذارد —
 * و برنامه‌نویس هیچ‌وقت دستی امتحانشان نمی‌کند.
 */
import { test, expect } from '../../src/fixtures.js';
import { signUp, logout } from './_helpers.js';

test('رفرش روی صفحهٔ کد بازیابی', async ({ page, ub, identity }) => {
  await ub.step('ثبت‌نام تا صفحهٔ کد بازیابی', async () => {
    await signUp(page, ub, identity.email, identity.password);
  });

  await ub.step('رفرش صفحه — همان کاری که کاربر بی‌حوصله می‌کند', async () => {
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2500);
    await ub.dismissBlockers();
  });

  await ub.step('آیا حساب ساخته شده؟', async () => {
    // اگر حساب هست ولی کد بازیابی دیگر دیده نمی‌شود، کاربر حسابی دارد که
    // هیچ‌وقت نمی‌تواند بازیابی‌اش کند — و خودِ اپ می‌گوید این یعنی داده برای
    // همیشه رفته.
    const codeVisible = await page
      .getByRole('heading', { name: 'کد بازیابی شما' })
      .isVisible()
      .catch(() => false);

    if (codeVisible) return; // رفتار درست: کد دوباره نشان داده می‌شود

    await page.goto('/');
    await page.waitForTimeout(1500);
    await ub.dismissBlockers();

    const onLogin = /\/login/.test(page.url());
    if (onLogin) {
      await page.getByLabel('ایمیل').fill(identity.email);
      await page.getByLabel('رمز عبور').fill(identity.password);
      await page.getByRole('button', { name: 'ورود / ثبت‌نام' }).click();
      await page.waitForTimeout(2500);
      await ub.dismissBlockers();
    }

    const codeShownNow = await page
      .getByRole('heading', { name: 'کد بازیابی شما' })
      .isVisible()
      .catch(() => false);
    const loggedIn = /\/contents/.test(page.url());

    if (loggedIn && !codeShownNow) {
      await ub.note({
        message:
          'رفرش روی صفحهٔ کد بازیابی: حساب ساخته می‌ماند ولی کد بازیابی دیگر هرگز نشان داده نمی‌شود',
        detail:
          'کاربر با رمز خودش وارد می‌شود، پس حساب هست؛ اما کد بازیابی فقط در حافظهٔ کامپوننت بود. ' +
          'طبق متن خودِ اپ، بدون این کد و با فراموشی رمز، داده برای همیشه غیرقابل بازگشایی است.',
      });
    }
  });
});

/*
 * «ایمیل با حرف بزرگ» به `email-case.yml` منتقل شد.
 *
 * نخستین سناریویی که از اسکریپت به داده رفت. نگه داشتن هر دو نسخه یعنی یک
 * باگ دو بار گزارش می‌شود و `replay` هر دو را برمی‌دارد — همان چیزی که در
 * اولین اجرای replay دیدیم.
 */

test('ایمیل با فاصلهٔ اضافه', async ({ page, ub, identity }) => {
  await ub.step('ثبت‌نام با ایمیل تمیز', async () => {
    await signUp(page, ub, identity.email, identity.password);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'ادامه' }).click();
    await expect(page).toHaveURL(/\/contents/, { timeout: 30_000 });
  });

  await ub.step('خروج', async () => {
    await logout(page, ub, identity.email);
  });

  await ub.step('ورود با فاصله در انتهای ایمیل', async () => {
    await page.getByLabel('ایمیل').fill(identity.email + ' ');
    await page.getByLabel('رمز عبور').fill(identity.password);
    await page.getByRole('button', { name: 'ورود / ثبت‌نام' }).click();
    await page.waitForTimeout(2500);
    await ub.dismissBlockers();

    const secondAccount = await page
      .getByRole('heading', { name: 'کد بازیابی شما' })
      .isVisible()
      .catch(() => false);

    if (secondAccount) {
      await ub.note({
        message: 'ایمیل با فاصلهٔ انتهایی حساب جداگانه ساخت — trim نمی‌شود',
        detail: 'کپی‌کردن ایمیل از جای دیگر معمولاً یک فاصله هم با خودش می‌آورد.',
      });
    }
  });
});
