/**
 * خودآزمای قراردادِ صفحه — لایهٔ ۲ از سنجهٔ هوشمند.
 *
 * ── مسئله‌ای که کلِ این لایه حول آن است ──
 *
 * ساده‌ترین پیاده‌سازی این است: نخستین بار که صفحه را دیدیم، عناصرش را ذخیره
 * کن و دفعهٔ بعد بسنج. و **کار نمی‌کند** — چون فهرستِ عناصرِ `/library` شاملِ
 * نامِ سندهای خودِ کاربر است. اجرای بعدی با دادهٔ دیگری می‌آید و قرارداد
 * می‌شکند، بی‌آنکه چیزی خراب باشد.
 *
 * پس این تست‌ها بیشتر از «شکست را می‌گیرد»، این را می‌سنجند: **دادهٔ کاربر
 * هرگز قاعده نمی‌شود.**
 */
import { test, expect } from '@playwright/test';
import {
  LEARNING_VISITS,
  contractFrom,
  describeTarget,
  reinforce,
  verifyContract,
} from '../../src/checks/contract.js';
import { snapshotPage } from '../../src/steps/snapshot.js';

/** صفحه‌ای با چیدمانِ ثابت و یک فهرستِ داده‌محور. */
const page1 = `<!doctype html><html lang="fa" dir="rtl"><body>
  <h1>کتابخانه</h1>
  <button>سند جدید</button>
  <button>تنظیمات</button>
  <input aria-label="جست‌وجو" />
  <ul><li><a href="/d/1">قرارداد اجاره</a></li><li><a href="/d/2">یادداشت جلسه</a></li></ul>
</body></html>`;

/** همان صفحه، با دادهٔ متفاوت — همان چیزی که اجرای بعدی می‌بیند. */
const page2 = `<!doctype html><html lang="fa" dir="rtl"><body>
  <h1>کتابخانه</h1>
  <button>سند جدید</button>
  <button>تنظیمات</button>
  <input aria-label="جست‌وجو" />
  <ul><li><a href="/d/9">فاکتور مهر</a></li></ul>
</body></html>`;

/** همان صفحه، ولی دکمهٔ اصلی رفته — این یعنی خرابی. */
const broken = page2.replace('<button>سند جدید</button>', '');

test('نامزدها از چیدمانِ ثابت می‌آیند، نه از پیوندهای داده‌محور', async ({ page }) => {
  await page.setContent(page1);
  const must = contractFrom(await snapshotPage(page));
  const text = JSON.stringify(must);

  expect(text).toContain('سند جدید');
  expect(text).toContain('جست‌وجو');

  /**
   * `link` عمداً در فهرستِ نقش‌های ساختاری نیست: در بیشتر اپ‌ها پیوندها
   * همان دادهٔ کاربرند.
   */
  expect(text).not.toContain('قرارداد اجاره');
  expect(text).not.toContain('یادداشت جلسه');
});

test('تقویت، تقاطع می‌گیرد نه اجتماع', async ({ page }) => {
  await page.setContent(page1);
  const first = contractFrom(await snapshotPage(page));

  await page.setContent(page2);
  const second = contractFrom(await snapshotPage(page));

  const { contract, dropped } = reinforce({ must: first, seenIn: 1 }, second);

  expect(contract.seenIn).toBe(2);
  // آنچه در بازدید اول نبود، بخشِ ثابتِ صفحه نیست
  expect(contract.must.length).toBeLessThanOrEqual(first.length);
  expect(dropped).toBe(first.length - contract.must.length);
});

test('بندی که غایب شود، حذف می‌شود — نه اینکه بماند و بشکند', () => {
  const before = { must: [{ role: 'button', name: 'الف' }, { role: 'button', name: 'ب' }], seenIn: 1 };
  const { contract, dropped } = reinforce(before, [{ role: 'button', name: 'الف' }]);

  expect(contract.must).toEqual([{ role: 'button', name: 'الف' }]);
  expect(dropped).toBe(1);
});

test('نخستین بازدید همهٔ نامزدها را می‌گیرد', () => {
  const candidates = [{ role: 'button', name: 'الف' }];
  const { contract } = reinforce({ must: [], seenIn: 0 }, candidates);

  expect(contract.must).toEqual(candidates);
  expect(contract.seenIn).toBe(1);
  expect(contract.lastSeen).toBeTruthy();
});

test('سنجش، بندِ غایب را پیدا می‌کند و بندِ موجود را نه', async ({ page }) => {
  await page.setContent(page1);
  const must = contractFrom(await snapshotPage(page));

  const same = await verifyContract(page, { must });
  expect(same.missing).toEqual([]);
  expect(same.present).toBe(must.length);

  await page.setContent(broken);
  const after = await verifyContract(page, { must });
  expect(JSON.stringify(after.missing)).toContain('سند جدید');
});

test('توصیفِ نامعتبر، غایب شمرده می‌شود نه اینکه بشکند', async ({ page }) => {
  await page.setContent(page1);
  // ایرادِ قرارداد است نه ایرادِ اپ؛ ولی نباید سنجش را از کار بیندازد
  const result = await verifyContract(page, { must: [{ role: 'nonsense-role', name: 'x' }] });
  expect(result.missing).toHaveLength(1);
});

test('نامِ خوانا برای پیامِ یافته', () => {
  expect(describeTarget({ role: 'button', name: 'ذخیره' })).toBe('button «ذخیره»');
  expect(describeTarget({ label: 'ایمیل' })).toBe('«ایمیل»');
  expect(describeTarget({ testid: 'save' })).toBe('[save]');
});

/* ─────────────── حلقهٔ کامل، از راه اجراگر ─────────────── */

async function runCheck(page, record) {
  const { runContractCheck } = await import('../../src/checks/run.js');
  return await runContractCheck({ page, target: 'demo', record, step: 'قدم', synthetic: true });
}

test('در مرحلهٔ یادگیری، غیبت یافته نمی‌سازد', async ({ page }) => {
  await page.setContent(page1);
  const must = contractFrom(await snapshotPage(page));

  await page.setContent(broken);
  const result = await runCheck(page, { path: '/library', contract: { mode: 'watch', must, seenIn: 1 } });

  /**
   * نبودنِ یک بند در بازدید دوم یعنی «این داده بود»، نه «این خراب شد». اگر
   * اینجا یافته ساخته می‌شد، هر صفحهٔ داده‌محور در هر اجرا یافته می‌داد.
   */
  expect(result.findings).toEqual([]);
  expect(result.page.contract.must.length).toBeLessThan(must.length);
});

test('پس از آستانه، غیبت یافته می‌سازد', async ({ page }) => {
  await page.setContent(page1);
  const must = contractFrom(await snapshotPage(page));

  await page.setContent(broken);
  const result = await runCheck(page, {
    path: '/library',
    contract: { mode: 'watch', must, seenIn: LEARNING_VISITS },
  });

  expect(result.findings).toHaveLength(1);
  expect(result.findings[0].source).toBe('contract');
  expect(result.findings[0].message).toContain('سند جدید');
  // حلقهٔ یادگیری به شناسه نیاز دارد تا بتواند قراردادِ پرسروصدا را پیدا کند
  expect(result.findings[0].checkId).toBe('contract:/library');
});

test('حالت off هیچ کاری نمی‌کند', async ({ page }) => {
  await page.setContent(broken);
  const result = await runCheck(page, {
    path: '/library',
    contract: { mode: 'off', must: [{ role: 'button', name: 'سند جدید' }], seenIn: 9 },
  });

  expect(result.findings).toEqual([]);
  expect(result.page).toBeNull();
});

test('قراردادِ خالی، snapshot اضافه نمی‌گیرد', async ({ page }) => {
  await page.setContent(page1);
  // همهٔ نامزدها حذف شده‌اند: این صفحه بخشِ ثابتِ قابلِ اتکایی ندارد
  const result = await runCheck(page, { path: '/x', contract: { mode: 'watch', must: [], seenIn: 4 } });

  expect(result.findings).toEqual([]);
  expect(result.page).toBeNull();
});

test('سه بازدید روی دادهٔ متفاوت، قرارداد را به چیدمانِ ثابت می‌رساند', async ({ page }) => {
  /**
   * این تستِ کلِ ایده است: بدونِ هیچ دخالتی، آنچه می‌ماند دقیقاً همان چیزی
   * است که در هر سه بازدید بود.
   */
  await page.setContent(page1);
  let contract = { mode: 'watch', must: contractFrom(await snapshotPage(page)), seenIn: 1 };

  for (const html of [page2, page1, page2]) {
    await page.setContent(html);
    contract = reinforce(contract, contractFrom(await snapshotPage(page))).contract;
  }

  const text = JSON.stringify(contract.must);
  expect(text).toContain('سند جدید');
  expect(text).toContain('تنظیمات');
  expect(text).toContain('جست‌وجو');
  expect(text).not.toContain('قرارداد اجاره');
  expect(text).not.toContain('فاکتور مهر');
  expect(contract.seenIn).toBe(4);
});
