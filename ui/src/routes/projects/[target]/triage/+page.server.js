import { aggregateTriage } from '$lib/server/artifacts.js';
import { readChecksConfig } from '../../../../../../src/checks/config.js';
import { UNIVERSAL } from '../../../../../../src/checks/universal.js';
import { normalizeCapabilityRoute, readCapabilities } from '../../../../../../src/knowledge/capabilities.js';

/**
 * یافته‌ها — و «چه چیزی ایراد حساب می‌شود».
 *
 * ── چرا چک‌ها اینجا آمدند ──
 *
 * کاربر پرسید «چرا چکِ همگانی در صفحهٔ پیکربندی است؟». جوابش این بود که
 * جایش غلط بود: لحظه‌ای که آدم سراغِ یک چک می‌رود، وقتی است که همان چک
 * یافته‌ای ساخته که قلابی است — یعنی همین‌جا، نه در صفحه‌ای که برای ثبتِ
 * حساب باز می‌شود.
 */
export async function load({ params, url }) {
  const safely = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  return {
    findings: await aggregateTriage(params.target),
    /**
     * نامِ خوانای هر مسیر — برای سرتیترِ دسته‌ها.
     *
     * ── چرا این صفحه دسته لازم داشت ──
     *
     * شش محورِ فیلتر داشت و خروجی‌اش یک فهرستِ تخت بود. فیلتر برای وقتی
     * است که می‌دانی دنبالِ چه می‌گردی؛ کسی که تازه یک بررسی گرفته
     * نمی‌داند، و پرسشش این است: «کدام بخشِ اپم بیشترین ایراد را دارد؟»
     * فهرستِ تخت این را جواب نمی‌دهد، هرچند همهٔ داده‌اش را دارد.
     *
     * ── چرا نام از شناخت می‌آید و نه از خودِ مسیر ──
     *
     * سرتیترِ `/content/:id` چیزی نمی‌گوید؛ «کتاب» می‌گوید. و همان نامی
     * است که کاربر در «اپِ من» دیده — دو نامِ متفاوت برای یک بخش یعنی
     * کاربر باید خودش بچسباندشان.
     *
     * نامی که خودِ کاربر گذاشته بر نامِ مشتق مقدم است، همان‌طور که در
     * درخت هست.
     */
    places: safely(() => {
      const caps = readCapabilities(params.target);
      const names = caps.names || {};
      const out = {};
      for (const node of caps.nodes || []) {
        /** فقط صفحه‌ها: نما مسیرِ خودش را ندارد و نامش روی کلِ صفحه می‌نشیند. */
        if (node.view) continue;
        const route = normalizeCapabilityRoute(node.route);
        if (!route) continue;
        out[route] = names[node.id]?.title || node.title || route;
      }
      return out;
    }, {}),
    /**
     * فیلترِ مکان از آدرس.
     *
     * ── چرا لازم شد ──
     *
     * پنلِ یک قابلیت دکمهٔ «ایرادهایش» دارد. بی این، آن دکمه به تریاژِ
     * **همه‌چیز** می‌رسید و کاربر باید خودش دوباره همان مسیر را از کشویی
     * پیدا می‌کرد — یعنی پیوندی که وعده‌اش را نگه نمی‌دارد.
     */
    place: String(url.searchParams.get('place') || ''),
    checksConfig: safely(() => readChecksConfig(params.target), { checks: {} }),
    checkDefinitions: UNIVERSAL.map((check) => ({
      id: check.id,
      title: check.title,
      risky: Boolean(check.risky),
    })),
  };
}
