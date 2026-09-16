/**
 * خودآزمای بَنچ.
 *
 * دو چیز اینجا می‌تواند بی‌صدا بشکند و هیچ‌کدام در اجرا دیده نمی‌شود، چون
 * نتیجه‌شان «سبز» است نه «قرمز»:
 *
 *   ۱. نامِ سناریو escape یا لنگر نشود → `--grep` یا زیادی می‌گیرد یا هیچ،
 *      و اجرا با سه سناریو به‌جای چهار — یا با بیست‌ودو به‌جای یک — سبز تمام
 *      می‌شود.
 *   ۲. فهرستِ خالی یک الگوی خالی ندهد → `--grep ''` یعنی همه، یا هیچ.
 */
import { test, expect } from '@playwright/test';
import { benchGrep, benchesOf, normalizeBench } from '../../src/runs/bench.js';

test('نامِ سناریو الگو نیست، متن است', () => {
  // پرانتز و نقطه در عنوانِ فارسی عادی‌اند؛ بی escape، `.` هر حرفی را می‌گیرد
  const grep = benchGrep(['ورود (بارِ اول)', 'خروج.']);
  expect(new RegExp(grep).test('ورود (بارِ اول)')).toBe(true);
  expect(new RegExp(grep).test('خروجX')).toBe(false);
  // بی escape، `.` هر حرفی را می‌گرفت و «خروجی» هم می‌افتاد داخلِ انتخاب
  expect(new RegExp(grep).test('خروجی')).toBe(false);
});

test('لنگر دارد، ولی پسوندِ پیش‌نویس را جا می‌دهد', () => {
  const grep = benchGrep(['کاوشِ من']);
  expect(new RegExp(grep).test('کاوشِ من [پیش‌نویس]')).toBe(true);
  expect(new RegExp(grep).test('کاوشِ من')).toBe(true);
  // Playwright عنوان را همراهِ زنجیرهٔ describe تطبیق می‌دهد
  expect(new RegExp(grep).test('yaml.spec.js › کاوشِ من')).toBe(true);
});

/**
 * ── باگی که یک بار واقعاً خورد ──
 *
 * روی صفحهٔ مأموریت‌ها تیکِ «ورود» زده شد — **یک** سفر — و ۲۲ تست اجرا شد:
 * ۲۱ تای آن خودآزمونِ خودِ userbug بود که «ورود» را در عنوانشان داشتند.
 * گزارش گفت «۲۱ سبز، ۱ قرمز»، و هیچ‌کدامِ آن سبزها مالِ اپِ کاربر نبود.
 *
 * زیررشته‌نبودن چیزی است که فقط یک آزمون می‌تواند نگهش دارد: چشم موقعِ
 * خواندنِ الگو آن را نمی‌بیند.
 */
test('نام زیررشتهٔ نامِ دیگری را نمی‌گیرد', () => {
  const grep = new RegExp(benchGrep(['ورود']));
  expect(grep.test('ورود')).toBe(true);
  expect(grep.test('ورودی نامعتبر بلند می‌شکند')).toBe(false);
  expect(grep.test('تکهٔ ورود همان‌جا تمام می‌شود، نه وسطِ اپ')).toBe(false);
  expect(grep.test('قدم‌هایی که فرمِ ورود ندارند، صریح رد می‌شوند')).toBe(false);
});

test('فهرستِ خالی الگوی خالی می‌دهد، نه الگویی که همه را بگیرد', () => {
  expect(benchGrep([])).toBe('');
  expect(benchGrep([''])).toBe('');
  expect(benchGrep(['  ', null, undefined])).toBe('');
});

test('یک نام هم کار می‌کند، چه در آرایه چه تنها', () => {
  expect(benchGrep('سلام')).toBe(benchGrep(['سلام']));
  expect(new RegExp(benchGrep('سلام')).test('سلام')).toBe(true);
});

test('نامِ بنچ تمیز و کوتاه می‌شود، ولی نبودنش خطا نیست', () => {
  expect(normalizeBench('  پیش   از\n انتشار ')).toBe('پیش از انتشار');
  expect(normalizeBench(null)).toBe('');
  expect(normalizeBench('x'.repeat(200))).toHaveLength(60);
});

test('فهرستِ بنچ‌ها یکتاست و اجراهای بی‌بنچ را نمی‌شمارد', () => {
  const runs = [
    { bench: 'الف' },
    { bench: '' },
    { bench: 'الف' },
    { bench: ' ب ' },
    {},
  ];
  expect(benchesOf(runs)).toEqual(['الف', 'ب']);
  expect(benchesOf(null)).toEqual([]);
});
