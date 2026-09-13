import { readChecksConfig } from '../../../../../../src/checks/config.js';
import { UNIVERSAL } from '../../../../../../src/checks/universal.js';
import { fixturesDir, listFixtures } from '../../../../../../src/knowledge/fixtures.js';
import { listAccounts } from '../../../../../../src/knowledge/credentials.js';

/**
 * پیکربندیِ پروژه — آنچه در صفحهٔ شناخت بود و شناخت نبود.
 *
 * ── چرا جدا شد ──
 *
 * صفحهٔ شناخت یازده بخش داشت و سه‌تایشان جنسِ دیگری بودند: حساب‌های
 * ذخیره‌شده، فایل‌های آپلود، و چکِ همگانی. هیچ‌کدام «آنچه از این اپ
 * می‌دانیم» نیستند؛ تنظیماتِ اجرا هستند. کنارِ هم بودنشان دو هزینه داشت:
 * صفحهٔ شناخت طولانی می‌شد، و این سه‌تا در انتهای آن گم می‌شدند.
 *
 * مرزش ساده است: چیزی که با **گشت و سورس و مدل** پر می‌شود شناخت است؛
 * چیزی که **کاربر تنظیم می‌کند** پیکربندی.
 *
 * چکِ همگانی همین‌جا روشن‌ترین نمونه است: متنش از اول می‌گفت «این‌ها به
 * شناخت نیاز ندارند و روی هر پروژه‌ای اجرا می‌شوند» — یعنی خودش گفته بود
 * جایش اینجا نیست.
 */
export async function load({ params }) {
  const target = params.target;
  const safely = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  return {
    checksConfig: safely(() => readChecksConfig(target), { checks: {} }),
    checkDefinitions: UNIVERSAL.map((check) => ({ id: check.id, title: check.title, risky: Boolean(check.risky) })),
    fixtures: await listFixtures(target).catch(() => []),
    // مسیر نشان داده می‌شود چون کاربر باید بداند فایل را کجا بگذارد
    fixturesPath: safely(() => fixturesDir(target), ''),
    accounts: safely(() => listAccounts(target), []),
  };
}
