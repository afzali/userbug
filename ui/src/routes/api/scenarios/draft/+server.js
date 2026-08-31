import { json } from '@sveltejs/kit';
import { scenarioFromText } from '../../../../../../src/scenario/from-text.js';
import { findRelevantSource, resolveSourceRoot } from '../../../../../../src/source-access.js';
import { assertModelSlug, loadGlobalConfig, resolveModel } from '../../../../../../src/models/config.js';
import { listProjects } from '$lib/server/projects.js';
import { knowledgeFor } from '../../../../../../src/knowledge/select.js';
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

    /**
     * سورس فقط با درخواستِ صریح خوانده می‌شود.
     *
     * دو شرط، نه یکی: هم کاربر باید `useSource` بفرستد، هم پروژه باید
     * `source.root` را در کانفیگش اعلام کرده باشد. محتوای این فایل‌ها به مدلِ
     * بیرونی می‌رود، پس پیش‌فرضش خاموش است.
     */
    let source;
    if (body?.useSource) {
      if (!project.sourceRoot) {
        throw new Error(
          `پروژهٔ «${project.name}» کلید source.root ندارد.\n` +
            '  آن را در کانفیگ پروژه بگذارید تا سورس قابل خواندن شود.'
        );
      }
      const root = await resolveSourceRoot({ key: target, source: { root: project.sourceRoot } });
      source = await findRelevantSource({ root, text: body?.text });
    }

    /**
     * شناخت، بی‌شرطِ اضافه.
     *
     * برخلاف سورس، این یکی `useSource` نمی‌خواهد: پرونده را خودِ کاربر ساخته
     * (با `learn` یا با جواب دادن به پرسش‌ها) و محتوایش از قبل از همان مرز
     * رد شده. شرط گذاشتن رویش یعنی کاربر باید دو بار اجازه بدهد برای چیزی
     * که یک بار داده.
     */
    const knowledge = knowledgeFor({ target, text: body?.text });

    const draft = await scenarioFromText({
      text: body?.text,
      models,
      target: { name: project.name, baseURL: project.baseURL },
      source,
      knowledge,
    });

    return json({
      ...draft,
      target,
      // مسیرِ پیشنهادی، نه مسیرِ قطعی: کاربر می‌تواند عوضش کند و ذخیره جای
      // دیگری بنشیند.
      relative: `_drafts/${draft.slug}.yml`,
      model: `${models.provider}:${models.model}`,
      // رابط باید بتواند بگوید «با شناخت ساخته شد» یا نه
      usedKnowledge: Boolean(knowledge),
    });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
