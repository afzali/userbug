import { readMap } from '../../../../../../src/map/store.js';
import { extraRoutes, unreachedRoutes } from '../../../../../../src/map/render.js';
import { readDossier } from '../../../../../../src/knowledge/store.js';
import { listScenarios } from '$lib/server/projects.js';

/**
 * نقشهٔ اپ.
 *
 * ── چرا نبودِ نقشه خطا نیست ──
 *
 * همان قاعدهٔ صفحهٔ شناخت: پروژه‌ای که هنوز خزیده نشده باید همین صفحه را
 * ببیند، با دکمهٔ «شروع». صفحه‌ای که تا وقتی داده نداری باز نمی‌شود، راهِ
 * ساختنِ آن داده را هم می‌بندد.
 *
 * ── چرا فهرستِ سناریوها اینجاست ──
 *
 * خزش یک «مسیرِ ورود» می‌خواهد و آن یک فایلِ سناریوست. کاربر نباید مسیرِ فایل
 * را از حفظ تایپ کند؛ کشویی همان فهرستی است که رابط از قبل دارد.
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

  const map = safely(() => readMap(target), null);
  const knownRoutes = safely(
    () => (readDossier(target).routes || []).map((route) => route.path).filter(Boolean),
    []
  );

  return {
    map,
    knownRoutes,
    unreached: map ? safely(() => unreachedRoutes(map, knownRoutes), []) : [],
    extra: map ? safely(() => extraRoutes(map, knownRoutes), []) : [],
    scenarios: await listScenarios(target).catch(() => []),
  };
}
