/**
 * خودآزمای دروازهٔ ایمنی — قانون ۸.
 *
 * دروازه‌ای که امتحان نشده، فقط یک ادعاست. و این ادعا از آن دسته‌ای است که
 * اگر دروغ باشد، یک بار و برای همیشه گران تمام می‌شود: `request` می‌تواند روی
 * دادهٔ واقعی کاربران بنویسد و قلاب `shell` می‌تواند دیتابیس پاک کند.
 *
 * پس هر سه حالت را می‌سنجیم: محیط امن، محیط تولیدی، و محیطی که اصلاً اعلام
 * نشده — که باید محافظه‌کارانه تولیدی فرض شود.
 */
import { test, expect } from '@playwright/test';
import { assertMayMutate, assertMayQuery, assertMayRequest, isSafeEnvironment } from '../../src/guard.js';
import { loadTarget } from '../../src/target.js';

test('دروازه: محیط توسعه اجازه می‌دهد', async () => {
  const target = await loadTarget('nepi');
  expect(isSafeEnvironment(target), 'nepi باید local باشد').toBe(true);

  expect(() => assertMayMutate(target, 'کار آزمایشی')).not.toThrow();
  expect(() => assertMayRequest(target, 'POST', '/auth/register')).not.toThrow();
});

test('دروازه: محیط تولیدی نوشتن را رد می‌کند', async () => {
  const target = await loadTarget('nepi-prod');
  expect(isSafeEnvironment(target)).toBe(false);

  expect(() => assertMayRequest(target, 'POST', '/auth/register')).toThrow(/رد شد/);
  expect(() => assertMayRequest(target, 'DELETE', '/account')).toThrow(/رد شد/);
  expect(() => assertMayMutate(target, 'قلاب shell')).toThrow(/رد شد/);

  // خواندن آزاد است — سناریوی فقط‌خواندنی روی تولیدی معنا دارد
  expect(() => assertMayRequest(target, 'GET', '/health')).not.toThrow();
});

/**
 * `query` تابعِ دیتابیسیِ خودِ اپ را می‌راند، پس `DELETE` در آن واقعاً پاک
 * می‌کند. تا امروز دروازه نداشت.
 */
test('دروازه: پرس‌وجوی خواندنی آزاد است، نوشتن نه', async () => {
  const prod = await loadTarget('nepi-prod');
  const local = await loadTarget('nepi');

  // همان چیزی که سناریوهای واقعی می‌زنند
  expect(() => assertMayQuery(prod, 'SELECT COUNT(*) AS n FROM users WHERE email = ?')).not.toThrow();
  expect(() => assertMayQuery(prod, '  select title from books order by rowid desc limit 1')).not.toThrow();

  for (const sql of ['DELETE FROM books', 'UPDATE users SET email = ?', 'DROP TABLE users', 'PRAGMA journal_mode = WAL']) {
    expect(() => assertMayQuery(prod, sql), sql).toThrow(/رد شد/);
  }

  // روی محیط توسعه همه‌شان مجازند
  expect(() => assertMayQuery(local, 'DELETE FROM books')).not.toThrow();
});

test('دروازه: جملهٔ دوم و کامنت نمی‌توانند نوشتن را پنهان کنند', async () => {
  const prod = await loadTarget('nepi-prod');

  // بدون بررسی چندجمله‌ای، این از کنار شرطِ «با select شروع می‌شود» رد می‌شد
  expect(() => assertMayQuery(prod, 'SELECT 1; DELETE FROM users')).toThrow(/رد شد/);

  // و بدون حذف کامنت، اینها هم
  expect(() => assertMayQuery(prod, '-- select\nDELETE FROM users')).toThrow(/رد شد/);
  expect(() => assertMayQuery(prod, '/* select */ DELETE FROM users')).toThrow(/رد شد/);

  // `WITH` با فعلِ خواندن شروع می‌شود ولی می‌تواند بنویسد
  expect(() => assertMayQuery(prod, 'WITH x AS (SELECT id FROM users) DELETE FROM users')).toThrow(/رد شد/);

  expect(() => assertMayQuery(prod, '   ')).toThrow(/خالی/);
});

test('دروازه: محیط اعلام‌نشده تولیدی فرض می‌شود', async () => {
  // پیش‌فرضِ ندانستن باید «نه» باشد. اگر روزی این تست بشکند، یعنی کسی
  // پیش‌فرض را به «بله» برگردانده و یک کانفیگ ناقص می‌تواند روی داده واقعی
  // بنویسد.
  const bare = { name: 'ناشناخته' };
  expect(isSafeEnvironment(bare)).toBe(false);
  expect(() => assertMayRequest(bare, 'POST', '/x')).toThrow(/رد شد/);
});
