/**
 * «برای این قابلیت چند سناریو لازم است؟»
 *
 * ── چرا `propose.js` جوابِ این نبود ──
 *
 * آن فایل **شکاف** پیدا می‌کند: روتی که در هیچ سناریویی نیامده، نمایی که
 * کسی بازش نکرده، ناوردایی که آزموده نشده. یک شکاف، یک پیشنهاد — و همین
 * درست است، چون شکاف یک واقعیتِ دوحالته است: یا هست یا نیست.
 *
 * ولی وقتی کاربر می‌گوید «به ازای هر فیچر چند سناریوی معقول تولید شود»،
 * دنبالِ شکاف نیست. دنبالِ این است که **همان یک فیچر** از چند زاویه آزموده
 * شود: مسیرِ خوش، ورودیِ خالی، مقدارِ تکراری، بعد از رفرش، بی ورود.
 *
 * `propose.js` بعد از نخستین سناریو ساکت می‌شود — شکاف پر شده. این فایل
 * همان‌جا شروع می‌کند.
 *
 * ── چرا بی مدل ──
 *
 * زاویه‌ها از خودِ ساختار درمی‌آیند و ساختار روی دیسک است: نقشه می‌گوید این
 * نما پنج `textbox` و سه `switch` دارد؛ schema می‌گوید روی این جدول
 * `UNIQUE` هست؛ پرونده می‌گوید اپ ورود دارد. «پنج textbox» یعنی «ورودیِ
 * خالی معنا دارد» — این استنتاج است، نه قضاوت.
 *
 * مدل یک قدم بعد لازم می‌شود، برای نوشتنِ خودِ YAML — و آن راه از قبل هست
 * (`from-text.js`). پس هر زاویه یک `text` دارد: همان جمله‌ای که اگر آدم
 * خودش می‌نوشت.
 *
 * ── چرا هر زاویه شاهد دارد ──
 *
 * همان قاعده‌ای که `propose.js` رویش بنا شده: فهرستی که از هوا پر شود،
 * کاربر دو بار بررسی می‌کند، دو بار چیزی پیدا نمی‌کند، و بار سوم می‌بنددش.
 * پس هیچ زاویه‌ای بی `evidence` ساخته نمی‌شود، و `evidence` نقلِ یک فکت
 * است نه یک توصیه.
 */
import crypto from 'node:crypto';
import { listInvariants } from './invariants.js';
import { readDossier } from './store.js';
import { readMap } from '../map/store.js';
import { normalizeCapabilityRoute } from './capabilities.js';

/**
 * نقش‌هایی که یعنی «اینجا آدم چیزی می‌نویسد».
 *
 * `searchbox` هم هست چون فرمِ جست‌وجو همان‌قدر ورودیِ خالی و بلند می‌خورد.
 */
const TYPING = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

/** نقش‌هایی که یعنی «اینجا آدم چیزی را عوض می‌کند». */
const TOGGLING = new Set(['switch', 'checkbox', 'radio']);

/**
 * واژه‌هایی که روی یک دکمه یعنی «این ثبت می‌کند».
 *
 * عمداً کوتاه و فارسی-محور است. بلند کردنش یعنی هر دکمه‌ای «ثبت» به نظر
 * برسد و زاویهٔ «بعد از رفرش» روی همه‌چیز بیفتد — که همان فهرستِ بی‌معنایی
 * است که این فایل از آن پرهیز می‌کند.
 */
const SUBMITTING =
  /ذخیره|ثبت|افزودن|اضافه|ایجاد|بساز|ارسال|بارگذاری|آپلود|تأیید|تایید|اعمال|save|submit|create|add|apply|upload/i;

/** و واژه‌هایی که یعنی «این کارِ لغو است». */
const CANCELLING = /لغو|انصراف|بستن|بازگشت|cancel|close|dismiss/i;

function idOf(capability, angle) {
  return `angle:${crypto.createHash('sha1').update(`${capability}|${angle}`).digest('hex').slice(0, 8)}`;
}

/**
 * کنش‌های یک قابلیت، از نقشه.
 *
 * ── چرا از نقشه و نه از خودِ گرهِ قابلیت ──
 *
 * گره فقط **شمار** کنش‌ها را دارد (`actions`, `tried`) چون درخت باید سبک
 * بماند. زاویه به **نقش**شان نیاز دارد: پنج `textbox` حرفِ کاملاً دیگری از
 * پنج `button` می‌زند.
 */
export function actionsOf(target, node) {
  const map = readMap(target);
  const mine = [];
  const inherited = new Set();

  for (const state of map.states || []) {
    if (normalizeCapabilityRoute(state.route) !== node.route) continue;
    if ((state.view || '') !== (node.view || '')) continue;
    mine.push(...(state.actions || []));

    /**
     * آنچه پشتِ این نما دیده می‌شود، مالِ این نما نیست.
     *
     * ── چرا این تفریق لازم است، با یک مثالِ واقعی ──
     *
     * مودالِ «افزودن کتاب جدید» نُه دکمه داشت و شش‌تایشان نوارِ کناری بودند:
     * «خانه»، «هوش مصنوعی»، «فایل‌های منتخب»، حتی ایمیلِ کاربرِ همان اجرا.
     * مودال که باز است، صفحهٔ پشتش هنوز در DOM است.
     *
     * نتیجه‌اش فقط یک عددِ باد‌کرده نبود: دکمهٔ واقعیِ ثبت («بارگذاری») بینِ
     * آن‌ها گم می‌شد و زاویهٔ «ورودیِ خالی» ساخته نمی‌شد — یعنی همان زاویه‌ای
     * که بیشترین باگ را پیدا می‌کند، برای همان نمایی که هرگز باز نشده بود.
     *
     * `propose.js` همین تله را خورده و همین‌طور حلش کرده: گرهِ والد را نقشه
     * از قبل می‌داند.
     */
    if (!node.view) continue;
    const parentId = (map.edges || []).find((edge) => edge.to === state.id)?.from;
    const parent = parentId ? (map.states || []).find((one) => one.id === parentId) : null;
    for (const action of parent?.actions || []) inherited.add(action.key);
  }

  /**
   * و یک بار برای هر کنش، نه یک بار برای هر حالتی که آن را دیده.
   *
   * نقشهٔ نپی چهار حالتِ جدا با `route=/contents, view=''` دارد (نمایشان
   * فرق می‌کند، مثلاً فیلترِ فعال). ۹۱ کنش داشتند و ۴۵ تایش یکتا بود — پس
   * «۸۸ دکمه در این نما» تقریباً دو برابرِ واقعیت بود. شاهدی که عددش غلط
   * باشد، شاهد نیست.
   */
  const seen = new Map();
  for (const action of mine) {
    if (inherited.has(action.key)) continue;
    if (!seen.has(action.key)) seen.set(action.key, action);
  }

  return [...seen.values()];
}

/**
 * مسیرِ رسیدن، از نقشه — تا سناریو مجبور نباشد حدسش بزند.
 *
 * همان چیزی که `propose.js` را اجراپذیرتر از بقیه می‌کند: بقیه متن می‌دهند
 * و مدل باید راه را پیدا کند؛ این یکی راه را **می‌داند**، چون خزنده یک بار
 * قطعی رفته.
 */
function pathTo(target, node) {
  const map = readMap(target);
  let best = null;

  for (const state of map.states || []) {
    if (normalizeCapabilityRoute(state.route) !== node.route) continue;
    if ((state.view || '') !== (node.view || '')) continue;
    const path = state.path || [];
    if (!best || path.length < best.length) best = path;
  }

  return best || [];
}

/**
 * ناورداهایی که به این قابلیت می‌خورند.
 *
 * ── چرا تطبیق سست است و چرا اشکالی ندارد ──
 *
 * هیچ‌جا ننوشته «جدولِ `books` مالِ صفحهٔ `/contents` است». تنها پلِ موجود
 * نامِ جدول در برابر نامِ مسیر و نمای قابلیت است — یعنی حدس.
 *
 * ولی خطای این حدس ارزان است: زاویهٔ «مقدارِ تکراری» روی صفحهٔ اشتباه، یک
 * پیشنهادِ بی‌ربط است که کاربر ردش می‌کند. در برابر، **نساختنش** یعنی
 * باگِ منطقیِ واقعی هرگز آزموده نشود. پس حدس می‌زنیم، و `evidence`
 * می‌گوید حدس است.
 */
function invariantsFor(target, node) {
  const words = `${node.route} ${node.view || ''} ${node.title || ''}`.toLowerCase();

  return listInvariants(target)
    .filter((one) => one.kind === 'unique')
    .filter((one) => {
      const table = String(one.table || '').toLowerCase();
      if (!table) return false;
      /** ریشهٔ سادهٔ جمع: `books` → `book`. بی این، `/book/:id` به `books` نمی‌خورد. */
      const stem = table.replace(/(ies|es|s)$/, '');
      return stem.length > 2 && words.includes(stem);
    })
    .slice(0, 3);
}

/**
 * زاویه‌های آزمونِ یک قابلیت.
 *
 * @param {string} target
 * @param {object} node گرهِ درختِ قابلیت‌ها
 * @param {object} [o]
 * @param {string[]} [o.covered] نامِ سناریوهایی که از قبل اینجا را لمس کرده‌اند
 */
export function anglesFor(target, node, { covered = [] } = {}) {
  if (!node?.route) return [];

  const safely = (fn, fallback) => {
    try {
      return fn() ?? fallback;
    } catch {
      return fallback;
    }
  };

  const actions = safely(() => actionsOf(target, node), []);
  const dossier = safely(() => readDossier(target), {});
  const preamble = safely(() => pathTo(target, node), []);

  const typing = actions.filter((one) => TYPING.has(one.role));
  const toggling = actions.filter((one) => TOGGLING.has(one.role));
  const buttons = actions.filter((one) => one.role === 'button');
  const submit = buttons.find((one) => SUBMITTING.test(one.label || ''));
  const cancel = buttons.find((one) => CANCELLING.test(one.label || ''));
  const destructive = actions.filter((one) => one.kind === 'destructive');

  const where = node.view ? `«${node.view}» در ${node.route}` : node.route;
  const open = node.view ? `«${node.view}» را باز کن.\n` : `به ${node.route} برو.\n`;
  const out = [];

  const add = (angle, title, why, evidence, text) =>
    out.push({
      id: idOf(node.id, angle),
      angle,
      capability: node.id,
      title,
      why,
      evidence,
      routes: [node.route],
      preamble,
      text,
    });

  /**
   * ۱. مسیرِ خوش — همیشه، اگر اصلاً کاری برای کردن هست.
   *
   * بدیهی به نظر می‌رسد و نیست: قابلیتی که فقط «نشکست» را ثابت کند، هیچ
   * ادعایی ندارد. سناریوی مسیرِ خوش تنها جایی است که **نتیجه** سنجیده
   * می‌شود.
   */
  if (buttons.length) {
    add(
      'happy',
      'کارِ اصلی، تا آخر',
      'هر قابلیت دستِ‌کم یک مسیرِ موفق دارد و آن باید سنجیده شود، نه فقط «چیزی نشکست».',
      `${buttons.length} دکمه در این نما`,
      `${open}کارِ اصلی‌اش را تا آخر انجام بده${submit ? ` و «${submit.label}» را بزن` : ''}.\n` +
        'بررسی کن نتیجه واقعاً اعمال شد — نه اینکه فقط خطایی ندیدیم.'
    );
  }

  /**
   * ۲. ورودیِ خالی.
   *
   * جایی که بیشترین باگِ واقعی پیدا می‌شود و کمترین سناریو برایش نوشته
   * می‌شود، چون کسی «فرمِ خالی» را کارِ کاربر نمی‌داند — و هست.
   */
  if (typing.length && submit) {
    add(
      'empty',
      'همه‌چیز خالی، بعد ثبت',
      'فرمِ خالی رایج‌ترین کارِ ناخواستهٔ کاربر است و معمولاً هیچ سناریویی ندارد.',
      `${typing.length} ورودیِ متنی و دکمهٔ «${submit.label}»`,
      `${open}هیچ فیلدی را پر نکن و «${submit.label}» را بزن.\n` +
        'انتظار: پیامِ خطای روشن — نه صفحهٔ سفید، نه ذخیره شدنِ رکوردِ خالی.'
    );

    /**
     * ۳. ورودیِ مرزی.
     *
     * جدا از خالی، چون شکستش جای دیگری است: خالی معمولاً در کلاینت گرفته
     * می‌شود و بلند و عجیب در سرور.
     */
    add(
      'edge',
      'مقدارِ خیلی بلند و نویسه‌های عجیب',
      'اعتبارسنجیِ کلاینت معمولاً طول و نویسه را نمی‌گیرد؛ شکستش در سرور می‌افتد.',
      `${typing.length} ورودیِ متنی`,
      `${open}در فیلدها مقدارِ خیلی بلند (چند هزار نویسه) و نویسه‌های عجیب بگذار` +
        `${submit ? ` و «${submit.label}» را بزن` : ''}.\n` +
        'انتظار: یا تمیز رد شود یا تمیز بپذیرد — نه ۵۰۰ و نه بریدنِ بی‌صدا.'
    );
  }

  /** ۴. قاعدهٔ یکتایی — باگِ منطقی، نه باگِ ظاهری. */
  for (const invariant of invariantsFor(target, node)) {
    add(
      `unique:${invariant.id}`,
      `همان مقدار، بارِ دوم (${invariant.columns?.join('، ') || invariant.table})`,
      'schema می‌گوید این نباید تکراری شود؛ اینکه رابط هم جلویش را می‌گیرد، جای دیگری است.',
      `UNIQUE روی ${invariant.table}(${invariant.columns?.join(', ') || '—'}) — حدسِ ربط از نامِ جدول`,
      `${open}یک بار کار را با مقدارِ تازه انجام بده، بعد **دقیقاً همان مقدار** را دوباره بده.\n` +
        `انتظار: بارِ دوم رد شود با پیامِ روشن. اگر پذیرفته شد، قاعدهٔ ${invariant.table} از راهِ رابط شکسته.`
    );
  }

  /**
   * ۵. ماندگاری.
   *
   * ── چرا این زاویه مهم است ──
   *
   * سناریوی معمولی بعد از ثبت، پیامِ موفقیت را می‌بیند و تمام می‌شود. ولی
   * «پیام آمد» با «در دیتابیس نشست» یکی نیست، و فاصله‌شان دقیقاً همان‌جایی
   * است که باگ می‌نشیند.
   */
  if (submit) {
    add(
      'persist',
      'بعد از رفرش هنوز هست؟',
      '«پیامِ موفقیت آمد» با «واقعاً ذخیره شد» یکی نیست، و سناریوی معمولی فقط اولی را می‌بیند.',
      `دکمهٔ «${submit.label}»`,
      `${open}کار را انجام بده و ثبت کن.\n` +
        'بعد صفحه را رفرش کن (یا از اپ بیرون برو و برگرد) و بررسی کن همان چیز هنوز هست.'
    );
  }

  /** ۶. لغو — فقط برای نما، چون فقط آنجاست که «بستن» معنا دارد. */
  if (node.view && cancel) {
    add(
      'cancel',
      'نیمه‌کاره رهایش کن',
      'کاربر بیشتر از آنکه تمام کند، منصرف می‌شود — و آن مسیر معمولاً هیچ سناریویی ندارد.',
      `دکمهٔ «${cancel.label}» در این نما`,
      `${open}فیلدها را پر کن ولی «${cancel.label}» را بزن.\n` +
        'انتظار: چیزی ساخته نشده باشد، و باز کردنِ دوبارهٔ همین نما فرمِ تمیز بدهد — نه مقدارهای قبلی.'
    );
  }

  /** ۷. گزینه‌ها — سوئیچ و رادیو و تیک. */
  if (toggling.length >= 2) {
    add(
      'toggle',
      'هر گزینه را عوض کن، ببین اثرش می‌ماند',
      'گزینه‌ها معمولاً ذخیره می‌شوند ولی اثرشان جای دیگری دیده می‌شود — و آن جای دیگر آزموده نمی‌شود.',
      `${toggling.length} گزینه (${[...new Set(toggling.map((one) => one.role))].join('، ')})`,
      `${open}هر گزینه را عوض کن.\n` +
        'بعد از رفرش بررسی کن همان حالت مانده، و اثرش واقعاً در اپ دیده می‌شود.'
    );
  }

  /**
   * ۸. بی ورود.
   *
   * ── چرا فقط وقتی اپ ورود دارد ──
   *
   * روی اپِ بی‌احراز، «بی ورود چه می‌شود» پرسشِ بی‌معنایی است و فهرست را
   * با ردیفی پر می‌کند که هیچ‌وقت باگی پیدا نمی‌کند.
   */
  /**
   * واژگانِ `auth.kind` در `schema.js`: form | oauth | magic-link | none | unknown.
   *
   * ── چرا `none` هم مثلِ `unknown` رد می‌شود ──
   *
   * شرطِ اول فقط `unknown` را می‌گرفت، پس اپی که پرونده‌اش صریحاً می‌گوید
   * «ورود ندارم» همچنان زاویهٔ «بی ورود، همین آدرس» می‌گرفت — ردیفی که
   * هیچ‌وقت چیزی پیدا نمی‌کند، روی پروژه‌ای که بیشترین اطمینان را دربارهٔ
   * خودش داده.
   *
   * `none` قوی‌ترین نشانهٔ «نساز» است، نه ضعیف‌ترین.
   */
  const loginPath = dossier?.auth?.loginPath || '';
  const hasAuth = dossier?.auth?.kind && !['unknown', 'none'].includes(dossier.auth.kind);
  if (hasAuth && node.route !== loginPath && !node.view) {
    add(
      'anon',
      'بی ورود، همین آدرس',
      'کنترلِ دسترسی معمولاً در رابط رعایت می‌شود و در خودِ مسیر نه؛ و همان شکاف است که کسی نمی‌آزماید.',
      `اپ ورود دارد (${dossier.auth.kind})${loginPath ? ` · مسیرِ ورود ${loginPath}` : ''}`,
      `بی آنکه وارد شوی مستقیم به ${node.route} برو.\n` +
        `انتظار: به ${loginPath || 'صفحهٔ ورود'} بروی — نه اینکه دادهٔ کسی را ببینی، نه صفحهٔ سفید یا خطای خام.`
    );
  }

  /**
   * ۹. کارِ برگشت‌ناپذیر.
   *
   * زاویه‌اش «انجامش بده» نیست — «بپرس آیا می‌پرسد». حذفی که بی تأیید
   * انجام شود، خودش یافته است.
   */
  if (destructive.length) {
    add(
      'confirm',
      'کارِ برگشت‌ناپذیر، بی تأیید؟',
      'کاری که جبران ندارد باید بپرسد. نپرسیدنش خودش یک یافته است، نه یک سلیقه.',
      `${destructive.length} کنشِ مخرب که خزش برچسب زده`,
      `${open}سراغِ ${destructive.map((one) => `«${one.label}»`).slice(0, 3).join(' یا ')} برو و بزنش.\n` +
        'انتظار: پیشِ انجام، تأیید بخواهد — و «انصراف» واقعاً کاری نکند. ' +
        'خودِ حذف را انجام نده مگر روی دادهٔ آزمایشیِ خودت.'
    );
  }

  /**
   * زاویه‌ای که از قبل پوشش دارد، پیشنهاد نمی‌شود.
   *
   * تطبیق سست است (نامِ سناریو در برابر عنوانِ زاویه) و عمداً: تطبیقِ
   * سخت‌گیرانه یعنی همان زاویه بارها پیشنهاد شود، و فهرستِ تکراری همان
   * فهرستی است که بسته می‌شود.
   */
  const haystack = covered.join(' ').toLowerCase();
  return out.map((one) => ({
    ...one,
    covered: one.title
      .split(/[\s،,]+/)
      .filter((word) => word.length > 3)
      .some((word) => haystack.includes(word.toLowerCase())),
  }));
}
