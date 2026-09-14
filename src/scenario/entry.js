/**
 * «مسیرِ ورود» را از چیزی که یک بار واقعاً کار کرد بساز.
 *
 * ── چرا این حلقهٔ گمشده بود ──
 *
 * کاربر در تنظیمات حساب ساخت (ایمیل و رمز)، فایل نمونه آپلود کرد، کلید
 * OpenRouter گذاشت — و بعد خزش را زد و خزنده روی صفحهٔ ورود ماند. حق هم
 * داشت که توقع داشته باشد کار کند: هر سه کار درست بودند.
 *
 * ولی هیچ‌کدام به خزش وصل نبودند. **خزنده بلد نیست وارد شود**؛ یک سناریوی
 * ورود را بازپخش می‌کند. و پروژه‌ای که آن سناریو را نداشت، خزشش «موفق» تمام
 * می‌شد با دو گرهِ `/login` — همان شکستِ خاموشی که این ابزار برای شکارش
 * ساخته شده، این بار در خودش.
 *
 * `--remember` هم گمراه‌کننده بود: حساب می‌سازد و ذخیره می‌کند، ولی **پرش
 * نمی‌کند** — فرم را همان سناریوی ورود پر می‌کند.
 *
 * ── چرا از روی ضبطِ موجود، نه از مدل ──
 *
 * قدم‌های ورود یک بار واقعاً اجرا شده‌اند: در گشتِ زنده که آدم خودش وارد شد،
 * یا در پیش‌نویسی که کاوش نوشت. برچسب‌ها از DOM واقعی آمده‌اند نه از حدس.
 * پرسیدن از مدل یعنی پول دادن برای چیزی که روی دیسک هست.
 *
 * ── چرا همه‌چیز زیر `when` می‌رود ──
 *
 * خزش ده‌ها بار به خانه برمی‌گردد و بارِ دوم کاربر از قبل وارد است: فرمِ
 * ورود اصلاً وجود ندارد و یک `fill`ِ بی‌شرط همان‌جا می‌شکند. این درسی است که
 * `scenarios/nepi-bug/ورود.yml` با دست یاد گرفته بود؛ اینجا خودکار می‌شود.
 */
import YAML from 'yaml';
import { stepVerb } from './verbs.js';

/** برچسبِ فیلدِ شناسه — فارسی و انگلیسی، چون اپ‌ها هر دو را دارند. */
const IDENTITY = /(ایمیل|پست الکترونیک|نام کاربری|شناسه|e-?mail|username|user name|login)/i;
const SECRET = /(رمز|گذرواژه|کلمه عبور|pass ?word|passphrase)/i;
/** دکمه‌ای که فرم را می‌فرستد. «ثبت‌نام» هم هست: اپِ بی‌ثبت‌نام کاربرِ تازه نمی‌دهد. */
const SUBMIT = /(ورود|وارد شدن|ثبت ?نام|عضویت|sign ?in|log ?in|sign ?up|submit|continue)/i;
/**
 * چیزهایی که **بعد از** فرستادنِ فرم می‌آیند و هنوز بخشی از ورودند.
 *
 * نپی پس از ثبت‌نام «کد بازیابی» را یک بار نشان می‌دهد و تا تیک نخورد جلو
 * نمی‌رود. بی این، سناریوی ورود درست پیش از رسیدن تمام می‌شد.
 */
const AFTER = /(کد بازیابی|ذخیره کردم|ادامه|بعدا|متوجه شدم|got it|continue|next)/i;

/** متنِ قابلِ جست‌وجوی یک قدم: برچسب، نقش، نام، یا خودِ رشته. */
export function textOf(step) {
  const verb = stepVerb(step);
  const body = step?.[verb];
  if (typeof body === 'string') return body;
  if (!body || typeof body !== 'object') return '';
  return [body.label, body.name, body.text, body.placeholder].filter(Boolean).join(' ');
}

/**
 * قدم‌های ضبط‌شده → سناریوی ورودِ قابلِ بازپخش.
 *
 * @param {object} o
 * @param {object[]} o.steps      قدم‌های یک سناریو یا پیش‌نویسِ موجود
 * @param {string} [o.accountId]  حسابِ ذخیره‌شده؛ خالی یعنی هویتِ تازهٔ هر اجرا
 * @param {string} [o.name]
 * @returns {{steps: object[], notes: string[], found: boolean}}
 */
export function buildEntry({ steps = [], accountId = '', name = 'ورود' } = {}) {
  const notes = [];
  const identityIndex = steps.findIndex((step) => stepVerb(step) === 'fill' && IDENTITY.test(textOf(step)));

  if (identityIndex < 0) {
    return {
      steps: [],
      notes: ['هیچ فیلدِ ایمیل یا نام کاربری در این قدم‌ها نبود؛ ورود از اینجا ساخته نمی‌شود.'],
      found: false,
    };
  }

  /**
   * تکهٔ ورود: از فیلدِ شناسه تا دکمه‌ای که می‌فرستد.
   *
   * سقفِ ده قدم عمدی است. بی آن، سناریویی که پس از ورود هم دکمهٔ «ورود به
   * پوشه» دارد، نیمِ اپ را داخلِ «مسیرِ ورود» می‌کشید.
   */
  const form = [];
  let index = identityIndex;
  let submitted = false;

  for (; index < steps.length && form.length < 10; index++) {
    const step = steps[index];
    const verb = stepVerb(step);
    const text = textOf(step);

    if (verb === 'fill' && (IDENTITY.test(text) || SECRET.test(text))) {
      form.push(rebind(step, accountId, notes));
      continue;
    }
    if (verb === 'click' && SUBMIT.test(text)) {
      form.push(step);
      submitted = true;
      index++;
      break;
    }
    // قدمِ بی‌ربطِ میانِ فرم (مثلاً بستنِ یک پنجره) نگه داشته می‌شود
    if (verb === 'click' || verb === 'check' || verb === 'press') form.push(step);
    else break;
  }

  if (!submitted) notes.push('دکمهٔ فرستادنِ فرم پیدا نشد؛ قدمِ آخر را خودتان بررسی کنید.');

  /**
   * تأییدهای پس از ورود — هر کدام `when`ِ خودش را می‌گیرد.
   *
   * «کد بازیابی» فقط بارِ اولِ هر حساب می‌آید. اگر با فرمِ ورود در یک `when`
   * می‌نشست، اجرای دومِ همان حساب یا همه را می‌پرید یا روی نبودنش می‌شکست.
   */
  const confirms = [];
  for (let after = index; after < steps.length && confirms.length < 4; after++) {
    const step = steps[after];
    const verb = stepVerb(step);
    if (!['click', 'check'].includes(verb)) break;
    if (!AFTER.test(textOf(step))) break;
    confirms.push(step);
  }

  const out = [
    { go: '/' },
    /**
     * پنجره‌ای که با بارگذاری می‌آید، نخستین کلیک را می‌خورد — و بعضی‌شان
     * چند ثانیه دیرتر می‌نشینند. این همان درسی است که `quest` هم گرفت.
     */
    { dismissBlockers: { wait: 5000 } },
    {
      when: { visible: triggerOf(steps[identityIndex]), timeout: 6000 },
      then: form,
    },
  ];

  if (confirms.length) {
    out.push({ when: { visible: triggerOf(confirms[0]), timeout: 8000 }, then: confirms });
  }

  return { steps: out, notes, found: true, name };
}

/**
 * نشانهٔ اینکه این تکه لازم است یا نه.
 *
 * از خودِ نخستین قدمِ همان تکه برداشته می‌شود، نه از یک سلکتورِ جدا: چیزی
 * که قرار است پر یا کلیک شود، بهترین نشانهٔ «هست یا نیست» هم هست.
 */
export function triggerOf(step) {
  const body = step?.[stepVerb(step)];
  if (typeof body === 'string') return { text: body, visible: true };
  const { label, role, name, exact } = body || {};
  if (label) return { label, visible: true };
  return { role, name, exact, visible: true };
}

/**
 * مقدارِ فیلد → حسابِ ذخیره‌شده.
 *
 * ── چرا این خط مهم‌ترین خطِ این فایل است ──
 *
 * گشتِ زنده ایمیل را عیناً ضبط می‌کند (`a@a.a`) ولی رمز را
 * `{{identity.password}}` می‌نویسد — یعنی رمزِ هویتِ **موقتِ همان اجرا**، نه
 * رمزِ آن حساب. بازپخشش با همان ایمیل و رمزِ عوضی می‌شکند، و پیامش هم
 * «رمز اشتباه» است نه «سناریو غلط است».
 */
function rebind(step, accountId, notes) {
  const verb = stepVerb(step);
  const text = textOf(step);
  const field = IDENTITY.test(text) ? 'email' : 'password';

  if (!accountId) {
    // بی حساب، هویتِ تازهٔ هر اجرا — که یعنی هر بار ثبت‌نام
    return { ...step, value: `{{identity.${field}}}` };
  }

  const before = step.value;
  const after = `{{account.${accountId}.${field}}}`;
  if (before && String(before) !== after && !String(before).startsWith('{{account.')) {
    notes.push(`مقدارِ «${text}» از «${String(before).slice(0, 40)}» به حسابِ «${accountId}» بسته شد.`);
  }
  return { ...step, value: after };
}

/** سناریوی ورود، با سرصفحه‌ای که می‌گوید از کجا آمده و چرا این شکلی است. */
export function entryYaml({ steps, notes = [], accountId = '', source = '', name = 'ورود' }) {
  const header = [
    '# مسیرِ ورود — ساختهٔ `userbug entry`.',
    '#',
    `# از روی: ${source || '(قدم‌های داده‌شده)'}`,
    accountId
      ? `# با حسابِ ذخیره‌شدهٔ «${accountId}» — مقدارها از knowledge می‌آیند، نه از این فایل.`
      : '# بی حسابِ ذخیره‌شده: هر اجرا کاربرِ تازه می‌سازد.',
    '#',
    '# ── چرا همه‌چیز زیر `when` است ──',
    '#',
    '# خزش ده‌ها بار به خانه برمی‌گردد و بارِ دوم کاربر از قبل وارد است: فرمِ',
    '# ورود اصلاً وجود ندارد و یک `fill`ِ بی‌شرط همان‌جا می‌شکند.',
    '#',
    '# این فایل را در صفحهٔ نقشه، کشویی «مسیرِ ورود» انتخاب کنید.',
  ];

  if (notes.length) {
    header.push('#', '# چیزهایی که باید بررسی کنید:');
    for (const note of notes) header.push(`#   ${note}`);
  }

  header.push('');

  return (
    header.join('\n') +
    YAML.stringify({ name, status: 'draft', persona: 'pro', steps })
  );
}
