import { json } from '@sveltejs/kit';
import { scenarioFromText } from '../../../../../../src/scenario/from-text.js';
import { findRelevantSource, resolveSourceRoots } from '../../../../../../src/source-access.js';
import { assertModelSlug, loadGlobalConfig, resolveModel } from '../../../../../../src/models/config.js';
import { listProjects, sourceOf } from '$lib/server/projects.js';
import { knowledgeFor } from '../../../../../../src/knowledge/select.js';
import { proposalsFor } from '../../../../../../src/knowledge/propose.js';
import { listFixtures } from '../../../../../../src/knowledge/fixtures.js';
import { listAccounts } from '../../../../../../src/knowledge/credentials.js';
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
      const roots = await resolveSourceRoots({ key: target, source: sourceOf(project) });
      source = await findRelevantSource({ roots, text: body?.text });
    }

    /**
     * شناخت، بی‌شرطِ اضافه.
     *
     * برخلاف سورس، این یکی `useSource` نمی‌خواهد: پرونده را خودِ کاربر ساخته
     * (با `learn` یا با جواب دادن به پرسش‌ها) و محتوایش از قبل از همان مرز
     * رد شده. شرط گذاشتن رویش یعنی کاربر باید دو بار اجازه بدهد برای چیزی
     * که یک بار داده.
     */
    const knowledge = knowledgeFor({
      target,
      text: body?.text,
      // بدون این، مدل نامِ فایلِ آپلود را اختراع می‌کند و سناریو در اجرا
      // با «فایل پیدا نشد» می‌شکند
      fixtures: await listFixtures(target).catch(() => []),
      // فقط شناسه‌ها؛ ایمیل و رمز دادهٔ کاربرند و به مدل کاری ندارند
      accounts: listAccounts(target).map((item) => item.id),
    });

    /**
     * مقدمه از **شناسهٔ پیشنهاد** می‌آید، نه از بدنهٔ درخواست.
     *
     * ── چرا قدم‌ها را از کلاینت نمی‌گیریم ──
     *
     * قدمِ سناریو کد نیست ولی کنشِ مرورگر است، و هر چیزی که از مرورگر بیاید
     * ورودیِ نامعتمد است. با فرستادنِ شناسه، سرور خودش مقدمه را از نقشه
     * برمی‌دارد — همان مسیری که خزنده واقعاً رفته. یک سطحِ حمله کمتر، و
     * هم‌زمان تضمینِ اینکه مقدمه واقعاً از نقشه است نه از دستِ کسی.
     */
    let preamble = [];
    const proposalId = String(body?.proposalId ?? '').trim();
    if (proposalId) {
      const found = proposalsFor(target).proposals.find((item) => item.id === proposalId);
      if (found?.preamble?.length) preamble = found.preamble;
    }

    /**
     * اپی که ورود دارد، سناریویش باید اول وارد شود.
     *
     * ── چه چیزی بی این ساخته می‌شد ──
     *
     * روی نپی، سناریوی «یک پوشه بساز» با `go: /contents` شروع می‌شد —
     * آدرسی که برای کاربرِ واردنشده به صفحهٔ ورود می‌رود. یعنی هر سناریویی
     * که این مسیر می‌ساخت، روی اپِ ورود‌دار **قطعاً** شکست می‌خورد، و
     * کاربر باید هر بار دستی قدم‌های ورود را بالایش می‌چسباند.
     *
     * و ابزار از قبل می‌دانست: `map.entry.scenario` می‌گوید خزش با کدام
     * سناریو وارد شده. همان را مقدمه می‌کنیم.
     *
     * ── چرا چسباندنِ قطعی و نه گفتن به مدل ──
     *
     * مدل قدم‌ها را «تقریباً» کپی می‌کند و هر تفاوتِ کوچک در برچسبِ فیلد
     * یعنی یک سناریوی شکسته. مقدمه از دیسک می‌آید و دست‌نخورده می‌ماند —
     * همان قاعده‌ای که مقدمهٔ پیشنهادها رویش بنا شده.
     */
    if (!preamble.length) {
      try {
        const { readMap } = await import('../../../../../../src/map/store.js');
        const entry = readMap(target)?.entry?.scenario;
        if (entry) {
          const { loadScenario, resolveScenarioRef } = await import('../../../../../../src/scenario/load.js');
          preamble = loadScenario(resolveScenarioRef(target, entry)).steps || [];
        }
      } catch {
        /** نبودِ مسیرِ ورود سناریو را نمی‌کشد؛ فقط مقدمه ندارد. */
      }
    }

    const draft = await scenarioFromText({
      text: body?.text,
      models,
      target: { name: project.name, baseURL: project.baseURL },
      source,
      knowledge,
      preamble,
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
      preambleSteps: preamble.length,
    });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
