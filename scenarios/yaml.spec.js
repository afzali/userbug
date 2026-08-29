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

const targetName = process.env.UB_TARGET || 'nepi';

for (const scenario of loadScenarios(targetName)) {
  // پیش‌نویس‌ها اجرا می‌شوند ولی در گزارش علامت می‌خورند، چون هنوز بازبینی
  // انسانی نشده‌اند و نباید به‌عنوان رگرسیون شمرده شوند.
  const title = scenario.status === 'draft' ? `${scenario.name} [پیش‌نویس]` : scenario.name;

  test(title, async ({ page, ub, identity }) => {
    // سناریوی کاوش ذاتاً بلند است؛ با مهلت پیش‌فرض وسط کار قطع می‌شود
    if (scenario.timeout) test.setTimeout(scenario.timeout);
    await runScenario({ page, ub, identity, scenario });
  });
}
