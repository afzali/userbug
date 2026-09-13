import { readMap } from '../../../../../../src/map/store.js';
import { extraRoutes, stuckAtLogin, unreachedRoutes } from '../../../../../../src/map/render.js';
import { mispredictions } from '../../../../../../src/map/classify.js';
import { readDossier } from '../../../../../../src/knowledge/store.js';
import { listScenarios } from '$lib/server/projects.js';
import { loadScenario } from '../../../../../../src/scenario/load.js';
import { unsupportedVerbs } from '../../../../../../src/map/replay.js';
import { scenarioDir } from '../../../../../../src/scenario/load.js';
import path from 'node:path';

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
  const loginPath = safely(() => readDossier(target).auth?.loginPath || '', '');
  const knownRoutes = safely(
    () => (readDossier(target).routes || []).map((route) => route.path).filter(Boolean),
    []
  );

  return {
    map,
    knownRoutes,
    unreached: map ? safely(() => unreachedRoutes(map, knownRoutes), []) : [],
    extra: map ? safely(() => extraRoutes(map, knownRoutes), []) : [],
    /**
     * جایی که سورس یک چیز گفت و کلیک چیز دیگری نشان داد.
     *
     * صفر هزینه دارد چون هر دو عدد از قبل در نقشه‌اند، و جنسِ باگی است که
     * هیچ چکِ همگانی نمی‌گیرد.
     */
    mispredicted: map ? safely(() => mispredictions(map), []) : [],
    /**
     * خزشی که پشتِ صفحهٔ ورود مانده، **موفق** گزارش می‌شود: صف تمام می‌شود و
     * چند گره پیدا می‌شود. بی این پرچم، کاربر نقشهٔ چهار گره‌ای می‌بیند و فکر
     * می‌کند اپش همین‌قدر است.
     */
    stuck: map ? safely(() => stuckAtLogin(map, { loginPath }), false) : false,
    /**
     * کدام سناریو **واقعاً** می‌تواند مسیرِ ورود باشد.
     *
     * ── چرا لازم شد ──
     *
     * کشویی همهٔ سناریوها را نشان می‌داد، از جمله پیش‌نویسِ گشت که ۵۷ قدم و
     * یک `upload` دارد. کاربر انتخابش می‌کرد، خزش شروع می‌شد و با «فعلی دارد
     * که خزش اجرا نمی‌کند: upload» می‌افتاد — یعنی خطا را **بعد** از شروع
     * می‌فهمید، نه موقعِ انتخاب.
     *
     * سنجش همان‌جایی انجام می‌شود که خودِ خزش انجامش می‌دهد
     * (`unsupportedVerbs`)، وگرنه دو تعریف از «اجراشدنی» می‌داشتیم.
     */
    scenarios: await Promise.all(
      (await listScenarios(target).catch(() => [])).map(async (scenario) => {
        const blockers = safely(
          () => unsupportedVerbs(loadScenario(path.join(scenarioDir(target), scenario.path)).steps),
          ['ناخوانا']
        );
        return { ...scenario, blockers };
      })
    ),
  };
}
