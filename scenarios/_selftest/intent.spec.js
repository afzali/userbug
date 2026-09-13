/**
 * خودآزمای درِ ورودی.
 *
 * ── چرا این یکی بیش از بقیه لازم است ──
 *
 * خطای روتر در رابط شبیه خطا به نظر نمی‌رسد: دکمه خورد، چیزی شروع شد، و
 * کاربر فرض می‌کند همان بود که خواست. دو خطای گران:
 *
 *   ۱. «ورود را دوباره بگیر» → همهٔ سناریوها اجرا شوند. کاری بزرگ‌تر از
 *      خواسته، که سبز هم تمام می‌شود.
 *   ۲. «برو بگرد» به کاوشِ هدف‌دار برود. کاربر منتظرِ نقشه است و پیش‌نویس
 *      می‌گیرد.
 */
import { test, expect } from '@playwright/test';
import { describeIntent, focusFrom, matchIntent, normalize } from '../../src/intent.js';

const SCENARIOS = [{ name: 'ورود برای نقشه' }, { name: 'آپلود کتاب' }];
const idOf = (text, context = { scenarios: SCENARIOS }) => matchIntent(text, context)?.intent?.id ?? null;

test('سه کارِ رایج با قاعده حل می‌شوند، بی یک فراخوانی', () => {
  expect(idOf('همهٔ تست‌ها را بگیر')).toBe('run');
  expect(idOf('برو بگرد و همه‌جا را کشف کن')).toBe('crawl');
  expect(idOf('گشتِ زنده برویم')).toBe('tour');
});

test('نامِ سناریو از هر کلیدواژه‌ای قوی‌تر است', () => {
  // وگرنه «اجرا» می‌برد و همهٔ سناریوها اجرا می‌شوند — بزرگ‌تر از خواسته
  const match = matchIntent('ورود برای نقشه را دوباره اجرا کن', { scenarios: SCENARIOS });
  expect(match.intent.id).toBe('run');
  expect(match.args.only).toEqual(['ورود برای نقشه']);
  expect(describeIntent(match, { target: 'x' }).command).toContain('--only "ورود برای نقشه"');
});

test('«برو بگرد ببین باگی هست» خزش است، نه کاوش', () => {
  // هر دو کلیدواژهٔ چهارحرفی دارند؛ جای واژه در جمله تساوی را می‌شکند
  const match = matchIntent('برو بگرد ببین باگی هست', { scenarios: SCENARIOS });
  expect(match.intent.id).toBe('crawl');
  // و «باگی» اولویتِ جست‌وجو نیست: هدفِ پیش‌فرضِ خزش است
  expect(match.args.focus).toBeUndefined();
});

test('هدفِ کاوش عینِ جملهٔ کاربر است', () => {
  const match = matchIntent('بررسی کن آپلودِ فایلِ تکراری چه می‌کند', { scenarios: SCENARIOS });
  expect(match.intent.id).toBe('quest');
  expect(match.args.goal).toBe('بررسی کن آپلودِ فایلِ تکراری چه می‌کند');
});

test('جای نام‌بردن، اولویتِ خزش درمی‌آید', () => {
  const match = matchIntent('برو بگرد بخشِ کتاب‌ها را', {});
  expect(match.intent.id).toBe('crawl');
  expect(match.args.focus).toContain('کتاب');
});

test('جملهٔ بی‌ربط null می‌دهد، نه نزدیک‌ترین حدس', () => {
  // حدسِ غلط اینجا می‌تواند بیست دقیقه خزشِ جهش‌زا راه بیندازد
  expect(idOf('سلام خوبی')).toBeNull();
  expect(idOf('')).toBeNull();
  expect(matchIntent('قیمت دلار چند است', {})).toBeNull();
});

test('نیم‌فاصله و «ي» عربی همان واژه‌اند', () => {
  expect(normalize('می‌گردد')).toBe(normalize('میگردد'));
  expect(normalize('يافته')).toBe('یافته');
  expect(idOf('یافته‌ها را نشانم بده')).toBe('triage');
});

test('نقشهٔ کار ساخته می‌شود و هیچ‌کدام خودش اجرا نمی‌کند', () => {
  for (const text of ['تست‌ها را بگیر', 'برو بگرد', 'بررسی کن ورود درست است', 'گشت برویم', 'یافته‌ها']) {
    const plan = describeIntent(matchIntent(text, { scenarios: SCENARIOS }), { target: 'nepi' });
    expect(plan).toBeTruthy();
    expect(plan.summary.length).toBeGreaterThan(5);
    // یا کاری برای شروع دارد یا مقصدی برای رفتن — هرگز هر دو، هرگز هیچ‌کدام
    expect(Boolean(plan.job) !== Boolean(plan.goto)).toBe(true);
  }
});

test('خزش صریح می‌گوید داده می‌سازد', () => {
  const plan = describeIntent(matchIntent('برو بگرد', {}), { target: 'nepi' });
  expect(plan.risk).toBe('high');
  expect(plan.summary).toContain('داده می‌سازد');
});

test('کلیدواژه‌های تشخیص وارد اولویتِ خزش نمی‌شوند', () => {
  expect(focusFrom('برو بگرد', ['بگرد'])).toBe('');
});
