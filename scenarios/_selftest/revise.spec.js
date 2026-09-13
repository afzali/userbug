/**
 * خودآزمای بازنویسیِ سناریو.
 *
 * خطرِ اصلیِ این قابلیت «خطا دادن» نیست، **بی‌صدا درست به نظر رسیدن** است:
 * فایلِ تازه معتبر است، اجرا می‌شود، و سبز تمام می‌شود — چون سنجشی که
 * می‌شکست دیگر آنجا نیست. پس اینجا سه چیز سنجیده می‌شود که هیچ‌کدام در اجرا
 * دیده نمی‌شوند:
 *
 *   ۱. تفاوت واقعاً حذف را نشان بدهد (وگرنه دیدنِ آن ممکن نیست).
 *   ۲. سناریوی رسمی پس از بازنویسی رسمی نماند.
 *   ۳. مقدمهٔ ورود دوبار گذاشته نشود.
 */
import YAML from 'yaml';
import { test, expect } from '@playwright/test';
import { diffLines, diffSummary, parseScenario, withEntryPreamble } from '../../src/scenario/revise.js';

const SCENARIO = [
  '# سرصفحه',
  'name: ورود و آپلود',
  'status: approved',
  'persona: pro',
  'steps:',
  '  - go: /books',
  '  - click: آپلود',
  '  - expect:',
  '      text: انجام شد',
  '',
].join('\n');

test('فایلِ فعلی با همهٔ تصمیم‌هایش خوانده می‌شود', () => {
  const parsed = parseScenario(SCENARIO);
  expect(parsed.name).toBe('ورود و آپلود');
  expect(parsed.status).toBe('approved');
  expect(parsed.persona).toBe('pro');
  expect(parsed.steps).toHaveLength(3);
});

test('فایلِ ناخوانا صریح می‌گوید، نه اینکه از صفر بسازد', () => {
  // بازنویسیِ چیزی که خوانده نشده یعنی جایگزینی با متنی که مدل از هیچ ساخته
  expect(() => parseScenario('')).toThrow(/خوانده نشد|قدمی ندارد/);
  expect(() => parseScenario('name: x')).toThrow(/قدمی ندارد/);
  expect(() => parseScenario('name: x\nsteps:\n  - {}\n')).toThrow(/فعل ندارد/);
});

test('مقدمهٔ ورود جلو می‌نشیند و قدم‌های اصلی دست‌نخورده می‌مانند', () => {
  const out = withEntryPreamble(SCENARIO, [{ go: '/login' }, { click: 'ورود' }]);
  const doc = YAML.parse(out);

  expect(doc.steps.slice(0, 2)).toEqual([{ go: '/login' }, { click: 'ورود' }]);
  expect(doc.steps.slice(2)).toEqual(parseScenario(SCENARIO).steps);
  // هیچ مدلی در کار نبوده، پس تأییدِ آدم هنوز معتبر است
  expect(doc.status).toBe('approved');
  expect(doc.persona).toBe('pro');
});

test('مقدمهٔ تکراری دوباره گذاشته نمی‌شود', () => {
  const once = withEntryPreamble(SCENARIO, [{ go: '/login' }]);
  expect(() => withEntryPreamble(once, [{ go: '/login' }])).toThrow(/از قبل/);
});

test('سناریوی ورودِ خالی خطای روشن می‌دهد', () => {
  expect(() => withEntryPreamble(SCENARIO, [])).toThrow(/قدمی ندارد/);
});

test('سرصفحهٔ «چرا» می‌ماند، و توضیحِ میانِ قدم‌ها شمرده می‌شود', () => {
  // بازنویسی YAML را از نو می‌سازد، پس توضیح‌ها می‌افتند. در این مخزن
  // توضیح دلیلِ تصمیم است، نه تزئین — نخستین آزمایشِ واقعی روی ورود.yml
  // هجده خطِ «چرا» را برداشت.
  const withComments = [
    '# چرا این سناریو هست',
    '# دلیلِ دوم',
    '',
    'name: نمونه',
    'status: draft',
    'steps:',
    '  # این یکی وسط است و نمی‌ماند',
    '  - go: /',
    '',
  ].join('\n');

  const parsed = parseScenario(withComments);
  expect(parsed.header).toEqual(['# چرا این سناریو هست', '# دلیلِ دوم']);
  expect(parsed.inlineComments).toBe(1);

  const out = withEntryPreamble(withComments, [{ go: '/login' }]);
  expect(out).toContain('# چرا این سناریو هست');
  expect(out).toContain('سرصفحهٔ نسخهٔ پیشین');
  // و صریح می‌گوید چند خط نماند، وگرنه تنها نشانه‌اش خط‌های قرمزِ تفاوت است
  expect(out).toContain('1 خطِ توضیح');
});

test('تفاوت، حذف را هم نشان می‌دهد نه فقط افزوده را', () => {
  const before = 'الف\nب\nج';
  const after = 'الف\nج';
  const rows = diffLines(before, after);

  expect(diffSummary(rows)).toEqual({ added: 0, removed: 1 });
  expect(rows.find((row) => row.kind === 'removed').text).toBe('ب');
});

test('تفاوتِ دو متنِ یکسان خالی است', () => {
  expect(diffSummary(diffLines(SCENARIO, SCENARIO))).toEqual({ added: 0, removed: 0 });
});

test('خطِ افتادهٔ expect در تفاوت پیداست', () => {
  // همان سناریوی خطرناک: مدل سنجش را برمی‌دارد و همه‌چیز سبز می‌شود
  const stripped = SCENARIO.split('\n').filter((line) => !line.includes('expect') && !line.includes('انجام شد')).join('\n');
  const removed = diffLines(SCENARIO, stripped)
    .filter((row) => row.kind === 'removed')
    .map((row) => row.text)
    .join('\n');

  expect(removed).toContain('expect');
  expect(removed).toContain('انجام شد');
});
