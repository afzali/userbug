import { json } from '@sveltejs/kit';
import path from 'node:path';
import {
  diffLines,
  diffSummary,
  parseScenario,
  reviseScenario,
  withEntryPreamble,
} from '../../../../../../src/scenario/revise.js';
import { loadScenario, scenarioDir } from '../../../../../../src/scenario/load.js';
import { assertModelSlug, loadGlobalConfig, resolveModel } from '../../../../../../src/models/config.js';
import { knowledgeFor } from '../../../../../../src/knowledge/select.js';
import { listFixtures } from '../../../../../../src/knowledge/fixtures.js';
import { listAccounts } from '../../../../../../src/knowledge/credentials.js';
import { listProjects } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

/**
 * بازنویسیِ یک سناریوی موجود.
 *
 * ── چرا خودش ذخیره نمی‌کند ──
 *
 * همان قاعدهٔ `draft/`: YAML و **تفاوت** برمی‌گردد، ذخیره کارِ
 * `POST /api/files` است. یک مسیرِ نوشتن، یک اعتبارسنجی، و آدم پیش از ذخیره
 * می‌بیند چه رفت و چه آمد.
 *
 * ── چرا دو حالت در یک مسیر ──
 *
 * `mode: 'entry'` هیچ مدلی صدا نمی‌زند و فقط قدم‌های سناریوی ورود را جلو
 * می‌گذارد. جدا کردنش به یک endpointِ دیگر یعنی دو جای ساختِ همان خروجی
 * (yaml + diff) — و بازبینِ رابط باید دو شکلِ پاسخ را بشناسد.
 *
 * ── و چرا قدم‌های ورود از **نامِ فایل** می‌آید، نه از بدنه ──
 *
 * همان دلیلِ `preamble` در `draft/`: قدمِ سناریو کنشِ مرورگر است و هر چیزی
 * که از کلاینت بیاید نامعتمد است. سرور خودش فایل را از پوشهٔ همین هدف
 * می‌خواند.
 */
export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();

    const target = String(body?.target ?? '').trim();
    const projects = await listProjects();
    const project = projects.find((item) => item.key === target);
    if (!project) throw new Error('هدف نامعتبر است');

    const before = String(body?.yaml ?? '');
    if (!before.trim()) throw new Error('متنِ سناریوی فعلی نیامد');

    /* ── حالتِ رایگان: مقدمهٔ ورود ── */
    if (body?.mode === 'entry') {
      const relative = String(body?.entry ?? '').trim();
      if (!relative) throw new Error('سناریوی ورود انتخاب نشده است');
      if (!project.scenarios.some((item) => item.path === relative)) {
        throw new Error('سناریوی ورود در این هدف نیست');
      }

      const entry = loadScenario(path.join(scenarioDir(target), relative));
      const after = withEntryPreamble(before, entry.steps);
      const diff = diffLines(before, after);

      return json({
        yaml: after,
        diff,
        ...diffSummary(diff),
        changed: `${entry.steps.length} قدمِ «${entry.name}» جلوی سناریو گذاشته شد.`,
        // حتی در مسیرِ رایگان هم کامنتِ میانِ قدم‌ها می‌افتد: YAML از نو
        // ساخته می‌شود. رابط باید بتواند بگوید چند خط
        lostComments: parseScenario(before).inlineComments,
        demoted: false,
        model: '',
        target,
      });
    }

    /* ── حالتِ مدل ── */
    const requested = String(body?.model ?? '').trim();
    const models = resolveModel({
      global: await loadGlobalConfig(),
      role: 'author',
      model: requested ? assertModelSlug(requested) : undefined,
    });

    /**
     * شناخت بی‌شرط می‌رود، مثل `draft/`.
     *
     * پرونده را خودِ کاربر ساخته و محتوایش از قبل از همان مرز رد شده. ولی
     * فقط شناسهٔ حساب‌ها — ایمیل و رمز دادهٔ کاربرند و به مدل کاری ندارند.
     */
    const knowledge = knowledgeFor({
      target,
      text: body?.instruction,
      fixtures: await listFixtures(target).catch(() => []),
      accounts: listAccounts(target).map((item) => item.id),
    });

    const revised = await reviseScenario({
      yaml: before,
      instruction: body?.instruction,
      models,
      target: { name: project.name, baseURL: project.baseURL },
      knowledge,
    });

    const diff = diffLines(before, revised.yaml);

    return json({
      ...revised,
      diff,
      ...diffSummary(diff),
      model: `${models.provider}:${models.model}`,
      usedKnowledge: Boolean(knowledge),
      target,
    });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
