/**
 * عرضِ **نمایشی** متن، نه طولِ رشته.
 *
 * ── چرا `padEnd` روی فارسی ستون را خراب می‌کند ──
 *
 * `String.length` واحدهای UTF-16 را می‌شمارد. در فارسی این با آنچه چشم
 * می‌بیند یکی نیست:
 *
 *   'می‌کند'    length = ۶   دیدنی = ۵   (نیم‌فاصله)
 *   'پاس‌شده'   length = ۷   دیدنی = ۶
 *
 * نیم‌فاصله (U+200C) یک واحد است و هیچ ستونی نمی‌گیرد. پس `padEnd(14)` روی
 * متنِ نیم‌فاصله‌دار یک فاصله کم می‌گذارد و کلِ جدول یک ستون می‌لغزد —
 * درست همان‌جا که آدم دارد ستون‌ها را با هم مقایسه می‌کند.
 *
 * ── آنچه این فایل حل نمی‌کند ──
 *
 * ترتیبِ **دیداریِ** راست‌به‌چپ کارِ ترمینال است، نه ما. `cmd.exe` فارسی را
 * جدا و وارونه نشان می‌دهد حتی با `chcp 65001`؛ Windows Terminal درست
 * نشان می‌دهد. این ماژول فقط حساب را درست می‌کند، نه رندر را.
 */

/** نویسه‌هایی که جا نمی‌گیرند: نیم‌فاصله، اتصال، و نشانه‌های جهت. */
const ZERO_WIDTH = /[​-‏⁠﻿]/g;

/** علامت‌های ترکیبی — اعراب فارسی و عربی هم همین‌جا. */
const COMBINING = /\p{Mn}|\p{Me}/gu;

/** نویسه‌های پهن: شرقِ آسیا و بیشترِ ایموجی‌ها. */
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]|[\u{1f300}-\u{1faff}]/u;

/** کدهای رنگِ ترمینال هم جا نمی‌گیرند. */
const ANSI = /\[[0-9;]*m/g;

/**
 * چند ستون می‌گیرد؟
 *
 * @param {string} text
 * @returns {number}
 */
export function width(text) {
  const clean = String(text ?? '')
    .replace(ANSI, '')
    .replace(ZERO_WIDTH, '')
    .replace(COMBINING, '');

  let total = 0;
  for (const char of clean) total += WIDE.test(char) ? 2 : 1;
  return total;
}

/**
 * پر کردن تا عرضِ نمایشی — جایگزینِ `padEnd`.
 *
 * @param {string} text
 * @param {number} size
 * @param {'start'|'end'} [side] `end` یعنی فاصله بعدِ متن، مثل `padEnd`
 * @returns {string}
 */
export function pad(text, size, side = 'end') {
  const value = String(text ?? '');
  const gap = Math.max(0, size - width(value));
  const filler = ' '.repeat(gap);
  return side === 'start' ? filler + value : value + filler;
}

/**
 * بریدن تا عرضِ نمایشی — جایگزینِ `slice`.
 *
 * ── چرا `slice` خطرناک است ──
 *
 * `'می‌کند'.slice(0, 5)` نیم‌فاصله را وسط می‌بُرد یا علامتِ ترکیبی را از
 * حرفش جدا می‌کند، و نتیجه نویسه‌ای است که هیچ‌جا دیده نشده. اینجا بریدن
 * روی مرزِ نویسه انجام می‌شود، نه واحدِ UTF-16.
 *
 * @param {string} text
 * @param {number} size
 * @returns {string}
 */
export function clip(text, size) {
  const value = String(text ?? '');
  if (width(value) <= size) return value;

  let out = '';
  let used = 0;
  for (const char of value) {
    const w = width(char);
    if (used + w > size - 1) break;
    out += char;
    used += w;
  }
  return out + '…';
}

/**
 * یک ردیفِ جدول.
 *
 * ستون‌ها `[متن, عرض, جهت؟]` — عرضِ منفی یعنی «هرچه هست»، بی بریدن.
 *
 * @param {Array<[string, number, ('start'|'end')?]>} columns
 * @param {string} [gap]
 * @returns {string}
 */
export function row(columns, gap = '  ') {
  return columns
    .map(([text, size, side]) => (size < 0 ? String(text ?? '') : pad(clip(text, size), size, side)))
    .join(gap);
}
