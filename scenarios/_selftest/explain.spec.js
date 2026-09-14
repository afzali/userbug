/**
 * خودآزمای «چرا این شد؟».
 *
 * ── چرا نقطهٔ حساس، متنِ جست‌وجوست ──
 *
 * اگر با متنِ غلط در سورس بگردیم، `findRelevantSource` هیچ فایلی برنمی‌گرداند
 * و مدل حدسِ عمومی می‌زند — جوابی که شبیهِ جوابِ واقعی است و نیست. و پیامِ
 * یافته‌های ما معمولاً **جملهٔ خودمان** است، نه چیزی که در سورسِ اپ نوشته
 * شده:
 *
 *   «چیزی که در /login همیشه بود، حالا نیست: button نپی»
 *
 * هیچ‌جای سورسِ اپ این جمله نیست. آنچه هست، نامِ خودِ عنصر است.
 */
import { test, expect } from '@playwright/test';
import { searchTextOf } from '../../src/knowledge/explain.js';

test('نامِ عنصرِ گم‌شده بیرون کشیده می‌شود، نه فقط جملهٔ ما', () => {
  const text = searchTextOf({
    source: 'contract',
    normalized: 'چیزی که در /login همیشه بود، حالا نیست: button «نپی»',
    steps: ['go /'],
    detail: { path: '/login', mode: 'watch', missing: [{ role: 'button', name: 'نپی' }, { label: 'کپی کد' }] },
  });

  expect(text).toContain('نپی');
  expect(text).toContain('کپی کد');
  expect(text).toContain('/login');
});

test('قدمِ سناریو از نویسه‌های JSON پاک می‌شود', () => {
  // قدم‌ها به‌شکل `click {"role":"button","name":"هوش مصنوعی"}` ذخیره می‌شوند؛
  // آکولاد و گیومه در جست‌وجوی سورس فقط نویزند
  const text = searchTextOf({ steps: ['click {"role":"button","name":"هوش مصنوعی"}'] });
  expect(text).toContain('هوش مصنوعی');
  expect(text).not.toContain('{');
  expect(text).not.toContain('"');
});

test('یافتهٔ بی‌متن، صریح رد می‌شود', () => {
  // وگرنه با رشتهٔ خالی در سورس می‌گردیم و مدل از هیچ حدس می‌زند
  expect(searchTextOf({})).toBe('');
  expect(searchTextOf(null)).toBe('');
});

test('روت و پیام هر دو می‌آیند، و متن کوتاه می‌ماند', () => {
  const text = searchTextOf({
    routes: ['/contents'],
    normalized: 'x'.repeat(2000),
  });
  expect(text).toContain('/contents');
  expect(text.length).toBeLessThanOrEqual(600);
});

test('جزئیاتِ رشته‌ای، ساختار را نمی‌شکند', () => {
  // `detail` گاهی متن است نه شیء؛ خواندنش نباید استثنا بدهد
  expect(() => searchTextOf({ detail: 'یک متن ساده', normalized: 'خطا' })).not.toThrow();
  expect(searchTextOf({ detail: 'یک متن', normalized: 'خطا' })).toContain('خطا');
});
