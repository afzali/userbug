/**
 * خودآزمای پرسیدن از کاربر.
 *
 * ── چرا ارقامِ فارسی مهم‌اند ──
 *
 * کاربرِ این ابزار فارسی تایپ می‌کند و صفحه‌کلیدش `۱` می‌دهد نه `1`. بی
 * تبدیل، «۱،۳» هیچ انتخابی نمی‌شود و کاربر فکر می‌کند فهرست خراب است —
 * شکستی که پیامی ندارد و کسی گزارشش نمی‌کند، فقط دیگر از ابزار استفاده
 * نمی‌کند.
 *
 * ویرگولِ فارسی (،) هم همین‌طور: روی صفحه‌کلیدِ فارسی همان زده می‌شود.
 */
import { test, expect } from '@playwright/test';
import { parseSelection, latinDigits } from '../../src/ask.js';

test('ارقامِ فارسی و عربی لاتین می‌شوند', () => {
  expect(latinDigits('۱۲۳')).toBe('123');
  expect(latinDigits('١٢٣')).toBe('123'); // عربی
  expect(latinDigits('۱،۳')).toBe('1،3');
  expect(latinDigits('all')).toBe('all');
  expect(latinDigits(null)).toBe('');
});

test('شماره‌های تکی، با هر دو ویرگول', () => {
  expect(parseSelection('1,3', 5)).toEqual([0, 2]);
  expect(parseSelection('۱،۳', 5)).toEqual([0, 2]);
  expect(parseSelection('1 3', 5)).toEqual([0, 2]);
  expect(parseSelection('۲', 5)).toEqual([1]);
});

test('بازه', () => {
  expect(parseSelection('2-4', 5)).toEqual([1, 2, 3]);
  expect(parseSelection('۲-۴', 5)).toEqual([1, 2, 3]);
  // برعکس هم باید کار کند؛ کسی که «۴-۲» می‌زند همان را می‌خواهد
  expect(parseSelection('4-2', 5)).toEqual([1, 2, 3]);
});

test('«همه» و «هیچ»، فارسی و انگلیسی', () => {
  expect(parseSelection('all', 3)).toEqual([0, 1, 2]);
  expect(parseSelection('همه', 3)).toEqual([0, 1, 2]);
  expect(parseSelection('none', 3)).toEqual([]);
  expect(parseSelection('هیچ', 3)).toEqual([]);
});

test('Enterِ خالی یعنی «نپرسیدم» — نه «همه»', () => {
  /**
   * تفاوت مهم است: این تابع `null` می‌دهد و صداکننده آن را «کاری نکن»
   * می‌خواند. اگر «همه» بود، یک Enterِ اشتباهی فایلِ کاربر را عوض می‌کرد.
   */
  expect(parseSelection('', 3)).toBeNull();
  expect(parseSelection('   ', 3)).toBeNull();
});

test('شماره‌های بیرون از محدوده بی‌صدا افتاده می‌شوند، نه اینکه بشکنند', () => {
  // «۱،۹» روی فهرستِ سه‌تایی یعنی «اولی» — نه خطا، نه اندیسِ خیالی
  expect(parseSelection('1,9', 3)).toEqual([0]);
  expect(parseSelection('0', 3)).toEqual([]);
  expect(parseSelection('-1', 3)).toEqual([]);
  expect(parseSelection('abc', 3)).toEqual([]);
});

test('تکراری یکی می‌شود و ترتیب مرتب است', () => {
  expect(parseSelection('3,1,3,2', 5)).toEqual([0, 1, 2]);
  expect(parseSelection('2-4,3', 5)).toEqual([1, 2, 3]);
});
