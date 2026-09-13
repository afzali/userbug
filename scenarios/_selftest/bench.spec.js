/**
 * خودآزمای بَنچ.
 *
 * دو چیز اینجا می‌تواند بی‌صدا بشکند و هیچ‌کدام در اجرا دیده نمی‌شود، چون
 * نتیجه‌شان «سبز» است نه «قرمز»:
 *
 *   ۱. نامِ سناریو escape نشود → `--grep` یا زیادی می‌گیرد یا هیچ، و اجرا
 *      با سه سناریو به‌جای چهار سبز تمام می‌شود.
 *   ۲. فهرستِ خالی یک الگوی خالی ندهد → `--grep ''` یعنی همه، یا هیچ.
 */
import { test, expect } from '@playwright/test';
import { benchGrep, benchesOf, normalizeBench } from '../../src/runs/bench.js';

test('نامِ سناریو الگو نیست، متن است', () => {
  // پرانتز و نقطه در عنوانِ فارسی عادی‌اند؛ بی escape، `.` هر حرفی را می‌گیرد
  const grep = benchGrep(['ورود (بارِ اول)', 'خروج.']);
  expect(grep).toBe(String.raw`ورود \(بارِ اول\)|خروج\.`);
  expect(new RegExp(grep).test('ورود (بارِ اول)')).toBe(true);
  expect(new RegExp(grep).test('خروجX')).toBe(false);
});

test('لنگر نمی‌گذارد، چون عنوانِ پیش‌نویس پسوند می‌گیرد', () => {
  const grep = benchGrep(['کاوشِ من']);
  expect(new RegExp(grep).test('کاوشِ من [پیش‌نویس]')).toBe(true);
});

test('فهرستِ خالی الگوی خالی می‌دهد، نه الگویی که همه را بگیرد', () => {
  expect(benchGrep([])).toBe('');
  expect(benchGrep([''])).toBe('');
  expect(benchGrep(['  ', null, undefined])).toBe('');
});

test('یک نام هم کار می‌کند، چه در آرایه چه تنها', () => {
  expect(benchGrep('سلام')).toBe('سلام');
  expect(benchGrep(['سلام'])).toBe('سلام');
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
