import { json } from '@sveltejs/kit';
import path from 'node:path';
import { buildEntry, entryYaml } from '../../../../../../src/scenario/entry.js';
import { loadScenario, scenarioDir } from '../../../../../../src/scenario/load.js';
import { listAccounts } from '../../../../../../src/knowledge/credentials.js';
import { listProjects } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

/**
 * ساختِ «مسیرِ ورود» از سناریویی که یک بار کار کرد.
 *
 * ── چرا هیچ مدلی صدا زده نمی‌شود ──
 *
 * قدم‌های ورود از قبل روی دیسک‌اند: در پیش‌نویسِ گشتِ زنده که آدم خودش وارد
 * شد، یا در پیش‌نویسی که کاوش نوشت. برچسب‌ها از DOM واقعی آمده‌اند نه از
 * حدس. پرسیدن از مدل یعنی پول دادن برای چیزی که `readFile` جواب می‌دهد.
 *
 * ── چرا فایل نمی‌نویسد ──
 *
 * همان قاعدهٔ `draft/` و `revise/`: YAML برمی‌گردد و ذخیره کارِ
 * `POST /api/files` است. یک مسیرِ نوشتن، یک اعتبارسنجی.
 *
 * ── و چرا `GET` هم دارد ──
 *
 * رابط پیش از نشان دادنِ فرم باید بداند اصلاً نامزدی هست یا نه. پروژه‌ای که
 * هیچ سناریوی ورودی ندارد، نباید فرمی ببیند که هر بار «پیدا نشد» می‌دهد.
 */
export async function GET({ url }) {
  try {
    const target = String(url.searchParams.get('target') ?? '').trim();
    const projects = await listProjects();
    const project = projects.find((item) => item.key === target);
    if (!project) throw new Error('هدف نامعتبر است');

    const candidates = [];
    for (const item of project.scenarios || []) {
      if (item.kind !== 'yaml' || item.status === 'invalid') continue;
      try {
        const steps = loadScenario(path.join(scenarioDir(target), item.path)).steps;
        if (buildEntry({ steps }).found) candidates.push({ path: item.path, name: item.name });
      } catch {
        // فایلِ خراب اینجا خطا نیست، فقط نامزد نیست
      }
    }

    return json({
      candidates,
      accounts: listAccounts(target).map((item) => ({ id: item.id, email: item.email, note: item.note })),
    });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}

export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();

    const target = String(body?.target ?? '').trim();
    const projects = await listProjects();
    const project = projects.find((item) => item.key === target);
    if (!project) throw new Error('هدف نامعتبر است');

    /**
     * منبع از **نامِ فایل** می‌آید، نه از قدم‌های بدنه.
     *
     * همان دلیلِ `preamble` در `draft/`: قدمِ سناریو کنشِ مرورگر است و هرچه
     * از کلاینت بیاید نامعتمد است. سرور خودش فایل را از پوشهٔ همین هدف
     * می‌خواند.
     */
    const relative = String(body?.from ?? '').trim();
    if (!project.scenarios.some((item) => item.path === relative)) {
      throw new Error('سناریوی منبع در این هدف نیست');
    }

    const accountId = String(body?.account ?? '').trim();
    if (accountId && !listAccounts(target).some((item) => item.id === accountId)) {
      throw new Error(`حسابِ «${accountId}» در این پروژه نیست`);
    }

    const steps = loadScenario(path.join(scenarioDir(target), relative)).steps;
    const built = buildEntry({ steps, accountId });
    if (!built.found) throw new Error(built.notes.join('\n'));

    const out = 'ورود.yml';
    return json({
      yaml: entryYaml({ ...built, accountId, source: relative }),
      notes: built.notes,
      // مسیرِ پیشنهادی؛ ذخیره با `createOnly` است، پس فایلِ موجود را نمی‌برد
      relative: out,
      steps: built.steps.length,
      target,
    });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
