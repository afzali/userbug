/**
 * نامِ خوانا برای قابلیت‌ها — تنها قدمِ مدل‌دارِ این درخت.
 *
 * ── چرا درخت بی این هم کار می‌کند ──
 *
 * استخراج عمداً بی مدل است و می‌ماند: ساختار، شمارش، سلسله‌مراتب و
 * زاویه‌های آزمون همه از دیسک درمی‌آیند. آنچه نمی‌شود رایگان ساخت، فقط
 * **نام** است.
 *
 * و نام مهم است: `contents` و `login` و `content/:id` روی صفحه درست‌اند و
 * برای کسی که اپ را نساخته چیزی نمی‌گویند. خودِ اپ هم کمکی نمی‌کند — نپی
 * روی هر دو صفحه `<title>` یکسان می‌گذارد.
 *
 * ── چرا با دکمه و نه خودکار ──
 *
 * همان موضعِ `--classify` و `--author`: هر چیزی که پول خرج کند با یک
 * انتخابِ صریح شروع می‌شود، نه به‌عنوان دنبالهٔ کاری که کاربر برای چیزِ
 * دیگری زده.
 *
 * ── چرا نتیجه `by: model` است و نه `by: user` ──
 *
 * این تفاوت کلِ قاعدهٔ اعتمادِ این مخزن است. نامی که مدل ساخته باید با
 * تازه‌سازیِ بعدی قابلِ بازنویسی باشد؛ نامی که آدم نوشته نباید. پس در
 * فایلِ مشتق می‌نشیند، نه در `capabilities.edits.json` — و ویرایشِ آدم
 * همیشه رویش می‌چربد.
 */
import { Budget, askJson } from '../models/provider.js';
import { buildTree, readCapabilities, readEdits } from './capabilities.js';
import { readBrief } from './brief.js';
import { writeNames } from './capabilities.js';

const SYSTEM = `تو یک طراحِ محصولی که ساختارِ یک اپِ وب را می‌بیند و برای هر بخش نامِ کوتاهِ فارسی می‌گذارد.

خروجی: فقط JSON، بدون توضیح و بدون حصار markdown.

قالب:
{"names":[{"id":"<همان شناسه>","title":"<۲ تا ۴ واژهٔ فارسی>","desc":"<یک جملهٔ کوتاه>"}]}

قواعد:
- «id» را عیناً از ورودی بردار؛ چیزی اختراع نکن.
- نام باید بگوید کاربر **چه کاری** آنجا می‌کند: «خواندن کتاب»، نه «صفحهٔ محتوا».
- نامِ یک نمونه را نگذار. اگر مسیر :id دارد، نامش دربارهٔ هر نمونه است نه یکی.
- اگر از روی مسیر و کنش‌ها نمی‌شود فهمید آنجا چیست، همان id را بده با title خالی.
  نامِ حدسی از نداشتنِ نام بدتر است، چون شبیهِ دانستن است.
- desc اختیاری است؛ اگر حرفِ تازه‌ای ندارد خالی بگذار.`;

/** فقط چیزی که مدل واقعاً لازم دارد — نه کلِ گره با عکس و قرارداد و شمارش. */
function sketch(node) {
  return {
    id: node.id,
    route: node.route,
    ...(node.view ? { view: node.view } : {}),
    ...(node.title ? { now: node.title } : {}),
    ...(node.actions ? { actions: node.actions } : {}),
  };
}

/**
 * کدام گره‌ها نام لازم دارند.
 *
 * ── چرا سه فیلتر ──
 *
 * `edits` — نامی که آدم گذاشته هرگز به مدل داده نمی‌شود. نه برای صرفه‌جویی:
 * اگر داده شود، مدل ممکن است «بهترش» کند و آن دقیقاً همان بازنویسیِ حرفِ
 * آدم است که کلِ `TRUST` برای جلوگیری‌اش نوشته شده.
 *
 * `named` — گرهی که قبلاً نام گرفته دوباره پول خرج نمی‌کند. همان اصلِ کش
 * که در این مخزن با ۱۰ اجرا و ۰ فراخوانی اثبات شده.
 *
 * `view` — نمای خزش نامش را از خودِ اپ دارد («افزودن کتاب جدید»). بهتر از
 * هر چیزی است که مدل بسازد، و رایگان.
 */
function pending(target, { force = false } = {}) {
  const edits = readEdits(target);
  const stored = readCapabilities(target);
  const named = new Set(Object.keys(stored.names || {}));

  return stored.nodes.filter((node) => {
    if (node.view || node.shelf) return false;
    if (edits[node.id]?.title) return false;
    if (!force && named.has(node.id)) return false;
    return true;
  });
}

/**
 * نام‌گذاری. بی گرهِ نیازمند، **صفر فراخوانی**.
 *
 * @param {object} o
 * @param {string} o.target
 * @param {object} o.models خروجی `resolveModel({ role: 'analyze' })`
 * @param {boolean} [o.force] حتی گره‌هایی که از قبل نام دارند
 */
export async function nameCapabilities({ target, models, force = false }) {
  const todo = pending(target, { force });
  const stats = { pending: todo.length, named: 0, skipped: 0, calls: 0 };
  if (!todo.length) return stats;

  const budget = new Budget(models?.budgetPerRun);

  /**
   * «این پروژه چیست» بالای prompt.
   *
   * همان متنی که کاربر خودش نوشته و بالای هر prompt دیگری هم می‌نشیند.
   * بی آن، مدل از `/contents` باید حدس بزند اپ چیست؛ با آن می‌داند
   * کتابخانه است و «قفسهٔ کتاب‌ها» را می‌سازد نه «فهرست محتوا».
   */
  let brief = '';
  try {
    brief = readBrief(target).slice(0, 1500);
  } catch {
    // پروژه‌ای که هنوز توضیح ندارد؛ نام‌گذاری بی آن هم کار می‌کند
  }

  /**
   * همهٔ گره‌ها در **یک** فراخوانی.
   *
   * ── چرا نه یکی در هر گره ──
   *
   * دو دلیل، و دومی مهم‌تر است: هزینه، و **هم‌خوانی**. مدلی که کلِ درخت را
   * یک‌جا ببیند می‌فهمد `/contents` و `/content/:id` دو سرِ یک کارند و
   * نامشان باید کنارِ هم معنا بدهد. یکی‌یکی که بپرسی، «مدیریت فایل» و
   * «نمایش‌دهندهٔ سند» درمی‌آید.
   */
  const payload = {
    ...(brief ? { about: brief } : {}),
    nodes: todo.map(sketch),
  };

  /**
   * `askJson` پاکت برمی‌گرداند (`{ json, usage, model }`)، نه خودِ JSON.
   *
   * نخستین اجرا این را با بدترین شکل نشان داد: «۰ نام از ۶ بخش · ۱
   * فراخوانی». یعنی پول داده شد، جواب هم آمد، و چون `answer.names` خالی
   * بود همه‌چیز بی‌صدا دور ریخته شد — هیچ خطایی، فقط یک عددِ صفر که شبیهِ
   * «مدل نتوانست» است، نه شبیهِ «ما اشتباه خواندیم».
   */
  let answer;
  try {
    const { json: reply } = await askJson(
      models,
      { system: SYSTEM, user: JSON.stringify(payload) },
      budget
    );
    answer = reply;
    stats.calls = 1;
  } catch (cause) {
    /**
     * شکستِ مدل درخت را خراب نمی‌کند.
     *
     * نام‌ها **افزودنی**‌اند: بی آن‌ها همان نامِ مشتق‌شده می‌ماند که از
     * دیروز کار می‌کرد. انداختنِ کلِ صفحه برای چیزی که تزئین است، بدترین
     * معاملهٔ ممکن است.
     */
    throw new Error(`نام‌گذاری انجام نشد: ${cause.message}`);
  }

  const valid = new Set(todo.map((one) => one.id));
  const names = {};

  for (const row of answer?.names || []) {
    const id = String(row?.id || '').trim();
    /** شناسه‌ای که در ورودی نبود، اختراعِ مدل است و دور ریخته می‌شود. */
    if (!valid.has(id)) {
      stats.skipped += 1;
      continue;
    }

    const title = String(row?.title || '').trim().slice(0, 80);
    /** مدل اجازه دارد بگوید «نمی‌دانم» — و آن جواب محترم است، نه شکست. */
    if (!title) {
      stats.skipped += 1;
      continue;
    }

    names[id] = {
      title,
      desc: String(row?.desc || '').trim().slice(0, 300),
      by: 'model',
      model: models?.model || '',
      at: new Date().toISOString(),
    };
    stats.named += 1;
  }

  writeNames(target, names);
  return stats;
}

export { pending as pendingNames };
