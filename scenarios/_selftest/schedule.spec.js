/**
 * خودآزمای زمان‌بندی — بخش‌های خالص.
 *
 * اینجا هیچ تسکی در ویندوز ساخته نمی‌شود: سنجه‌ای که وضعیت سیستم را عوض کند،
 * روی ماشین کسِ دیگری خرابی می‌سازد و در CI بی‌معناست. آنچه سنجیده می‌شود
 * همان چیزی است که می‌تواند بی‌صدا غلط باشد: اعتبارسنجی ورودی، آرگومان‌هایی که
 * به CLI می‌روند، و ASCII بودنِ راه‌انداز.
 */
import { test, expect } from '@playwright/test';
import {
  TASK_PREFIX,
  assertScheduleFields,
  assertScheduleKey,
  renderLauncher,
  scheduleArgs,
  taskName,
} from '../../src/schedule.js';

const BASE = { key: 'nightly', target: 'nepi', time: '02:00' };

test('کلید زمان‌بندی محدود به ASCII است', () => {
  expect(assertScheduleKey('nightly')).toBe('nightly');
  expect(assertScheduleKey('run-2_a')).toBe('run-2_a');

  // نام فایل و نام تسک از همین می‌آید، پس فارسی و نقطه و فاصله رد می‌شوند
  for (const bad of ['شبانه', 'a.b', 'a b', '../x', '-lead', '', 'x'.repeat(60)]) {
    expect(() => assertScheduleKey(bad), bad).toThrow();
  }
});

test('نام تسک همیشه پیشوند دارد', () => {
  expect(taskName('nightly')).toBe(`${TASK_PREFIX}nightly`);
  // حذف فقط روی همین پیشوند مجاز است؛ بی‌آن، یک کلیدِ اشتباه می‌توانست تسک
  // سیستمیِ دیگری را ببرد
  expect(taskName('nightly').startsWith('userbug-')).toBe(true);
});

test('ساعت باید ۲۴ساعته و کامل باشد', () => {
  expect(assertScheduleFields(BASE).time).toBe('02:00');
  expect(assertScheduleFields({ ...BASE, time: '23:59' }).time).toBe('23:59');
  for (const bad of ['25:00', '2', '2:00', '02:60', '', 'دو']) {
    expect(() => assertScheduleFields({ ...BASE, time: bad }), bad).toThrow(/HH:MM/);
  }
});

test('هفتگی بدون روزِ معتبر رد می‌شود', () => {
  expect(() => assertScheduleFields({ ...BASE, frequency: 'weekly' })).toThrow(/روز/);
  expect(() => assertScheduleFields({ ...BASE, frequency: 'weekly', days: 'FUN' })).toThrow(/روز هفته/);

  const weekly = assertScheduleFields({ ...BASE, frequency: 'weekly', days: 'mon,WED,mon' });
  expect(weekly.days).toEqual(['MON', 'WED']);
});

test('پرچم‌ها همان اعتبارسنجیِ run را دارند', () => {
  expect(() => assertScheduleFields({ ...BASE, depth: 'abc' })).toThrow(/عمق/);
  expect(() => assertScheduleFields({ ...BASE, depth: 0 })).toThrow(/عمق/);
  expect(() => assertScheduleFields({ ...BASE, depth: 101 })).toThrow(/عمق/);
  expect(() => assertScheduleFields({ ...BASE, repeat: 11 })).toThrow(/تکرار/);
  expect(() => assertScheduleFields({ ...BASE, model: 'bad' })).toThrow(/اسلاگ/);
  expect(() => assertScheduleFields({ ...BASE, persona: 'expert' })).toThrow(/novice/);
  expect(() => assertScheduleFields({ ...BASE, target: '../escape' })).toThrow();
});

test('نویسهٔ کنترلی در فیلتر سناریو رد می‌شود', () => {
  expect(() => assertScheduleFields({ ...BASE, grep: 'الف\nب' })).toThrow(/کنترلی/);
  // ولی فارسیِ معمولی باید بگذرد، چون در JSON می‌نشیند نه در فایل cmd
  expect(assertScheduleFields({ ...BASE, grep: 'ورود با قدم‌های زبان طبیعی' }).grep).toBe(
    'ورود با قدم‌های زبان طبیعی'
  );
});

test('آرگومان‌ها فقط برای فیلدهای پرشده ساخته می‌شوند', () => {
  expect(scheduleArgs(assertScheduleFields(BASE))).toEqual(['run', 'nepi']);

  const full = assertScheduleFields({
    ...BASE,
    grep: 'ورود',
    device: 'iPhone 13',
    persona: 'pro',
    model: 'x/y:free',
    depth: 3,
    repeat: 2,
  });
  expect(scheduleArgs(full)).toEqual([
    'run', 'nepi',
    '--grep', 'ورود',
    '--device', 'iPhone 13',
    '--persona', 'pro',
    '--model', 'x/y:free',
    '--depth', '3',
    '--repeat', '2',
  ]);
});

test('راه‌انداز ASCII است و پارامتری در خود ندارد', () => {
  const launcher = renderLauncher('nightly');

  // `cmd` روی این ماشین رشتهٔ فارسی را می‌شکند و قطعه‌ها را اجرا می‌کند؛
  // همان درسی که start.bat را ASCII-only نگه داشت
  // eslint-disable-next-line no-control-regex
  expect(/[^\x00-\x7f]/.test(launcher)).toBe(false);

  expect(launcher).toContain('run-schedule.mjs');
  expect(launcher).toContain('nightly');
  // پارامترها در JSON می‌مانند، نه در فرمان
  expect(launcher).not.toContain('--grep');
});
