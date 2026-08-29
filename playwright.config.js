import { defineConfig, devices } from '@playwright/test';
import { loadTarget } from './src/target.js';

const targetName = process.env.UB_TARGET || 'nepi';
const target = await loadTarget(targetName);

// 'desktop' یعنی بدون emulation. بقیه مستقیم از فهرست دستگاه‌های Playwright
// می‌آید — عمداً هیچ شبیه‌سازی سفارشی نمی‌نویسیم.
const deviceName = process.env.UB_DEVICE || target.device;
const deviceOptions =
  deviceName === 'desktop' ? { viewport: { width: 1440, height: 900 } } : devices[deviceName];

if (!deviceOptions) throw new Error(`دستگاه ناشناخته: ${deviceName}`);

export default defineConfig({
  testDir: './scenarios',
  // یک اجرا = یک روایت. موازی‌سازی، ترتیبِ لاگ سرور را بی‌معنا می‌کند.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  globalSetup: './src/global-setup.js',
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
