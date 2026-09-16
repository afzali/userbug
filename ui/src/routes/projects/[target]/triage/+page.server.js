import { aggregateTriage } from '$lib/server/artifacts.js';
import { readChecksConfig } from '../../../../../../src/checks/config.js';
import { UNIVERSAL } from '../../../../../../src/checks/universal.js';

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
