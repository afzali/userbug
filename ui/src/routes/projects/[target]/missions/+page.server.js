import { healthFor } from '$lib/server/artifacts.js';
import { listProjects, listScenarios } from '$lib/server/projects.js';
import { proposalsFor } from '../../../../../../src/knowledge/propose.js';
import { impactOf } from '../../../../../../src/knowledge/impact.js';
import { resolveSourceRoots } from '../../../../../../src/source-access.js';
import { sourceOf } from '$lib/server/projects.js';

/**
 * «مأموریت‌ها» — سفرهایی که کاربر واقعاً می‌رود، با وضعیتشان.
 *
 * ── چرا این صفحه ساخته شد ──
 *
 * کاربر گفت: «مأموریت‌هایی مثل ثبت‌نام، ورود، فراموشی رمز، افزودن کتاب،
 * خواندن کتاب، هایلایت و بازیابی آن — برای من مهم است بدانم اینها همه
 * بررسی شده‌اند.»
 *
 * داده‌اش از گام ۱ و ۲ آماده شد (سبز/قرمزِ هر سناریو، و شمارِ انتظارها)، ولی
 * هیچ صفحه‌ای این پرسش را نمی‌پرسید. فهرستِ فایل‌ها بر اساسِ **فایل** مرتب
 * بود، و فهرستِ اجراها بر اساسِ **کارِ ابزار**. هیچ‌کدام «اپِ من سالم است؟»
 * را جواب نمی‌داد.
 *
 * ── چرا جای «سناریوها» را در منو گرفت ──
 *
 * چون همان فایل‌هاست، با نگاهِ درست. دو ردیفِ منو برای یک چیز، همان ایرادی
 * است که کاربر دو بار گرفت. ویرایشگر سرِ جایش هست — از همین‌جا باز می‌شود.
 */
export async function load({ params }) {
  const target = params.target;

  const safely = (fn, fallback) => {
    try {
      return fn() ?? fallback;
    } catch {
      return fallback;
    }
  };

  const all = await listScenarios(target).catch(() => []);

  /**
   * فقط سناریوهای YAMLِ ریشه.
   *
   * `_drafts/` و `_quests/` را `loadScenarios` اصلاً برنمی‌دارد (بازگشتی
   * نیست)، پس هرگز اجرا نمی‌شوند. نشستنشان در فهرستِ «سفرها» یعنی ردیفی که
   * برای همیشه «هرگز اجرا نشد» می‌ماند و کسی نمی‌فهمد چرا.
   */
  const scenarios = all.filter((one) => one.kind === 'yaml' && !one.path.includes('/'));
  const health = await healthFor(target, { known: scenarios.map((one) => one.name) }).catch(() => []);

  const byName = new Map(scenarios.map((one) => [one.name, one]));

  return {
    /**
     * سلامت و فایل، در یک ردیف.
     *
     * جدا نگه داشتنشان یعنی رابط باید دو فهرست را با نام به هم بچسباند — و
     * هر جای دیگری که این کار تکرار شود، یک تعریفِ دیگر از «یکی بودن».
     */
    missions: health.map((row) => {
      const file = byName.get(row.name) || null;
      return {
        ...row,
        path: file?.path || '',
        status: file?.status || '',
        steps: file?.steps || 0,
        expects: file?.expects || 0,
        executable: Boolean(file?.executable),
        /**
         * سفری که فایلش نیست، ولی در اجراها دیده شده.
         *
         * یعنی یک `.spec.js` یا سناریویی که پاک شده. حذفش از فهرست، تاریخچه
         * را بی‌صدا کوتاه می‌کند؛ علامت‌خوردنش صادقانه‌تر است.
         */
        orphan: !file,
      };
    }),
    /** بقیهٔ فایل‌ها — پیش‌نویس و اسکریپت — فقط برای شمارش و پیوند */
    others: all.length - scenarios.length,

    /**
     * «چه باید آزمود» — پلِ میانِ کشف و سفر.
     *
     * ── چرا صفحهٔ جدا نماند ──
     *
     * هر جایی که کشف پیدا کرده و هیچ سفری سراغش نمی‌رود، یک پیشنهاد است.
     * صفحهٔ مستقل داشتنش یعنی کاربر باید یادش بماند چنین صفحه‌ای هست — و
     * همان‌جا حلقهٔ «کشف → سفر» پاره می‌شد. حالا بالای همان فهرستی است که
     * سفرها در آن زندگی می‌کنند.
     */
    ...proposals(target),

    /**
     * «کد عوض شد — چه باید دوباره آزمود؟»
     *
     * جوابِ سؤالی که توسعه‌دهنده **همین حالا** دارد. نبودِ سورس یا گیت خطای
     * صفحه نیست؛ پیام در همان بخش می‌نشیند.
     */
    ...(await impact(target)),
  };
}

/** پروژه‌ای که هنوز شناخت ندارد خطا نیست — ولی بی‌صدا هم نباید بماند. */
function proposals(target) {
  try {
    return { proposals: proposalsFor(target), proposalsError: '' };
  } catch (cause) {
    return {
      proposals: { proposals: [], open: 0, coveredRoutes: 0, totalRoutes: 0 },
      proposalsError: cause.message,
    };
  }
}

async function impact(target) {
  try {
    const project = (await listProjects()).find((item) => item.key === target);
    const roots = await resolveSourceRoots({ key: target, source: sourceOf(project) });
    return { impact: await impactOf(target, { roots, base: 'HEAD' }), impactError: '' };
  } catch (cause) {
    return { impact: null, impactError: cause.message };
  }
}
