/**
 * خودآزمای عرضِ نمایشی.
 *
 * ── چرا این فایل هست ──
 *
 * کلِ خروجیِ این ابزار ترمینال است و کاربرش فارسی می‌خواند. ستونی که یک
 * فاصله بلغزد، در جدولی که آدم دارد ردیف‌هایش را با هم مقایسه می‌کند،
 * خواندن را از بین می‌برد — و علتش آن‌قدر نامرئی است که کسی دنبالش
 * نمی‌گردد: نیم‌فاصله یک واحدِ UTF-16 است و هیچ ستونی نمی‌گیرد.
 */
import { test, expect } from '@playwright/test';
import { width, pad, clip, row } from '../../src/terminal.js';

test('نیم‌فاصله شمرده نمی‌شود', () => {
  // 'می‌کند' شش واحد است و پنج ستون
  expect('می‌کند'.length).toBe(6);
  expect(width('می‌کند')).toBe(5);

  expect('پاس‌شده'.length).toBe(7);
  expect(width('پاس‌شده')).toBe(6);

  // و متنِ بی‌نیم‌فاصله فرقی نمی‌کند
  expect(width('ناتمام')).toBe(6);
  expect(width('failed')).toBe(6);
});

test('اعراب و نشانه‌های جهت هم ستون نمی‌گیرند', () => {
  expect(width('مُعلّم')).toBe(4); // م ع ل م + دو حرکت
  expect(width('‏فارسی‎')).toBe(5);
  expect(width('')).toBe(0);
  expect(width(null)).toBe(0);
});

test('کدِ رنگ جا نمی‌گیرد', () => {
  expect(width('[31mقرمز[0m')).toBe(4);
});

test('نویسهٔ پهن دو ستون است', () => {
  expect(width('漢字')).toBe(4);
  expect(width('a漢')).toBe(3);
});

test('`pad` ستون را درست می‌بندد', () => {
  /**
   * همان جایی که `padEnd` می‌لغزید: دو واژهٔ فارسی که یکی نیم‌فاصله دارد
   * باید هم‌عرض دربیایند.
   */
  expect(width(pad('می‌کند', 10))).toBe(10);
  expect(width(pad('ناتمام', 10))).toBe(10);
  expect(width(pad('نشد', 10))).toBe(10);

  // مقایسهٔ مستقیم با رفتارِ غلطِ قبلی
  expect('می‌کند'.padEnd(10).length).toBe(10);
  expect(width('می‌کند'.padEnd(10))).toBe(9); // ← یک ستون کم

  expect(pad('x', 5, 'start')).toBe('    x');
  expect(pad('طولانی‌تر از ستون', 3)).toBe('طولانی‌تر از ستون'); // کوتاه نمی‌کند
});

test('`clip` روی مرزِ نویسه می‌بُرد، نه واحدِ UTF-16', () => {
  /**
   * `slice` نیم‌فاصله را وسط نمی‌بُرد (یک واحد است) ولی علامتِ ترکیبی را
   * از حرفش جدا می‌کند و نویسه‌ای می‌سازد که هیچ‌جا دیده نشده.
   */
  expect(clip('کوتاه', 10)).toBe('کوتاه');
  expect(width(clip('یک متنِ نسبتاً بلند برای بریدن', 10))).toBeLessThanOrEqual(10);
  expect(clip('یک متنِ نسبتاً بلند برای بریدن', 10)).toMatch(/…$/);

  // حرفِ دارای حرکت نباید نصفه بماند
  const cut = clip('مُعلّمِ نمونه', 5);
  expect(cut.endsWith('…')).toBe(true);
  expect(width(cut)).toBeLessThanOrEqual(5);
});

test('`row` ستون‌ها را هم‌تراز می‌کند حتی با فارسیِ نامتقارن', () => {
  const a = row([['می‌کند', 12], ['۱۲', 4, 'start'], ['ok', -1]]);
  const b = row([['ناتمام', 12], ['۳', 4, 'start'], ['fail', -1]]);

  // جای شروعِ ستونِ سوم در هر دو ردیف باید یکی باشد
  const third = (line) => width(line.slice(0, line.lastIndexOf('  ')));
  expect(third(a)).toBe(third(b));
});
