/**
 * خودآزمای هم‌زبانیِ حل‌کننده و تولیدکننده.
 *
 * ── چرا این فایل هست ──
 *
 * `src/scenario/resolve.js` توصیفِ هدف را در **زمانِ اجرا** به locator
 * تبدیل می‌کند؛ `src/emit/locator.js` همان توصیف را به **متنِ** locator.
 * دو تبدیل برای یک معنا — و این مخزن یک بار بهای همین الگو را داده است:
 * `replay-parity.spec.js` برای دو مفسر نوشته شد که «دیر یا زود واگرا
 * می‌شوند» و واگرا شدند.
 *
 * اینجا واگرایی بدتر است. اگر `checks` عنصری را با `resolveTarget` پیدا
 * کند ولی تستِ تولیدشده با کدِ خودش پیدایش نکند، یافته‌ای ثبت می‌شود که
 * **هیچ‌وقت بازتولید نمی‌شود** — و «یافتهٔ اشتباه از نبودِ یافته بدتر است».
 *
 * پس این فایل روی متن قفل نمی‌کند، روی **رفتار**: هر توصیف از هر دو راه
 * ساخته می‌شود و باید روی یک صفحهٔ واقعی به یک چیز برسد.
 */
import { test, expect } from '@playwright/test';
import { resolveTarget } from '../../src/scenario/resolve.js';
import { emitLocator, quote } from '../../src/emit/locator.js';
import { emitAssertion } from '../../src/emit/assertion.js';

/**
 * صفحهٔ ساختگی.
 *
 * دو «نام کتاب» دارد که یکی پنهان است — همان چیزی که `visible` را لازم
 * کرد: کامپوننت Tabs محتوای همهٔ تب‌ها را در DOM نگه می‌دارد.
 */
const PAGE = `<!doctype html><html lang="fa" dir="rtl"><body>
  <button data-testid="save">ذخیره</button>
  <button>ورود / ثبت‌نام</button>

  <label for="email">ایمیل</label><input id="email" />
  <input placeholder="جستجو کنید" />

  <div hidden><label for="b1">نام کتاب</label><input id="b1" /></div>
  <label for="b2">نام کتاب</label><input id="b2" value="دیده می‌شود" />

  <p>تنها یک بار</p>
  <span class="tag">برچسب</span>
  <span class="tag">برچسب</span>
</body></html>`;

/** هر توصیف، با نامی که در گزارش خوانده می‌شود. */
const TARGETS = [
  ['testid', { testid: 'save' }],
  ['role + name', { role: 'button', name: 'ورود / ثبت‌نام' }],
  ['role بی‌نام', { role: 'textbox' }],
  ['label', { label: 'ایمیل' }],
  ['placeholder', { placeholder: 'جستجو کنید' }],
  ['text', { text: 'تنها یک بار' }],
  ['label + visible', { label: 'نام کتاب', visible: true }],
  ['selector + nth', { selector: '.tag', nth: 1 }],
  ['exact: false', { role: 'button', name: 'ثبت‌نام', exact: false }],
  ['رشتهٔ ساده (نردبان)', 'ذخیره'],
];

/** کدِ تولیدشده را به locator تبدیل می‌کند — همان کاری که فایلِ spec می‌کند. */
const build = (page, source) => new Function('page', `return ${source};`)(page);

for (const [name, target] of TARGETS) {
  test(`هم‌زبانی: ${name}`, async ({ page }) => {
    await page.setContent(PAGE);

    const { locator: resolved } = resolveTarget(page, target);
    const emitted = build(page, emitLocator(target));

    const count = await resolved.count();

    // شمارشِ برابر تنها نیمِ ادعاست: دو locatorِ متفاوت می‌توانند هر دو یک
    // عنصر پیدا کنند و آن یکی نباشد. پس وقتی دقیقاً یکی است، خودِ عنصر هم
    // سنجیده می‌شود.
    expect(await emitted.count(), `شمارشِ «${name}» فرق کرد`).toBe(count);

    if (count === 1) {
      const [a, b] = await Promise.all([
        resolved.evaluate((el) => el.outerHTML),
        emitted.evaluate((el) => el.outerHTML),
      ]);
      expect(b, `عنصرِ «${name}» فرق کرد`).toBe(a);
    }
  });
}

test('هدفِ نامفهوم در هر دو راه می‌شکند', async ({ page }) => {
  await page.setContent(PAGE);

  // سکوت در برابر توصیفِ بد یعنی تستی که چیزی را نمی‌آزماید ولی سبز است.
  expect(() => resolveTarget(page, { nope: 1 })).toThrow();
  expect(() => emitLocator({ nope: 1 })).toThrow();

  expect(() => resolveTarget(page, null)).toThrow();
  expect(() => emitLocator(null)).toThrow();
});

test('رشته با نقل‌قول و بک‌اسلش، کدِ معتبر می‌سازد', () => {
  /**
   * نامِ عناصر از خودِ اپ می‌آید، نه از ما. آپاستروف در نامِ یک دکمه کافی
   * است تا فایلِ تولیدشده اصلاً پارس نشود — و آن خطا در جایی دیده می‌شود
   * که هیچ ربطی به علتش ندارد.
   */
  for (const raw of ["it's", 'back\\slash', 'خط\nدوم', 'ساده']) {
    expect(new Function(`return ${quote(raw)};`)()).toBe(raw);
  }
});

test('ادعای سخت و نرم، شکلِ درستِ پلی‌رایت را می‌گیرند', () => {
  const target = { role: 'button', name: 'ذخیره' };

  expect(emitAssertion({ target, hard: true })).toBe(
    `await expect(page.getByRole('button', { name: 'ذخیره', exact: true })).toBeVisible();`,
  );

  expect(emitAssertion({ target, kind: 'hidden', hard: true })).toBe(
    `await expect(page.getByRole('button', { name: 'ذخیره', exact: true })).toBeHidden();`,
  );

  // پیشنهادِ نیازمودهٔ مدل نرم می‌شکند: یافته ثبت می‌شود و تست ادامه می‌دهد.
  expect(emitAssertion({ target, why: 'بعد از ذخیره باید بماند' })).toBe(
    `await expect.soft(page.getByRole('button', { name: 'ذخیره', exact: true }), 'بعد از ذخیره باید بماند').toBeVisible();`,
  );
});

test('ادعای تولیدشده واقعاً اجرا می‌شود', async ({ page }) => {
  /**
   * سه بندِ بالا شکلِ متن را می‌سنجند. این یکی می‌سنجد که آن متن، کدِ
   * زنده‌ای است که پلی‌رایت اجرایش می‌کند — وگرنه یک ویرگولِ جاافتاده تا
   * اولین اجرای واقعی پنهان می‌ماند.
   */
  await page.setContent(PAGE);

  const run = (src) => new Function('page', 'expect', `return (async () => { ${src} })();`)(page, expect);

  await run(emitAssertion({ target: { testid: 'save' }, hard: true }));
  await run(emitAssertion({ target: { text: 'نیست و نبوده' }, kind: 'hidden', hard: true }));
});
