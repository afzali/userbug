/**
 * «این ۲۸ دکمه در عمل ۶ کار انجام می‌دهند» — دومین و آخرین قدمِ مدل‌دارِ
 * این درخت.
 *
 * ── چرا این یکی را قاعده نمی‌تواند بسازد ──
 *
 * `angles.js` ثابت کرد چقدر از کار رایگان است: نقش و برچسبِ هر کنش کافی
 * است تا بفهمیم کجا تایپ می‌شود، کجا ثبت، کجا لغو. ولی هیچ قاعده‌ای
 * نمی‌گوید «انتخابِ متن + دکمهٔ رنگ + دکمهٔ یادداشت» روی هم یعنی
 * **هایلایت**. آن، دانشِ محصول است نه دانشِ DOM.
 *
 * ── چرا یک فراخوانی برای هر صفحه، نه یکی برای کلِ اپ ──
 *
 * برعکسِ `name-caps.js`. آنجا هم‌خوانی مهم بود: مدل باید کلِ درخت را
 * می‌دید تا `/contents` و `/content/:id` را کنارِ هم نام بگذارد. اینجا
 * چنین وابستگی‌ای نیست — فیچرهای صفحهٔ خواندنِ کتاب هیچ ربطی به فیچرهای
 * تنظیمات ندارند — و در عوض ورودی سنگین است: فهرستِ کاملِ کنش‌ها با نقش و
 * برچسب. کلِ اپ یک‌جا یعنی prompt‌ای که یا بریده می‌شود یا مدل در آن گم
 * می‌شود.
 *
 * پس صفحه‌به‌صفحه، و **با دکمه**: کاربر می‌گوید کدام صفحه ارزشِ این خرج را
 * دارد. همان موضعِ `--classify` و نام‌گذاری.
 */
import { Budget, askJson } from '../models/provider.js';
import { buildTree } from './capabilities.js';
import { actionsOf } from './angles.js';
import { readBrief } from './brief.js';
import { addFeature, readFeatures } from './features.js';

const SYSTEM = `تو یک طراحِ محصولی که فهرستِ عناصرِ یک صفحهٔ وب را می‌بیند و می‌گوید کاربر آنجا چند «کار» می‌تواند بکند.

خروجی: فقط JSON، بدون توضیح و بدون حصار markdown.

قالب:
{"features":[{"title":"<۱ تا ۳ واژهٔ فارسی>","desc":"<یک جملهٔ کوتاه>","actions":["<برچسبِ عناصرِ سازنده>"],"hash":"<اگر آدرس با # عوض می‌شود>"}]}

قواعد:
- «کار» یعنی چیزی که کاربر می‌خواهد انجام دهد، نه عنصری که روی صفحه است.
  «هایلایت کردن» کار است؛ «دکمهٔ زرد» نیست.
- ناوبری کار نیست. لینکِ منو، بازگشت، خروج، و رفتن به صفحهٔ دیگر را نیاور —
  آن‌ها خودشان گرهِ دیگری در درختند.
- چیزی که از خودِ مسیر پیداست را دوباره نگو. در صفحهٔ «فهرست کتاب‌ها»،
  «دیدن کتاب‌ها» فیچر نیست.
- حداکثر ۸ تا. اگر صفحه واقعاً کاری ندارد، فهرستِ خالی بده.
  فهرستِ خالی جوابِ درستی است؛ فیچرِ ساختگی از نبودنِ فیچر بدتر است چون
  شبیهِ دانستن است.
- «actions» فقط برچسب‌هایی از همان ورودی باشند، نه چیزی که خودت ساختی.`;

/** فقط نقش و برچسب — نه مختصات، نه selector، نه چیزی که مدل با آن کاری ندارد. */
function sketch(action) {
  return {
    role: action.role || '',
    label: String(action.label || action.name || '').slice(0, 60),
  };
}

/**
 * پیدا کردنِ فیچرهای یک گره.
 *
 * @param {object} o
 * @param {string} o.target
 * @param {string} o.capability شناسهٔ گره در درختِ قابلیت‌ها
 * @param {object} o.models خروجی `resolveModel({ role: 'analyze' })`
 * @param {boolean} [o.force] حتی اگر این صفحه قبلاً فیچر گرفته
 */
export async function findFeatures({ target, capability, models, force = false }) {
  const { flat } = buildTree(target);
  const node = flat.find((one) => one.id === capability);
  if (!node) throw new Error('چنین بخشی در درخت نیست');
  if (node.feature) throw new Error('فیچر خودش فیچر ندارد');
  if (node.shelf) throw new Error('قفسه صفحه نیست — یکی از زیرهایش را بزنید');

  const stats = { actions: 0, found: 0, kept: 0, skipped: 0, calls: 0 };

  /**
   * کشِ صریح: صفحه‌ای که قبلاً فیچر گرفته دوباره پول خرج نمی‌کند.
   *
   * و «قبلاً» یعنی **هر** فیچری اینجا هست، حتی اگر خودِ کاربر ثبتش کرده
   * باشد — چون آن‌وقت جوابِ سوال را از منبعِ بهتری داریم.
   */
  const already = Object.values(readFeatures(target).features || {}).filter(
    (one) => one.where.route === node.route && (one.where.view || '') === (node.view || '')
  );
  if (already.length && !force) return { ...stats, kept: already.length, cached: true };

  const actions = actionsOf(target, node);
  stats.actions = actions.length;
  /**
   * صفحه‌ای که کنشی ندارد، فیچری هم ندارد — و این جواب **رایگان** است.
   *
   * همان قاعدهٔ نام‌گذاری: بی گرهِ نیازمند، صفر فراخوانی.
   */
  if (!actions.length) return stats;

  let brief = '';
  try {
    brief = readBrief(target).slice(0, 1500);
  } catch {
    // پروژه‌ای که هنوز توضیح ندارد؛ بی آن هم کار می‌کند
  }

  const payload = {
    ...(brief ? { about: brief } : {}),
    page: {
      route: node.route,
      ...(node.view ? { view: node.view } : {}),
      title: node.title,
      ...(node.desc ? { desc: node.desc } : {}),
    },
    actions: actions.map(sketch).slice(0, 120),
  };

  let answer;
  try {
    const { json: reply } = await askJson(
      models,
      { system: SYSTEM, user: JSON.stringify(payload) },
      new Budget(models?.budgetPerRun)
    );
    answer = reply;
    stats.calls = 1;
  } catch (cause) {
    throw new Error(`پیدا کردنِ فیچر انجام نشد: ${cause.message}`);
  }

  const labels = new Set(actions.map((one) => String(one.label || one.name || '').trim()).filter(Boolean));

  for (const row of answer?.features || []) {
    const title = String(row?.title || '').trim();
    if (!title) {
      stats.skipped += 1;
      continue;
    }
    stats.found += 1;

    addFeature(target, {
      where: { route: node.route, view: node.view || '', hash: row?.hash || '' },
      title,
      desc: row?.desc || '',
      by: 'model',
      model: models?.model || '',
      /** برچسبی که در ورودی نبود، اختراعِ مدل است و دور ریخته می‌شود. */
      actions: (Array.isArray(row?.actions) ? row.actions : [])
        .map((one) => String(one).trim())
        .filter((one) => labels.has(one)),
    });
    stats.kept += 1;
  }

  return stats;
}
