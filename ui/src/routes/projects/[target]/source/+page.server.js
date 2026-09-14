import path from 'node:path';
import { coverageSnapshot } from '../../../../../../src/knowledge/endpoints.js';
import { listInvariants } from '../../../../../../src/knowledge/invariants.js';
import { readDossier } from '../../../../../../src/knowledge/store.js';
import { readMap } from '../../../../../../src/map/store.js';
import { extraRoutes, unreachedRoutes } from '../../../../../../src/map/render.js';
import { RUNS_DIR } from '$lib/server/paths.js';
import { listProjects } from '$lib/server/projects.js';

/**
 * صفحهٔ سورس — «چه چیزی هست که به آن نرسیده‌ایم».
 *
 * ── چرا این صفحه لازم شد ──
 *
 * سه شکافِ متفاوت داشتیم و هر کدام جای دیگری بود: روت‌های نرسیده ته صفحهٔ
 * نقشه، endpointها فقط در خط فرمان، و ناوردا اصلاً هیچ‌جا. هیچ‌کس نمی‌توانست
 * یک‌جا ببیند «سورس چه اعلام می‌کند و ما به کجایش رسیده‌ایم».
 *
 * ── چرا هیچ‌چیزِ این صفحه مدل صدا نمی‌زند ──
 *
 * هر سه عدد از حقیقتِ نحوی می‌آیند: مسیرِ فایل، رشتهٔ `case 'GET /x'`، و
 * `UNIQUE(...)` در schema. صفحه‌ای که فقط برای نگاه کردن باز می‌شود، نباید
 * پول خرج کند.
 *
 * ── و چرا از کش می‌خواند ──
 *
 * کشفِ endpoint یعنی خواندنِ صدها فایل. صفحه‌ای که هر بار چند ثانیه سفید
 * بماند، کسی بازش نمی‌کند. دکمهٔ «تازه‌سازی» کار را صریح می‌کند، و تاریخِ
 * اسکن کنارش می‌نشیند تا کش به‌جای واقعیت خوانده نشود.
 */
export async function load({ params }) {
  const target = params.target;
  const projects = await listProjects();
  const project = projects.find((item) => item.key === target) || null;

  const dossier = safely(() => readDossier(target), {});
  const map = safely(() => readMap(target), { states: [] });
  const invariants = safely(() => listInvariants(target), []);

  const coverage = await coverageSnapshot({ target, runsRoot: RUNS_DIR }).catch(() => null);

  /**
   * روت‌ها: اول از اسکنِ بی‌مدل، بعد از پرونده.
   *
   * پرونده را `learn` پر می‌کند و آن مدل می‌خواهد. روی پروژه‌ای که `learn`
   * نشده، تکیه به پرونده یعنی نمایشِ عددی کمتر از واقعیت — و بدتر، جملهٔ
   * «هر صفحه‌ای دیده شده» در حالی که نصفشان اصلاً شمرده نشده‌اند.
   */
  const knownRoutes = coverage?.routes?.length
    ? coverage.routes
    : (dossier.routes || []).map((route) => route.path).filter(Boolean);

  /**
   * دو جهتِ متفاوت، و اولی همانی است که این صفحه دربارهٔ آن است.
   *
   * ── چرا این‌جا یک بار اشتباه شد ──
   *
   * `extraRoutes` گذاشته بودم و صفحه گفت «هر صفحه‌ای دیده شده» در حالی که
   * خودِ خزش چند دقیقه پیش نوشته بود «در سورس هست و نرسیدیم (۴)». آن تابع
   * جهتِ برعکس را می‌دهد: چیزی که در مرورگر دیدیم و در سورس نبود.
   *
   * هر دو خبرند و هیچ‌کدام جای دیگری را نمی‌گیرد: اولی «نیازموده»، دومی
   * «یا آشکارساز کور است یا مسیرِ پویاست».
   */
  const unreached = safely(() => unreachedRoutes(map, knownRoutes), []);
  const extra = safely(() => extraRoutes(map, knownRoutes), []);

  return {
    target,
    hasSource: Boolean(project?.sourceRoot),
    sourceRoot: project?.sourceRoot || '',
    stack: dossier.stack || {},

    routes: {
      total: knownRoutes.length,
      unreached,
      extra,
      states: (map.states || []).length,
    },

    endpoints: coverage
      ? {
          scanned: coverage.scanned,
          at: coverage.at,
          files: coverage.files,
          calls: coverage.calls,
          total: coverage.endpoints.length,
          untouched: coverage.untouched.map(pick),
          partial: coverage.partial.map(pick),
          unknown: coverage.unknown.slice(0, 20),
          byDetector: coverage.byDetector,
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
  };
}

const pick = (row) => ({
  path: row.path,
  methods: row.methods || [],
  untried: row.untried || [],
  sourceFile: row.sourceFile || '',
});

/**
 * پروژه‌ای که هنوز سورس ندارد، نباید صفحهٔ ۵۰۰ ببیند.
 *
 * همان قاعدهٔ صفحهٔ نقشه و شناخت: جایی که داده نیست، حالتِ خالی نشان بده و
 * بگو چطور پُرش کند — نه اینکه در را ببند.
 */
function safely(read, fallback) {
  try {
    return read() ?? fallback;
  } catch {
    return fallback;
  }
}
