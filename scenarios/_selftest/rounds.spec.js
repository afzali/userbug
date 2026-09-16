/**
 * خودآزمای «دورِ بررسی».
 *
 * ── چرا این فایل هست ──
 *
 * دور چیزی **نمی‌سازد**؛ فقط اجراهای موجود را بر اساسِ نامی که در
 * `run.json` نوشته شده گروه می‌کند. یعنی همهٔ خطاهای ممکنش از جنسِ
 * «گروه‌بندیِ غلط» است — و گروه‌بندیِ غلط هیچ‌وقت خطا نمی‌دهد، فقط عددِ
 * اشتباه نشان می‌دهد.
 *
 * مهم‌ترینشان: دوری که اجراهای بی‌نام را ببلعد، یا دوری که تفاوتش را با
 * اجرای قبلی بسنجد به‌جای دورِ قبلی.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';

function withProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-round-'));
  process.env.USERBUG_ROOT = root;
  fs.mkdirSync(path.join(root, 'knowledge', 'demo'), { recursive: true });
  return root;
}

test.afterEach(() => {
  delete process.env.USERBUG_ROOT;
});

const load = () => import(`../../src/runs/rounds.js?t=${Date.now()}${Math.random()}`);

const run = (bench, at, extra = {}) => ({
  runId: `${at}_demo`,
  bench,
  startedAt: at,
  kind: 'run',
  findings: 0,
  steps: 0,
  green: 0,
  red: 0,
  ...extra,
});

test('اجراهای هم‌نام یک دور می‌شوند و عددهایشان جمع', async () => {
  withProject();
  const { groupRounds } = await load();

  const rounds = groupRounds(
    [
      run('پیش از ۴.۲', '2026-09-10T10:00:00Z', { findings: 2, steps: 10 }),
      run('پیش از ۴.۲', '2026-09-10T09:00:00Z', { findings: 1, steps: 5, kind: 'map' }),
    ],
    {}
  );

  expect(rounds).toHaveLength(1);
  expect(rounds[0].findings).toBe(3);
  expect(rounds[0].steps).toBe(15);
  // نوع‌ها شمرده می‌شوند، چون «دو اجرا» نمی‌گوید یکی‌شان خزش بود
  expect(rounds[0].kinds).toEqual({ run: 1, map: 1 });
});

test('اجرای بی‌نام قاطیِ دورِ نام‌دار نمی‌شود', async () => {
  withProject();
  const { groupRounds } = await load();

  const rounds = groupRounds(
    [run('پیش از ۴.۲', '2026-09-10T10:00:00Z'), run('', '2026-09-10T09:00:00Z')],
    {}
  );

  /**
   * ── چرا این مهم‌ترین تستِ این فایل است ──
   *
   * اگر بی‌نام‌ها در نزدیک‌ترین دور بیفتند، عددِ آن دور باد می‌کند و
   * «تفاوت نسبت به دورِ قبل» بی‌معنا می‌شود — بی آنکه چیزی خطا بدهد.
   */
  expect(rounds).toHaveLength(2);
  expect(rounds.find((one) => !one.name).runs).toHaveLength(1);
  expect(rounds.find((one) => one.name === 'پیش از ۴.۲').runs).toHaveLength(1);
});

test('اجرای بی‌نام پنهان نمی‌شود', async () => {
  withProject();
  const { groupRounds } = await load();

  const rounds = groupRounds([run('', '2026-09-10T10:00:00Z')], {});
  /**
   * کاربری که ده بار سریع اجرا گرفته و اسم نگذاشته نباید صفحه‌ای ببیند که
   * می‌گوید هیچ کاری نشده.
   */
  expect(rounds).toHaveLength(1);
  expect(rounds[0].name).toBe('');
});

test('دامنه و توضیح ذخیره می‌شوند و به گروه می‌چسبند', async () => {
  withProject();
  const { saveRound, readRounds, groupRounds } = await load();

  saveRound('demo', 'پیش از ۴.۲', { note: 'قبل از انتشار', scope: ['aaa111', 'bbb222'] });
  const rounds = groupRounds([run('پیش از ۴.۲', '2026-09-10T10:00:00Z')], readRounds('demo'));

  expect(rounds[0].note).toBe('قبل از انتشار');
  expect(rounds[0].scope).toEqual(['aaa111', 'bbb222']);
});

test('دورِ ثبت‌شدهٔ بی‌اجرا هم دیده می‌شود', async () => {
  withProject();
  const { saveRound, readRounds, groupRounds } = await load();

  saveRound('demo', 'همین حالا', { note: 'تازه زدم' });
  const rounds = groupRounds([], readRounds('demo'));

  /**
   * کسی که دور را ساخته و اجرا هنوز تمام نشده، بیشترین شک را دارد که آیا
   * دکمه کار کرد یا نه. صفحه‌ای که بگوید «دوری در کار نیست» بدترین جواب
   * ممکن است.
   */
  expect(rounds).toHaveLength(1);
  expect(rounds[0].empty).toBe(true);
});

test('اثرانگشت‌ها از بنچِ یافته می‌آیند و تفاوت درست حساب می‌شود', async () => {
  withProject();
  const { printsByRound, diffRounds } = await load();

  const prints = printsByRound([
    { fingerprint: 'aaa', benches: ['دور ۱', 'دور ۲'] },
    { fingerprint: 'bbb', benches: ['دور ۱'] },
    { fingerprint: 'ccc', benches: ['دور ۲'] },
  ]);

  const diff = diffRounds(prints, 'دور ۱', 'دور ۲');
  expect(diff.added).toEqual(['ccc']);
  expect(diff.gone).toEqual(['bbb']);
  expect(diff.kept).toEqual(['aaa']);
});

test('حذفِ دور فقط توضیحش را می‌برد، نه اجراهایش', async () => {
  withProject();
  const { saveRound, removeRound, readRounds, groupRounds } = await load();

  saveRound('demo', 'پیش از ۴.۲', { note: 'اشتباه نوشتم' });
  removeRound('demo', 'پیش از ۴.۲');

  const rounds = groupRounds([run('پیش از ۴.۲', '2026-09-10T10:00:00Z')], readRounds('demo'));
  /**
   * تاریخچه بی‌صدا کوتاه نمی‌شود: نام در `run.json` است و آن فایل دستِ این
   * ماژول نیست. آنچه حذف می‌شود فقط توضیح و دامنه است.
   */
  expect(rounds).toHaveLength(1);
  expect(rounds[0].note).toBe('');
});

test('دور بی‌نام ثبت نمی‌شود', async () => {
  withProject();
  const { saveRound } = await load();
  expect(() => saveRound('demo', '   ')).toThrow();
});
