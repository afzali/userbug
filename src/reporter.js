/**
 * گزارشگر.
 *
 * کارِ سنگین اینجا نیست — در `finalize.js` است که `globalTeardown` هم صدایش
 * می‌زند. این کلاس فقط وضعیت واقعی تست‌ها را اضافه می‌کند، چون تنها جایی است
 * که آن را می‌داند.
 *
 * اگر کسی با `--reporter=line` این را کنار بزند، اجرا همچنان نهایی و گزارشش
 * ساخته می‌شود؛ فقط `status` به‌جای `passed`/`failed` می‌شود `finished`.
 */
import { finalizeRun } from './finalize.js';

export default class UserbugReporter {
  async onEnd(result) {
    try {
      await finalizeRun(undefined, { status: result.status });
    } catch (e) {
      console.error('  نهایی‌سازی اجرا ناموفق بود:', e.message);
    }
  }
}
