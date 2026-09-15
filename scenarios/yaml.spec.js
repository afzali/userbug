/**
 * راه‌اندازِ سناریوهای YAML.
 *
 * هر فایل `scenarios/<هدف>/*.yml` یک تست می‌شود. سناریوها داده‌اند، این فایل
 * تنها کدی است که اجرایشان می‌کند — و همین است که بعداً `replay` و `resume` و
 * ویرایش از رابط گرافیکی را ممکن می‌کند.
 */
import { test } from '../src/fixtures.js';
import { loadScenarios } from '../src/scenario/load.js';
import { runScenario } from '../src/scenario/run.js';
import { DRAFT_SUFFIX } from '../src/report/tests.js';

const targetName = process.env.UB_TARGET || 'nepi';

for (const scenario of loadScenarios(targetName)) {
  // پیش‌نویس‌ها اجرا می‌شوند ولی در گزارش علامت می‌خورند، چون هنوز بازبینی
  // انسانی نشده‌اند و نباید به‌عنوان رگرسیون شمرده شوند.
  const title = scenario.status === 'draft' ? `${scenario.name}${DRAFT_SUFFIX}` : scenario.name;

  /**
   * نامِ پایدار، جدا از عنوانِ نمایشی.
   *
   * ── چرا لازم شد ──
   *
   * عنوانِ تستِ یک پیش‌نویس `[پیش‌نویس]` می‌گیرد. یعنی روزی که آدم همان
   * سناریو را تأیید می‌کند، عنوانش عوض می‌شود و تاریخچهٔ سلامت آن را یک
   * سناریوی **تازه** می‌بیند: قبلی «دیگر اجرا نمی‌شود» و این یکی «هرگز سبز
   * نبوده». هویتِ یک سفر نباید با وضعیتش عوض شود.
   */
  const annotation = [
    { type: 'ub-name', description: scenario.name },
    { type: 'ub-status', description: scenario.status || 'approved' },
  ];

  test(title, { annotation }, async ({ page, ub, identity }) => {
    // سناریوی کاوش ذاتاً بلند است؛ با مهلت پیش‌فرض وسط کار قطع می‌شود
    if (scenario.timeout) test.setTimeout(scenario.timeout);
    await runScenario({ page, ub, identity, scenario });
  });
}
