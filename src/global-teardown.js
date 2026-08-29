import { finalizeRun, printSummary } from './finalize.js';

/**
 * همیشه اجرا می‌شود — حتی وقتی گزارشگرِ کانفیگ با `--reporter=…` کنار رفته باشد.
 *
 * این تنها جایی است که می‌شود مطمئن بود گزارش ساخته می‌شود. نگاه به توضیح
 * `finalize.js`.
 */
export default async function globalTeardown() {
  try {
    printSummary(await finalizeRun());
  } catch (e) {
    console.error('  نهایی‌سازی اجرا ناموفق بود:', e.message);
  }
}
