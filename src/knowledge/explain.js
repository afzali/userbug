/**
 * «چرا این شد؟» — از یافته به سورس.
 *
 * ── چرا این حلقه باز بود ──
 *
 * `findRelevantSource` از اول وجود داشت ولی فقط موقعِ **نوشتنِ** سناریو صدا
 * زده می‌شد. وقتی تریاژ می‌گفت «۵۰۰ در `/sync/push`»، هیچ راهی نبود بپرسی
 * «کدام کد این را داد؟» — و آدم می‌رفت دستی grep می‌زد، با همان کلیدواژه‌ای
 * که ابزار خودش داشت.
 *
 * ── و چرا این «دنبالِ باگ گشتن در سورس» نیست ──
 *
 * تحلیلِ ایستا محصولِ دیگری است: پرنویز، و مخالفِ فلسفهٔ این ابزار که
 * **رفتارِ واقعی** را می‌سنجد. اینجا نقطهٔ شروع یک شکستِ **مشاهده‌شده** است،
 * نه حدسی دربارهٔ کدی که هرگز اجرا نشده. مدل فقط می‌گوید کدام تکه احتمالاً
 * مسئول است.
 *
 * ── چرا خروجی «حدس» برچسب می‌خورد ──
 *
 * همان قاعدهٔ `by:` در پرونده. این جواب از مدل آمده و ممکن است غلط باشد؛
 * نشستنش کنارِ فکت‌ها بی برچسب، همان چیزی است که پروندهٔ شناخت را بی‌ارزش
 * می‌کند. پس `by: 'model'` و تاریخ و نامِ مدل با خودش می‌ماند.
 */
import { askJson, Budget } from '../models/provider.js';
import { redactDeep } from '../models/redact.js';
import { accountSecrets } from './credentials.js';
import { findRelevantSource } from '../source-access.js';

const SYSTEM = `تو یک مهندس نرم‌افزاری که یک **خطای مشاهده‌شده** را می‌گیرد و در سورس دنبالِ علتش می‌گردد.

خروجی فقط JSON، بی توضیح و بی حصار markdown:
{"cause":"...","where":[{"file":"...","why":"..."}],"siblings":[{"file":"...","why":"..."}],"next":"...","confidence":"high|medium|low"}

معنی هر کلید:
- cause: در دو سه جمله، محتمل‌ترین علت. اگر از این تکه‌ها معلوم نیست، همین را بگو.
- where: فایل‌هایی که احتمالاً مسئول‌اند، با یک جمله دلیل. فقط از فایل‌هایی که پایین داده شده.
- siblings: **جاهای دیگری که همین الگو تکرار شده** و ممکن است همین نقص را داشته باشند. اگر نبود، آرایهٔ خالی.
- next: یک کارِ مشخص برای آزمودنِ این فرضیه — ترجیحاً چیزی که با یک سناریو بشود ساخت.
- confidence: اگر تکه‌های سورس ربطی نداشتند، «low» بگو.

قواعد:
- نامِ فایلی که در ورودی نیست، ننویس.
- حدسِ بی‌پایه نزن. «از این کد معلوم نیست» جوابِ درستی است.
- فارسی بنویس.`;

/**
 * یک یافته + سورسِ مرتبط → فرضیه دربارهٔ علت.
 *
 * @param {object} o
 * @param {object} o.finding یافتهٔ ادغام‌شدهٔ تریاژ
 * @param {object[]} o.roots خروجی `resolveSourceRoots`
 * @param {object} o.models خروجی `resolveModel({role:'analyze'})`
 * @param {string} [o.target] برای پاک کردنِ رازهای حساب
 */
export async function explainFinding({ finding, roots, models, target = '' }) {
  const query = searchTextOf(finding);
  if (!query) throw new Error('این یافته متنی ندارد که بشود در سورس دنبالش گشت');

  /**
   * سورس **پیش از** مدل خوانده می‌شود و اگر هیچ نبود، همان‌جا می‌ایستیم.
   *
   * پرسیدن از مدل بی هیچ تکهٔ سورسی یعنی پول دادن برای حدسِ عمومی — و
   * جوابش هم شبیه جوابِ واقعی به نظر می‌رسد، که بدتر است.
   */
  const source = await findRelevantSource({ roots, text: query, maxFiles: 5, budget: 8000 });
  if (!source.files.length) {
    return {
      cause: 'هیچ فایلی در سورس با متنِ این یافته نخواند.',
      where: [],
      siblings: [],
      next: 'اگر نامِ فنی‌تری از این خطا می‌دانید، در سورس دنبالش بگردید؛ کلیدواژهٔ این پیام چیزی نگرفت.',
      confidence: 'low',
      scanned: source.scanned,
      files: [],
      by: 'model',
      at: new Date().toISOString(),
    };
  }

  /**
   * رازهای حساب پیش از هر ارسال پاک می‌شوند.
   *
   * پیامِ یافته از اپ می‌آید و می‌تواند ایمیل یا توکن داشته باشد — روی نپی
   * یک گرهٔ نقشه نامش شد «منوی ub-…@userbug.test». همان درسِ `classify-run`.
   */
  const secrets = accountSecrets(target);
  const safe = redactDeep(
    {
      message: finding.message || finding.normalized,
      source: finding.source,
      steps: finding.steps || [],
      routes: finding.routes || [],
      detail: finding.detail ?? finding.latest?.detail ?? null,
    },
    secrets
  );

  const budget = new Budget(models.budgetPerRun);
  const { json } = await askJson(
    models,
    {
      system: SYSTEM,
      user:
        `خطای مشاهده‌شده:\n${JSON.stringify(safe, null, 1)}\n\n` +
        `فایل‌هایی که خوانده شد:\n${source.files.map((one) => one.relative || one).join('\n')}\n\n` +
        `تکه‌های سورس:\n${redactDeep(source.snippets, secrets)}`,
    },
    budget
  );

  const known = new Set(source.files.map((one) => one.relative || String(one)));
  const clean = (rows) =>
    (Array.isArray(rows) ? rows : [])
      // نامِ فایلی که ندادیم یعنی مدل اختراع کرده؛ همان درسِ `classify.js`
      .filter((row) => row?.file && known.has(row.file))
      .map((row) => ({ file: row.file, why: String(row.why || '').slice(0, 300) }))
      .slice(0, 5);

  return {
    cause: String(json?.cause || '').slice(0, 1200) || 'مدل علتی نگفت.',
    where: clean(json?.where),
    siblings: clean(json?.siblings),
    next: String(json?.next || '').slice(0, 400),
    confidence: ['high', 'medium', 'low'].includes(json?.confidence) ? json.confidence : 'low',
    files: [...known],
    scanned: source.scanned,
    // برچسبِ منبع با خودش می‌ماند: این فکت نیست، فرضیه است
    by: 'model',
    model: `${models.provider}:${models.model}`,
    at: new Date().toISOString(),
    spent: budget.spent,
  };
}

/**
 * متنی که با آن در سورس می‌گردیم.
 *
 * ── چرا نه فقط پیام ──
 *
 * پیامِ یک یافتهٔ `contract` این است: «چیزی که در /login همیشه بود، حالا
 * نیست: button نپی». آن جمله را خودِ ما ساخته‌ایم و در سورسِ اپ نیست؛
 * چیزی که هست، **نامِ خودِ عنصر** است. پس بخش‌های مفید بیرون کشیده می‌شوند
 * نه کلِ جمله.
 */
export function searchTextOf(finding) {
  const parts = [];
  const detail = finding?.detail ?? finding?.latest?.detail ?? null;

  if (detail && typeof detail === 'object') {
    if (detail.path) parts.push(detail.path);
    for (const one of detail.missing || []) parts.push(one?.name || one?.label || one?.text || '');
  }
  for (const route of finding?.routes || []) parts.push(route);
  for (const step of finding?.steps || []) parts.push(String(step).replace(/[{}"[\]]/g, ' '));
  parts.push(finding?.normalized || finding?.message || '');

  return parts.filter(Boolean).join(' ').slice(0, 600).trim();
}
