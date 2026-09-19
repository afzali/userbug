import fs from 'node:fs';
import path from 'node:path';
import { listScenarios } from '$lib/server/projects.js';
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

/**
 * «خزشِ دقیق» — فرمِ کاملِ خزش، در خانهٔ خودش.
 *
 * ── چرا از صفحهٔ جلسهٔ زنده بیرون آمد ──
 *
 * این فرم روی `discover/live` رندر می‌شد؛ یعنی دقیقاً همان صفحه‌ای که
 * بعد از زدنِ «شروع» به آن می‌رسیدی. نتیجه‌اش این بود: کاری شروع می‌شد،
 * و صفحهٔ بعدی یک فرمِ شروع نشانت می‌داد با همان سه گزینه‌ای که همین الان
 * انتخاب کرده بودی. کاربر پرسید «اگر شروع شده، پس این چیه؟» — و حق داشت:
 * آن فرم دربارهٔ کارِ در جریان نبود، درِ دومی بود برای شروعِ کارِ بعدی.
 *
 * ── چرا حذف نشد ──
 *
 * چیزهایی دارد که مودالِ «کشفِ تازه» ندارد و از خط فرمان هم به این آسانی
 * درنمی‌آیند: دانه، دامنه، واژه‌های اولویت، انتخابِ حساب، و نقشهٔ کار.
 * حذفشان یعنی قابلیت را به بهانهٔ تمیزی از دست بدهیم.
 *
 * پس مودال درِ **پیش‌فرض** است و این صفحه راهِ کسی که بیشتر می‌خواهد —
 * و مهم‌تر: جایی است که آدم **عمداً** می‌رود، نه جایی که به آن پرت می‌شود.
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

  const dossier = safely(() => readDossier(target), null);
  const map = safely(() => readMap(target), null);
  const loginPath = dossier?.auth?.loginPath || '';
  const knownRoutes = (dossier?.routes || []).map((one) => one.path).filter(Boolean);

  return {
    crawl: {
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
    },
    /** `CrawlPanel` و `MapReport` هر کدام یک عدد از اینجا می‌خوانند. */
    found: {
      proposals: safely(() => proposalsFor(target).proposals.length, 0),
      places: safely(() => unifiedStates(target), []),
    },
  };
}
