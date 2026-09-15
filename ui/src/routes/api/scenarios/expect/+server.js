import { json } from '@sveltejs/kit';
import path from 'node:path';
import YAML from 'yaml';
import {
  applyExpectations,
  candidatesFor,
  describeExpectation,
  proposeExpectations,
} from '../../../../../../src/scenario/expect.js';
import { diffLines, diffSummary, parseScenario } from '../../../../../../src/scenario/revise.js';
import { loadScenario, scenarioDir } from '../../../../../../src/scenario/load.js';
import { assertModelSlug, loadGlobalConfig, resolveModel } from '../../../../../../src/models/config.js';
import { knowledgeFor } from '../../../../../../src/knowledge/select.js';
import { listProjects } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

/**
 * «انتظار داشتیم چه ببینیم؟» — افزودنِ انتظار به یک سناریوی موجود.
 *
 * ── چرا خودش ذخیره نمی‌کند ──
 *
 * همان قاعدهٔ `revise/` و `draft/`: YAML و **تفاوت** برمی‌گردد، ذخیره کارِ
 * `POST /api/files` است. یک مسیرِ نوشتن، یک اعتبارسنجی، و آدم پیش از ذخیره
 * می‌بیند چه اضافه شد.
 *
 * ── چرا `GET` رایگان است و `POST` پول خرج می‌کند ──
 *
 * فهرستِ نامزدها از گشت و نقشه می‌آید و هیچ مدلی لازم ندارد. آدمی که
 * می‌داند چه می‌خواهد، همان فهرست را می‌بیند و تیک می‌زند. مدل میان‌بُر است،
 * نه دروازه.
 */

async function assertTarget(value) {
  const target = String(value ?? '').trim();
  const projects = await listProjects();
  const project = projects.find((item) => item.key === target);
  if (!project) throw new Error('هدف نامعتبر است');
  return { target, project };
}

/** نامزدها — رایگان. */
export async function GET({ url }) {
  try {
    const { target } = await assertTarget(url.searchParams.get('target'));
    const candidates = candidatesFor(target);

    /**
     * شمارِ قدم‌های سناریو هم برمی‌گردد، برای پیش‌فرضِ «کجا سنجیده شود».
     *
     * از **فایل** خوانده می‌شود نه از متنِ ویرایشگر: همان قاعدهٔ همیشگی که
     * چیزی از مرورگر مبنای تصمیم نشود. اگر آدم در ویرایشگر قدمی اضافه کرده
     * باشد، پیش‌فرض یکی عقب‌تر می‌افتد و خودش جابه‌جایش می‌کند — و اعمالِ
     * نهایی هم دوباره سنجیده می‌شود.
     */
    let steps = 0;
    const relative = String(url.searchParams.get('relative') ?? '').trim();
    if (relative) {
      try {
        steps = loadScenario(path.join(scenarioDir(target), relative)).steps.length;
      } catch {
        steps = 0;
      }
    }

    return json({
      target,
      candidates,
      steps,
      /**
       * فهرستِ خالی یک خبر است، نه یک خطا.
       *
       * یعنی این پروژه نه گشتِ ثبت‌شده دارد نه نقشه — و آن‌وقت هیچ انتظاری
       * نمی‌شود نوشت که به عنصرِ **واقعی** اشاره کند.
       */
      why: candidates.length
        ? ''
        : 'هیچ نامزدی نیست: این پروژه نه گشتِ ثبت‌شده دارد نه نقشه. اول یکی از آن دو.',
    });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}

export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();
    const { target, project } = await assertTarget(body?.target);

    const before = String(body?.yaml ?? '');
    if (!before.trim()) throw new Error('متنِ سناریوی فعلی نیامد');

    let scenario;
    try {
      scenario = YAML.parse(before);
    } catch (cause) {
      throw new Error(`YAML خوانده نشد: ${cause.message}`);
    }
    if (!scenario || typeof scenario !== 'object') throw new Error('سناریو شیء نیست');

    /* ── اعمالِ آنچه آدم تیک زده: رایگان ── */
    if (body?.mode === 'apply') {
      const chosen = Array.isArray(body?.chosen) ? body.chosen : [];
      if (!chosen.length) throw new Error('هیچ انتظاری انتخاب نشده است');

      /**
       * توصیفِ هدف از **فهرستِ سرور** برداشته می‌شود، نه از بدنه.
       *
       * همان قاعدهٔ `preamble` در `draft/`: هر چیزی که از مرورگر بیاید
       * نامعتمد است. کلاینت فقط `ref` می‌فرستد؛ خودِ شرط را اینجا می‌سازیم،
       * از همان فهرستی که از گشت و نقشه ساخته شده.
       */
      const byRef = new Map(candidatesFor(target).map((one) => [one.ref, one]));
      const steps = (scenario.steps || []).length;
      const resolved = [];
      const dropped = [];

      for (const item of chosen) {
        const candidate = byRef.get(String(item?.ref ?? ''));
        if (!candidate) {
          dropped.push(`نامزدِ «${item?.ref ?? '—'}» دیگر در فهرست نیست`);
          continue;
        }
        const after = Number(item?.after);
        resolved.push({
          after: Number.isInteger(after) && after >= 0 && after <= steps ? after : steps,
          kind: item?.kind === 'hidden' ? 'hidden' : 'visible',
          hard: Boolean(item?.hard),
          why: String(item?.why ?? '').slice(0, 200),
          label: candidate.label,
          target: candidate.target,
        });
      }
      if (!resolved.length) throw new Error(`هیچ‌کدام از انتخاب‌ها معتبر نبود: ${dropped.join('، ')}`);

      const after = YAML.stringify(applyExpectations(scenario, resolved));
      // `header` آرایهٔ خطوط است، نه یک رشته
      const header = parseScenario(before).header;
      const yaml = header.length ? [...header, after].join('\n') : after;
      const diff = diffLines(before, yaml);

      return json({
        yaml,
        diff,
        ...diffSummary(diff),
        /**
         * نامش `added` نیست، چون `diffSummary` همان نام را برای **شمارِ
         * خطوط** می‌دهد و رابط با آن «+۱۲ خط» را نشان می‌دهد. هم‌نامی یعنی
         * یکی از آن دو بی‌صدا برود.
         */
        expectationsAdded: resolved.map((one) => describeExpectation(one)),
        dropped,
        // همان هشدارِ همیشگی: YAML از نو ساخته می‌شود و کامنتِ میانِ قدم‌ها می‌افتد
        lostComments: parseScenario(before).inlineComments,
        target,
      });
    }

    /* ── پیشنهادِ مدل: تنها فعلی که پول خرج می‌کند ── */
    const requested = String(body?.model ?? '').trim();
    const models = resolveModel({
      global: await loadGlobalConfig(),
      role: 'author',
      model: requested ? assertModelSlug(requested) : undefined,
    });

    const result = await proposeExpectations({
      scenario,
      target,
      models,
      knowledge: knowledgeFor({ target, text: scenario.name || '', budget: 1200 }),
    });

    return json({
      ...result,
      project: project.name,
      model: `${models.provider}:${models.model}`,
      target,
    });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
