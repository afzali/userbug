import { expect } from '../../src/fixtures.js';

/**
 * داورِ وضعیت — «واقعاً چه چیزی ذخیره شد؟»
 *
 * تا اینجا هر assert ما از روی چیزی بود که روی صفحه دیده می‌شد. ولی بخش بزرگی
 * از باگ‌ها همان‌جایی است که صفحه درست نشان می‌دهد و دیتابیس چیز دیگری دارد —
 * مثل «دو ردیف کاربر با یک ایمیل» که از بیرون هیچ نشانه‌ای ندارد.
 *
 * ── چرا از کنسول SQL خودِ نپی استفاده نمی‌کنیم ──
 *
 * `/sqlite` هست، ولی سه مانع دارد: پشت `devMode` در localStorage است، یک
 * `prompt` با رمز ثابتِ درون سورس می‌پرسد، و مهم‌تر از همه `showContent` در آن
 * صفحه با `let` سادهٔ Svelte 5 نوشته شده — یعنی بدون `$state` هرگز واکنشی
 * نیست و محتوا حتی با رمز درست هم رندر نمی‌شود. علاوه بر این، رفتن به آن صفحه
 * کاربر را از مسیرش بیرون می‌برد.
 *
 * پس مستقیم همان ماژولی را صدا می‌زنیم که خودِ اپ استفاده می‌کند. این کار در
 * حالت توسعه ممکن است چون Vite سورس را به‌شکل ESM سرو می‌کند — و همان محیطی
 * است که فاز ۰ هدف گرفته. اگر روزی روی بیلد تولیدی لازم شد، این تابع باید
 * جایش را به یک قلاب اعلام‌شدهٔ خودِ پروژه بدهد.
 */
export async function sql(page, query, params = []) {
  return await page.evaluate(
    async ({ query, params }) => {
      const { default: db } = await import('/src/lib/db/database.js');
      if (!db.initialized) await db.init();
      return await db.query(query, params);
    },
    { query, params }
  );
}

/**
 * خروج از حساب — مستقل از دستگاه.
 *
 * روی دسکتاپ منوی کاربر در نوار کناریِ باز است؛ روی موبایل نوار جمع شده و
 * اول باید بازش کرد. اولین اجرا روی Pixel 7 دقیقاً همین‌جا گیر کرد و نشان داد
 * که یک سناریوی «دسکتاپی» به‌طور خاموش فرض‌های چیدمان را با خودش حمل می‌کند.
 */
export async function logout(page, ub, email) {
  await ub.dismissBlockers();

  const userMenu = page.getByRole('button', { name: new RegExp(email.split('@')[0]) }).first();

  if (!(await userMenu.isVisible().catch(() => false))) {
    const toggle = page.getByRole('button', { name: 'Toggle Sidebar' });
    if (await toggle.count()) {
      await toggle.first().click();
      await page.waitForTimeout(600);
    }
  }

  await userMenu.click();
  await page.getByRole('menuitem', { name: 'خروج', exact: true }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  await ub.dismissBlockers();
}

/**
 * ساخت سند خالی از فهرست.
 *
 * `#blank-title` نه `getByLabel('نام کتاب')`: کامپوننت Tabs محتوای همهٔ تب‌ها
 * را در DOM نگه می‌دارد، پس دو ورودیِ «نام کتاب» هم‌زمان وجود دارد — یکی در تب
 * بارگذاری فایل و یکی در تب سند خالی — و سلکتور نقش‌محور به هر دو می‌خورد.
 *
 * @param {object} opts
 * @param {boolean} opts.waitForSlug صبر کردن تا بررسیِ ۵۰۰ میلی‌ثانیه‌ایِ یکتاییِ
 *   slug تمام شود. `false` یعنی همان کاری که کاربر عجول می‌کند.
 */
export async function createBlankDoc(page, ub, { title, waitForSlug = true }) {
  await ub.dismissBlockers();
  await page.getByRole('button', { name: 'فایل جدید' }).first().click();
  await page.getByRole('tab', { name: 'فایل خالی جدید' }).click();
  await page.locator('#blank-title').fill(title);
  if (waitForSlug) await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'ساخت و باز کردن' }).click();
}

/** عبور از صفحهٔ کد بازیابی به فهرست. */
export async function acknowledgeRecoveryCode(page, ub) {
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'ادامه' }).click();
  await expect(page).toHaveURL(/\/contents/, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await ub.dismissBlockers();
}

/** ثبت‌نام تا صفحهٔ کد بازیابی. */
export async function signUp(page, ub, email, password) {
  await ub.clearBrowserState();
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  // پنجره‌ها با تأخیر می‌آیند؛ کاربر هم همین‌قدر صبر می‌کند و بعد می‌بنددشان
  await page.waitForTimeout(2000);
  await ub.dismissBlockers();

  await page.getByLabel('ایمیل').fill(email);
  await page.getByLabel('رمز عبور').fill(password);
  await page.getByRole('button', { name: 'ورود / ثبت‌نام' }).click();
  await expect(page.getByRole('heading', { name: 'کد بازیابی شما' })).toBeVisible({ timeout: 30_000 });
  await ub.dismissBlockers();
}
