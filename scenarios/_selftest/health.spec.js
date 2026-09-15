/**
 * خودآزمای «کدام سفر سالم است».
 *
 * ── چرا این یکی بی‌صدا خراب می‌شود ──
 *
 * این فهرست قرار است همان چیزی باشد که آدم بعد از هر تغییرِ پروژه نگاهش
 * می‌کند. هر سه شکلِ خرابی‌اش **سبز** به نظر می‌رسند:
 *
 *   ۱. سناریویی که `expect`اش شکسته ولی خطای کنسولی نداده → «۰ یافته».
 *   ۲. سناریویی که هرگز اجرا نشده → اصلاً در فهرست نیست.
 *   ۳. سبزِ سه‌ماه‌پیش که شبیهِ سبزِ امروز نشان داده شود.
 */
import { test, expect } from '@playwright/test';
import { daysSinceGreen, healthOf, summarize } from '../../src/runs/health.js';
import { DRAFT_SUFFIX, outcomesOf, stableName, verdictOf } from '../../src/report/tests.js';

const run = (runId, at, scenarios) => ({ runId, startedAt: at, scenarios });

test('شکستِ تست قرمز است، حتی با صفر یافته', () => {
  /**
   * همان شکستِ خاموشی که این کار برای رفعش شروع شد: پیش از این، `run.json`
   * برای هر سناریو فقط `{name, steps, findings}` داشت و این ردیف صفرِ یافته
   * بود — یعنی شبیهِ سبز.
   */
  expect(verdictOf({ status: 'failed', findings: 0 })).toBe('failed');
  expect(verdictOf({ status: 'timedOut', findings: 0 })).toBe('failed');
  // املای دیگرِ پلی‌رایت هم باید بیفتد، وگرنه تستِ افتاده سبز شمرده می‌شود
  expect(verdictOf({ status: 'timedout', findings: 0 })).toBe('failed');
});

test('یافته هم قرمز می‌کند، حتی وقتی تست پاس شده', () => {
  // سناریویی که هیچ `expect` ندارد همیشه passed تمام می‌شود، حتی وقتی سرور ۵۰۰ داد
  expect(verdictOf({ status: 'passed', findings: 2 })).toBe('findings');
  expect(verdictOf({ status: 'passed', findings: 0 })).toBe('passed');
});

test('نبودِ گزارشگر «نامعلوم» است، نه سبز', () => {
  // `--reporter=line` گزارشگرِ ما را کنار می‌زند؛ آن‌وقت وضعیتی ثبت نمی‌شود
  expect(verdictOf({ status: '', findings: 0 })).toBe('unknown');
  expect(verdictOf({ status: 'skipped', findings: 0 })).toBe('skipped');
});

test('آخرین تلاشِ هر تست برنده است، نه آخرین سطر', () => {
  const outcomes = outcomesOf([
    { scenario: 'ورود', testId: 'a', retry: 1, status: 'passed' },
    { scenario: 'ورود', testId: 'a', retry: 0, status: 'failed' },
  ]);
  expect(outcomes.get('ورود').status).toBe('passed');
});

test('در تکرارِ چندباره، یک شکست کافی است', () => {
  /**
   * `--repeat-each` همان عنوان را چند بار می‌برد و هر تکرار `testId` خودش را
   * دارد. اگر تکرارِ افتاده زیر تکرارِ سالم دفن شود، دقیقاً همان بی‌ثباتی را
   * گم کرده‌ایم که `--repeat` برای شکارش هست.
   */
  const outcomes = outcomesOf([
    { scenario: 'ورود', testId: 'a', retry: 0, status: 'passed' },
    { scenario: 'ورود', testId: 'b', retry: 0, status: 'failed', error: 'دکمه نبود' },
  ]);
  expect(outcomes.get('ورود').status).toBe('failed');
  expect(outcomes.get('ورود').error).toBe('دکمه نبود');
});

test('آخرین وضعیت از تاریخ می‌آید، نه از ترتیبِ آرایه', () => {
  const rows = healthOf([
    run('r2', '2026-03-02T10:00:00Z', [{ name: 'ورود', verdict: 'passed' }]),
    run('r1', '2026-03-01T10:00:00Z', [{ name: 'ورود', verdict: 'failed' }]),
  ]);
  expect(rows[0]).toMatchObject({ name: 'ورود', verdict: 'passed', runId: 'r2' });
  // ولی قرمزِ قبلی گم نمی‌شود — «از کی سالم شد» هم یک خبر است
  expect(rows[0].lastRed.runId).toBe('r1');
});

test('سناریویی که هرگز اجرا نشده، یک ردیف است نه یک غیبت', () => {
  /**
   * بی این، فهرست سبز به نظر می‌رسد چون خطرناک‌ترین ردیف اصلاً در آن نیست —
   * همان پوششِ خوش‌بینانه‌ای که در `endpointCoverage` هم از آن پرهیز شد.
   */
  const rows = healthOf([run('r1', '2026-03-01T10:00:00Z', [{ name: 'ورود', verdict: 'passed' }])], {
    known: ['ورود', 'فراموشی رمز'],
  });
  const forgot = rows.find((row) => row.name === 'فراموشی رمز');
  expect(forgot.verdict).toBe('never');
  expect(forgot.runs).toBe(0);
});

test('بدترین‌ها اول', () => {
  const rows = healthOf(
    [
      run('r1', '2026-03-01T10:00:00Z', [
        { name: 'الف', verdict: 'passed' },
        { name: 'ب', verdict: 'failed' },
        { name: 'ج', verdict: 'findings' },
      ]),
    ],
    { known: ['د'] }
  );
  expect(rows.map((row) => row.name)).toEqual(['ب', 'ج', 'د', 'الف']);
});

test('اجرای قدیمی بی `verdict` هم خوانده می‌شود', () => {
  // اجراهای پیش از این تغییر فقط `findings` دارند؛ نباید «نامعلوم» شوند
  const rows = healthOf([run('r1', '2026-03-01T10:00:00Z', [{ name: 'ورود', findings: 3 }])]);
  expect(rows[0].verdict).toBe('findings');
});

test('سبزِ کهنه با سبزِ امروز یکی نیست', () => {
  const rows = healthOf([run('r1', '2026-01-01T00:00:00Z', [{ name: 'ورود', verdict: 'passed' }])]);
  expect(daysSinceGreen(rows[0], Date.parse('2026-01-11T00:00:00Z'))).toBe(10);
  expect(daysSinceGreen({ lastGreen: null })).toBeNull();
});

test('خلاصه همان چیزی را می‌شمارد که ردیف‌ها می‌گویند', () => {
  const rows = healthOf(
    [
      run('r1', '2026-03-01T10:00:00Z', [
        { name: 'الف', verdict: 'passed' },
        { name: 'ب', verdict: 'failed' },
      ]),
    ],
    { known: ['ج'] }
  );
  expect(summarize(rows)).toMatchObject({ total: 3, passed: 1, failed: 1, never: 1 });
});

test('خودآزماهای خودِ ابزار در سلامتِ پروژه نمی‌آیند', () => {
  /**
   * ── چرا این فیلتر لازم است ──
   *
   * `testDir` کلِ `scenarios/` است، پس خودآزماها در هر اجرای واقعی هم
   * می‌روند. روی نپی نتیجه‌اش این شد: ۲۰ ردیف از ۲۲ ردیفِ «سلامتِ پروژه»،
   * تستِ خودِ userbug بود — فهرستی که هیچ‌کس نمی‌خواندش.
   */
  const rows = healthOf([
    run('r1', '2026-03-01T10:00:00Z', [
      { name: 'ورود', verdict: 'passed', file: 'scenarios/yaml.spec.js' },
      { name: 'امضا پایدار می‌ماند', verdict: 'passed', file: 'scenarios/_selftest/cache.spec.js' },
    ]),
  ]);
  expect(rows.map((row) => row.name)).toEqual(['ورود']);
});

test('اجرای قدیمِ خودآزما هم پاک می‌شود، نه فقط تازه‌اش', () => {
  /**
   * فیلترِ تک‌پاسی کافی نبود: اجرای قدیمی ستونِ `file` را ندارد، پس ردیف را
   * می‌ساخت و اجرای تازه فقط از کنارش رد می‌شد — ردیفِ کهنه سرِ جایش می‌ماند.
   */
  const rows = healthOf([
    run('r1', '2026-03-01T10:00:00Z', [{ name: 'امضا', verdict: 'passed' }]),
    run('r2', '2026-03-02T10:00:00Z', [
      { name: 'امضا', verdict: 'passed', file: 'scenarios/_selftest/cache.spec.js' },
    ]),
  ]);
  expect(rows).toEqual([]);
});

test('پیش‌نویسی که تأیید شود، همان سفر می‌ماند', () => {
  /**
   * عنوانِ پیش‌نویس پسوند دارد. بی نامِ پایدار، روزِ تأیید تاریخچه دو ردیف
   * می‌شد: قبلی «دیگر اجرا نمی‌شود» و تازه «هرگز سبز نبوده».
   */
  expect(stableName(`ورود${DRAFT_SUFFIX}`)).toBe('ورود');

  const rows = healthOf([
    run('r1', '2026-03-01T10:00:00Z', [{ name: `ورود${DRAFT_SUFFIX}`, verdict: 'failed' }]),
    run('r2', '2026-03-02T10:00:00Z', [{ name: 'ورود', verdict: 'passed' }]),
  ]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ name: 'ورود', verdict: 'passed' });
  expect(rows[0].lastRed.runId).toBe('r1');
});
