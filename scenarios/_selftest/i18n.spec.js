/**
 * خودآزمای زبانِ خروجی.
 *
 * ── چرا لازم شد ──
 *
 * کاربر عکسِ ترمینالش را فرستاد: `cmd.exe` فارسی را جدا و وارونه نشان
 * می‌داد. این نقصِ کنسولِ قدیمیِ ویندوز است — bidi را اصلاً پیاده نکرده —
 * و از داخلِ برنامه درست‌شدنی نیست.
 *
 * پس خروجی به انگلیسی می‌افتد، **فقط وقتی لازم است**. دو اشتباه ممکن
 * است، و هر دو بد:
 *
 *   فارسی جایی که خوانده نمی‌شود  →  راهنمایی که راهنمایی نیست
 *   انگلیسی جایی که لازم نبود     →  کاربرِ فارسی‌زبان بی‌دلیل انگلیسی می‌خواند
 *
 * پس تشخیص باید سیگنالِ واقعی باشد، نه حدس: `WT_SESSION` را فقط Windows
 * Terminal می‌گذارد.
 */
import { test, expect } from '@playwright/test';
import { lang, pick, terminalHandlesRTL } from '../../src/i18n.js';

/** متغیرها را دست‌کاری می‌کنیم و سرِ جایشان برمی‌گردانیم. */
function withEnv(vars, fn) {
  const before = {};
  for (const [key, value] of Object.entries(vars)) {
    before[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('خواستهٔ صریحِ کاربر بر همه‌چیز می‌چربد', () => {
  // حتی روی ترمینالی که bidi ندارد، اگر کاربر فارسی خواست یعنی خواسته
  withEnv({ UB_LANG: 'fa', WT_SESSION: undefined }, () => expect(lang()).toBe('fa'));
  withEnv({ UB_LANG: 'en', WT_SESSION: 'x' }, () => expect(lang()).toBe('en'));
});

test('مقدارِ بی‌معنا نادیده گرفته می‌شود، نه اینکه بشکند', () => {
  // `UB_LANG=de` نباید ابزار را از کار بیندازد
  withEnv({ UB_LANG: 'de', WT_SESSION: 'x' }, () => expect(lang()).toBe('fa'));
  withEnv({ UB_LANG: '', WT_SESSION: 'x' }, () => expect(lang()).toBe('fa'));
});

test('`WT_SESSION` سیگنالِ واقعی است، نه حدس', () => {
  /**
   * Windows Terminal این متغیر را می‌گذارد و کنسولِ قدیمی نمی‌گذارد. حدس
   * زدن از روی چیزهای دیگر — نامِ شل، اندازهٔ پنجره — همان چیزی است که
   * گاهی درست می‌افتد و گاهی نه، و وقتی نه، کسی نمی‌فهمد چرا.
   */
  if (process.platform !== 'win32') {
    // غیرِ ویندوز فرض می‌شود bidi دارد
    expect(terminalHandlesRTL()).toBe(true);
    return;
  }

  withEnv({ WT_SESSION: 'abc-123' }, () => expect(terminalHandlesRTL()).toBe(true));
  withEnv({ WT_SESSION: undefined }, () => expect(terminalHandlesRTL()).toBe(false));
});

test('`pick` همان زبانِ انتخاب‌شده را می‌دهد', () => {
  withEnv({ UB_LANG: 'fa' }, () => expect(pick('فارسی', 'English')).toBe('فارسی'));
  withEnv({ UB_LANG: 'en' }, () => expect(pick('فارسی', 'English')).toBe('English'));
});

test('راهنمای انگلیسی واقعاً انگلیسی است', async () => {
  /**
   * بی این، یک متنِ فارسیِ جامانده در راهنمای انگلیسی همان صفحهٔ وارونه را
   * برمی‌گرداند — و دقیقاً همان چیزی است که این کار برای نبودنش انجام شد.
   */
  const { HELP_EN } = await import('../../src/help-en.js');

  const persian = HELP_EN.match(/[؀-ۿ]+/g) || [];
  const allowed = new Set(['شروع']); // نامِ فایلِ راهنما در مسیر

  expect(persian.filter((word) => !allowed.has(word))).toEqual([]);
  expect(HELP_EN).toContain('userbug setup');
  expect(HELP_EN).toContain('UB_LANG=fa');
});
