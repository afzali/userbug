import { json } from '@sveltejs/kit';
import { scenarioFromText } from '../../../../../../src/scenario/from-text.js';
import { assertModelSlug, loadGlobalConfig, resolveModel } from '../../../../../../src/models/config.js';
import { listProjects } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

/**
 * متن ساده → YAML.
 *
 * ── چرا فایل نمی‌نویسد ──
 *
 * فقط YAML را برمی‌گرداند. ذخیره کارِ `POST /api/files` است، با
 * `createOnly: true`. یعنی یک مسیرِ نوشتن و یک اعتبارسنجی، و کاربر پیش از
 * ذخیره چیزی را که ساخته شده می‌بیند.
 *
 * ── چرا کانفیگ هدف اینجا import نمی‌شود ──
 *
 * کانفیگ هدف فایل جاوااسکریپت است و import کردنش یعنی اجرای کدِ کاربر در
 * پروسهٔ رابط. رابط این کار را جای دیگری هم نمی‌کند (اعتبارسنجی کانفیگ در
 * زیرپروسه است). پس نام و آدرس پایه از `listProjects()` می‌آید که فایل را
 * به‌شکل متن می‌خواند.
 *
 * بهایش این است: مدلِ اختصاصیِ یک هدف در کانفیگش، هنگام ساختِ سناریو اعمال
 * نمی‌شود. مهم نیست چون مدل را همین فرم صریح می‌فرستد؛ لایهٔ بعدی
 * `userbug.config.js` است و بعد پیش‌فرض.
 */
export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();

    const target = String(body?.target ?? '').trim();
    const projects = await listProjects();
    const project = projects.find((item) => item.key === target);
    if (!project) throw new Error('هدف نامعتبر است');

    const requested = String(body?.model ?? '').trim();
    const model = requested ? assertModelSlug(requested) : undefined;

    const models = resolveModel({
      global: await loadGlobalConfig(),
      role: 'author',
      model,
    });

    const draft = await scenarioFromText({
      text: body?.text,
      models,
      target: { name: project.name, baseURL: project.baseURL },
    });

    return json({
      ...draft,
      target,
      // مسیرِ پیشنهادی، نه مسیرِ قطعی: کاربر می‌تواند عوضش کند و ذخیره جای
      // دیگری بنشیند.
      relative: `_drafts/${draft.slug}.yml`,
      model: `${models.provider}:${models.model}`,
    });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
