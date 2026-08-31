import { coverageOf } from '../../../../../../src/knowledge/coverage.js';
import { readHistory } from '../../../../../../src/knowledge/history.js';
import { knowledgeDir, listPages, readDossier } from '../../../../../../src/knowledge/store.js';
import { fixturesDir, listFixtures } from '../../../../../../src/knowledge/fixtures.js';
import { listAccounts } from '../../../../../../src/knowledge/credentials.js';
import { listDocs } from '../../../../../../src/knowledge/docs.js';
import { readChecksConfig } from '../../../../../../src/checks/config.js';
import { UNIVERSAL } from '../../../../../../src/checks/universal.js';

/**
 * شناختِ پروژه.
 *
 * ── چرا هیچ‌کدام از این خواندن‌ها صفحه را نمی‌خواباند ──
 *
 * پروژه‌ای که هنوز شناختی ندارد باید همین صفحه را ببیند، با دکمهٔ «شروع».
 * اگر نبودِ `knowledge/` خطا می‌داد، تنها راهِ ساختنش از صفحه‌ای می‌گذشت که
 * خودش باز نمی‌شد.
 *
 * فهرستِ چک‌ها از موتور می‌آید نه از کامپوننت: افزودنِ چکِ تازه نباید به
 * ویرایشِ Svelte نیاز داشته باشد.
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

  return {
    dossier: safely(() => readDossier(target), null),
    pages: safely(() => listPages(target), []),
    coverage: safely(() => coverageOf(target), null),
    checksConfig: safely(() => readChecksConfig(target), { checks: {} }),
    checkDefinitions: UNIVERSAL.map((check) => ({ id: check.id, title: check.title, risky: Boolean(check.risky) })),
    history: safely(() => readHistory(knowledgeDir(target), { limit: 60 }), []),
    fixtures: await listFixtures(target).catch(() => []),
    // مسیر نشان داده می‌شود چون کاربر باید بداند فایل را کجا بگذارد
    fixturesPath: safely(() => fixturesDir(target), ''),
    accounts: safely(() => listAccounts(target), []),
    docs: await listDocs(target).catch(() => []),
  };
}
