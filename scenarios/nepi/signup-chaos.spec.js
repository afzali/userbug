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

test('ایمیل با حرف بزرگ، حساب دوم می‌سازد', async ({ page, ub, identity }) => {
  const lower = identity.email;
  const upper = lower[0].toUpperCase() + lower.slice(1);

  await ub.step('ثبت‌نام با ایمیل کوچک', async () => {
    await signUp(page, ub, lower, identity.password);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'ادامه' }).click();
    await expect(page).toHaveURL(/\/contents/, { timeout: 30_000 });
  });

  await ub.step('خروج', async () => {
    await logout(page, ub, lower);
  });

  await ub.step('ورود با همان ایمیل، فقط حرف اول بزرگ', async () => {
    await page.getByLabel('ایمیل').fill(upper);
    await page.getByLabel('رمز عبور').fill(identity.password);
    await page.getByRole('button', { name: 'ورود / ثبت‌نام' }).click();
    await page.waitForTimeout(2500);
    await ub.dismissBlockers();

    // اگر صفحهٔ کد بازیابی دوباره آمد، یعنی حسابِ دومی ساخته شده
    const secondAccount = await page
      .getByRole('heading', { name: 'کد بازیابی شما' })
      .isVisible()
      .catch(() => false);

    if (secondAccount) {
      await ub.note({
        message: `ایمیل «${upper}» حساب جداگانه‌ای از «${lower}» ساخت — ایمیل پیش از ذخیره نرمال نمی‌شود`,
        detail:
          'کاربری که ایمیلش را با حرف بزرگ بنویسد، حساب تازه و خالی می‌گیرد و فکر می‌کند داده‌هایش پریده است.',
      });
    }
  });
});

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
