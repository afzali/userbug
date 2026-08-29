/**
 * رفت‌وبرگشتِ متن: چیزی که کاربر نوشت، همان چیزی که می‌ماند؟
 *
 * برای یک اپ یادداشت این مهم‌ترین ثابتِ ممکن است، و دو شکلِ متفاوت دارد که
 * هر دو اینجا آزموده می‌شوند:
 *
 *   ۱. کاربر نوشت، «✓ ذخیره شده» دید، رفرش زد — متن باید باشد.
 *   ۲. متنِ فارسیِ واقعی (نیم‌فاصله، ارقام فارسی، متن مخلوط) باید همان‌طور
 *      برگردد که وارد شده. نرمال‌سازیِ حالت نمایش نباید نیم‌فاصله را بخورد.
 *
 * داورِ صفحه به‌تنهایی اینجا کافی نیست: ممکن است صفحه متن را از حافظه نشان
 * دهد و دیتابیس چیز دیگری داشته باشد. پس هر دو را می‌بینیم.
 */
import { test, expect } from '../../src/fixtures.js';
import { signUp, sql, createBlankDoc, openBlankDocForm, acknowledgeRecoveryCode } from './_helpers.js';
import { NASTY } from '../../src/data/persian.js';

const TITLE = 'یادداشت‌های ۱۴۰۴';
const BODY = `${NASTY.zwnj} — ${NASTY.persianDigits} — ${NASTY.mixed}`;

/** متن دیدنیِ همهٔ بندها، بدون تگ. */
async function visibleBody(page) {
  return (await page.locator('[data-id]').first().innerText()).replace(/\s+/g, ' ').trim();
}

test('نوشتن، ذخیره، رفرش', async ({ page, ub, identity }) => {
  let bookId = '';

  await ub.step('ثبت‌نام و ورود به فهرست', async () => {
    await signUp(page, ub, identity.email, identity.password);
    await acknowledgeRecoveryCode(page, ub);
  });

  await ub.step('ساخت سند خالی با عنوان فارسی', async () => {
    // برای این سناریو مسیر سالم را می‌خواهیم، پس منتظر بررسیِ slug می‌مانیم.
    // رقابتش سناریوی جداگانه دارد.
    await createBlankDoc(page, ub, { title: TITLE, waitForSlug: true });
    await expect(page).toHaveURL(/\/content\/[^/?]+\?mode=edit/, { timeout: 30_000 });
    bookId = decodeURIComponent(new URL(page.url()).pathname.split('/').pop());
    console.log('    شناسهٔ سند:', bookId);
  });

  await ub.step('نوشتن متن در ویرایشگر', async () => {
    await ub.dismissBlockers();
    const paragraph = page.locator('[data-id]').first();
    await paragraph.click();
    await page.waitForTimeout(800); // Tiptap فقط برای بندِ فعال ساخته می‌شود
    await page.keyboard.type(BODY, { delay: 8 });
    await expect(page.getByText('● ذخیره‌نشده')).toBeVisible({ timeout: 10_000 });
  });

  await ub.step('ذخیره و دیدن نشانِ «ذخیره شده»', async () => {
    await page.getByRole('button', { name: 'ذخیره', exact: true }).click();
    await expect(page.getByText('✓ ذخیره شده')).toBeVisible({ timeout: 30_000 });
  });

  await ub.step('چه چیزی واقعاً در دیتابیس نشست؟', async () => {
    const rows = await sql(page, 'SELECT content FROM paragraphs WHERE book_id = ?', [bookId]);
    const stored = (rows.map((r) => r.content).join(' ') || '').replace(/<[^>]*>/g, ' ');
    console.log('    ذخیره‌شده:', JSON.stringify(stored));

    if (!stored.includes(NASTY.zwnj)) {
      await ub.note({
        message: 'متنِ نیم‌فاصله‌دار همان‌طور که وارد شد در دیتابیس ذخیره نشد',
        detail: `انتظار: «${NASTY.zwnj}» — ذخیره‌شده: «${stored.slice(0, 200)}»`,
      });
    }
  });

  await ub.step('رفرش — همان کاری که کاربر بعد از ذخیره می‌کند', async () => {
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await ub.dismissBlockers();

    const after = await visibleBody(page);
    console.log('    پس از رفرش:', JSON.stringify(after.slice(0, 160)));

    if (!after.includes(NASTY.zwnj)) {
      await ub.note({
        message: 'متنِ ذخیره‌شده پس از رفرش روی صفحه نیست',
        detail: `کاربر «✓ ذخیره شده» دیده بود. آنچه دیده می‌شود: «${after.slice(0, 200)}»`,
      });
    }
  });

  await ub.step('عنوان در فهرست همان است که کاربر نوشت؟', async () => {
    const rows = await sql(page, 'SELECT title FROM books WHERE id = ?', [bookId]);
    const stored = rows[0]?.title ?? '';
    console.log('    عنوان ذخیره‌شده:', JSON.stringify(stored));

    if (stored !== TITLE) {
      await ub.note({
        severity: 'error',
        message: `عنوان سند دست‌کاری شد: «${TITLE}» ذخیره شد به‌شکل «${stored}»`,
        detail:
          'کلید «نرمال‌سازی عنوان و مشخصات» روشن است و حالتش نمایشی اعلام شده، پس نیم‌فاصله و ارقام ' +
          'باید دست‌نخورده بمانند. عنوانی که کاربر تایپ کرده و عنوانی که بعداً می‌بیند باید یکی باشند.',
      });
    }
  });
});

test('کلیک سریع روی «ساخت و باز کردن» با عنوان تکراری', async ({ page, ub, identity }) => {
  /**
   * چرا این باگ است و نه سلیقه: یکتاییِ slug با یک `$effect` و ۵۰۰ میلی‌ثانیه
   * تأخیر بررسی می‌شود، ولی دکمه فقط وقتی قفل می‌شود که `slugError` نشسته
   * باشد. کاربری که تندتر از نیم‌ثانیه کلیک می‌کند از کنارِ اعتبارسنجی رد
   * می‌شود و به‌جای پیام قابل‌فهم، خطای خامِ دیتابیس می‌گیرد.
   */
  const title = 'دفتر روزانه';

  await ub.step('ثبت‌نام و ورود به فهرست', async () => {
    await signUp(page, ub, identity.email, identity.password);
    await acknowledgeRecoveryCode(page, ub);
  });

  await ub.step('سند اول', async () => {
    await createBlankDoc(page, ub, { title, waitForSlug: true });
    await expect(page).toHaveURL(/\/content\//, { timeout: 30_000 });
    await page.goto('/contents');
    await page.waitForTimeout(2000);
    await ub.dismissBlockers();
  });

  await ub.step('دکمهٔ ساخت در بازهٔ بررسی یکتایی قفل نیست', async () => {
    /**
     * سنجش قطعی به‌جای بردنِ مسابقه.
     *
     * نسخهٔ قبلی این سناریو فقط وقتی یافته ثبت می‌کرد که کلیکش زودتر از
     * بررسیِ ۵۰۰ میلی‌ثانیه‌ای بنشیند — و در دو اجرا از سه اجرا نمی‌نشست. یافتهٔ
     * تصادفی، طبق قانون سوم پروژه، یافته نیست.
     *
     * پس به‌جای «بیا ببینیم می‌توانم رد شوم؟» می‌پرسیم «آیا اصلاً پنجرهٔ رد
     * شدن وجود دارد؟» — یعنی دکمه پیش از پایان بررسی باز است و بعدش قفل
     * می‌شود. این را بدون هیچ مسابقه‌ای می‌شود دید.
     */
    await openBlankDocForm(page, ub, { title });
    const submit = page.getByRole('button', { name: 'ساخت و باز کردن' });

    const openDuringCheck = await submit.isEnabled();
    await page.waitForTimeout(1200);
    const openAfterCheck = await submit.isEnabled();

    console.log(`    دکمه — حین بررسی: ${openDuringCheck} · پس از بررسی: ${openAfterCheck}`);

    if (openDuringCheck && !openAfterCheck) {
      await ub.note({
        message:
          'دکمهٔ ساخت در بازهٔ بررسی یکتاییِ عنوان باز است و تنها پس از آن قفل می‌شود',
        detail:
          'یکتاییِ slug با ۵۰۰ میلی‌ثانیه تأخیر بررسی می‌شود، ولی دکمه فقط با نشستن slugError ' +
          'قفل می‌گردد. یعنی پنجره‌ای هست که کاربر می‌تواند از اعتبارسنجی رد شود و مستقیم به ' +
          'INSERT برسد — و آنچه می‌گیرد پیام خامِ UNIQUE constraint failed است.',
      });
    }
  });

  await ub.step('و کاربری که در همان پنجره کلیک کند چه می‌بیند', async () => {
    // این قدم مکملِ سنجشِ بالاست: نتیجه‌اش به زمان‌بندی بستگی دارد، پس هرچه
    // ببیند فقط ثبت می‌شود و یافته‌ای از آن ساخته نمی‌شود.
    await page.getByRole('button', { name: 'ساخت و باز کردن' }).click().catch(() => {});
    const toastText = await page
      .locator('[data-sonner-toast]')
      .first()
      .innerText({ timeout: 8000 })
      .catch(() => '');
    await ub.dismissBlockers({ expected: [/افزودن کتاب جدید/] });
    console.log(`    در ویرایشگر: ${/\/content\//.test(page.url())} · پیام: ${JSON.stringify(toastText)}`);
  });
});
