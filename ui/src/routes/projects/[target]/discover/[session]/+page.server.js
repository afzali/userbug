import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { RUNS_DIR } from '$lib/server/paths.js';
import { listRuns, readRunDetails } from '$lib/server/artifacts.js';
import { listProjects, listScenarios } from '$lib/server/projects.js';
import { tourState } from '$lib/server/tours.js';
import { getActiveJob } from '$lib/server/jobs.js';
import { WAYS } from '../../../../../../../src/knowledge/sessions.js';
import { coverageSnapshot } from '../../../../../../../src/knowledge/endpoints.js';
import { knowledgeDir, readDossier } from '../../../../../../../src/knowledge/store.js';
import { listAccounts } from '../../../../../../../src/knowledge/credentials.js';
import { readMap } from '../../../../../../../src/map/store.js';
import { unifiedStates } from '../../../../../../../src/map/merge.js';
import { proposalsFor } from '../../../../../../../src/knowledge/propose.js';
import { extraRoutes, stuckAtLogin, unreachedRoutes } from '../../../../../../../src/map/render.js';
import { mispredictions } from '../../../../../../../src/map/classify.js';
import { loadScenario, scenarioDir } from '../../../../../../../src/scenario/load.js';
import { unsupportedVerbs } from '../../../../../../../src/map/replay.js';
import { looksRecorded } from '../../../../../../../src/scenario/entry.js';
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
  const dossier = safely(() => readDossier(target), null);

  /* ── جلسهٔ در جریان ── */
  if (id === 'live') {
    const live = safely(() => tourState(target), { running: false });
    const job = getActiveJob(true, target);
    return {
      session: {
        id: 'live',
        kind: live.running ? 'tour' : job?.options?.kind === 'quest' ? 'quest' : 'map',
        way: live.running ? WAYS.tour : WAYS[job?.options?.kind === 'quest' ? 'quest' : 'map'],
        live: true,
        running: Boolean(live.running || job),
      },
      tour: { live, history: [] },
      crawl: await crawlContext(target, dossier, safely),
      /**
       * `CrawlPanel` یک عدد از `found` می‌خواند: «چند سناریوی پیشنهادی از
       * این نقشه درآمد».
       *
       * کلِ `found` را نمی‌دهیم — همان ۱۳ بخشی است که به «دانسته‌ها» رفت و
       * آوردنش اینجا یعنی برگرداندنِ همان شلوغی. فقط همان یک عدد، که
       * واقعاً دربارهٔ نتیجهٔ همین خزش است.
       */
      found: {
        proposals: safely(() => proposalsFor(target).proposals.length, 0),
        /** `MapReport` فهرستِ جاها را برای «فقط گشت دیده» می‌خواند. */
        places: safely(() => unifiedStates(target), []),
      },
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

/**
 * بافتارِ خزشِ در جریان — همان چیزی که `CrawlPanel` لازم دارد.
 *
 * فقط برای جلسهٔ زنده خوانده می‌شود: جلسهٔ تمام‌شده نقشه‌اش را از قبل در
 * شناخت گذاشته و این عددها دربارهٔ **حالا** اند، نه دربارهٔ آن بار.
 */
async function crawlContext(target, dossier, safely) {
  const map = safely(() => readMap(target), null);
  const loginPath = dossier?.auth?.loginPath || '';
  const knownRoutes = (dossier?.routes || []).map((one) => one.path).filter(Boolean);

  return {
    hasMap: Boolean(map?.states?.length),
    map,
    knownRoutes,
    unreached: map ? safely(() => unreachedRoutes(map, knownRoutes), []) : [],
    extra: map ? safely(() => extraRoutes(map, knownRoutes), []) : [],
    mispredicted: map ? safely(() => mispredictions(map), []) : [],
    stuck: map ? safely(() => stuckAtLogin(map, { loginPath }), false) : false,
    hasProfile: safely(() => fs.existsSync(path.join(knowledgeDir(target), 'profile')), false),
    accounts: safely(() => listAccounts(target).map((one) => ({ id: one.id, email: one.email })), []),
    scenarios: await Promise.all(
      (await listScenarios(target).catch(() => []))
        .filter((one) => !one.path.startsWith('_quests/'))
        .map(async (one) => {
          const steps = safely(() => loadScenario(path.join(scenarioDir(target), one.path)).steps, null);
          return {
            ...one,
            blockers: steps ? unsupportedVerbs(steps) : ['ناخوانا'],
            recorded: steps ? looksRecorded(steps) : false,
          };
        })
    ),
  };
}
