import { json } from '@sveltejs/kit';
import { coverageOf } from '../../../../../src/knowledge/coverage.js';
import { digestSource } from '../../../../../src/knowledge/digest.js';
import { readHistory } from '../../../../../src/knowledge/history.js';
import { answerQuestion, mergeIntoDossier } from '../../../../../src/knowledge/merge.js';
import { knowledgeDir, listPages, readDossier, writeDossier } from '../../../../../src/knowledge/store.js';
import { listFixtures } from '../../../../../src/knowledge/fixtures.js';
import { readChecksConfig, setCheckMode } from '../../../../../src/checks/config.js';
import { assertModelSlug, loadGlobalConfig, resolveModel } from '../../../../../src/models/config.js';
import { Budget } from '../../../../../src/models/provider.js';
import { listProjects } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertLoopbackRequest, assertMutationRequest } from '$lib/server/security.js';

/**
 * شناختِ یک پروژه — خواندن و تغییر.
 *
 * ── چرا این فایل هست ──
 *
 * قاعدهٔ پروژه دو نیمه دارد و نیمهٔ دومش تا امروز شکسته بود: «هر کاری که رابط
 * می‌کند از CLI هم بشود» رعایت شده بود، ولی «هیچ کاری نباید *فقط* از CLI ممکن
 * باشد» نه — ساختنِ شناخت فقط با `userbug learn` ممکن بود.
 *
 * و این از یک ناراحتیِ ظاهری بدتر است: تزریقِ شناخت به ساختِ سناریو خودکار
 * است، پس کاربری که فقط از رابط کار می‌کند سناریوی ضعیف‌تری می‌گرفت **بی‌آنکه
 * بفهمد چرا**.
 *
 * ── چرا هضم اینجا منتظر می‌ماند و job نمی‌شود ──
 *
 * `jobs.js` برای اجرای پلی‌رایت است: چند دقیقه، با رخدادِ زنده. هضم یک
 * فراخوانیِ مدل است، مثل `POST /api/scenarios/draft` که از قبل همین‌جا
 * منتظر می‌ماند. ساختنِ لولهٔ دوم برای یک `await`، پیچیدگی بی‌بهاست.
 */

/** هدفی که واقعاً در `targets/` هست. آدرسِ دلخواه نباید به انبار برسد. */
async function assertProject(key) {
  const target = String(key ?? '').trim();
  const project = (await listProjects()).find((item) => item.key === target);
  if (!project) throw new Error('هدف نامعتبر است');
  return project;
}

async function snapshot(target) {
  return {
    target,
    dossier: readDossier(target),
    pages: listPages(target),
    coverage: coverageOf(target),
    checks: readChecksConfig(target),
    history: readHistory(knowledgeDir(target), { limit: 60 }),
    fixtures: await listFixtures(target).catch(() => []),
  };
}

export async function GET(event) {
  try {
    assertLoopbackRequest(event);
    const project = await assertProject(event.url.searchParams.get('target'));
    return json(await snapshot(project.key));
  } catch (cause) {
    return jsonError(cause, 400);
  }
}

export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();
    const project = await assertProject(body?.target);
    const action = String(body?.action || '');

    if (action === 'digest') return json(await digest({ project, body }));

    if (action === 'answer') {
      const next = answerQuestion(readDossier(project.key), String(body?.question), String(body?.answer));
      await writeDossier(project.key, next, { by: 'user', why: 'پاسخ از رابط' });
      return json(await snapshot(project.key));
    }

    if (action === 'check-mode') {
      setCheckMode(project.key, String(body?.id), String(body?.mode), String(body?.why ?? ''));
      return json(await snapshot(project.key));
    }

    throw new Error(`کنشِ ناشناخته: «${action}»`);
  } catch (cause) {
    return jsonError(cause, 400);
  }
}

/**
 * هضمِ سورس.
 *
 * `dry` نیمهٔ بی‌مدل را می‌دهد: روت و استک، قطعی و رایگان. روی پروژه‌ای که
 * آشکارساز چیزی پیدا نکند، فراخوانیِ مدل فقط پول سوزاندن است — و کاربر باید
 * بتواند پیش از خرج کردن ببیندش.
 */
async function digest({ project, body }) {
  if (!project.sourceRoot) {
    throw new Error(
      `پروژهٔ «${project.name}» کلید source.root ندارد.\n` +
        '  بدون سورس، شناخت فقط از گشت و از پاسخ به پرسش‌ها ساخته می‌شود.'
    );
  }

  /**
   * کانفیگ هدف اینجا import نمی‌شود — همان دلیلِ `api/scenarios/draft`:
   * فایل جاوااسکریپت است و import کردنش یعنی اجرای کدِ کاربر در پروسهٔ رابط.
   * `digestSource` فقط `source.root` را لازم دارد.
   */
  const target = { key: project.key, name: project.name, source: { root: project.sourceRoot } };

  if (body?.dry) {
    const { scan } = await digestSource({ target });
    return {
      dry: true,
      routes: scan.routes,
      stack: scan.stack,
      byDetector: scan.byDetector,
      files: scan.files.length,
      docs: scan.docs,
    };
  }

  const requested = String(body?.model ?? '').trim();
  const models = resolveModel({
    global: await loadGlobalConfig(),
    role: 'analyze',
    model: requested ? assertModelSlug(requested) : undefined,
  });
  if (!models.apiKey) throw new Error('کلید مدل تنظیم نشده؛ با «فقط ساختار» می‌توانید بی‌مدل پیش بروید');

  const budget = new Budget(models.budgetPerRun);
  const { partial, scan, note } = await digestSource({ target, models, budget });

  const merged = mergeIntoDossier(readDossier(project.key), partial);
  await writeDossier(project.key, merged.dossier, { by: 'source', why: 'هضم سورس از رابط' });

  return {
    ...(await snapshot(project.key)),
    merge: { kept: merged.kept, replaced: merged.replaced, conflicts: merged.conflicts },
    scan: { files: scan.files.length, routes: scan.routes.length, byDetector: scan.byDetector },
    note,
    model: `${models.provider}:${models.model}`,
    spent: budget.spent,
  };
}
