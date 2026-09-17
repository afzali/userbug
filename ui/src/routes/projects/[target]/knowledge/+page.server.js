import fs from 'node:fs';
import { RUNS_DIR } from '$lib/server/paths.js';
import { listProjects } from '$lib/server/projects.js';
import { readBrief } from '../../../../../../src/knowledge/brief.js';
import { coverageOf } from '../../../../../../src/knowledge/coverage.js';
import { coverageSnapshot } from '../../../../../../src/knowledge/endpoints.js';
import { listDocs } from '../../../../../../src/knowledge/docs.js';
import { readHistory } from '../../../../../../src/knowledge/history.js';
import { listInvariants } from '../../../../../../src/knowledge/invariants.js';
import { knowledgeDir, listPages, readDossier } from '../../../../../../src/knowledge/store.js';
import { proposalsFor } from '../../../../../../src/knowledge/propose.js';
import { BY_LABEL, coverage as placeCoverage, unifiedStates } from '../../../../../../src/map/merge.js';

/**
 * «دانسته‌ها» — چه می‌دانیم، و از کجا.
 *
 * ── چرا از «کشف» بیرون آمد ──
 *
 * صفحهٔ کشف بیست و پنج بخش داشت و سه جنسِ کاملاً متفاوت را کنارِ هم
 * می‌ریخت: ابزارِ گشتن، نتیجهٔ همان جلسه، و **شناختِ کلِ پروژه**.
 *
 * سومی هیچ ربطی به «الان دارم می‌گردم» ندارد. واژه‌نامه و مستنداتِ بیرونی
 * و تاریخچهٔ شناخت، وقتی مرورگرِ گشت باز است، فقط فاصله‌اند تا چیزی که
 * دنبالش هستی. و کاربر همین را گفت: «خیلی قابلیت تو این صفحه زیاد هست و
 * خیلی بد چیده شده».
 *
 * پس اینجا یک جنس است و یک پرسش: **چه می‌دانیم، و از کجا آمده**. هر بند
 * `by:` خودش را دارد و همان قاعدهٔ اعتمادِ همیشگی رویش می‌چربد.
 *
 * ── و چرا «جاهای اپ» با خودش نیامد ──
 *
 * آن جدول همان درختِ «اپِ من» است با شکلِ قدیمی — دو نمایشِ یک حقیقت،
 * که دیر یا زود یکی‌شان عقب می‌ماند. حذف شد، نه منتقل.
 */
export async function load({ params }) {
  const target = params.target;

  const safely = (fn, fallback) => {
    try {
      return fn() ?? fallback;
    } catch {
      return fallback;
    }
  };

  const projects = await listProjects();
  const project = projects.find((item) => item.key === target) || null;
  const dossier = safely(() => readDossier(target), null);

  const places = safely(() => unifiedStates(target), []);
  const endpoints = await coverageSnapshot({ target, runsRoot: RUNS_DIR }).catch(() => null);
  const invariants = safely(() => listInvariants(target), []);

  /**
   * همان شکلی که `FoundPanel` می‌خواند — نه شکلی که من حدس زدم.
   *
   * نخستین بار `{ path, method, file }` نوشتم و صفحه ۵۰۰ داد:
   * `row.methods.join` روی `undefined`. قرارداد در همان کامپوننت بود و
   * بازنویسی‌اش لازم نبود، فقط کپیِ درست.
   */
  const pick = (row) => ({
    path: row.path,
    methods: row.methods || [],
    untried: row.untried || [],
    sourceFile: row.sourceFile || '',
  });

  return {
    found: {
      brief: safely(() => readBrief(target), ''),
      dossier,
      pages: safely(() => listPages(target), []),
      coverage: safely(() => coverageOf(target), null),
      history: safely(() => readHistory(knowledgeDir(target), { limit: 60 }), []),
      docs: await listDocs(target).catch(() => []),
      places,
      placeCoverage: placeCoverage(places),
      /**
       * برچسب‌ها از سرور می‌آیند، نه با import در کامپوننت: `map/merge.js`
       * به `target.js` می‌رسد که `node:url` دارد، و آن کلِ صفحه را در
       * مرورگر می‌اندازد. یک بار افتاد.
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
      proposals: safely(() => proposalsFor(target).proposals.length, 0),
    },
    hasProfile: safely(() => fs.existsSync(`${knowledgeDir(target)}/profile`), false),
  };
}
