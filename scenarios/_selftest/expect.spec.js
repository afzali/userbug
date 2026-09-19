/**
 * خودآزمای «انتظار».
 *
 * ── چرا این یکی از همه خطرناک‌تر است ──
 *
 * انتظارِ غلط بدتر از نبودِ انتظار است. تست برای همیشه قرمز می‌ماند، و آدم
 * یاد می‌گیرد قرمزها را نادیده بگیرد — همان لحظه کلِ این ابزار بی‌اثر شده.
 * پس هر چیزی که مدل اختراع کند باید بیفتد، و افتادنش دیده شود.
 *
 * ── چه چیزی با رفتنِ YAML عوض شد ──
 *
 * `after` از **شماره** به **نام** رفت. دلیلش در `emit/spec.js` نوشته شده:
 * کاربر فایل را ویرایش می‌کند و هر قدمی که اضافه کند شماره‌ها را جابه‌جا
 * می‌کند. بندهای زیر همان ادعاها را می‌سنجند، با لنگرِ تازه.
 */
import { test, expect } from '@playwright/test';
import {
  applyExpectations,
  assertProposals,
  buildUser,
  countExpects,
  describeExpectation,
} from '../../src/scenario/expect.js';
import { emitSpec } from '../../src/emit/spec.js';

const CANDIDATES = [
  { ref: 'e1', route: '/contents', view: '', label: 'دکمه «افزودن کتاب»', target: { role: 'button', name: 'افزودن کتاب' }, by: 'contract' },
  { ref: 'e2', route: '/login', view: '', label: '«ایمیل»', target: { label: 'ایمیل' }, by: 'contract' },
];

const STEPS = ['باز کردن خانه', 'پر کردن فرم', 'زدنِ ورود'];

const SPEC = emitSpec({
  title: 'ورود',
  steps: [
    { name: STEPS[0], lines: ["await page.goto('/');"] },
    { name: STEPS[1], lines: ["await page.getByLabel('ایمیل').fill('a@b.c');"] },
    { name: STEPS[2], lines: ["await page.getByRole('button', { name: 'ورود' }).click();"] },
  ],
});

const propose = (expectations) => assertProposals({ expectations }, { candidates: CANDIDATES, steps: STEPS });

test('عنصری که در فهرست نبود، می‌افتد — و افتادنش نوشته می‌شود', () => {
  /**
   * همان درسِ `classify.js` و `explain.js` و `mission.js`: نامی که ندادیم،
   * از جوابِ مدل بیرون می‌رود. اینجا ولی هزینه‌اش بیشتر است — انتظارِ خیالی
   * یعنی یک تستِ همیشه‌قرمز.
   */
  const result = propose([{ after: STEPS[2], ref: 'e404', kind: 'visible', why: 'x' }]);
  expect(result.expectations).toHaveLength(0);
  expect(result.dropped[0]).toContain('e404');
});

test('لنگرِ ناشناس انتظار را نمی‌کشد، به پایان می‌بردش', () => {
  // «کجا سنجیده شود» را آدم در یک نگاه اصلاح می‌کند؛ ولی حرفِ درست نباید برود
  const result = propose([{ after: 'قدمی که وجود ندارد', ref: 'e1', kind: 'visible', why: 'کتابخانه باز شد' }]);
  expect(result.expectations[0].after).toBeNull();
  expect(result.dropped.join(' ')).toContain('قدمی که وجود ندارد');
});

test('`after: null` یعنی پایان، و افتادنی نیست', () => {
  // مدل صریح گفته «در پایان» — این انتخابِ درست است، نه خطا
  const result = propose([{ after: null, ref: 'e1', kind: 'visible', why: 'x' }]);
  expect(result.expectations[0].after).toBeNull();
  expect(result.dropped).toHaveLength(0);
});

test('انتظارِ تکراری یکی می‌شود', () => {
  const result = propose([
    { after: STEPS[2], ref: 'e1', kind: 'visible', why: 'یک' },
    { after: STEPS[1], ref: 'e1', kind: 'visible', why: 'دو' },
  ]);
  expect(result.expectations).toHaveLength(1);
  expect(result.dropped.join(' ')).toContain('تکراری');
});

test('اطمینانِ ناشناخته «کم» است، نه «زیاد»', () => {
  // پیش‌فرضِ خوش‌بینانه یعنی چیزی که مدل مطمئن نبوده، مثل قاعده نشان داده شود
  const result = propose([{ after: STEPS[0], ref: 'e1', kind: 'visible', why: 'x', confidence: 'شاید' }]);
  expect(result.expectations[0].confidence).toBe('low');
});

test('ترتیبِ خروجی، ترتیبِ فایل است و «پایان» آخر از همه', () => {
  const result = propose([
    { after: null, ref: 'e1', kind: 'visible', why: 'آخر' },
    { after: STEPS[0], ref: 'e2', kind: 'visible', why: 'اول' },
  ]);
  expect(result.expectations.map((one) => one.ref)).toEqual(['e2', 'e1']);
});

test('پیشنهادِ مدل نرم می‌شکند، نه سخت', () => {
  /**
   * `expect` سخت می‌شکند و اجرا را همان‌جا تمام می‌کند. حرفِ نیازموده‌ی مدل
   * نباید بتواند بقیهٔ تست را از اجرا بیندازد — یافته ثبت می‌کند و می‌گذرد.
   */
  const next = applyExpectations(SPEC, [
    { after: STEPS[2], kind: 'visible', target: { role: 'button', name: 'افزودن کتاب' }, why: 'کتابخانه باز شد', label: 'ک' },
  ]);
  expect(next).toContain('await expect.soft(');
  expect(next).toContain('کتابخانه باز شد');
  expect(next).not.toMatch(/await expect\(page\.getByRole\('button', \{ name: 'افزودن کتاب'/);
});

test('تأییدِ آدم، همان بند را سخت می‌کند', () => {
  const next = applyExpectations(SPEC, [
    { after: STEPS[2], kind: 'visible', target: { label: 'ایمیل' }, hard: true, why: 'x', label: 'ی' },
  ]);
  expect(next).toContain("await expect(page.getByLabel('ایمیل', { exact: true })).toBeVisible();");
  expect(next).not.toContain('expect.soft');
});

test('چند انتظار، هر کدام سرِ لنگرِ خودش', () => {
  const next = applyExpectations(SPEC, [
    { after: STEPS[0], kind: 'visible', target: { label: 'ایمیل' }, why: 'فرمِ ورود آمد', label: 'ی' },
    { after: STEPS[2], kind: 'hidden', target: { label: 'ایمیل' }, why: 'فرم رفت', label: 'ی' },
  ]);

  const first = next.indexOf('toBeVisible');
  const second = next.indexOf('toBeHidden');

  expect(first).toBeGreaterThan(next.indexOf(`ub.step('${STEPS[0]}'`));
  expect(first).toBeLessThan(next.indexOf(`ub.step('${STEPS[1]}'`));
  expect(second).toBeGreaterThan(next.indexOf(`ub.step('${STEPS[2]}'`));
});

test('ورودیِ مدل، نامِ قدم‌ها و شناسهٔ نامزدها را می‌دهد', () => {
  /**
   * نام و نه شماره: مدل باید چیزی برگرداند که `insertAssertions` بتواند در
   * فایل پیدایش کند.
   */
  const user = buildUser({ title: 'ورود', steps: STEPS, candidates: CANDIDATES, knowledge: 'نپی کتاب‌خوان است' });
  expect(user).toContain('- باز کردن خانه');
  expect(user).toContain('e1  /contents');
  expect(user).toContain('نپی کتاب‌خوان است');
  expect(user).not.toContain('1. go');
});

test('جملهٔ فهرست، خواندنی است نه JSON', () => {
  // آدم باید در یک نگاه بفهمد دارد چه چیزی را تأیید می‌کند
  expect(describeExpectation({ after: 'زدنِ ورود', label: 'دکمه «افزودن کتاب»', kind: 'visible' })).toBe(
    'بعد از «زدنِ ورود»: دکمه «افزودن کتاب» باید دیده شود'
  );
  expect(describeExpectation({ after: null, label: 'ک', kind: 'hidden' })).toBe('در پایان: ک نباید دیده شود');
});

test('شمارشِ ادعا، نرم و سخت هر دو را می‌شمارد', () => {
  /**
   * ── چرا این عدد ──
   *
   * گزارش با همین عدد می‌گوید «این تست بی‌ادعاست». شمارشِ کم یعنی تستی که
   * واقعاً ادعا دارد هشدارِ زرد بگیرد و آدم برود ادعایی اضافه کند که از
   * قبل هست.
   *
   * هر دو شمرده می‌شوند چون هر دو سنجش‌اند؛ تفاوتشان در شدتِ شکستن است نه
   * در اینکه چیزی را می‌آزمایند یا نه.
   */
  expect(countExpects(SPEC)).toBe(0);
  expect(countExpects('await expect(x).toBeVisible();')).toBe(1);
  expect(countExpects('await expect.soft(x, "y").toBeHidden();')).toBe(1);
  expect(countExpects('expect(a); expect.soft(b); await expect (c);')).toBe(3);
  expect(countExpects(null)).toBe(0);
});
