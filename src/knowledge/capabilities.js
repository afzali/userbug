/**
 * «این اپ چه بخش‌ها و قابلیت‌هایی دارد؟» — یک درخت، نه یک فهرستِ تخت.
 *
 * ── چرا این فایل لازم شد ──
 *
 * `map/merge.js` همهٔ **جاها** را یکی کرد و آن درست بود، ولی خروجی‌اش یک
 * آرایهٔ تخت است که با `route|view` کلید می‌خورد. روی نپی می‌شود ۱۹ ردیف و
 * خوانا است؛ روی اپی با دویست صفحه می‌شود دویست ردیفِ هم‌شکل که هیچ‌کس
 * نمی‌تواند در آن چیزی پیدا کند.
 *
 * و پرسشی که کاربر واقعاً دارد اصلاً «چه جاهایی هست» نیست:
 *
 *   «سایتم چه دارد، کدامش را فراموش کرده‌ام، و کجا شکست؟»
 *
 * هر سه نیمهٔ این پرسش یک چیزِ مشترک می‌خواهند که تا امروز وجود نداشت: یک
 * **موجودیت** به اسم قابلیت، که سناریو و اجرا و یافته بتوانند به آن گره
 * بخورند. بی آن، سه فهرستِ موازی داشتیم که هیچ‌کدام به آن دوتای دیگر وصل
 * نبود.
 *
 * ── قاعدهٔ پدر–فرزند: پیشوندِ مسیر، نه گرافِ خزش ──
 *
 * وسوسه این است که سلسله‌مراتب از گرافِ خزش دربیاید («از اینجا به آنجا
 * رسیدم، پس آن فرزندِ این است»). سه دلیل که نمی‌شود:
 *
 *   ۱. گراف حلقه دارد. هر صفحه‌ای منوی اصلی را دارد، پس همه‌چیز فرزندِ
 *      همه‌چیز است.
 *   ۲. ناپایدار است. خزشِ بعدی که از مسیرِ دیگری برسد، کلِ درخت را عوض
 *      می‌کند — و درختی که هر بار جایش عوض شود، درختی است که آدم در آن
 *      چیزی حفظ نمی‌کند.
 *   ۳. با هدف نمی‌خواند. هدف **پیدا شدن در مقیاس** است، نه ثبتِ اینکه
 *      کاربر از کجا آمد. آن را نقشه از قبل دارد.
 *
 * پیشوندِ مسیر هر سه را جواب می‌دهد: قطعی است، بی مدل حساب می‌شود، و با
 * همان ذهنیتی می‌خواند که اپ با آن نوشته شده.
 *
 * ── و چرا شناسه‌ها جمع می‌شوند ──
 *
 * `/content/f2e9a6d428` یک قابلیت نیست، یک **نمونه** از یک قابلیت است.
 * بی جمع کردنش، اپی با پانصد کتاب پانصد ردیف می‌گیرد و درخت دقیقاً همان
 * چیزی می‌شود که قرار بود نباشد. پس هر قطعه‌ای که شبیهِ شناسه باشد
 * `:id` می‌شود — و این تنها جای این فایل است که **حدس** می‌زند، پس
 * محافظه‌کارانه حدس می‌زند.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { knowledgeDir } from './store.js';
import { unifiedStates } from '../map/merge.js';

export const CAPABILITIES_VERSION = 1;

/**
 * سقفِ عمق.
 *
 * ── چرا سقف دارد ──
 *
 * مسیرِ `/a/b/c/d/e/f` در اپ‌های بزرگ عادی است، و درختی با شش تورفتگی روی
 * صفحه خوانده نمی‌شود — همان مشکلی که قرار بود حل شود، با لباسِ دیگر.
 * چیزی که از سقف بگذرد حذف نمی‌شود؛ به نزدیک‌ترین جدِ مجاز می‌چسبد و
 * مسیرِ کاملش را کنارِ نامش نگه می‌دارد.
 */
export const MAX_DEPTH = 4;

/* ───────────────────────── مسیر ───────────────────────── */

/**
 * آیا این قطعه شناسه است؟
 *
 * محافظه‌کارانه، چون خطای این تابع در دو جهت هزینهٔ یکسانی ندارد:
 *
 *   شناسه را ثابت بخوانیم  → هزار ردیفِ تکراری. فاجعه.
 *   ثابت را شناسه بخوانیم  → دو قابلیتِ واقعی در یک ردیف قاطی می‌شوند.
 *                             بد، ولی قابلِ اصلاح با یک ویرایشِ دستی.
 *
 * پس در حالتِ شک، شناسه است. ولی «شک» تعریفِ تنگی دارد: قطعه‌ای که فقط
 * حروف است و کوتاه، هرگز شناسه نیست — `/settings` و `/admin` باید سالم
 * بمانند.
 */
export function looksLikeId(segment) {
  const raw = String(segment || '');
  if (!raw) return false;

  /**
   * جانگهدارِ خودِ فریم‌ورک — `[id_book]`، `{slug}`، `:id`، `<id>`.
   *
   * ── چرا این جا افتاده بود، و چطور پیدا شد ──
   *
   * فقط **مقدارها** جمع می‌شدند (`f2e9a6d428`)، نه **الگوها**. ولی سورس
   * الگو می‌دهد: اسکنِ نپی `/content/[id_book]` برمی‌گرداند و خزش از
   * همان صفحه `/content/f2e9a6d428` می‌بیند.
   *
   * نتیجه دو گره برای یک قابلیت بود — یکی «فقط در سورس» و آن یکی
   * خزیده‌شده، هر کدام با نصفِ عددها. روی `nepi4` که از صفر ساخته شد
   * همان بار اول دیده شد.
   *
   * `propose.js` این را از قبل می‌دانست (`\[[^\]]+\]|:[A-Za-z_]\w*`)؛
   * الگویش در مخزن بود و این فایل ندیده بودش.
   */
  if (/^(\[.+\]|\{.+\}|<.+>|:[A-Za-z_]\w*)$/.test(raw)) return true;

  /** فقط رقم: `/42`, `/2024`. */
  if (/^\d+$/.test(raw)) return true;
  /** UUID، با یا بی خط تیره. */
  if (/^[0-9a-f]{8}(-?[0-9a-f]{4}){3}-?[0-9a-f]{12}$/i.test(raw)) return true;
  /** هگزِ بلند — `f2e9a6d428` نپی از همین‌جا می‌آید. */
  if (/^[0-9a-f]{8,}$/i.test(raw)) return true;
  /** رشتهٔ بلندِ درهم با رقم — slugِ تولیدشده، نه کلمهٔ آدم. */
  if (raw.length >= 12 && /\d/.test(raw) && !/[-_](?=[a-z])/i.test(raw)) return true;

  return false;
}

/**
 * مسیرِ قابلیت: بی query، بی اسلشِ آخر، با شناسه‌های جمع‌شده.
 *
 * query عمداً می‌افتد. `?tab=x` گاهی واقعاً یک نمای جداست، ولی نما در این
 * مدل **فیلدِ خودش** را دارد (`view`) و از خزش می‌آید که دقیق‌تر از حدس
 * زدن از روی نامِ پارامتر است.
 */
export function normalizeCapabilityRoute(route) {
  let raw = String(route || '').trim();
  if (!raw) return '';
  raw = raw.split('#')[0].split('?')[0];
  if (!raw.startsWith('/')) raw = '/' + raw;

  const parts = raw
    .split('/')
    .filter(Boolean)
    .map((segment) => (looksLikeId(segment) ? ':id' : segment));

  return '/' + parts.join('/');
}

/** قطعه‌های یک مسیر، برای حسابِ پیشوند. `/` می‌شود آرایهٔ خالی. */
function segmentsOf(route) {
  return String(route || '')
    .split('/')
    .filter(Boolean);
}

/**
 * شناسهٔ پایدارِ یک قابلیت.
 *
 * از **معنا** ساخته می‌شود (مسیر و نما)، نه از ترتیب یا زمان. یعنی خزشِ
 * فردا همان شناسه‌ها را می‌دهد، پس ویرایشِ دستیِ امروز فردا هم سرِ جایش
 * است. شناسه‌ای که با هر استخراج عوض شود، هر ویرایشی را بی‌صدا می‌بلعد.
 */
export function capabilityId(route, view = '') {
  const key = `${normalizeCapabilityRoute(route)}|${String(view || '').trim()}`;
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 10);
}

/* ───────────────────────── استخراج ───────────────────────── */

/**
 * عنوانِ خوانا، بی یک فراخوانی مدل.
 *
 * ── چرا این ترتیب ──
 *
 * نمای خزش بهترین منبع است چون خودِ اپ اسمش را گذاشته («افزودن کتاب
 * جدید»). بعد `purpose` که آدم نوشته. بعد `title`ِ صفحه — که معمولاً
 * «نامِ اپ :: نامِ صفحه» است و باید تکه شود. و آخرش خودِ مسیر، که زشت
 * است ولی دروغ نیست.
 *
 * هیچ‌کدام از اینها ادعای خوب بودن ندارند؛ ادعایشان این است که **رایگان**
 * و **قطعی**‌اند. نامِ زیبا کارِ قدمِ بعدی است و انتخابِ کاربر.
 */
function titleOf(node) {
  if (node.view) return node.view;
  if (node.purpose) return node.purpose.split('\n')[0].slice(0, 60);

  /**
   * روتِ شناسه‌دار عنوانِ صفحه را قرض نمی‌گیرد.
   *
   * ── چرا، با یک مثالِ واقعی ──
   *
   * `/content/:id` از خزشِ نپی عنوانِ «گزيده نهج البلاغه» گرفت — یعنی نامِ
   * **یک کتاب**، روی قابلیتی که «خواندنِ هر کتاب» است. فردا که کتابِ دیگری
   * خزیده شود، نامِ همان قابلیت عوض می‌شود.
   *
   * نامی که از یک نمونهٔ تصادفی بیاید، هم امروز گمراه‌کننده است هم فردا
   * ناپایدار. خودِ مسیر زشت‌تر است و درست.
   */
  const dynamic = normalizeCapabilityRoute(node.route).includes('/:id');
  const title = dynamic ? '' : String(node.title || '').trim();
  if (title) {
    /** «مدیریت فایل‌ها :: نپی» → «مدیریت فایل‌ها». جداکننده‌های رایج. */
    const head = title.split(/\s*(?:::|[|–—-])\s*/)[0].trim();
    if (head && head.length <= 60) return head;
  }

  const parts = segmentsOf(normalizeCapabilityRoute(node.route));
  if (!parts.length) return 'خانه';
  const last = parts[parts.length - 1];
  return last === ':id' ? parts.slice(-2).join('/') : last;
}

/**
 * جاهای یکپارچه → گره‌های خامِ قابلیت.
 *
 * ── چرا گره‌های هم‌مسیر با هم جمع می‌شوند ──
 *
 * `/content/f2e9a6d428` و `/content/9b1c22aa07` دو ردیف در `unifiedStates`
 * بودند و یک قابلیت‌اند. جمع شدنشان یعنی عددهایشان هم جمع می‌شود —
 * «۱۱۶ کنش» روی قابلیت، نه روی یک نمونهٔ تصادفی از آن.
 */
function rawNodes(target) {
  const byId = new Map();

  for (const place of unifiedStates(target)) {
    const route = normalizeCapabilityRoute(place.route);
    /** مسیری که اصلاً روت نیست (about:blank و همنوعانش) گره نمی‌سازد. */
    if (!route) continue;

    const view = String(place.view || '').trim();
    const id = capabilityId(route, view);
    const previous = byId.get(id);

    const next = {
      id,
      route,
      view,
      title: titleOf(place),
      /** نمونه‌های واقعی — تا بشود گفت «مثلاً `/content/f2e9a6d428`». */
      samples: [...new Set([...(previous?.samples || []), place.route])].slice(0, 5),
      by: [...new Set([...(previous?.by || []), ...(place.by || [])])],
      actions: (previous?.actions || 0) + (place.actions || 0),
      tried: (previous?.tried || 0) + (place.tried || 0),
      contract: (previous?.contract || 0) + (place.contract || 0),
      stale: Boolean(previous?.stale || place.stale),
      shot: previous?.shot || place.shot || '',
    };

    byId.set(id, next);
  }

  return [...byId.values()];
}

/**
 * گره‌های میانیِ ساختگی.
 *
 * ── چرا لازم‌اند ──
 *
 * اگر `/admin/users` و `/admin/settings` کشف شده باشند ولی خودِ `/admin`
 * هرگز بازدید نشده، آن دو یتیم می‌مانند و در ریشهٔ درخت کنارِ `/login`
 * می‌نشینند. یعنی دقیقاً همان تختیِ بی‌معنایی که این فایل برای حذفش نوشته
 * شد.
 *
 * پس گرهِ `/admin` ساخته می‌شود، با `by: ['derived']` تا هیچ‌کس با یک
 * جای واقعی اشتباهش نگیرد: این یک **قفسه** است، نه صفحه‌ای که کسی دیده.
 *
 * فقط وقتی که دستِ‌کم دو فرزند دارد — قفسه‌ای با یک کتاب، فقط یک تورفتگیِ
 * اضافه است.
 */
function shelves(nodes) {
  const have = new Set(nodes.filter((one) => !one.view).map((one) => one.route));
  const want = new Map();

  /**
   * مسیرهای **متمایز** شمرده می‌شوند، نه گره‌ها.
   *
   * ── باگی که با دادهٔ واقعی پیدا شد ──
   *
   * `/content/:id` سه گره داشت (خودش و دو نمایش)، پس پیشوندِ `/content` سه
   * بار شمرده می‌شد و شرطِ «دستِ‌کم دو فرزند» را رد می‌کرد — در حالی که
   * فرزندِ واقعی یکی بود. نتیجه یک قفسهٔ تک‌فرزند بود: دقیقاً همان تورفتگیِ
   * بی‌فایده‌ای که این شرط برای جلوگیری از آن نوشته شده بود.
   */
  for (const node of nodes) {
    if (node.view) continue;
    const parts = segmentsOf(node.route);
    for (let depth = 1; depth < parts.length; depth++) {
      const prefix = '/' + parts.slice(0, depth).join('/');
      if (have.has(prefix)) continue;
      const seen = want.get(prefix) || new Set();
      seen.add(node.route);
      want.set(prefix, seen);
    }
  }

  return [...want.entries()]
    .filter(([, routes]) => routes.size >= 2)
    .map(([route]) => ({
      id: capabilityId(route, ''),
      route,
      view: '',
      title: segmentsOf(route).pop() || 'خانه',
      samples: [],
      by: ['derived'],
      actions: 0,
      tried: 0,
      contract: 0,
      stale: false,
      shot: '',
      shelf: true,
    }));
}

/**
 * پدرِ هر گره.
 *
 *   نما  →  همان مسیر، بی نما. مودالِ «افزودن کتاب» زیرِ `/contents` است،
 *           چون واقعاً همان‌جاست و آدرسِ خودش را ندارد.
 *   مسیر →  بلندترین مسیرِ موجود که پیشوندِ قطعه‌ایِ آن باشد.
 *
 * «قطعه‌ای» مهم است: `/contents` پیشوندِ `/contents-archive` نیست، هرچند
 * رشته‌اش هست. یک تطبیقِ رشته‌ایِ ساده اینجا دو قابلیتِ بی‌ربط را تو در تو
 * می‌کرد.
 */
function parentOf(node, byRoute, byId) {
  if (node.view) {
    const host = byRoute.get(node.route);
    return host && host.id !== node.id ? host.id : null;
  }

  const parts = segmentsOf(node.route);
  for (let depth = parts.length - 1; depth >= 0; depth--) {
    const prefix = '/' + parts.slice(0, depth).join('/');
    const candidate = byRoute.get(prefix);
    if (candidate && candidate.id !== node.id && byId.has(candidate.id)) return candidate.id;
  }
  return null;
}

/**
 * عمقِ هر گره، و چسباندنِ آنچه از سقف گذشته به نزدیک‌ترین جدِ مجاز.
 *
 * ── چرا حذف نمی‌شود ──
 *
 * قابلیتی که از سقف بگذرد همچنان یک قابلیتِ واقعی است. حذفش یعنی رابط
 * چیزی را که وجود دارد نشان ندهد — و این ابزار جای دیگر هم همین قاعده را
 * دارد: «صفر یک خبر است، ولی ندانستن با نبودن فرق دارد».
 */
function capDepth(nodes) {
  const byId = new Map(nodes.map((one) => [one.id, one]));
  const depthOf = (node, seen = new Set()) => {
    if (!node.parent || seen.has(node.id)) return 0;
    seen.add(node.id);
    const parent = byId.get(node.parent);
    return parent ? 1 + depthOf(parent, seen) : 0;
  };

  for (const node of nodes) node.depth = depthOf(node);

  for (const node of nodes) {
    if (node.depth < MAX_DEPTH) continue;
    let parent = byId.get(node.parent);
    while (parent && parent.depth >= MAX_DEPTH - 1) parent = byId.get(parent.parent);
    node.parent = parent?.id || null;
    node.depth = parent ? parent.depth + 1 : 0;
    /** مسیرِ کامل کنارِ نام می‌ماند، وگرنه معلوم نیست این از کجا آمده. */
    node.reparented = true;
  }

  return nodes;
}

/**
 * درختِ مشتق‌شده — بی یک فراخوانی مدل، از آنچه از قبل روی دیسک هست.
 *
 * خروجی تخت است ولی هر گره `parent` دارد؛ ساختنِ درخت کارِ `buildTree` است
 * که ویرایش‌های آدم را هم رویش می‌گذارد.
 */
/**
 * عنوانی که دو جای مختلف را یک‌شکل نشان دهد، بدتر از عنوانِ زشت است.
 *
 * ── چرا لازم شد ──
 *
 * نپی روی `/login` و `/contents` هر دو `<title>` را «مدیریت فایل‌ها :: نپی»
 * می‌گذارد — یعنی درخت دو ردیف داشت با نامِ یکسان و کاربر باید مسیر را
 * می‌خواند تا بفهمد کدام کدام است. اپ‌های تک‌صفحه‌ای این را زیاد دارند.
 *
 * راه‌حل صادقانه‌ترین چیزی است که رایگان در دست داریم: عنوانِ تکراری جایش
 * را به خودِ قطعهٔ مسیر می‌دهد. زشت‌تر است، ولی یکتاست — و نامِ زیبا کارِ
 * قدمِ بعد است، با انتخابِ کاربر.
 */
function unclash(nodes) {
  const count = new Map();
  for (const node of nodes) {
    if (node.view) continue;
    count.set(node.title, (count.get(node.title) || 0) + 1);
  }

  for (const node of nodes) {
    if (node.view || count.get(node.title) < 2) continue;
    const parts = segmentsOf(node.route);
    node.title = parts.length ? parts[parts.length - 1] : 'خانه';
    node.titleClashed = true;
  }

  return nodes;
}

export function extract(target) {
  const nodes = unclash([...rawNodes(target)]);
  nodes.push(...shelves(nodes));

  /**
   * فهرستِ «مسیر → گرهِ بی‌نما»، برای پیدا کردنِ پدر.
   *
   * فقط گره‌های بی‌نما نامزدِ پدری‌اند: یک مودال نمی‌تواند پدرِ یک صفحه
   * باشد، حتی اگر مسیرشان یکی باشد.
   */
  const byRoute = new Map();
  for (const node of nodes) if (!node.view) byRoute.set(node.route, node);
  const byId = new Map(nodes.map((one) => [one.id, one]));

  for (const node of nodes) node.parent = parentOf(node, byRoute, byId);

  return capDepth(nodes).sort(
    (a, b) => a.route.localeCompare(b.route, 'fa') || a.view.localeCompare(b.view, 'fa')
  );
}

/* ───────────────────────── ذخیره ───────────────────────── */

function derivedFile(target) {
  return path.join(knowledgeDir(target), 'capabilities.json');
}

function editsFile(target) {
  return path.join(knowledgeDir(target), 'capabilities.edits.json');
}

function readJson(file, fallback) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return raw && typeof raw === 'object' ? raw : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

/**
 * دو فایل، نه یکی — و این تصمیم‌ترین خطِ این ماژول است.
 *
 * `capabilities.json` **مشتق** است: هر بار از نو ساخته می‌شود و دور
 * ریختنش هیچ چیزی از بین نمی‌برد.
 *
 * `capabilities.edits.json` **حرفِ آدم** است: نامی که خودتان گذاشته‌اید،
 * پدری که دستی عوض کرده‌اید، قابلیتی که گفته‌اید حذف شده. هیچ استخراجی
 * دستش به این نمی‌خورد.
 *
 * یکی کردنشان یعنی روزی یک `extract` حرفِ کاربر را بی‌صدا بازنویسی کند —
 * همان چیزی که `merge.js` یک بار با `TRUST` جلویش را گرفت. اینجا جداییِ
 * فیزیکی همان کار را ساده‌تر می‌کند: تابعی که فایلِ مشتق را می‌نویسد،
 * اصلاً فایلِ دیگر را باز نمی‌کند.
 */
export function readEdits(target) {
  return readJson(editsFile(target), {});
}

/**
 * نام‌هایی که مدل ساخته — لایهٔ **میانی**.
 *
 * ── چرا سه لایه و نه دو ──
 *
 * `مشتق < مدل < کاربر`، و هر مرز دلیلِ خودش را دارد:
 *
 *   مدل بر مشتق می‌چربد، چون `contents` درست است ولی چیزی نمی‌گوید.
 *   کاربر بر مدل می‌چربد، چون تنها منبعی است که قضاوتِ آدم پشتش است.
 *
 * و چرا نام‌های مدل در فایلِ **مشتق** می‌نشینند نه در `edits`: چون باید با
 * تازه‌سازی قابلِ بازنویسی باشند. ریختنشان در `edits` یعنی حدسِ یک مدلِ
 * ارزان همان وزنی را بگیرد که جملهٔ خودِ آدم — دقیقاً همان چیزی که
 * `TRUST` در `merge.js` برای جلوگیری‌اش نوشته شده.
 */
export function writeNames(target, names) {
  const stored = readJson(derivedFile(target), { version: CAPABILITIES_VERSION, target, nodes: [] });
  stored.names = { ...(stored.names || {}), ...names };
  writeJson(derivedFile(target), stored);
  return stored.names;
}

/**
 * ثبتِ یک ویرایش. `patch: null` یعنی برگرداندن به حالتِ مشتق‌شده.
 *
 * فیلدهای مجاز محدودند، چون این فایل دستِ کاربر است و نباید بتواند
 * شکلِ گره را عوض کند — فقط معنایش را.
 */
export function setEdit(target, id, patch) {
  const all = readEdits(target);
  const key = String(id || '').trim();
  if (!key) throw new Error('شناسهٔ قابلیت لازم است');

  if (patch === null) delete all[key];
  else {
    const clean = { ...(all[key] || {}) };
    if ('title' in patch) clean.title = String(patch.title ?? '').trim().slice(0, 80);
    if ('desc' in patch) clean.desc = String(patch.desc ?? '').trim().slice(0, 500);
    if ('parent' in patch) clean.parent = patch.parent ? String(patch.parent).trim() : null;
    if ('status' in patch) clean.status = STATUS.includes(patch.status) ? patch.status : 'active';
    clean.by = 'user';
    clean.at = new Date().toISOString();
    all[key] = clean;
  }

  writeJson(editsFile(target), all);
  return all;
}

/**
 * وضعیت‌ها.
 *
 * ── چرا «حذف شده» فقط دستی است ──
 *
 * وسوسه این بود که استخراج خودش بفهمد: «این گره دفعهٔ قبل بود و حالا
 * نیست، پس حذف شده». ولی نیست‌بودنِ یک گره در خزشِ امروز صد دلیل دارد که
 * هیچ‌کدام «حذف شده» نیستند — خزشِ محدود، ورودِ ناموفق، سروری که بالا
 * نبود، دکمه‌ای که آن روز کار نکرد.
 *
 * ابزاری که بگوید «این فیچر حذف شده» و اشتباه بگوید، دقیقاً همان کاری را
 * می‌کند که این مخزن همه‌جا از آن پرهیز می‌کند: ادعای چیزی که نمی‌داند.
 *
 * پس درخت فقط **آخرین بارِ دیده‌شدن** را نگه می‌دارد و رابط می‌گوید «۳۰
 * روز است دیده نشده». تصمیمِ «دیگر لازم نیست بگردیم» تصمیمِ آدم است.
 */
export const STATUS = ['active', 'gone', 'ignored'];

/**
 * ساختِ درخت و نوشتنِ فایلِ مشتق.
 *
 * `seenAt`ِ هر گره نگه داشته می‌شود تا «تازه» و «مدتی است دیده نشده»
 * محاسبه‌شدنی باشند — و همان دلیلی که `firstSeen` در تریاژ هست: بی زمان،
 * «چه عوض شد» جوابی ندارد.
 */
export function rebuild(target) {
  const previous = readJson(derivedFile(target), { nodes: [] });
  const seen = new Map((previous.nodes || []).map((one) => [one.id, one]));
  const now = new Date().toISOString();

  const nodes = extract(target).map((node) => {
    const before = seen.get(node.id);
    return { ...node, firstSeenAt: before?.firstSeenAt || now, lastSeenAt: now };
  });

  /**
   * گره‌هایی که این بار پیدا نشدند حذف نمی‌شوند.
   *
   * `lastSeenAt` قدیمی‌شان می‌ماند و رابط خودش می‌گوید چند وقت است خبری
   * نیست. حذفشان یعنی تاریخچه بی‌صدا کوتاه شود — و آن‌وقت «چه چیزی کم
   * شده» را هیچ‌کس نمی‌تواند بپرسد، که اولین پرسشِ این درخت بود.
   */
  const fresh = new Set(nodes.map((one) => one.id));
  for (const old of previous.nodes || []) {
    if (fresh.has(old.id)) continue;
    /**
     * قفسه استثناست: ساختار است، نه مشاهده.
     *
     * قاعدهٔ بالا دربارهٔ چیزی است که یک بار **دیده** شده — آن حق دارد
     * بماند و بگوید مدتی است خبری نیست. ولی قفسه چیزی نیست که کسی دیده
     * باشد؛ فقط وقتی معنا دارد که همین حالا دستِ‌کم دو فرزند داشته باشد.
     *
     * بی این استثنا، قفسه‌ای که یک بار اشتباه ساخته شد تا ابد در درخت
     * می‌ماند — و اولین باری که این کد روی نپی اجرا شد، دقیقاً همین شد.
     */
    if (old.shelf) continue;
    nodes.push({ ...old, missing: true });
  }

  /**
   * نام‌های ساخته‌شده از تازه‌سازی جان سالم می‌برند.
   *
   * ── چرا این خط لازم است ──
   *
   * `rebuild` کلِ فایلِ مشتق را بازنویسی می‌کند، و نام‌ها هم در همان فایل
   * زندگی می‌کنند. بی این، هر بار که کسی «تازه‌سازی درخت» بزند، کارِ
   * مدل دور ریخته می‌شود و دفعهٔ بعد دوباره پول می‌گیرد — بی آنکه چیزی
   * خطا بدهد. نام‌ها فقط کم‌رنگ‌تر برمی‌گردند به `contents` و کسی نمی‌فهمد
   * چرا.
   *
   * شناسه از **معنا** ساخته می‌شود (مسیر و نما)، پس گرهی که هنوز هست،
   * همان شناسه را دارد و نامش سرِ جایش می‌ماند.
   */
  const payload = {
    version: CAPABILITIES_VERSION,
    target,
    updatedAt: now,
    names: previous.names || {},
    nodes,
  };
  writeJson(derivedFile(target), payload);
  return payload;
}

/** خواندنِ درختِ مشتق بی ساختنِ دوباره. نبودنش خطا نیست. */
export function readCapabilities(target) {
  return readJson(derivedFile(target), { version: CAPABILITIES_VERSION, target, nodes: [] });
}

/**
 * درختِ نهایی: مشتق + ویرایشِ آدم + شمارش‌ها.
 *
 * `counts` از بیرون می‌آید (شاخصِ لمس و تریاژ)، چون این ماژول نباید
 * `runs/` را بشناسد: شناخت دربارهٔ اپ است، اجرا دربارهٔ تاریخچه.
 */
export function buildTree(target, { counts = {}, includeGone = false } = {}) {
  const edits = readEdits(target);
  const stored = readCapabilities(target);
  const names = stored.names || {};
  const NONE = { scenarios: [], planned: [], runs: 0, visits: 0, findings: 0, openFindings: 0, firstAt: '', lastAt: '' };

  const rows = stored.nodes.map((node) => {
    const edit = edits[node.id] || null;
    const named = names[node.id] || null;
    return {
      ...node,
      /** مشتق < مدل < کاربر — و هر ردیف می‌گوید کدامش را می‌بینید. */
      title: edit?.title || named?.title || node.title,
      desc: edit?.desc || named?.desc || '',
      parent: edit && 'parent' in edit ? edit.parent : node.parent,
      status: edit?.status || 'active',
      /** هر بند می‌گوید از کجا آمده — همان قاعدهٔ پروندهٔ شناخت. */
      titleBy: edit?.title ? 'user' : named?.title ? 'model' : 'derived',
      edited: Boolean(edit),
      /**
       * نما عددِ صفحهٔ میزبانش را **نمی‌گیرد**.
       *
       * ── سبزِ دروغینی که با دادهٔ واقعی دیده شد ──
       *
       * شمارش با `route` کلید می‌خورد و نما همان `route` را دارد. پس مودالِ
       * «افزودن کتاب جدید» که هرگز باز نشده بود، می‌گفت «۳ سناریو · ۱۱
       * اجرا» — چون `/contents` این عددها را داشت. یعنی رابط دقیقاً همان
       * قابلیتی را آزموده نشان می‌داد که آزموده نشده بود.
       *
       * رخدادِ `step` فقط `route` دارد و نما را نمی‌شناسد، پس این عدد برای
       * نما **وجود ندارد** — و نداشتن با صفر بودن فرق دارد. آنچه دربارهٔ
       * یک نما واقعاً می‌دانیم از خزش می‌آید و روی خودِ گره هست:
       * `tried` از `actions`. همان را نشان می‌دهیم، نه عددِ قرضی.
       */
      counts: node.view ? { ...NONE, hostRoute: node.route } : { ...NONE, ...(counts[node.route] || {}) },
    };
  });

  const visible = includeGone ? rows : rows.filter((one) => one.status !== 'gone');
  const byId = new Map(visible.map((one) => [one.id, { ...one, children: [] }]));

  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parent ? byId.get(node.parent) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  /**
   * مرتب‌سازی: قفسه‌ها و صفحه‌ها اول، نماها بعد.
   *
   * نما (مودال، منو) زیرمجموعهٔ صفحه است و معمولاً زیاد؛ آمدنشان پیش از
   * صفحه‌های واقعی یعنی ساختارِ اپ زیرِ جزئیات دفن شود.
   */
  const order = (list) => {
    list.sort(
      (a, b) =>
        Number(Boolean(a.view)) - Number(Boolean(b.view)) ||
        a.title.localeCompare(b.title, 'fa')
    );
    for (const one of list) order(one.children);
    return list;
  };

  return { roots: order(roots), flat: visible };
}
