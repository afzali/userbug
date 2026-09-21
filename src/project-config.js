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
 * وسوسه‌اش هست: یک `playwright.config.mjs` ساده در پروژه بنویسیم و تمام.
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
   * بی نامِ هدف، کانفیگ را از کنارِ خودِ specها می‌خوانیم.
   *
   * `process.cwd()` اینجا به‌درد نمی‌خورد: پلی‌رایت ممکن است از هر جایی
   * اجرا شده باشد. ولی `testDir` همیشه همان پوشه‌ای است که این کانفیگ در
   * آن نشسته — پس نقطهٔ شروعِ قابلِ اعتمادی است.
   */
  let target;

  if (targetName) {
    target = await loadTargetOrPlaceholder(targetName);
  } else {
    const { loadTarget } = await import('./target.js');
    target = await loadTarget(undefined, { from: testDir });
    targetName = target.key;
  }

  /**
   * شناسهٔ اجرا پیش از workerها ساخته می‌شود.
   *
   * کانفیگ زودتر از `globalSetup` و گزارشگر بار می‌شود، پس همه یک شناسهٔ
   * ثابت را به ارث می‌برند. بی این، هر worker اجرای خودش را می‌ساخت و
   * گزارش تکه‌تکه می‌شد.
   */
  process.env.UB_TARGET ||= targetName;
  process.env.UB_RUN_ID ||= newRunId(targetName);

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
 * متنِ `playwright.config.mjs`ی که در پوشهٔ userbugِ پروژه می‌نشیند.
 *
 * عمداً کوتاه است: هرچه اینجا نوشته شود، نسخهٔ دومی از تصمیم‌هایی است که
 * جای دیگری گرفته شده‌اند.
 */
export function renderProjectConfig() {
  return `/**
 * ساختهٔ \`userbug setup\`.
 *
 * تنظیمات — مهلت‌ها، گزارشگر، trace و دستگاه — از خودِ userbug می‌آید تا
 * دو جا تعریف نشوند و واگرا نشوند.
 *
 * آدرسِ اپ، لاگِ سرور و بقیه در \`userbug.config.mjs\`ِ کنارِ همین فایل.
 */
import { userbugConfig } from 'userbug/config';

export default await userbugConfig({ testDir: import.meta.dirname });
`;
}
