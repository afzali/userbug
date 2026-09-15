import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertMission,
  listMissions,
  missionToJob,
  proposeMission,
  removeMission,
  saveMission,
} from '../../../../../src/map/mission.js';
import { readMap } from '../../../../../src/map/store.js';
import { knowledgeDir, readDossier } from '../../../../../src/knowledge/store.js';
import { knowledgeFor } from '../../../../../src/knowledge/select.js';
import { listAccounts } from '../../../../../src/knowledge/credentials.js';
import { readEndpoints } from '../../../../../src/knowledge/endpoints.js';
import { assertModelSlug, loadGlobalConfig, resolveModel } from '../../../../../src/models/config.js';
import { listProjects, listScenarios } from '$lib/server/projects.js';
import { startJob } from '$lib/server/jobs.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

/**
 * «مأموریت» — جمله، پیش از آنکه پولی خرج شود.
 *
 * ── چرا سه کار از یک در ──
 *
 * پیشنهاد، ذخیره، و اجرا سه فعلِ یک چیزند و هر سه به همان دنیا نگاه
 * می‌کنند (روت‌ها، حساب‌ها، سناریوها). جدا کردنشان یعنی روزی یکی‌شان
 * فهرستی را بشناسد که آن یکی نمی‌شناسد — و همان لحظه دامنه‌ای ذخیره می‌شود
 * که خزش هرگز پیدایش نمی‌کند.
 *
 * ── چرا اجرا هم از اینجا می‌گذرد و نه مستقیم از `/api/jobs` ──
 *
 * چون مأموریت باید بداند چه اجراهایی از دلش درآمده. اگر رابط خودش job را
 * می‌ساخت، پیوند در مرورگر می‌ماند و با بستنِ تب می‌رفت.
 */

/** دنیایی که مدل مجاز است از آن نام ببرد — یک بار، برای هر سه فعل. */
async function worldOf(target) {
  const safely = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  const map = safely(() => readMap(target), null);
  const states = map?.states || [];

  /**
   * روت‌ها از سه جا: نقشه، پروندهٔ شناخت، و endpointهای سورس.
   *
   * نقشه فقط جایی را می‌شناسد که رفته. مأموریتی که می‌خواهد جایی را بگردد
   * که هنوز نرفته‌ایم — دقیقاً ارزشمندترین حالت — با فهرستِ نقشه به
   * «دامنه‌ای که نشناختیم» می‌خورد و می‌افتد.
   */
  const routes = [
    ...new Set([
      ...states.map((one) => one.route).filter(Boolean),
      ...safely(() => (readDossier(target).routes || []).map((one) => one.path), []).filter(Boolean),
      ...safely(() => (readEndpoints(target).routes || []).map((one) => one.path), []).filter(Boolean),
    ]),
  ];

  return {
    map,
    routes,
    views: [...new Set(states.map((one) => one.view).filter(Boolean))],
    accounts: safely(() => listAccounts(target).map((one) => one.id), []),
    scenarios: (await listScenarios(target).catch(() => []))
      // رانندهٔ کاوش مسیرِ ورود نیست، خروجیِ همین حلقه است
      .filter((one) => !one.path.startsWith('_quests/'))
      .map((one) => one.path),
    hasSession: fs.existsSync(path.join(knowledgeDir(target), 'profile')),
  };
}

async function assertTarget(body) {
  const target = String(body?.target ?? '').trim();
  const projects = await listProjects();
  const project = projects.find((item) => item.key === target);
  if (!project) throw new Error('هدف نامعتبر است');
  return { target, project };
}

export async function GET({ url }) {
  try {
    const target = String(url.searchParams.get('target') ?? '').trim();
    await assertTarget({ target });
    const world = await worldOf(target);
    return json({
      target,
      missions: listMissions(target),
      // رابط همین‌ها را در کشویی می‌گذارد تا اصلاحِ دستی هم از حدس نوشته نشود
      world: {
        routes: world.routes,
        views: world.views,
        accounts: world.accounts,
        scenarios: world.scenarios,
        hasSession: world.hasSession,
      },
    });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}

export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();
    const { target } = await assertTarget(body);
    const action = String(body?.action ?? 'propose');

    if (action === 'remove') {
      removeMission(target, String(body?.slug ?? ''));
      return json({ target, missions: listMissions(target) });
    }

    if (action === 'save') {
      /**
       * آنچه ذخیره می‌شود، دوباره از همان صافی رد می‌شود.
       *
       * متنِ ویرایش‌شده از مرورگر می‌آید و آدم هم غلط تایپ می‌کند. دامنه‌ای
       * که به هیچ حالتی نمی‌خورد، چه از مدل آمده باشد چه از دستِ آدم،
       * خزشِ بی‌فایده می‌سازد.
       */
      const world = await worldOf(target);
      const clean = assertMission(body?.mission, world);
      return json({
        target,
        mission: saveMission(target, {
          ...clean,
          text: String(body?.mission?.text ?? '').slice(0, 300),
          // «کی گفت» می‌ماند: مدل، قاعده، یا دستِ آدم — همان قاعدهٔ `by:` پرونده
          by: ['model', 'rule'].includes(body?.mission?.by) ? body.mission.by : 'user',
          slug: body?.mission?.slug || undefined,
        }),
      });
    }

    if (action === 'run') {
      const mission = listMissions(target).find((one) => one.slug === String(body?.slug ?? ''));
      if (!mission) throw new Error('این مأموریت ذخیره نشده است');

      const options = missionToJob(mission, {
        target,
        states: Number(body?.states) || 40,
        minutes: Number(body?.minutes) || 12,
      });
      const job = await startJob({ ...options, headed: Boolean(body?.headed) });

      /**
       * اجرا در خودِ فایلِ مأموریت ثبت می‌شود.
       *
       * «چه سناریوهایی از این مأموریت درآمد» پرسشی است که هفتهٔ بعد پرسیده
       * می‌شود، نه همین حالا؛ و تا آن موقع تبِ مرورگر بسته شده.
       */
      saveMission(target, {
        ...mission,
        runs: [{ job: job.id, at: new Date().toISOString(), by: 'ui' }, ...(mission.runs || [])].slice(0, 20),
      });
      return json({ job, mission: mission.slug }, { status: 201 });
    }

    /* ── پیشنهاد: تنها فعلی که پول خرج می‌کند ── */
    const world = await worldOf(target);
    const models = resolveModel({
      global: await loadGlobalConfig(),
      role: 'author',
      model: body?.model ? assertModelSlug(String(body.model)) : undefined,
    });

    const mission = await proposeMission({
      text: String(body?.text ?? ''),
      target,
      models,
      map: world.map,
      // خودش با توضیحِ صاحبِ پروژه شروع می‌شود؛ همان که در گام ۱ اضافه شد
      knowledge: knowledgeFor({ target, text: String(body?.text ?? ''), budget: 1200 }),
      routes: world.routes,
      views: world.views,
      accounts: world.accounts,
      scenarios: world.scenarios,
      hasSession: world.hasSession,
    });

    // ذخیره نمی‌شود: نقشهٔ کار اول باید جلوی چشمِ آدم اصلاح شود
    return json({ target, mission });
  } catch (cause) {
    const status = cause?.code === 'JOB_ACTIVE' ? 409 : 400;
    return jsonError(cause, status);
  }
}
