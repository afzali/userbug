/**
 * خودآزمای دامنهٔ خزش.
 *
 * ── چرا این یکی بی‌صدا خراب می‌شود ──
 *
 * دامنهٔ غلط خطا نمی‌دهد. دو شکلِ خرابی هر دو «موفق» تمام می‌شوند:
 *
 *   ۱. زیادی تنگ → خزنده اصلاً به مقصد نمی‌رسد و نقشه خالی می‌ماند، ولی
 *      گزارش می‌گوید «صف تمام شد».
 *   ۲. زیادی گشاد → همان مشکلِ امروز: از ۲۲ حالتِ نپی، ۹ تا در `/ai-chat`
 *      افتاد در حالی که خواسته کتاب بود.
 */
import { test, expect } from '@playwright/test';
import { gatewayRoutes, makeScope, outsideScope } from '../../src/map/scope.js';

test('نبودِ دامنه یعنی همه‌جا، نه هیچ‌جا', () => {
  // پیش‌فرض باید همان رفتارِ همیشگی بماند
  expect(makeScope([])).toBeNull();
  expect(makeScope('')).toBeNull();
  expect(makeScope(['  ', ''])).toBeNull();
});

test('روت با الگو می‌خورد، نه با تساویِ رشته‌ای', () => {
  const scope = makeScope(['/content/[id_book]']);
  expect(scope.covers({ route: '/content/[id_book]', view: '' })).toBe(true);
  expect(scope.covers({ route: '/content/12', view: '' })).toBe(true);
  expect(scope.covers({ route: '/contents', view: '' })).toBe(false);
  expect(scope.covers({ route: '/ai-chat', view: 'با کدام مدل؟' })).toBe(false);
});

test('نامِ نما هم دامنه می‌سازد — چون آدم نمی‌داند در کدام روت است', () => {
  const scope = makeScope(['ویرایش']);
  expect(scope.covers({ route: '/contents', view: 'ویرایشِ برچسب' })).toBe(true);
  expect(scope.covers({ route: '/contents', view: 'افزودن برچسب' })).toBe(false);
});

test('نیم‌فاصله و «ك» عربی دامنه را نمی‌شکنند', () => {
  const scope = makeScope(['ویرایش‌ها']);
  expect(scope.covers({ route: '/x', view: 'ویرایشها' })).toBe(true);
});

test('چند الگو با هم، و روت و نما قاطی', () => {
  const scope = makeScope(['/content/[id]', 'جستجو']);
  expect(scope.covers({ route: '/content/9', view: '' })).toBe(true);
  expect(scope.covers({ route: '/contents', view: 'جستجوی جامع' })).toBe(true);
  expect(scope.covers({ route: '/ai-chat', view: 'آمار مصرف' })).toBe(false);
});

test('آنچه بیرون ماند شمرده می‌شود — نقشهٔ محدود با کامل یکی نیست', () => {
  /**
   * بی این، کسی بعداً «کجا را نیازموده‌ایم» را از روی نقشه‌ای می‌خواند که
   * عمداً ناقص است.
   */
  const map = {
    states: [
      { route: '/content/1', view: '' },
      { route: '/ai-chat', view: '' },
      { route: '/ai-chat', view: 'با کدام مدل؟' },
    ],
  };
  expect(outsideScope(map, makeScope(['/content/[id]']))).toHaveLength(2);
  // بی دامنه، هیچ‌چیز «بیرون» نیست
  expect(outsideScope(map, null)).toEqual([]);
});

test('دروازه فقط روتِ مشخص است — الگو آدرس نیست', () => {
  /**
   * ── چرا این تست ──
   *
   * نخستین مأموریتِ واقعی دامنه‌اش یک کتاب بود و خزش هیچ‌وقت به آن نرسید:
   * درِ ورودش کلیک در `/contents` بود و آن کلیک بیرونِ دامنه افتاد. گزارشش
   * «صف تمام شد» بود — یعنی شبیهِ موفقیت.
   *
   * حالا روتِ مشخص مستقیم رفته می‌شود. ولی `/content/[id]` آدرس نیست: دادنش
   * به مرورگر یک ۴۰۴ می‌سازد که شبیهِ یافته به نظر می‌رسد.
   */
  expect(gatewayRoutes(makeScope(['/content/f2e9', '/content/[id]', 'ویرایش']))).toEqual(['/content/f2e9']);
  expect(gatewayRoutes(null)).toEqual([]);
});
