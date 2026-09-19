/**
 * خودآزمای «متن → YAML».
 *
 * مدل صدا زده نمی‌شود: چیزی که اینجا اهمیت دارد، دروازهٔ بین مدل و دیسک است.
 * پاسخِ مدل غیرقطعی است، پس تنها تضمینِ واقعی این است که خروجیِ بی‌ربط ذخیره
 * نشود.
 *
 * ── سنجه‌ای که اینجا بود و رفت ──
 *
 * مهم‌ترین بندِ این فایل می‌گفت «فهرست فعل‌ها در `verbs.js` نباید از `switch`
 * مفسر عقب بماند» و متنِ `src/scenario/run.js` را می‌خواند. آن مفسر با
 * برداشتنِ اجرای YAML رفت، پس سنجه طرفِ مقابلش را از دست داد.
 *
 * تضمین از بین نرفت، جا عوض کرد: `replay-parity.spec.js` همچنان می‌سنجد که
 * هر فعلی که `map/replay.js` می‌شناسد در `KNOWN_VERBS` باشد — و بازپخش
 * اکنون تنها جایی است که این فعل‌ها اجرا می‌شوند.
 *
 * خودِ `KNOWN_VERBS` هم گذراست: وقتی `userbug author` به‌جای YAML کدِ
 * پلی‌رایت بنویسد، واژگانِ فعل جایش را به فراخوانیِ خودِ پلی‌رایت می‌دهد.
 */
import { test, expect } from '@playwright/test';
import { stepVerb } from '../../src/scenario/verbs.js';
import { assertScenarioShape, toYaml, slugify } from '../../src/scenario/from-text.js';

test('فعل قدم، از میان کلیدهای وابسته پیدا می‌شود', () => {
  expect(stepVerb({ click: 'x' })).toBe('click');
  expect(stepVerb({ as: 'عنوان', fill: { a: 'b' }, value: 'v' })).toBe('fill');
  expect(stepVerb({ as: 'فقط عنوان' })).toBeNull();
  expect(stepVerb('رشته')).toBeNull();
});

test('سناریوی بی‌نام یا بی‌قدم رد می‌شود', () => {
  expect(() => assertScenarioShape(null)).toThrow();
  expect(() => assertScenarioShape({ steps: [{ go: '/' }] })).toThrow(/name/);
  expect(() => assertScenarioShape({ name: 'الف', steps: [] })).toThrow(/قدم/);
  expect(() => assertScenarioShape({ name: 'الف', steps: 'not-array' })).toThrow(/قدم/);
});

test('فعل ناشناخته پیش از ذخیره گرفته می‌شود', () => {
  expect(() =>
    assertScenarioShape({ name: 'الف', steps: [{ go: '/' }, { clickk: 'دکمه' }] })
  ).toThrow(/ناشناخته/);

  // قدمِ بدون فعل هم رد می‌شود، وگرنه مفسر وسط اجرا می‌شکست
  expect(() => assertScenarioShape({ name: 'الف', steps: [{ as: 'عنوان' }] })).toThrow(/فعل ندارد/);
});

test('بدنهٔ بی‌شکل پیش از ذخیره گرفته می‌شود', () => {
  // نخستین اجرای واقعی همین را داد: فعل درست، بدنهٔ غلط. مفسر `page.goto(object)`
  // می‌زد و وسط اجرا می‌شکست — یعنی سناریویی ذخیره می‌شد که هرگز اجرا نمی‌شد.
  expect(() =>
    assertScenarioShape({ name: 'الف', steps: [{ go: { url: 'http://x' } }] })
  ).toThrow(/رشته/);

  expect(() => assertScenarioShape({ name: 'الف', steps: [{ press: 12 }] })).toThrow(/رشته/);
  expect(() => assertScenarioShape({ name: 'الف', steps: [{ do: '' }] })).toThrow(/رشته/);
  expect(() => assertScenarioShape({ name: 'الف', steps: [{ wait: 'زود' }] })).toThrow(/میلی‌ثانیه/);
  expect(() => assertScenarioShape({ name: 'الف', steps: [{ explore: 42 }] })).toThrow(/goal/);

  // و شکل‌های درست باید بگذرند
  expect(() =>
    assertScenarioShape({
      name: 'الف',
      steps: [{ go: '/login' }, { wait: 2000 }, { explore: { goal: 'بگرد' } }, { do: 'ذخیره کن' }],
    })
  ).not.toThrow();
});

test('سناریوی معتبر با فعل‌های شناخته‌شده می‌گذرد', () => {
  const scenario = assertScenarioShape({
    name: 'ورود و دیدن فهرست',
    steps: [{ clearState: true }, { go: '/' }, { fill: { 'ایمیل': 'a@b.c' } }, { expect: { url: '/' } }],
    notes: 'رمز از متن مشخص نبود',
  });
  expect(scenario.steps).toHaveLength(4);
  expect(scenario.notes).toBe('رمز از متن مشخص نبود');
});

test('YAML خروجی پیش‌نویس است و متنِ کاربر را نگه می‌دارد', () => {
  const yaml = toYaml(
    assertScenarioShape({ name: 'ورود', steps: [{ go: '/' }], notes: 'حدسِ آدرس' }),
    { text: 'برو به صفحهٔ اول' }
  );

  expect(yaml).toContain('status: draft');
  expect(yaml).toContain('# متنِ اصلی:');
  expect(yaml).toContain('برو به صفحهٔ اول');
  expect(yaml).toContain('حدسِ آدرس');
});

test('نام فایل از نام سناریو، فارسی و بی‌فاصله', () => {
  expect(slugify('ورود و دیدن فهرست')).toBe('ورود-و-دیدن-فهرست');
  expect(slugify('  a/b:c  ')).toBe('a-b-c');
  expect(slugify('!!!')).toBe('scenario');
});
