import { error } from '@sveltejs/kit';
import { getActiveJob } from '$lib/server/jobs.js';
import { listProjects } from '$lib/server/projects.js';
import { aggregateTriage, healthFor } from '$lib/server/artifacts.js';
import { loadScenarios } from '../../../../../src/scenario/load.js';
import { listPages } from '../../../../../src/knowledge/store.js';
import { readMap } from '../../../../../src/map/store.js';
import { summarize } from '../../../../../src/runs/health.js';
import { readCapabilities } from '../../../../../src/knowledge/capabilities.js';
import { readTouch } from '../../../../../src/runs/touch.js';

/**
 * فضای کاری یک پروژه.
 *
 * هدف از مسیر می‌آید نه از `?target=`. پیش‌تر روی هر صفحه یک کشویی بود و هر
 * صفحه پیش‌فرضِ خودش را داشت (`projects[0]`)، پس رفتن از تریاژ به فایل‌ها
 * می‌توانست بی‌صدا پروژه را عوض کند.
 *
 * هدفِ ناموجود ۴۰۴ می‌گیرد، نه اینکه بی‌صدا به پروژهٔ اول بیفتد: آدرسِ غلط
 * باید خودش را نشان دهد.
 */
export async function load({ params }) {
  const projects = await listProjects();
  const project = projects.find((item) => item.key === params.target);
  if (!project) error(404, `پروژهٔ «${params.target}» وجود ندارد`);
  /**
   * اجرای در جریان، در **لایه** نه در صفحه.
   *
   * ── چرا بالا آمد ──
   *
   * پیش‌تر فقط صفحهٔ خانه آن را می‌خواند، پس پلیر روی بقیهٔ صفحه‌ها بعد از
   * یک رفرش خالی می‌ماند — در حالی که همان لحظه خزشی در جریان بود. اجرا
   * مالِ پروژه است، نه مالِ یک صفحه.
   */
  return {
    projects,
    project,
    target: project.key,
    activeJob: getActiveJob(true, project.key),
    counts: await counts(project.key),
  };
}

/**
 * عددِ زندهٔ کنارِ هر ردیفِ منو.
 *
 * ── چرا از نوارِ پیشرفتِ صفحهٔ خانه به اینجا آمد ──
 *
 * آن نوار پنج قدم را با عدد نشان می‌داد، ولی فقط روی **یک** صفحه. کاربر
 * گفت «همهٔ اینها هم معلوم باشد که کجاییم و چه باید بکنیم» — و «کجاییم»
 * چیزی نیست که با رفتن به صفحهٔ دیگر باید گم شود. منو تنها چیزی است که
 * همه‌جا هست، پس جای این عددها همان‌جاست.
 *
 * هر خواندن جدا محصور است: پروژه‌ای که هنوز `knowledge/` ندارد باید منو را
 * ببیند، نه ۵۰۰. و صفر هم یک خبر است، پس پنهان نمی‌شود — فقط «هیچ» بودن با
 * نبودنِ داده فرق دارد و رابط خودش تصمیم می‌گیرد چه بگوید.
 */
async function counts(target) {
  const safely = (fn, fallback) => {
    try {
      return fn() ?? fallback;
    } catch {
      return fallback;
    }
  };

  const map = safely(() => readMap(target), null);
  const known = safely(() => loadScenarios(target).map((one) => one.name), []);
  const health = await healthFor(target, { known }).catch(() => []);
  const sum = summarize(health);
  const triage = await aggregateTriage(target).catch(() => []);

  /**
   * عددِ درختِ قابلیت‌ها، از فایلِ **مشتق** — نه با ساختنِ دوباره.
   *
   * ساختنِ درخت `map.json` و همهٔ صفحه‌ها را می‌خواند. انجامش در لایه‌ای که
   * روی **هر** صفحهٔ پروژه اجرا می‌شود، یعنی تریاژ و سناریوها هم هزینهٔ
   * چیزی را بدهند که نشان نمی‌دهند. خودِ صفحهٔ «اپِ من» می‌سازدش.
   */
  const caps = safely(() => readCapabilities(target).nodes, []);
  const pagesOnly = caps.filter((one) => !one.view && !one.shelf);
  /** شاخصِ ذخیره‌شده خوانده می‌شود، نه تازه — همان دلیلِ بالا. */
  const touched = new Set(Object.keys(safely(() => readTouch(target).routes, {})));

  return {
    pages: safely(() => listPages(target).length, 0),
    states: map?.states?.length || 0,
    caps: caps.length,
    /**
     * «بی‌سناریو» اینجا تقریبی است و عمداً: شمارشِ دقیق شاخصِ لمس را
     * می‌خواهد که خواندنِ اجراهاست. عددِ کنارِ منو باید ارزان باشد؛ عددِ
     * دقیق روی خودِ صفحه است.
     */
    blind: pagesOnly.filter((one) => !touched.has(one.route)).length,
    missions: sum.total,
    green: sum.passed,
    red: sum.failed + sum.findings,
    /** «باز» یعنی هنوز قضاوت نشده — همان چیزی که کار می‌خواهد. */
    open: triage.filter((item) => (item.triage?.status || 'open') === 'open').length,
  };
}
