import { listRuns } from '$lib/server/artifacts.js';
import { tourState } from '$lib/server/tours.js';
import { discoverySessions, summarizeSessions } from '../../../../../../src/knowledge/sessions.js';

/**
 * «کشف» — صندوقِ جلسه‌ها.
 *
 * ── چرا این صفحه از نو نوشته شد ──
 *
 * صفحهٔ قبلی یک رادیوی «چطور کشفش کنم؟» داشت با سه حالت، و زیرش بیست و
 * پنج بخش. سه ایرادِ مشخص:
 *
 *   رادیو **حالت** بود نه کار. وقتی گشتی در جریان بود همان‌جا می‌ماند و
 *   یک کلیکِ اشتباهی حالت را عوض می‌کرد — کنترلی که کارِ در جریان را خراب
 *   کند، نباید کنارِ همان کار باشد.
 *
 *   قدمِ دومِ ساختِ پروژه می‌گفت «سایت را معرفی کن» و «شروع» که می‌زدی، به
 *   صفحه‌ای می‌رسیدی که **دوباره همان پرسش** را می‌پرسید.
 *
 *   سیزده بخشش اصلاً دربارهٔ گشتن نبود (واژه‌نامه، مستندات، تاریخچهٔ
 *   شناخت) و به «دانسته‌ها» رفتند.
 *
 * حالا یک فهرست است و یک دکمه — همان شکلِ «بررسی». دو صفحهٔ هم‌شکل یعنی
 * یاد گرفتنِ یکی، یاد گرفتنِ آن یکی.
 */
export async function load({ params }) {
  const target = params.target;
  const runs = await listRuns({ target, limit: 200 }).catch(() => []);

  const safely = (fn, fallback) => {
    try {
      return fn() ?? fallback;
    } catch {
      return fallback;
    }
  };

  const sessions = safely(() => discoverySessions(target, runs), []);

  return {
    sessions,
    summary: summarizeSessions(sessions),
    /**
     * گشتِ زنده در **همین پروسه** است، نه در `runs/`.
     *
     * تا وقتی تمام نشده `run.json` ندارد، پس در فهرست نمی‌آید. صندوقی که
     * کارِ در جریان را نشان ندهد، دقیقاً در لحظه‌ای بی‌فایده است که کاربر
     * بیشترین شک را دارد که آیا چیزی شروع شد یا نه.
     */
    live: safely(() => tourState(target), null),
  };
}
