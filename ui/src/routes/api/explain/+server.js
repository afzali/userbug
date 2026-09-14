import { json } from '@sveltejs/kit';
import { explainFinding } from '../../../../../src/knowledge/explain.js';
import { resolveSourceRoots } from '../../../../../src/source-access.js';
import { assertModelSlug, loadGlobalConfig, resolveModel } from '../../../../../src/models/config.js';
import { aggregateTriage, saveExplain } from '$lib/server/artifacts.js';
import { listProjects, sourceOf } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

/**
 * «چرا این شد؟» برای یک یافته.
 *
 * ── چرا `POST` با وجود اینکه چیزی را عوض نمی‌کند ──
 *
 * مدل صدا می‌زند، یعنی پول خرج می‌کند. هر چیزی که هزینه دارد باید از همان
 * دروازه‌ای رد شود که بقیهٔ کارهای هزینه‌دار: تأییدِ صریح، نه یک `GET` که
 * ممکن است مرورگر خودش پیش‌بارگذاری‌اش کند.
 *
 * ── چرا جواب ذخیره می‌شود ──
 *
 * فرضیه با هر بار باز کردنِ صفحه عوض نمی‌شود. ذخیره نکردنش یعنی هر رفرش یک
 * فراخوانی دیگر — و کاربر هم نمی‌فهمد چرا بودجه‌اش آب می‌رود.
 *
 * ── چرا قدمِ یافته از سرور خوانده می‌شود، نه از بدنه ──
 *
 * همان قاعدهٔ `preamble` و `entry`: کلاینت فقط اثرانگشت می‌فرستد و سرور
 * خودش یافته را از اجراها برمی‌دارد. متنی که به مدل می‌رود، نباید از
 * مرورگر آمده باشد.
 */
export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();

    const target = String(body?.target ?? '').trim();
    const projects = await listProjects();
    const project = projects.find((item) => item.key === target);
    if (!project) throw new Error('هدف نامعتبر است');

    if (!project.sourceRoot) {
      throw new Error(
        `پروژهٔ «${project.name}» کلید source.root ندارد.\n` +
          '  آن را در پیکربندی پروژه بگذارید تا سورس خوانده شود.'
      );
    }

    const fingerprint = String(body?.fingerprint ?? '').trim();
    const findings = await aggregateTriage(target);
    const finding = findings.find((item) => item.fingerprint === fingerprint);
    if (!finding) throw new Error('این یافته در اجراهای این هدف نیست');

    const models = resolveModel({
      global: await loadGlobalConfig(),
      role: 'analyze',
      model: body?.model ? assertModelSlug(String(body.model)) : undefined,
    });

    const roots = await resolveSourceRoots({ key: target, source: sourceOf(project) });
    const explain = await explainFinding({ finding, roots, models, target });

    await saveExplain(target, fingerprint, explain);
    return json({ explain, fingerprint, target });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
