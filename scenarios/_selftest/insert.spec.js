/**
 * خودآزمای درجِ ادعا در فایلِ موجود.
 *
 * ── چرا این فایل از بقیه مهم‌تر است ──
 *
 * اینجا تنها جایی است که ابزار به فایلی دست می‌زند که **کاربر نوشته**.
 * شکستِ بد اینجا شکستنِ تست نیست؛ خراب کردنِ کدِ کسی است.
 *
 * پس هر بند یکی از این دو را می‌سنجد: یا درج در جای درست نشست، یا وقتی
 * مطمئن نبودیم **هیچ کاری نکردیم**. حالتِ سومی — درجی که جای غلط بنشیند
 * یا فایل را نامعتبر کند — نباید وجود داشته باشد.
 */
import { test, expect } from '@playwright/test';
import { insertAssertions, blockEnd, testEnd, assertParses } from '../../src/emit/insert.js';
import { emitSpec } from '../../src/emit/spec.js';

const BASE = emitSpec({
  title: 'ورود',
  steps: [
    { name: 'باز کردن خانه', lines: ["await page.goto('/');"] },
    { name: 'پر کردن فرم', lines: ["await page.getByLabel('ایمیل').fill(identity.email);"] },
  ],
});

const SAVE = { target: { role: 'button', name: 'ذخیره' }, hard: true };
const EXIT = { target: { testid: 'exit' }, hard: true };

test('ادعا درست بعد از قدمِ نام‌برده می‌نشیند', () => {
  const out = insertAssertions(BASE, [{ ...SAVE, after: 'باز کردن خانه' }]);

  const step = out.indexOf("ub.step('باز کردن خانه'");
  const next = out.indexOf("ub.step('پر کردن فرم'");
  const assertion = out.indexOf('toBeVisible');

  expect(assertion).toBeGreaterThan(step);
  expect(assertion).toBeLessThan(next);
});

test('ادعای بی‌لنگر در پایانِ تست می‌نشیند', () => {
  const out = insertAssertions(BASE, [SAVE]);
  expect(out.indexOf('toBeVisible')).toBeGreaterThan(out.indexOf("ub.step('پر کردن فرم'"));
  expect(out.trimEnd().endsWith('});')).toBe(true);
});

test('چند ادعا در یک جا، ترتیبِ نوشتن را نگه می‌دارند', () => {
  const out = insertAssertions(BASE, [
    { ...SAVE, after: 'باز کردن خانه' },
    { ...EXIT, after: 'باز کردن خانه' },
  ]);
  expect(out.indexOf("name: 'ذخیره'")).toBeLessThan(out.indexOf("getByTestId('exit')"));
});

test('ادعا در دو لنگرِ متفاوت، هر کدام سرِ جای خودش', () => {
  const out = insertAssertions(BASE, [
    { ...EXIT, after: 'پر کردن فرم' },
    { ...SAVE, after: 'باز کردن خانه' },
  ]);

  const first = out.indexOf("name: 'ذخیره'");
  const second = out.indexOf("getByTestId('exit')");
  const middle = out.indexOf("ub.step('پر کردن فرم'");

  expect(first).toBeLessThan(middle);
  expect(second).toBeGreaterThan(middle);
});

test('نامِ ناشناس بلند می‌شکند — و فایل دست‌نخورده می‌ماند', () => {
  /**
   * درجی که جای دیگری بنشیند از درج‌نشدن بدتر است: کاربر ادعا را در فایل
   * می‌بیند و فکر می‌کند جای درستی است.
   */
  expect(() => insertAssertions(BASE, [{ ...SAVE, after: 'قدمی که نیست' }])).toThrow(/نیست/);
});

test('آکولاد داخلِ رشته و کامنت و template، شمارش را گول نمی‌زند', () => {
  const tricky = emitSpec({
    title: 'دشوار',
    steps: [
      {
        name: 'پرآکولاد',
        lines: [
          "const a = '}';",
          'const b = `متن ${ { تو: 1 }.تو } باز`;',
          '// } کامنتِ تک‌خطی',
          '/* } کامنتِ بلوکی { */',
          'const c = { d: { e: 1 } };',
          'await page.goto(`/${a}`);',
        ],
      },
      { name: 'بعدی', lines: ["await page.goto('/next');"] },
    ],
  });

  const out = insertAssertions(tricky, [{ ...SAVE, after: 'پرآکولاد' }]);

  const assertion = out.indexOf('toBeVisible');
  expect(assertion).toBeGreaterThan(out.indexOf("ub.step('پرآکولاد'"));
  expect(assertion).toBeLessThan(out.indexOf("ub.step('بعدی'"));
});

test('نامِ قدم با نقل‌قول هم لنگر می‌شود', () => {
  const quoted = emitSpec({
    title: 'x',
    steps: [{ name: `it's ورود`, lines: ["await page.goto('/');"] }],
  });
  expect(() => insertAssertions(quoted, [{ ...SAVE, after: `it's ورود` }])).not.toThrow();
});

test('وقتی اسکنر گول می‌خورد، فایل خراب برنمی‌گردد', () => {
  /**
   * literalِ منظم تنها چیزی است که اسکنر نمی‌فهمد: `/}/` یک `}` دارد که
   * کد نیست. به‌جای وانمود کردن به پارسرِ کامل، نتیجه سنجیده می‌شود.
   *
   * خواستهٔ این بند «درست درج کن» نیست؛ «یا درست، یا هیچ» است.
   */
  const risky = emitSpec({
    title: 'منظم',
    steps: [
      { name: 'منظم‌دار', lines: ['const re = /}/;', 'if (re.test(`x`)) await page.goto("/");'] },
      { name: 'بعدی', lines: ["await page.goto('/next');"] },
    ],
  });

  let out = null;
  try {
    out = insertAssertions(risky, [{ ...SAVE, after: 'منظم‌دار' }]);
  } catch {
    out = null; // شکستِ صریح — همان چیزی که می‌خواهیم
  }

  // اگر درج شد، باید معتبر باشد؛ اگر نشد، فایل دست‌نخورده است.
  if (out !== null) expect(() => assertParses(out)).not.toThrow();
});

test('خروجی همیشه پارس می‌شود', () => {
  const out = insertAssertions(BASE, [
    { ...SAVE, after: 'باز کردن خانه' },
    { target: { label: 'ایمیل' }, kind: 'hidden', why: `it's «پنهان»` },
  ]);
  expect(() => assertParses(out)).not.toThrow();
  expect(out).toContain('expect.soft');
});

test('`blockEnd` و `testEnd` اندیسِ معنادار می‌دهند', () => {
  const end = blockEnd(BASE, 'باز کردن خانه');
  expect(BASE.slice(end - 3, end)).toBe('});');
  expect(testEnd(BASE)).toBeLessThan(BASE.length);
  expect(() => testEnd('const x = 1;\n')).toThrow(/پایانِ/);
});
