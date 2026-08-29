/**
 * خودآزمای شرط‌ها — «شرط نخورد» در برابر «توصیف بد بود».
 *
 * ── چرا این فایل هست ──
 *
 * `assert`ی که نخورد، یافته ثبت می‌کند. پس اگر خطای **ابزار** هم «نخورد»
 * خوانده شود، هر توصیفِ مبهم به یافته‌ای به‌نام اپ تبدیل می‌شود.
 *
 * یک بار همین شد: `{text: "همه مطالب"}` در `/list` نپی به سه چیز خورد —
 * آیتم نوار کناری، breadcrumb، و `<title>`. پلی‌رایت strict-mode داد،
 * `.catch(() => false)` قورتش داد، و گزارش گفت «/list چیزی رندر نکرد» در
 * حالی که عکسِ همان قدم صفحهٔ کاملاً سالم را نشان می‌داد. سه یافتهٔ قلابی در
 * یک اجرا — و «یافتهٔ اشتباه از نبودِ یافته بدتر است».
 *
 * پس هر دو سمتِ تفکیک سنجیده می‌شود: مبهم باید بشکند، و غایبِ واقعی باید
 * یافته شود. یکی‌شان بی‌دیگری بی‌معناست: اگر فقط اولی را بسنجیم، ممکن است
 * کسی همه‌چیز را بشکند و سنجش سبز بماند.
 */
import { test, expect } from '../../src/fixtures.js';
import { runScenario } from '../../src/scenario/run.js';

test.use({ probe: true });

/** صفحهٔ ساختگی: یک متنِ تکراری و یک متنِ یکتا. */
const PAGE = `<!doctype html><html lang="fa" dir="rtl"><body>
  <nav><span>همه مطالب</span></nav>
  <main><h1>همه مطالب</h1><p id="unique">تنها یک بار</p></main>
</body></html>`;

const scenarioWith = (steps) => ({
  id: '_selftest-condition',
  name: 'خودآزمای شرط',
  status: 'approved',
  persona: 'pro',
  steps,
});

test('توصیفِ مبهم می‌شکند و یافته نمی‌سازد', async ({ page, ub, identity }) => {
  await page.setContent(PAGE);

  const before = ub.findings.length;

  await expect(
    runScenario({
      page,
      ub,
      identity,
      scenario: scenarioWith([
        { as: 'سنجش با توصیفِ مبهم', assert: { visible: { text: 'همه مطالب' } }, finding: 'نباید ثبت شود' },
      ]),
    }),
    'تطبیق چندگانه باید بلند بشکند، نه اینکه «نخورد» خوانده شود',
  ).rejects.toThrow(/ایرادِ سناریو است، نه اپ/);

  expect(ub.findings.length, 'خطای ابزار نباید یافته بسازد').toBe(before);
});

test('غایبِ واقعی همچنان یافته می‌شود', async ({ page, ub, identity }) => {
  await page.setContent(PAGE);

  const before = ub.findings.length;

  await runScenario({
    page,
    ub,
    identity,
    scenario: scenarioWith([
      {
        as: 'سنجش روی چیزی که نیست',
        assert: { visible: { text: 'چیزی که وجود ندارد' }, timeout: 1000 },
        finding: 'باید ثبت شود',
      },
    ]),
  });

  const added = ub.findings.slice(before);
  expect(added.map((f) => f.message), 'شرطِ واقعاً نخورده باید یافته بسازد').toContain('باید ثبت شود');
});

test('توصیفِ یکتا سبز می‌ماند', async ({ page, ub, identity }) => {
  await page.setContent(PAGE);

  const before = ub.findings.length;

  await runScenario({
    page,
    ub,
    identity,
    scenario: scenarioWith([
      { as: 'سنجش روی متنِ یکتا', assert: { visible: { text: 'تنها یک بار' } }, finding: 'نباید ثبت شود' },
    ]),
  });

  expect(ub.findings.length, 'شرطی که می‌خورد نباید یافته بسازد').toBe(before);
});
