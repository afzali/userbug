import { error } from '@sveltejs/kit';
import path from 'node:path';
import { RUNS_DIR } from '$lib/server/paths.js';
import { listRuns, readRunDetails } from '$lib/server/artifacts.js';
import { listProjects } from '$lib/server/projects.js';
import { tourState } from '$lib/server/tours.js';
import { getActiveJob } from '$lib/server/jobs.js';
import { WAYS } from '../../../../../../../src/knowledge/sessions.js';
import { coverageSnapshot } from '../../../../../../../src/knowledge/endpoints.js';
import { countsByRoute, refreshTouch } from '../../../../../../../src/runs/touch.js';
import { allScenarios, yieldOf } from '../../../../../../../src/knowledge/yield.js';

/**
 * داخلِ یک جلسهٔ کشف.
 *
 * ── چرا صفحهٔ جدا و نه یک پنل ──
 *
 * کاربر گفت: «وقتی در یک گشتی وارد شدیم و در جریانه، دکمه‌های اضافه دیده
 * نشه — مثل این‌باکس که وقتی نیو رو می‌زنیم داخلِ اون ایمیل می‌ریم.»
 *
 * دستِ اشتباهی دیگر چیزی را عوض نمی‌کند، چون چیزی برای عوض کردن نیست:
 * اینجا فقط **همین** جلسه است. نه سوئیچِ روش، نه فهرستِ جلسه‌های دیگر، نه
 * واژه‌نامه.
 *
 * ── سه شناسهٔ خاص ──
 *
 * `live`    گشت یا خزشی که همین حالا در جریان است و هنوز `run.json` ندارد
 * `source`  آخرین خواندنِ سورس؛ اجرا نیست، پس `runId` هم ندارد
 * بقیه      همان `runId` در `runs/`
 */
export async function load({ params }) {
  const target = params.target;
  const id = params.session;

  const safely = (fn, fallback) => {
    try {
      return fn() ?? fallback;
    } catch {
      return fallback;
    }
  };

  const projects = await listProjects();
  const project = projects.find((one) => one.key === target) || null;

  /* ── جلسهٔ در جریان ── */
  /**
   * ── چرا این شاخه بازنویسی شد ──
   *
   * دو دروغ داشت و هر دو را روی یک پروژهٔ واقعی دیدیم:
   *
   *   ۱. `kind` را «یا گشت یا خزش» حساب می‌کرد، پس **کاوشِ هدف‌دار** به
   *      شاخهٔ خزش می‌افتاد — و صفحه فرمِ شروعِ خزش را نشان می‌داد وسطِ
   *      کاوشی که همان لحظه در جریان بود. کاربر درست پرسید: «اگر شروع
   *      شده، پس این چیه؟»
   *
   *   ۲. `live: true` ثابت بود، پس سرصفحه **همیشه** می‌گفت «در جریان» —
   *      حتی وقتی هیچ کاری نبود. `running` حساب می‌شد و هیچ‌جا خوانده
   *      نمی‌شد.
   *
   * حالا `kind` از خودِ کارِ در جریان می‌آید و اگر کاری نباشد، `null`
   * است — و صفحه همین را می‌گوید، نه چیزی شبیهِ آن.
   */
  if (id === 'live') {
    const live = safely(() => tourState(target), { running: false });
    const job = getActiveJob(true, target);
    const kind = live.running ? 'tour' : job?.options?.kind === 'quest' ? 'quest' : job ? 'map' : '';

    return {
      session: {
        id: 'live',
        kind,
        /**
         * وقتی کاری در جریان نیست، زیرنویسی نمی‌ماند.
         *
         * سرصفحه خودش «چیزی در جریان نیست» را می‌گوید؛ همان جمله در
         * `hint` یعنی دو بار پشتِ هم، که خواننده را وادار می‌کند دنبالِ
         * تفاوتی بگردد که وجود ندارد.
         */
        way: kind ? WAYS[kind] : { label: 'کشف', hint: '' },
        live: true,
        running: Boolean(live.running || job),
        /**
         * جملهٔ هدف و دامنه — تنها چیزی که کاوش دربارهٔ خودش دارد.
         *
         * بی این، پنلِ زنده فقط می‌گوید «کاوشی در جریان است» و کاربر باید
         * یادش بماند خودش چه نوشته بود.
         */
        goal: job?.options?.goal || '',
        scope: job?.options?.scope || '',
        focus: job?.options?.focus || '',
      },
      tour: { live, history: [] },
    };
  }

  /* ── خواندنِ سورس ── */
  if (id === 'source') {
    const snapshot = await coverageSnapshot({ target, runsRoot: RUNS_DIR }).catch(() => null);
    if (!snapshot) error(404, 'هنوز سورسی خوانده نشده');
    return {
      session: {
        id: 'source',
        kind: 'source',
        way: WAYS.source,
        at: snapshot.at,
        live: false,
        running: false,
      },
      source: {
        files: snapshot.files,
        at: snapshot.at,
        total: snapshot.endpoints.length,
        routes: snapshot.routes || [],
        untouched: snapshot.untouched.map((one) => ({ path: one.path, method: one.method })),
        byDetector: snapshot.byDetector,
      },
      hasSource: Boolean(project?.sourceRoot),
      sourceRoot: project?.sourceRoot || '',
      harvest: safely(
        () =>
          yieldOf({
            session: { kind: 'source', at: snapshot.at },
            runDir: '',
            target,
            scenarios: allScenarios(target),
            counts: countsByRoute(refreshTouch(target, RUNS_DIR), []),
          }),
        null
      ),
    };
  }

  /* ── یک اجرای گذشته ── */
  const runs = await listRuns({ target, limit: 300 }).catch(() => []);
  const row = runs.find((one) => one.runId === id);
  if (!row) error(404, 'چنین جلسه‌ای نیست');

  const detail = await readRunDetails(id).catch(() => null);

  return {
    session: {
      id,
      kind: row.kind,
      way: WAYS[row.kind] || { label: row.kind, hint: '' },
      at: row.startedAt,
      finishedAt: row.finishedAt,
      status: row.status,
      steps: row.steps || 0,
      findings: row.findings || 0,
      bench: row.bench || '',
      live: false,
      running: false,
    },
    /**
     * فقط آنچه مالِ **همین** جلسه است.
     *
     * صفحهٔ قبلی «صفحه‌های ثبت‌شده» و «یافته‌ها» را از کلِ پروژه می‌آورد،
     * پس بعد از ده گشت، هیچ‌کدام دربارهٔ گشتی نبودند که باز کرده بودی.
     */
    steps: (detail?.timeline || []).map((one) => ({
      step: one.step,
      route: one.route || '',
      shot: one.shot || '',
      at: one.at,
      findings: (one.findings || []).length,
    })),
    findings: (detail?.findings || []).map((one) => ({
      fingerprint: one.fingerprint,
      message: one.normalized || one.message,
      source: one.source,
      route: one.route || '',
    })),

    /**
     * «این کشف چه چیزی برای اجرا ساخت؟»
     *
     * ── چرا در لودر و نه با یک دکمه ──
     *
     * این جوابِ سوالِ اصلیِ صفحه است، نه یک جزئیاتِ اختیاری. کاربر گفت
     * ملاکِ درست انجام شدنِ کشف همین است — و ملاکی که باید دنبالش بگردی،
     * ملاک نیست.
     *
     * هزینه‌اش هم مالِ **یک** اجراست: `events.ndjson`ِ همین جلسه، نه
     * همهٔ اجراها.
     */
    harvest: safely(
      () =>
        yieldOf({
          session: { kind: row.kind, at: row.startedAt },
          runDir: path.join(RUNS_DIR, id),
          target,
          scenarios: allScenarios(target),
          counts: countsByRoute(refreshTouch(target, RUNS_DIR), []),
        }),
      null
    ),
  };
}
