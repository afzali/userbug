/**
 * خودآزمای چکِ همگانی.
 *
 * ── چرا هر دو سمت سنجیده می‌شود ──
 *
 * سنجیدنِ فقط «خرابی گرفته شد» کافی نیست: چکی که به **همه‌چیز** یافته بدهد
 * هم آن آزمون را پاس می‌کند. و چکِ پرسروصدا کلِ گزارش را بی‌ارزش می‌کند —
 * سه هفته بعد کسی دیگر گزارش را نمی‌خواند.
 *
 * پس هر چک دو تست دارد: صفحهٔ خراب باید گرفته شود، و صفحهٔ سالمِ **شبیه به
 * آن** باید ساکت بماند.
 */
import { test, expect } from '@playwright/test';
import { UNIVERSAL, probePage } from '../../src/checks/universal.js';
import { runUniversalChecks } from '../../src/checks/run.js';

/** فقط چک‌ها را روی یک HTML اجرا کن، بی‌فیکسچر و بی‌مخزن. */
async function check(page, html) {
  await page.setContent(html);
  const probe = await probePage(page);
  const hits = [];
  for (const item of UNIVERSAL) {
    const result = item.run(probe);
    if (result) hits.push({ id: item.id, message: result.message, detail: result.detail });
  }
  return { hits, ids: hits.map((h) => h.id), probe };
}

const HEALTHY = `<!doctype html><html lang="fa" dir="rtl"><head><title>کتابخانه</title></head><body>
  <h1>کتابخانه</h1>
  <p>اینجا فهرست اسناد شما دیده می‌شود.</p>
  <button>سند جدید</button>
  <a href="/settings">تنظیمات</a>
</body></html>`;

test('صفحهٔ سالم هیچ یافته‌ای نمی‌سازد', async ({ page }) => {
  const { ids } = await check(page, HEALTHY);
  expect(ids).toEqual([]);
});

test('صفحهٔ کاملاً خالی گرفته می‌شود', async ({ page }) => {
  const { ids, hits } = await check(page, `<!doctype html><html><head><title>x</title></head><body></body></html>`);
  expect(ids).toContain('empty-page');
  expect(hits[0].detail.interactive).toBe(0);
});

test('صفحهٔ کوچک ولی زنده، خالی شمرده نمی‌شود', async ({ page }) => {
  // شرط «و» است نه «یا»: یک دکمه یعنی کاربر به بن‌بست نرسیده
  const { ids } = await check(page, `<!doctype html><html><head><title>x</title></head><body><button>برو</button></body></html>`);
  expect(ids).not.toContain('empty-page');
});

test('[object Object] روی صفحه گرفته می‌شود', async ({ page }) => {
  const { ids, hits } = await check(page, `<body><p>نویسنده: [object Object]</p><button>ب</button></body>`);
  expect(ids).toContain('object-literal');
  expect(hits.find((h) => h.id === 'object-literal').detail.sample).toContain('نویسنده');
});

test('همان متن داخل code یا pre، یافته نیست', async ({ page }) => {
  const { ids } = await check(
    page,
    `<body><p>خروجی چنین است:</p><pre>[object Object]</pre><code>undefined</code><button>ب</button></body>`
  );
  expect(ids).not.toContain('object-literal');
  expect(ids).not.toContain('undefined-text');
});

test('قالبِ رندرنشده گرفته می‌شود', async ({ page }) => {
  const { ids } = await check(page, `<body><h1>سلام {{ user.name }}</h1><button>ب</button></body>`);
  expect(ids).toContain('unrendered-template');
});

test('ردِ پشته و نام خطا روی صفحه گرفته می‌شوند', async ({ page }) => {
  const trace = await check(page, `<body><p>at renderList (app.js:42:11)</p><button>ب</button></body>`);
  expect(trace.ids).toContain('stack-trace');

  const named = await check(page, `<body><p>TypeError: cannot read x</p><button>ب</button></body>`);
  expect(named.ids).toContain('runtime-error');
});

test('undefined و NaN و null به‌شکل متن گرفته می‌شوند', async ({ page }) => {
  const { ids } = await check(page, `<body><p>قیمت: NaN تومان</p><p>نام: undefined</p><p>مقدار: null</p><button>ب</button></body>`);
  expect(ids).toContain('nan-text');
  expect(ids).toContain('undefined-text');
  expect(ids).toContain('null-text');
});

test('واژه‌های عادی که این توکن‌ها را در خود دارند، یافته نمی‌سازند', async ({ page }) => {
  // «nullable» و «undefinedBehavior» واژه‌اند، نه مقدارِ رندرشده
  const { ids } = await check(
    page,
    `<body><p>این ستون nullable است و رفتارش undefinedBehavior نامیده می‌شود. NaNoTech هم همین‌طور.</p><button>ب</button></body>`
  );
  expect(ids).not.toContain('null-text');
  expect(ids).not.toContain('undefined-text');
  expect(ids).not.toContain('nan-text');
});

test('عنوانِ ۴۰۴ گرفته می‌شود، حتی وقتی پاسخ HTTP سالم است', async ({ page }) => {
  const { ids } = await check(page, `<html><head><title>404 - صفحه پیدا نشد</title></head><body><h1>پیدا نشد</h1><a href="/">خانه</a></body></html>`);
  expect(ids).toContain('error-title');
});

test('عنوانی که فقط واژهٔ خطا دارد، یافته نیست', async ({ page }) => {
  // داشبوردی به نام «گزارش خطاها» صفحهٔ سالمی است
  const { ids } = await check(page, `<html><head><title>گزارش خطاها</title></head><body><h1>خطاها</h1><button>ب</button></body></html>`);
  expect(ids).not.toContain('error-title');
});

test('اسکرول افقی گرفته می‌شود و عنصرِ مقصر را نام می‌برد', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 600 });
  const { ids, hits } = await check(
    page,
    `<body style="margin:0"><div class="wide" style="width:1200px;height:40px;background:#eee">پهن</div><button>ب</button></body>`
  );
  expect(ids).toContain('horizontal-overflow');
  expect(hits.find((h) => h.id === 'horizontal-overflow').detail.worst.cls).toBe('wide');
});

test('نمایشگرِ JSON یافته نمی‌سازد', async ({ page }) => {
  // رابطی که پاسخ خام API را نشان می‌دهد (مثل خودِ رابط userbug) پر از
  // null و undefined است و همه‌اش عمدی است
  const { ids } = await check(
    page,
    `<body><div>{"name": "x", "parent": null, "size": undefined, "score": NaN}</div><button>ب</button></body>`
  );
  expect(ids).toEqual([]);
});

test('حالت off چک را کاملاً حذف می‌کند', async ({ page }) => {
  await page.setContent(`<body><p>[object Object]</p><button>ب</button></body>`);

  const on = await runUniversalChecks({ page, target: '', config: { checks: {} }, synthetic: true });
  expect(on.findings.map((f) => f.checkId)).toContain('object-literal');

  const off = await runUniversalChecks({
    page,
    target: '',
    config: { checks: { 'object-literal': { mode: 'off', why: 'تست' } } },
    synthetic: true,
  });
  expect(off.findings.map((f) => f.checkId)).not.toContain('object-literal');
});

test('حالت expect یافته را در فهرست سخت می‌گذارد', async ({ page }) => {
  await page.setContent(`<body><p>[object Object]</p><button>ب</button></body>`);

  const { findings, hard } = await runUniversalChecks({
    page,
    target: '',
    config: { checks: { 'object-literal': { mode: 'expect' } } },
    synthetic: true,
  });

  expect(hard).toHaveLength(1);
  expect(findings[0].detail.mode).toBe('expect');
  // یافته حتی در حالت سخت هم ثبت می‌شود؛ شکستن جای دیگری است
  expect(findings[0].source).toBe('check');
});

test('یافتهٔ چک، شناسهٔ چک را حمل می‌کند', async ({ page }) => {
  await page.setContent(`<body><p>TypeError: x</p><button>ب</button></body>`);
  const { findings } = await runUniversalChecks({ page, target: '', config: { checks: {} }, synthetic: true });

  // بدون این، حلقهٔ یادگیری نمی‌تواند چکِ پرسروصدا را پیدا کند
  expect(findings.every((f) => f.checkId && f.fingerprint)).toBe(true);
});

test('صفحهٔ بسته یافته نمی‌سازد', async ({ page }) => {
  await page.setContent(HEALTHY);
  await page.close();

  // نبودِ سنجش، سنجشِ موفق نیست — ولی یافته هم نیست
  const { findings, probe } = await runUniversalChecks({ page, target: '', config: { checks: {} }, synthetic: true });
  expect(findings).toEqual([]);
  expect(probe).toBeNull();
});
