import path from 'node:path';
import fs from 'node:fs';
import { tourState } from '$lib/server/tours.js';
import { listRuns } from '$lib/server/artifacts.js';
import { listProjects, listScenarios } from '$lib/server/projects.js';
import { RUNS_DIR } from '$lib/server/paths.js';
import { knowledgeDir, listPages, readDossier } from '../../../../../../src/knowledge/store.js';
import { readBrief } from '../../../../../../src/knowledge/brief.js';
import { listDocs } from '../../../../../../src/knowledge/docs.js';
import { coverageOf } from '../../../../../../src/knowledge/coverage.js';
import { readHistory } from '../../../../../../src/knowledge/history.js';
import { coverageSnapshot } from '../../../../../../src/knowledge/endpoints.js';
import { listInvariants } from '../../../../../../src/knowledge/invariants.js';
import { listAccounts } from '../../../../../../src/knowledge/credentials.js';
import { proposalsFor } from '../../../../../../src/knowledge/propose.js';
import { readMap } from '../../../../../../src/map/store.js';
import { extraRoutes, stuckAtLogin, unreachedRoutes } from '../../../../../../src/map/render.js';
import { mispredictions } from '../../../../../../src/map/classify.js';
import { BY_LABEL, coverage as placeCoverage, unifiedStates } from '../../../../../../src/map/merge.js';
import { loadScenario, scenarioDir } from '../../../../../../src/scenario/load.js';
import { unsupportedVerbs } from '../../../../../../src/map/replay.js';
import { looksRecorded } from '../../../../../../src/scenario/entry.js';

/**
 * «کشف» — سه راه، یک هدف.
 *
 * ── چرا سه صفحه یکی شد ──
 *
 * کاربر پرسید «آیا گشت خودش یک نوع نقشه نیست؟» و بعد گفت «اگر لازم است
 * ادغامشان کن، چون UX مهم است که ساده و بدردبخور باشد».
 *
 * و جملهٔ خودش بهترین توضیح بود: «بگرد و سورس را ببین و کشف کن و بخز طبق
 * دستور من». این یک کار است با سه راه — نه سه کارِ جدا:
 *
 *   گشت   آدم نشان می‌دهد        → صفحه، هدفِ صفحه، قرارداد
 *   خزش   ابزار خودش می‌گردد     → حالت، کنش، مسیرِ بازپخش‌شدنی
 *   سورس  بی مرورگر، بی مدل      → روت، endpoint، قاعده
 *
 * و خروجیِ هر سه یک چیز است: «این اپ چه دارد و چقدرش را لمس کرده‌ایم» — که
 * تا امروز در سه صفحهٔ متفاوت تکه‌تکه بود و هیچ‌کدام کاملش را نمی‌گفت.
 *
 * ── چرا یک لودرِ بزرگ و نه سه تا ──
 *
 * چون یک صفحه است. تقسیمش یعنی سه بار خواندنِ همان `readMap` و `listPages`،
 * و سه جا که می‌توانند از هم عقب بیفتند.
 */
export async function load({ params, url }) {
  /**
   * «کدام راه» از آدرس هم می‌آید.
   *
   * ── چرا لازم شد ──
   *
   * قدمِ دومِ ساختِ پروژه می‌گوید «حالا سایت را معرفی کن» و کاربر گشت را
   * انتخاب می‌کند. بی این پارامتر، دکمه او را به همین صفحه می‌آورد و
   * صفحه دوباره از او می‌پرسد «چطور کشفش کنم؟» — یعنی همان پرسش، دو بار.
   */
  return { ...(await build(params.target)), how: String(url.searchParams.get('how') || '') };
}

async function build(target) {
  const safely = (fn, fallback) => {
    try {
      return fn() ?? fallback;
    } catch {
      return fallback;
    }
  };

  const projects = await listProjects();
  const project = projects.find((item) => item.key === target) || null;

  const map = safely(() => readMap(target), null);
  const dossier = safely(() => readDossier(target), null);
  const runs = await listRuns({ target, limit: 120 }).catch(() => []);

  /* ── گشت ── */
  const tour = {
    live: tourState(target),
    history: runs.filter((run) => run.kind === 'tour').slice(0, 8),
  };

  /* ── خزش ── */
  const loginPath = dossier?.auth?.loginPath || '';
  const knownRoutes = (dossier?.routes || []).map((route) => route.path).filter(Boolean);

  const crawl = {
    hasMap: Boolean(map?.states?.length),
    map,
    knownRoutes,
    unreached: map ? safely(() => unreachedRoutes(map, knownRoutes), []) : [],
    extra: map ? safely(() => extraRoutes(map, knownRoutes), []) : [],
    mispredicted: map ? safely(() => mispredictions(map), []) : [],
    /**
     * خزشی که پشتِ صفحهٔ ورود مانده، **موفق** گزارش می‌شود: صف تمام می‌شود و
     * چند گره پیدا می‌شود. بی این پرچم، کاربر نقشهٔ چهار گره‌ای می‌بیند و فکر
     * می‌کند اپش همین‌قدر است.
     */
    stuck: map ? safely(() => stuckAtLogin(map, { loginPath }), false) : false,
    hasProfile: safely(() => fs.existsSync(path.join(knowledgeDir(target), 'profile')), false),
    accounts: safely(() => listAccounts(target).map((item) => ({ id: item.id, email: item.email })), []),
    /**
     * کدام سناریو **واقعاً** می‌تواند مسیرِ ورود باشد.
     *
     * سنجش همان‌جایی انجام می‌شود که خودِ خزش انجامش می‌دهد
     * (`unsupportedVerbs`)، وگرنه دو تعریف از «اجراشدنی» می‌داشتیم و کاربر
     * خطا را **بعد** از شروع می‌فهمید، نه موقعِ انتخاب.
     */
    scenarios: await Promise.all(
      (await listScenarios(target).catch(() => []))
        .filter((scenario) => !scenario.path.startsWith('_quests/'))
        .map(async (scenario) => {
          const steps = safely(
            () => loadScenario(path.join(scenarioDir(target), scenario.path)).steps,
            null
          );
          return {
            ...scenario,
            blockers: steps ? unsupportedVerbs(steps) : ['ناخوانا'],
            recorded: steps ? looksRecorded(steps) : false,
          };
        })
    ),
  };

  /* ── آنچه پیدا شده ── */
  const places = safely(() => unifiedStates(target), []);
  const endpoints = await coverageSnapshot({ target, runsRoot: RUNS_DIR }).catch(() => null);
  const invariants = safely(() => listInvariants(target), []);

  const found = {
    brief: safely(() => readBrief(target), ''),
    dossier,
    pages: safely(() => listPages(target), []),
    coverage: safely(() => coverageOf(target), null),
    history: safely(() => readHistory(knowledgeDir(target), { limit: 60 }), []),
    docs: await listDocs(target).catch(() => []),
    places,
    placeCoverage: placeCoverage(places),
    /**
     * برچسب‌ها از سرور می‌آیند، نه با import در کامپوننت: `map/merge.js` به
     * `target.js` می‌رسد که `node:url` دارد، و آن کلِ صفحه را در مرورگر
     * می‌اندازد. یک بار افتاد.
     */
    byLabel: BY_LABEL,
    hasSource: Boolean(project?.sourceRoot),
    sourceRoot: project?.sourceRoot || '',
    endpoints: endpoints
      ? {
          scanned: endpoints.scanned,
          at: endpoints.at,
          files: endpoints.files,
          calls: endpoints.calls,
          total: endpoints.endpoints.length,
          untouched: endpoints.untouched.map(pick),
          partial: endpoints.partial.map(pick),
          unknown: endpoints.unknown.slice(0, 20),
          byDetector: endpoints.byDetector,
        }
      : null,
    invariants: {
      total: invariants.length,
      unique: invariants.filter((one) => one.kind === 'unique').length,
      notNull: invariants.filter((one) => one.kind === 'not-null').length,
      silenced: invariants.filter((one) => one.why).length,
      sample: invariants
        .filter((one) => one.kind === 'unique')
        .slice(0, 6)
        .map((one) => ({ id: one.id, statement: one.statement, from: one.from })),
    },
    /**
     * چند پیشنهاد از همین کشف درآمده.
     *
     * پیوندِ خنثی به «چه باید آزمود» چیزی نمی‌گفت. عدد می‌گوید کشف واقعاً چه
     * تولید کرده — و اگر صفر باشد، همان صفر هم یک خبر است.
     */
    proposals: safely(() => proposalsFor(target).proposals.length, 0),
  };

  return { tour, crawl, found };
}

const pick = (row) => ({
  path: row.path,
  methods: row.methods || [],
  untried: row.untried || [],
  sourceFile: row.sourceFile || '',
});
