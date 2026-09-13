/**
 * «این را که ساختی، حالا درستش کن.»
 *
 * ── چرا این لازم بود، با اینکه ویرایشگر YAML از قبل هست ──
 *
 * مسیرِ ساخت یک‌طرفه بود: متن → سناریو، یا کاوش → پیش‌نویس. اگر چیزی کم
 * داشت — و رایج‌ترین کمبود همیشه یکی بود: «اصلاً وارد نمی‌شود» — تنها راه
 * نوشتنِ دستیِ قدم‌های ورود بود، یا ساختِ دوبارهٔ کل سناریو از صفر که
 * `expect`های بازبینی‌شده را هم می‌برد.
 *
 * ── چرا خروجی ذخیره نمی‌شود ──
 *
 * همان قاعدهٔ `from-text.js`: YAML برمی‌گردد تا آدم ببیند و از همان دروازهٔ
 * همیشگی (`POST /api/files`) ذخیره شود. یک مسیرِ نوشتن، یک اعتبارسنجی.
 *
 * ── و چرا دو تابع، نه یکی ──
 *
 * `withEntryPreamble` مدل صدا نمی‌زند. چون در بیشتر موردهای واقعی مشکل
 * دقیقاً «ورود ندارد» است و جوابش از قبل روی دیسک هست: سناریوی ورودی که
 * نقشه با آن ساخته شده. پول دادن برای چیزی که `readMap` جواب می‌دهد، همان
 * اشتباهی است که این مخزن جای دیگر هم از آن پرهیز کرده.
 */
import YAML from 'yaml';
import { KNOWN_VERBS, stepVerb } from './verbs.js';
import { assertScenarioShape } from './from-text.js';
import { askJson, Budget } from '../models/provider.js';

const MAX_INSTRUCTION = 2000;

/**
 * ── چرا قاعدهٔ `{{identity}}` و `{{account}}` اینجا هم هست ──
 *
 * نخستین بازنویسیِ واقعی، با خواستهٔ «اول با حساب crawler وارد شود»،
 * `{{crawler.email}}` نوشت — نحوی که مفسر نمی‌شناسد و در اجرا عیناً همان
 * رشته در فیلد می‌نشیند. `from-text.js` این قاعده را داشت و اینجا نبود؛
 * دو prompt برای یک زبان، و همین‌قدر کافی بود که واگرا شوند.
 */
const SYSTEM = `تو یک سناریوی تستِ موجود را طبقِ خواستهٔ کاربر **بازنویسی** می‌کنی.

خروجی فقط JSON باشد با این شکل:
{"name": "...", "steps": [ ... ], "notes": "...", "changed": "..."}

قواعد:
- سناریوی فعلی را بگیر و **کمترین تغییرِ لازم** را بده. قدمی که کاربر دربارهٔ آن حرفی نزده، دست‌نخورده برگردد — با همان شکل و همان مقدارها.
- هر قدم یک شیء با **یک** فعل است. عنوان اختیاری با کلید "as".
- فعل‌های مجاز: {{VERBS}}
- فعل دیگری ننویس. اگر کاری با این فعل‌ها بیان‌شدنی نبود، از "do" با توضیح فارسی استفاده کن.
- "changed" یک جملهٔ فارسی است که می‌گوید چه کردی. اگر چیزی را حذف کردی، همان‌جا صریح بگو.
- "notes" برای چیزهایی است که حدس زدی و آدم باید بازبینی کند.
- قدم‌هایی که "expect" دارند را بی‌دلیل برندار: آن‌ها را آدم نوشته و معیارِ درستی‌اند.
- هویتِ تازه با {{identity.email}} و {{identity.password}} در دسترس است.
- حسابِ ذخیره‌شده با {{account.<شناسه>.email}} و {{account.<شناسه>.password}}. فقط
  شناسه‌هایی را بنویس که در «حساب‌های ذخیره‌شده» آمده‌اند؛ شناسهٔ تازه نساز.`;

/**
 * سناریوی فعلی + یک جملهٔ کاربر → سناریوی بازنویسی‌شده.
 *
 * @param {object} o
 * @param {string} o.yaml        متنِ فعلیِ فایل
 * @param {string} o.instruction «چه چیزش را عوض کنم»
 * @param {object} o.models      خروجی `resolveModel({role:'author'})`
 * @param {object} [o.target]    نام و آدرسِ پایه، برای مدل
 * @param {string} [o.knowledge] خروجی `knowledgeFor()`
 */
export async function reviseScenario({ yaml, instruction, models, target, knowledge }) {
  const current = parseScenario(yaml);
  const wish = String(instruction ?? '').trim();

  if (wish.length < 4) throw new Error('بنویسید چه چیزش را عوض کنم؛ یک جمله کافی است');
  if (wish.length > MAX_INSTRUCTION) throw new Error(`خواسته بیش از ${MAX_INSTRUCTION} نویسه است`);

  const budget = new Budget(models.budgetPerRun);
  const { json } = await askJson(
    models,
    {
      system: SYSTEM.replace('{{VERBS}}', [...KNOWN_VERBS].join(' ')),
      user:
        (target ? `پروژه: ${target.name} — ${target.baseURL}\n\n` : '') +
        (knowledge ? `شناختِ ثبت‌شدهٔ پروژه:\n${knowledge}\n\n` : '') +
        `سناریوی فعلی:\n${JSON.stringify({ name: current.name, steps: current.steps }, null, 1)}\n\n` +
        `خواستهٔ کاربر:\n${wish}`,
    },
    budget
  );

  const revised = assertScenarioShape(json);
  const changed = String(json?.changed ?? '').trim();

  return {
    yaml: reviseYaml(current, revised, { instruction: wish, changed }),
    name: revised.name,
    steps: revised.steps.length,
    notes: revised.notes,
    changed,
    lostComments: current.inlineComments,
    // سناریوی رسمی که مدل عوضش کند، دیگر رگرسیونِ بازبینی‌شده نیست
    demoted: current.status === 'approved',
    budget: budget.snapshot(),
  };
}

/**
 * مقدمهٔ ورود، بی یک فراخوانی مدل.
 *
 * قدم‌هایی که از قبل در سناریو هستند دوباره اضافه نمی‌شوند: نشانه‌اش
 * برابریِ ساختاریِ نخستین قدم‌هاست. ورودِ تکراری خطا نمی‌دهد ولی سناریو را
 * دوبرابر و گیج‌کننده می‌کند.
 */
export function withEntryPreamble(yaml, entrySteps = []) {
  const current = parseScenario(yaml);
  const steps = Array.isArray(entrySteps) ? entrySteps : [];
  if (!steps.length) throw new Error('سناریوی ورودی قدمی ندارد');

  if (alreadyStartsWith(current.steps, steps)) {
    throw new Error('این سناریو از قبل با همین قدم‌های ورود شروع می‌شود');
  }

  return reviseYaml(
    current,
    { name: current.name, steps: [...steps, ...current.steps], notes: '' },
    { preamble: steps.length }
  );
}

function alreadyStartsWith(steps, prefix) {
  if (steps.length < prefix.length) return false;
  return prefix.every((step, index) => JSON.stringify(steps[index]) === JSON.stringify(step));
}

/**
 * خواندنِ فایلِ فعلی.
 *
 * خطا صریح است چون بازنویسیِ فایلی که خوانده نشده یعنی جایگزین کردنش با
 * چیزی که مدل از هیچ ساخته — و آن دیگر ویرایش نیست.
 */
export function parseScenario(yaml) {
  let doc;
  try {
    doc = YAML.parse(String(yaml ?? ''));
  } catch (cause) {
    throw new Error(`سناریوی فعلی خوانده نشد: ${cause.message}`);
  }

  if (!doc || typeof doc !== 'object') throw new Error('سناریوی فعلی خوانده نشد؛ فایل خالی است؟');
  if (!Array.isArray(doc.steps) || !doc.steps.length) throw new Error('سناریوی فعلی قدمی ندارد');
  for (const [index, step] of doc.steps.entries()) {
    if (!stepVerb(step)) throw new Error(`قدم ${index + 1} سناریوی فعلی فعل ندارد`);
  }

  return {
    name: String(doc.name ?? '').trim(),
    status: String(doc.status || 'approved'),
    persona: doc.persona || 'novice',
    device: doc.device || null,
    timeout: doc.timeout || null,
    steps: doc.steps,
    ...commentsOf(yaml),
  };
}

/**
 * سرصفحهٔ توضیحیِ فایل — و شمارشِ آنچه نمی‌ماند.
 *
 * ── چرا این کار لازم بود ──
 *
 * بازنویسی از JSON دوباره YAML می‌سازد، پس هر توضیحی در فایل می‌افتد. در این
 * مخزن آن توضیح‌ها **دلیلِ** تصمیم‌اند، نه تزئین: نخستین آزمایشِ واقعیِ
 * همین قابلیت، روی `ورود.yml` هجده خطِ «چرا» را برداشت — از جمله دلیلِ
 * اینکه چرا همه‌چیز زیر `when` است.
 *
 * سرصفحه (تا پیش از نخستین خطِ غیرکامنت) نگه داشته می‌شود، چون در هر فایلِ
 * این مخزن همان‌جاست که «چرا» نوشته شده. کامنتِ میانِ قدم‌ها نمی‌ماند و
 * **شمرده** می‌شود تا رابط بتواند بگوید چند خط می‌رود — بی گفتنش، تنها
 * نشانه‌اش خط‌های قرمزِ تفاوت بود که میانِ شصت خطِ دیگر گم می‌شوند.
 */
function commentsOf(yaml) {
  const lines = String(yaml ?? '').split(/\r?\n/);
  const header = [];
  let index = 0;

  for (; index < lines.length; index++) {
    const line = lines[index].trim();
    if (line.startsWith('#')) header.push(lines[index]);
    else if (line === '') header.push('');
    else break;
  }

  const inlineComments = lines.slice(index).filter((line) => line.trim().startsWith('#')).length;
  return { header: trimBlankEdges(header), inlineComments };
}

function trimBlankEdges(lines) {
  const out = [...lines];
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out.at(-1).trim()) out.pop();
  return out;
}

/**
 * فایلِ تازه.
 *
 * ── چرا `status` پایین می‌آید ──
 *
 * سناریوی `approved` معیارِ سلامت است چون آدم خوانده و تأیید کرده. بعد از
 * بازنویسیِ مدل، آن تأیید دیگر برای این متن نیست. برگرداندنش به `draft`
 * یعنی تا کسی دوباره نخوانده، شکستنش رگرسیون شمرده نمی‌شود.
 *
 * ولی مقدمهٔ ورود `status` را دست نمی‌زند: آنجا مدلی در کار نیست و قدم‌ها
 * از سناریوی ورودی آمده‌اند که خودِ آدم انتخابش کرده.
 *
 * ── و چرا persona و device و timeout می‌مانند ──
 *
 * اینها تصمیمِ آدم دربارهٔ *چگونه اجرا شود* است، نه بخشی از قدم‌ها. مدل
 * دربارهٔ آن‌ها چیزی نپرسیده و نباید بی‌صدا عوضشان کند.
 */
function reviseYaml(current, revised, { instruction = '', changed = '', preamble = 0 } = {}) {
  const header = ['# این فایل بازنویسی شده است.', '#'];

  if (preamble) {
    header.push(
      `# ${preamble} قدمِ اولْ مقدمهٔ ورود است، از سناریویی که خودتان انتخاب`,
      '# کردید — مسیرِ واقعی، نه حدسِ مدل. هیچ فراخوانی مدلی نشد.'
    );
  } else {
    header.push('# خواستهٔ کاربر:', ...String(instruction).split(/\r?\n/).map((line) => `#   ${line}`));
    if (changed) header.push('#', '# مدل می‌گوید چه کرد:', `#   ${changed}`);
  }

  if (revised.notes) {
    header.push('#', '# چیزهایی که باید بازبینی شود:', `#   ${revised.notes}`);
  }

  if (!preamble && current.status === 'approved') {
    header.push(
      '#',
      '# این سناریو `approved` بود و به `draft` برگشت: تأییدِ قبلی برای متنِ',
      '# قبلی بود. پس از بازبینی دوباره رسمی‌اش کنید.'
    );
  }

  /**
   * سرصفحهٔ نسخهٔ قبلی می‌ماند، زیرِ توضیحِ بازنویسی.
   *
   * زیر و نه بالا: تازه‌ترین حرف باید اول خوانده شود. ولی می‌ماند، چون
   * «چرا این‌طور نوشته شده» با یک ویرایش باطل نمی‌شود.
   */
  if (current.header?.length) {
    header.push('#', '# ── سرصفحهٔ نسخهٔ پیشین، دست‌نخورده ──', ...current.header);
  }

  if (current.inlineComments) {
    header.push(
      '#',
      `# ${current.inlineComments} خطِ توضیح که میانِ قدم‌ها بود در این بازنویسی`,
      '# نماند. اگر لازم‌اند، از تفاوت برشان دارید.'
    );
  }

  header.push('');

  // ترتیبِ کلیدها ثابت می‌ماند تا تفاوتِ دو نسخه فقط تفاوتِ واقعی باشد
  const doc = { name: revised.name, status: preamble ? current.status : 'draft', persona: current.persona };
  if (current.device) doc.device = current.device;
  if (current.timeout) doc.timeout = current.timeout;
  doc.steps = revised.steps;

  return header.join('\n') + YAML.stringify(doc);
}

/**
 * تفاوتِ خط‌به‌خطِ دو نسخه.
 *
 * ── چرا تفاوت، نه فقط متنِ تازه ──
 *
 * اگر فقط نتیجه نشان داده شود، `expect`ی که آدم با دست نوشته می‌تواند بی‌صدا
 * برود و کسی نفهمد: فایلِ تازه هم معتبر است، هم اجرا می‌شود، و هم سبز تمام
 * می‌شود — چون همان سنجشی که می‌شکست دیگر آنجا نیست. این همان قانونِ
 * «`by: user` را اتوماسیون بازنویسی نمی‌کند» است، این بار روی سناریو.
 *
 * الگوریتم ساده است (LCS) چون این فایل‌ها صد خط‌اند؛ آوردنِ کتابخانه برای
 * صد خط وابستگیِ بی‌جاست.
 */
export function diffLines(before, after) {
  const a = String(before ?? '').split(/\r?\n/);
  const b = String(after ?? '').split(/\r?\n/);

  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const rows = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ kind: 'same', text: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      rows.push({ kind: 'removed', text: a[i++] });
    } else {
      rows.push({ kind: 'added', text: b[j++] });
    }
  }
  while (i < a.length) rows.push({ kind: 'removed', text: a[i++] });
  while (j < b.length) rows.push({ kind: 'added', text: b[j++] });

  return rows;
}

/** خلاصهٔ تفاوت، برای وقتی که جا برای نشان دادنِ همهٔ خط‌ها نیست. */
export function diffSummary(rows) {
  return {
    added: rows.filter((row) => row.kind === 'added').length,
    removed: rows.filter((row) => row.kind === 'removed').length,
  };
}
