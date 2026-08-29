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
import { assertMayMutate, assertMayRequest, isSafeEnvironment } from '../../src/guard.js';
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

test('دروازه: محیط اعلام‌نشده تولیدی فرض می‌شود', async () => {
  // پیش‌فرضِ ندانستن باید «نه» باشد. اگر روزی این تست بشکند، یعنی کسی
  // پیش‌فرض را به «بله» برگردانده و یک کانفیگ ناقص می‌تواند روی داده واقعی
  // بنویسد.
  const bare = { name: 'ناشناخته' };
  expect(isSafeEnvironment(bare)).toBe(false);
  expect(() => assertMayRequest(bare, 'POST', '/x')).toThrow(/رد شد/);
});
