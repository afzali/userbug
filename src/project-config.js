/**
 * کانفیگِ پلی‌رایت برای **پروژهٔ هدف**.
 *
 * ── چرا لازم شد ──
 *
 * تست‌ها به ریپوی اپ رفتند، ولی آن ریپو راهی برای اجرایشان نداشت: نه
 * `@playwright/test` داشت، نه کانفیگی، نه دسترسی به fixtureها. یعنی فایلِ
 * تولیدشده روی دیسک می‌نشست و `npx playwright test` هیچ کاری نمی‌کرد —
 * حلقه‌ای که به نظر کامل می‌آمد و نبود.
 *
 * ── چرا تکرارِ کانفیگ نه ──
 *
 * وسوسه‌اش هست: یک `playwright.config.js` ساده در پروژه بنویسیم و تمام.
 * ولی آن‌وقت `trace: 'on'`، مهلت‌ها، گزارشگر، و `globalTeardown` که گزارش
 * را می‌سازد، دو جا تعریف می‌شوند و دیر یا زود واگرا. همان درسی که
 * `emit/locator.js` و `replay-parity` نوشتند.
 *
 * پس یک تعریف، دو مصرف‌کننده: کانفیگِ خودِ این مخزن، و کانفیگی که در
 * پروژهٔ شما می‌نشیند.
 */
import path from 'node:path';
import { devices } from '@playwright/test';
import { loadTargetOrPlaceholder, ROOT } from './target.js';
import { newRunId } from './store/run-store.js';

/** مسیرِ مطلق به فایل‌های خودِ userbug — از پروژهٔ هدف هم باید پیدا شوند. */
const own = (relative) => path.join(ROOT, relative);

/**
 * @param {object} options
 * @param {string} options.target کلید پروژه
 * @param {string} options.testDir پوشه‌ای که specها آنجایند
 * @param {string[]} [options.testIgnore]
 * @returns {Promise<import('@playwright/test').PlaywrightTestConfig>}
 */
export async function userbugConfig({ target: targetName, testDir, testIgnore = [] }) {
  /**
   * شناسهٔ اجرا پیش از workerها ساخته می‌شود.
   *
   * کانفیگ زودتر از `globalSetup` و گزارشگر بار می‌شود، پس همه یک شناسهٔ
   * ثابت را به ارث می‌برند. بی این، هر worker اجرای خودش را می‌ساخت و
   * گزارش تکه‌تکه می‌شد.
   */
  process.env.UB_TARGET ||= targetName;
  process.env.UB_RUN_ID ||= newRunId(targetName);

  const target = await loadTargetOrPlaceholder(targetName);

  // 'desktop' یعنی بدون emulation. بقیه مستقیم از فهرستِ دستگاه‌های پلی‌رایت.
  const deviceName = process.env.UB_DEVICE || target.device;
  const deviceOptions =
    deviceName === 'desktop' ? { viewport: { width: 1440, height: 900 } } : devices[deviceName];

  if (!deviceOptions) throw new Error(`دستگاه ناشناخته: ${deviceName}`);

  return {
    testDir,
    testIgnore,
    // یک اجرا = یک روایت. موازی‌سازی، ترتیبِ لاگ سرور را بی‌معنا می‌کند.
    workers: 1,
    fullyParallel: false,
    timeout: 120_000,
    expect: { timeout: 10_000 },

    // مسیرهای مطلق‌اند چون این کانفیگ از پوشهٔ پروژهٔ شما بار می‌شود، نه از اینجا.
    globalSetup: own('src/global-setup.js'),
    globalTeardown: own('src/global-teardown.js'),
    reporter: [['list'], [own('src/reporter.js')]],

    use: {
      baseURL: target.baseURL,
      locale: target.locale || 'fa-IR',
      // `trace: 'on'` گران نیست و همان بسته‌ای است که تشخیصِ شکست به آن نیاز دارد.
      trace: 'on',
      video: 'off',
      screenshot: 'off',
      actionTimeout: 15_000,
      ...deviceOptions,
    },
  };
}

/**
 * متنِ `playwright.config.js`ی که در پوشهٔ userbugِ پروژه می‌نشیند.
 *
 * عمداً کوتاه است: هرچه اینجا نوشته شود، نسخهٔ دومی از تصمیم‌هایی است که
 * جای دیگری گرفته شده‌اند.
 */
export function renderProjectConfig(targetName) {
  return `/**
 * ساختهٔ \`userbug init ${targetName} --workspace\`.
 *
 * تنظیمات — مهلت‌ها، گزارشگر، trace، دستگاه، و آدرسِ اپ — از خودِ userbug
 * می‌آید تا دو جا تعریف نشود و واگرا نشوند. آدرس و لاگ و سورس را در
 * \`targets/${targetName}.config.js\` عوض کنید.
 */
import { userbugConfig } from 'userbug/config';

export default await userbugConfig({
  target: ${JSON.stringify(targetName)},
  testDir: import.meta.dirname,
});
`;
}
