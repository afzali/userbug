/**
 * مولد دیتا.
 *
 * دو کار می‌کند: هویت تازه برای هر اجرا (که جای ریست دیتابیس را می‌گیرد)، و
 * دادهٔ بدخیمِ فارسی — همان چیزهایی که در اپ‌های فارسی واقعاً می‌شکنند و در
 * هیچ مجموعهٔ تست انگلیسی پیدا نمی‌شوند.
 */
import { faker } from '@faker-js/faker/locale/fa';
import crypto from 'node:crypto';

/**
 * هویت مستقل برای یک اجرا.
 *
 * چون ریست دیتابیس نداریم، تکرارپذیری از اینجا می‌آید: هر اجرا کاربر خودش را
 * می‌سازد و فقط با دادهٔ خودش کار می‌کند، پس اجراها به هم کار ندارند.
 */
export function freshIdentity(runId = '') {
  const tag = crypto.randomBytes(4).toString('hex');
  return {
    email: `ub-${tag}@userbug.test`,
    password: `Ab1!${crypto.randomBytes(6).toString('base64url')}`,
    displayName: faker.person.fullName(),
    tag,
    runId,
  };
}

/**
 * رشته‌هایی که در اپ فارسی دردسر می‌سازند.
 *
 * هرکدام دلیل دارد، نه اینکه صرفاً «عجیب» باشد:
 *   - نیم‌فاصله و «ی/ك» عربی: جست‌وجو و یکتایی را می‌شکنند
 *   - ارقام فارسی: در تبدیل عدد و مرتب‌سازی
 *   - متن مخلوط: در چیدمان RTL و انتخاب متن
 *   - رشتهٔ بلند: در سرریز چیدمان و سقف ستون دیتابیس
 */
export const NASTY = {
  zwnj: 'می‌خواهم کتاب‌ها را می‌بینم',
  arabicYaKaf: 'كتابهاي عربي ي و ك',
  persianDigits: '۱۴۰۴/۱۲/۳۰ ساعت ۲۳:۵۹',
  mixed: 'یادداشت درباره React و TypeScript — نسخهٔ 2.5',
  rtlOverride: 'سلام‮evil‬ دنیا',
  emoji: 'یادداشت 📚🔑 با ایموجی',
  long: 'الف'.repeat(4000),
  quotes: `نقل «قول» و 'single' و "double" و \\ backslash`,
  html: '<script>alert(1)</script> و <b>bold</b>',
  boundaryDate: '۱۴۰۴/۱۲/۳۰',
};

export function nastyList() {
  return Object.entries(NASTY).map(([key, value]) => ({ key, value }));
}
