import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { newRunId } from './src/store/run-store.js';
import { loadTarget } from './src/target.js';

const targetName = process.env.UB_TARGET || 'nepi';

/**
 * سناریوی جاوااسکریپتیِ یک هدف نباید روی هدفِ دیگر اجرا شود.
 *
 * `yaml.spec.js` خودش `scenarios/<هدف>/*.yml` را فیلتر می‌کند، ولی فایل‌های
 * `.spec.js` را خودِ پلی‌رایت از `testDir` برمی‌دارد و برای او پوشهٔ `nepi` و
 * `userbug-ui` تفاوتی ندارند. نتیجه‌اش وقتی هدف دوم وصل شد این بود:
 * `scenarios/nepi/content-roundtrip.spec.js` با baseURL هدف تازه اجرا شد و
 * شکست — شکستی که هیچ باگی را نشان نمی‌دهد و فقط گزارش را بی‌اعتبار می‌کند.
 *
 * فهرست از `targets/` ساخته می‌شود، نه از نام پوشه‌های `scenarios/`.
 * تفاوتش مهم است: پوشه‌ای که هدفِ متناظر ندارد نباید بی‌صدا از هر اجرایی حذف
 * شود — آن‌وقت کدِ مرده‌ای می‌شد که هیچ‌کس خبردار نمی‌شد. با این ترتیب فقط
 * پوشهٔ هدف‌های واقعیِ *دیگر* کنار می‌رود.
 */
const otherTargetDirs = fs
  .readdirSync(path.join(import.meta.dirname, 'targets'), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.config.js'))
  .map((entry) => entry.name.replace(/\.config\.js$/, ''))
  .filter((name) => name !== targetName)
  .map((name) => `**/scenarios/${name}/**`);
// config پیش از globalSetup، reporter و workerها بار می‌شود؛ همه یک هویت ثابت
// را به ارث می‌برند. CLI برای هر device مقدار خودش را از قبل تنظیم می‌کند.
process.env.UB_RUN_ID ||= newRunId(targetName);
const target = await loadTarget(targetName);

// 'desktop' یعنی بدون emulation. بقیه مستقیم از فهرست دستگاه‌های Playwright
// می‌آید — عمداً هیچ شبیه‌سازی سفارشی نمی‌نویسیم.
const deviceName = process.env.UB_DEVICE || target.device;
const deviceOptions =
  deviceName === 'desktop' ? { viewport: { width: 1440, height: 900 } } : devices[deviceName];

if (!deviceOptions) throw new Error(`دستگاه ناشناخته: ${deviceName}`);

export default defineConfig({
  testDir: './scenarios',
  testIgnore: otherTargetDirs,
  // یک اجرا = یک روایت. موازی‌سازی، ترتیبِ لاگ سرور را بی‌معنا می‌کند.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  globalSetup: './src/global-setup.js',
  // نهایی‌سازی و ساخت گزارش در teardown است، نه در گزارشگر — تا با
  // `--reporter=…` در خط فرمان از دست نرود. نگاه به `src/finalize.js`.
  globalTeardown: './src/global-teardown.js',
  reporter: [['list'], ['./src/reporter.js']],
  use: {
    baseURL: target.baseURL,
    locale: target.locale || 'fa-IR',
    trace: 'on',
    video: 'off',
    screenshot: 'off',
    actionTimeout: 15_000,
    ...deviceOptions,
  },
});
