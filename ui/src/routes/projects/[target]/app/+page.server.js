import { coverageOf } from '../../../../../../src/knowledge/coverage.js';
import { readHistory } from '../../../../../../src/knowledge/history.js';
import { readBrief } from '../../../../../../src/knowledge/brief.js';
import { knowledgeDir, listPages, readDossier } from '../../../../../../src/knowledge/store.js';
import { listDocs } from '../../../../../../src/knowledge/docs.js';
import { coverageSnapshot } from '../../../../../../src/knowledge/endpoints.js';
import { listInvariants } from '../../../../../../src/knowledge/invariants.js';
import { BY_LABEL, coverage as placeCoverage, unifiedStates } from '../../../../../../src/map/merge.js';
import { RUNS_DIR } from '$lib/server/paths.js';
import { listProjects } from '$lib/server/projects.js';

/**
 * «اپ» — هرچه دربارهٔ این پروژه می‌دانیم، در یک صفحه.
 *
 * ── چرا دو صفحه یکی شد ──
 *
 * کاربر پرسید: «چرا شناخت و سورس دوتاست؟ مگر یکی نیستند؟»
 *
 * بودند. هر دو یک پرسش را جواب می‌دادند — «این اپ چه دارد و چقدرش را لمس
 * کرده‌ایم؟» — و تفکیکشان تاریخی بود نه مفهومی: یکی از مدل و گشت پر می‌شد،
 * آن یکی از اسکنِ ایستا. ولی کاربر که سراغِ هیچ‌کدام نمی‌رود تا بپرسد
 * «کدامش را مدل گفته»؛ می‌رود تا بداند اپش چه دارد.
 *
 * و بدتر: هر کدام **نصفِ** پوشش را می‌شمرد، پس هر دو نمره از واقعیت
 * خوش‌بین‌تر بودند.
 *
 * ── چرا هیچ‌کدام از این خواندن‌ها صفحه را نمی‌خواباند ──
 *
 * پروژه‌ای که هنوز شناختی ندارد باید همین صفحه را ببیند، با دکمهٔ «شروع».
 * اگر نبودِ `knowledge/` خطا می‌داد، تنها راهِ ساختنش از صفحه‌ای می‌گذشت که
 * خودش باز نمی‌شد.
 *
 * ── و چرا حساب‌ها و fixtureها و چک‌ها اینجا نیستند ──
 *
 * جنسشان تنظیمات است نه شناخت، و به `/projects/<کلید>/config` رفتند. مرز:
 * چیزی که با گشت و سورس و مدل **پر می‌شود** شناخت است؛ چیزی که کاربر
 * **تنظیم می‌کند** پیکربندی.
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

  const projects = await listProjects();
  const project = projects.find((item) => item.key === target) || null;

  /**
   * جاهای اپ، از هر سه منبع — خزش، گشت، و سورس.
   *
   * همان خوانندهٔ واحدی که صفحهٔ نقشه هم از آن می‌خواند. دو شمارشِ جدا یعنی
   * دو عددِ پوشش که هیچ‌کدام کامل نیست.
   */
  const places = safely(() => unifiedStates(target), []);

  /**
   * endpointها از کش خوانده می‌شوند.
   *
   * کشفشان یعنی خواندنِ صدها فایل؛ صفحه‌ای که هر بار چند ثانیه سفید بماند
   * کسی بازش نمی‌کند. دکمهٔ «خواندنِ دوبارهٔ سورس» کار را صریح می‌کند و
   * تاریخِ اسکن کنارش می‌نشیند تا کش به‌جای واقعیت خوانده نشود.
   */
  const endpointCoverage = await coverageSnapshot({ target, runsRoot: RUNS_DIR }).catch(() => null);
  const invariants = safely(() => listInvariants(target), []);

  return {
    hasSource: Boolean(project?.sourceRoot),
    sourceRoot: project?.sourceRoot || '',
    places,
    placeCoverage: placeCoverage(places),
    /**
     * برچسب‌ها از سرور می‌آیند، نه با import در کامپوننت.
     *
     * `merge.js` از `map/store.js` و آن از `target.js` استفاده می‌کند که
     * `node:url` دارد — یعنی import کردنش در کلاینت کلِ صفحه را با «Module
     * has been externalized for browser compatibility» می‌اندازد. یک بار
     * افتاد و صفحه ۵۰۰ شد در حالی که سرور درست رندر کرده بود.
     */
    byLabel: BY_LABEL,

    endpoints: endpointCoverage
      ? {
          scanned: endpointCoverage.scanned,
          at: endpointCoverage.at,
          files: endpointCoverage.files,
          calls: endpointCoverage.calls,
          total: endpointCoverage.endpoints.length,
          untouched: endpointCoverage.untouched.map(pick),
          partial: endpointCoverage.partial.map(pick),
          unknown: endpointCoverage.unknown.slice(0, 20),
          byDetector: endpointCoverage.byDetector,
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
     * توضیحِ خودِ آدم — جدا از پرونده، چون مالکش فرق دارد.
     *
     * پرونده را اتوماسیون می‌نویسد (`learn`، گشت، تریاژ). این متن `by: user`
     * است و در فایلِ خودش می‌نشیند تا هیچ اجرایی رویش ننویسد.
     */
    brief: safely(() => readBrief(target), ''),
    dossier: safely(() => readDossier(target), null),
    pages: safely(() => listPages(target), []),
    coverage: safely(() => coverageOf(target), null),
    history: safely(() => readHistory(knowledgeDir(target), { limit: 60 }), []),
    docs: await listDocs(target).catch(() => []),
  };
}

const pick = (row) => ({
  path: row.path,
  methods: row.methods || [],
  untried: row.untried || [],
  sourceFile: row.sourceFile || '',
});
