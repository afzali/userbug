import { tourState } from '$lib/server/tours.js';
import { listRuns } from '$lib/server/artifacts.js';
import { listPages } from '../../../../../../src/knowledge/store.js';

/**
 * پنلِ گشت.
 *
 * وضعیتِ **زنده** از حافظهٔ همین پروسه می‌آید، نه از دیسک: گشت یک شیءِ زنده
 * است و تا تمام نشده چیزی نوشته نمی‌شود. اگر کاربر تبِ پنل را ببندد و
 * برگردد، همین `load` گشتِ در جریان را پیدا می‌کند و SSE تاریخچه را بازپخش
 * می‌کند.
 *
 * ── ولی حافظهٔ پروسه، حافظهٔ پروژه نیست ──
 *
 * تا امروز صفحه فقط همان نشستِ زنده را می‌شناخت، پس بعد از پایانِ گشت — یا
 * با ریستِ رابط — می‌گفت «گشت هنوز شروع نشده»، حتی وقتی کاربر ساعت‌ها در اپ
 * گشته بود. صفحه‌ای که کارِ دیروزِ خودش را انکار کند، کاربر را وادار می‌کند
 * دوباره از صفر شروع کند.
 *
 * گشت هم یک اجراست (`runs/<id>` با `kind: 'tour'`) و صفحه‌هایی که ثبت کرده
 * در پروندهٔ شناخت‌اند. هر دو خوانده می‌شوند.
 */
export async function load({ params }) {
  const safely = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  const runs = await listRuns({ target: params.target, limit: 120 }).catch(() => []);

  return {
    tour: tourState(params.target),
    history: runs.filter((run) => run.kind === 'tour').slice(0, 8),
    // «چه چیزی از گشت‌ها مانده» — همان چیزی که کاربر دنبالش است
    pages: safely(() => listPages(params.target), []).map((page) => ({
      path: page.path,
      view: page.view || '',
      purpose: page.purpose || '',
      by: page.by || '',
      at: page.at || '',
    })),
  };
}
