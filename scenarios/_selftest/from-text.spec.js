/**
 * خودآزمای «متن → YAML».
 *
 * مدل صدا زده نمی‌شود: چیزی که اینجا اهمیت دارد، دروازهٔ بین مدل و دیسک است.
 * پاسخِ مدل غیرقطعی است، پس تنها تضمینِ واقعی این است که خروجیِ بی‌ربط ذخیره
 * نشود.
 *
 * سنجهٔ اول از همه مهم‌تر است: فهرست فعل‌ها در `verbs.js` نباید از `switch`
 * مفسر عقب بماند. آن روزی که عقب بماند، مدل فعلی می‌سازد که وسط اجرا
 * «فعل ناشناخته» می‌دهد — و کسی نمی‌فهمد تقصیر مدل نبوده.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { KNOWN_VERBS, stepVerb } from '../../src/scenario/verbs.js';
import { assertScenarioShape, toYaml, slugify } from '../../src/scenario/from-text.js';

test('فهرست فعل‌ها با switch مفسر یکی است', () => {
  const source = fs.readFileSync(
    path.join(import.meta.dirname, '..', '..', 'src', 'scenario', 'run.js'),
    'utf8'
  );
  const cases = [...source.matchAll(/^\s+case '(\w+)':/gm)].map((match) => match[1]);

  expect(cases.length).toBeGreaterThan(20);
  expect([...new Set(cases)].sort()).toEqual([...KNOWN_VERBS].sort());
});

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
