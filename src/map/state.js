/**
 * هویتِ یک حالت، و کنش‌هایی که از آن بیرون می‌روند.
 *
 * همهٔ توابعِ این فایل **خالص**اند: ورودی‌شان snapshot است و خروجی‌شان داده.
 * دلیلش این است که کلِ درستیِ نقشه به همین چند تابع بند است و بی مرورگر باید
 * آزمودنی باشند (`scenarios/_selftest/map.spec.js`).
 *
 * ── چرا واحدِ نقشه «صفحه» نیست ──
 *
 * دو شکستِ متقارن. فهرستِ ۲۰۰ یادداشتی، ۲۰۰ آدرس است با یک ساختار: اگر آدرس
 * واحد باشد، نقشه ۲۰۰ گره می‌گیرد با دکمه‌های یکسان. و مودال و کشو **هیچ**
 * آدرسی ندارند: اگر آدرس واحد باشد، نیمی از یک اپِ امروزی در نقشه نیست — و
 * همان نیمه است که کسی تست ننوشته.
 *
 * پس هویت سه تکه است: الگوی روت، نمای باز، و نمای نقش‌ها.
 */
import { hashSignature } from '../steps/signature.js';
import { descriptorFor } from '../steps/snapshot.js';

/**
 * قطعه‌ای که شناسه است، نه اسمِ صفحه.
 *
 * ترتیب مهم نیست چون هر کدام کافی است: هگزِ بلند، عددِ خالی، uuid، یا رشتهٔ
 * مخلوطِ بلندی که رقم دارد (`6737f33d35`، `42`، `a1b2-…`, `Ab3xK9mP`).
 */
const ID_LIKE = [
  /^[0-9]+$/,
  // رقم اجباری است، وگرنه واژه‌های کاملاً هگزی («decade», «beefed») شناسه خوانده
  // می‌شدند و دو روتِ واقعاً متفاوت یکی می‌شد
  /^(?=.*[0-9])[0-9a-f]{6,}$/i,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^(?=.*[0-9])[A-Za-z0-9_-]{12,}$/,
];

/**
 * واژه‌هایی که کلیکشان برگشت‌ناپذیر است.
 *
 * ── چرا قاعده، پیش از هر مدلی ──
 *
 * خزنده‌ای که آزاد کلیک کند دیر یا زود «خروج» را می‌زند و بقیهٔ خزش روی صفحهٔ
 * ورود می‌گذرد. همان درسی که `explore.js` نوشت، با این تفاوت که آنجا دوازده
 * قدم هدر می‌رفت و اینجا یک خزشِ چهل‌دقیقه‌ای.
 *
 * `خروج(?!ی)` عمدی است: «خروجی گرفتن» صادرات است و بی‌خطر — همان تلهٔ واقعی
 * که در `resolve.js` هم ثبت شده.
 */
const DESTRUCTIVE = [
  /حذف/,
  /پاک\s?(کردن|سازی)?/,
  /ریست/,
  /بازنشانی/,
  /خروج(?!ی)/,
  /لغو\s?عضویت/,
  /\b(delete|remove|reset|logout|log\s?out|sign\s?out|wipe|revoke|destroy|drop)\b/i,
];

/** نقش‌هایی که کلیک کردنشان معنا ندارد یا در فاز ۱ نمی‌کنیم. */
const INPUT_ROLES = new Set(['textbox', 'checkbox', 'radio', 'combobox', 'slider', 'spinbutton']);

/**
 * نقش‌هایی که خبر می‌دهند، نه کنش.
 *
 * ── چرا جدا شدند ──
 *
 * نخستین خزش تمامِ بودجه‌اش را روی «در حال بارگذاری نپی…» (نقشِ `status`) سوزاند
 * و ۵ ثانیه منتظرِ کلیک‌شدنیِ چیزی ماند که هرگز کلیک‌شدنی نیست.
 *
 * `presentation` و `heading` عمداً **در این فهرست نیستند**: نپی هر دو را
 * کلیک‌پذیر می‌سازد و در گشتِ واقعیِ کاربر هر دو زده شده‌اند. فهرستِ بلندتر
 * یعنی نیمی از اپ ندیده بماند.
 */
const NOISE_ROLES = new Set(['status', 'alert', 'progressbar', 'log', 'timer', 'marquee', 'tooltip', 'separator']);

/**
 * نقش‌هایی که **ظرف**اند، نه کنش.
 *
 * ── چرا جدا از بالایی ──
 *
 * خودِ قابِ مودال یک `[role="dialog"]` با نام است، پس در snapshot می‌آید و
 * خزنده صادقانه رویش کلیک می‌کند: پنج ثانیه انتظار برای چیزی که هیچ‌وقت
 * کنش نبوده. در خزشِ دوم، هر مودال دقیقاً یک شکستِ این‌شکلی داشت.
 *
 * `presentation` عمداً اینجا نیست: نپی متنِ کتاب را با همین نقش کلیک‌پذیر
 * می‌کند و در گشتِ واقعی کاربر بارها زده است.
 */
const CONTAINER_ROLES = new Set([
  'dialog',
  'alertdialog',
  'menu',
  'menubar',
  'listbox',
  'tablist',
  'tabpanel',
  'toolbar',
  'navigation',
  'region',
  'main',
  'group',
  'list',
  'form',
  'banner',
  'contentinfo',
  'complementary',
]);

/**
 * مسیر → الگو.
 *
 * روت‌های سورس (که `[param]` دارند) **برنده‌اند**: `[id]`ی که از کد آمده از
 * حدسِ ما دقیق‌تر است، و همین‌جاست که هضمِ سورس هزینهٔ خودش را برمی‌گرداند.
 * نخورد، قاعدهٔ `ID_LIKE` روی هر قطعه اجرا می‌شود.
 *
 * ── چرا query در الگو نیست ──
 *
 * `?q=ریاضت` و `?q=نماز` یک حالتِ ساختاری‌اند. حالتی که فقط با query فرق
 * می‌کند (مثل تب) از نمای نقش‌ها جدا می‌شود، نه از آدرس.
 */
export function routePatternOf(pathname, knownRoutes = []) {
  const raw = String(pathname || '').split('?')[0].split('#')[0] || '/';
  const path = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
  const parts = path.split('/').filter(Boolean);

  for (const known of knownRoutes) {
    if (matchesKnown(parts, String(known || ''))) return normalizeKnown(known);
  }

  if (!parts.length) return '/';
  return '/' + parts.map((part) => (ID_LIKE.some((rx) => rx.test(part)) ? '[id]' : part)).join('/');
}

function normalizeKnown(known) {
  const trimmed = String(known).split('?')[0];
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed;
}

function matchesKnown(parts, known) {
  const knownParts = normalizeKnown(known).split('/').filter(Boolean);
  if (knownParts.length !== parts.length) return false;
  return knownParts.every((segment, index) =>
    /^\[.+\]$/.test(segment) ? true : segment === parts[index]
  );
}

/**
 * نمای نقش‌ها — `button:12,link:4`.
 *
 * **بی هیچ متنی.** نامِ عناصرِ یک صفحهٔ محتوا خودِ محتواست؛ در گشتِ واقعیِ نپی
 * یک `role: presentation` با ۸۰ نویسه متنِ کتاب ثبت شد. هر متنی که وارد هویت
 * شود، هر یادداشت را یک گرهِ تازه می‌کند و نقشه همان فهرستِ داده‌ای می‌شود که
 * نمی‌خواستیم.
 */
export function profileOf(items = []) {
  const counts = new Map();
  for (const item of items) {
    const role = item.role || 'other';
    counts.set(role, (counts.get(role) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([role, count]) => `${role}:${bucket(count)}`)
    .join(',');
}

/**
 * شمارشِ سطل‌بندی‌شده — نه عددِ دقیق.
 *
 * ── چرا عددِ دقیق کار نکرد ──
 *
 * خزشِ واقعی روی نپی مدام «حالتِ تازه» می‌ساخت: همان `/contents` یک بار ۱۸
 * دکمه داشت و بار بعد ۲۰ (یک toast، یک آیتمِ تازه در فهرست). هویتِ تازه یعنی
 * مسیرِ ذخیره‌شده دیگر به آن گره نمی‌رسد، و نتیجه‌اش زنجیره‌ای از «مسیر
 * شکسته» بود که کلِ صف را خالی کرد: نقشهٔ چهار گره‌ای از اپی با دهها صفحه.
 *
 * سطل یعنی نوسانِ کوچک هویت را عوض نمی‌کند، ولی تفاوتِ **مرتبه‌ای** هنوز
 * می‌کند — و تفاوتِ مرتبه‌ای همان است که «صفحهٔ دیگری» معنی می‌دهد.
 */
function bucket(count) {
  if (count <= 2) return String(count);
  if (count <= 4) return '3-4';
  if (count <= 8) return '5-8';
  if (count <= 16) return '9-16';
  if (count <= 32) return '17-32';
  return '33+';
}

export function stateIdOf({ route = '', view = '', profile = '' } = {}) {
  return hashSignature(`${route}|${view}|${profile}`);
}

/** کلیدِ یک کنش — توصیفش، نرمال‌شده. دو بازدید باید یک کلید بدهند. */
export function actionKeyOf(descriptor) {
  if (!descriptor) return '';
  const ordered = {};
  for (const key of ['testid', 'role', 'name', 'label', 'placeholder', 'text', 'nth']) {
    if (descriptor[key] !== undefined) ordered[key] = descriptor[key];
  }
  return hashSignature(JSON.stringify(ordered));
}

/**
 * دسته‌بندیِ بی‌مدل.
 *
 * فاز ۲ این را با سورس و یک فراخوانیِ کش‌شده دقیق می‌کند؛ ولی پیش از هر
 * مدلی، دو دسته باید همین‌جا معلوم شوند چون **ایمنی‌اند نه کیفیت**:
 * برگشت‌ناپذیر، و ورودی.
 */
export function classifyAction({ role, name, label, placeholder } = {}) {
  const text = `${name || ''} ${label || ''} ${placeholder || ''}`;
  if (DESTRUCTIVE.some((rx) => rx.test(text))) return 'destructive';
  if (NOISE_ROLES.has(role) || CONTAINER_ROLES.has(role)) return 'noise';
  if (INPUT_ROLES.has(role)) return 'input';
  if (role === 'link') return 'nav';
  return 'unknown';
}

/**
 * snapshot → فهرستِ کنش‌ها.
 *
 * `descriptorFor` همان چیزی است که `do:` و ضبط‌کنندهٔ گشت می‌سازند — عمداً
 * همان، وگرنه یالِ نقشه به عنصری اشاره می‌کرد که کش هرگز پیدایش نمی‌کند.
 *
 * عنصرِ `disabled` کنش نیست: کلیکش timeout می‌خورد و یک یالِ دروغ می‌سازد.
 */
export function actionsFrom(snapshot) {
  const items = snapshot?.items || [];
  const actions = [];
  for (const item of items) {
    if (item.disabled) continue;

    /**
     * عنصرِ پشتِ مودال، کنشِ **این** حالت نیست.
     *
     * دیده می‌شود ولی کلیک به آن نمی‌رسد. نگه داشتنش دو خسارت داشت که هر دو
     * در نخستین خزش دیده شدند: ۲۰ کلیک از ۳۸ با timeoutِ ۵ ثانیه‌ای افتاد،
     * و همان‌ها «امتحان‌شده» علامت خوردند پس هیچ‌وقت دوباره امتحان نشدند.
     *
     * حذف است نه علامت، چون وقتی مودال بسته شود حالتِ دیگری است و فهرستِ
     * کنشِ خودش را دارد.
     */
    if (item.blocked) continue;
    const descriptor = descriptorFor(item, items);
    if (!descriptor) continue;
    const key = actionKeyOf(descriptor);
    if (!key || actions.some((action) => action.key === key)) continue;
    actions.push({
      key,
      descriptor,
      label: String(item.name || item.label || item.placeholder || item.testid || '').slice(0, 80),
      role: item.role || '',
      kind: classifyAction(item),
      by: 'rule',
    });
  }
  return actions;
}

/**
 * کدام کنش‌ها امتحان شوند — سه نمونه از هر **خانوادهٔ پرجمعیت**، نه همه.
 *
 * صفحه‌ای با صد پیوندِ یادداشت، صد کنش دارد که همه یک چیز را اثبات می‌کنند.
 * سه نمونه می‌گوید «این خانواده کار می‌کند» بی‌آنکه بودجه را بخورد. و سه، نه
 * یک: اولین ردیف ممکن است ردیفِ خاصی باشد (تنها ردیفِ بی‌داده، یا سرصفحه).
 *
 * ── چرا «پرجمعیت» شرط است ──
 *
 * نسخهٔ اول سقف را روی **هر** نقش می‌گذاشت، و نخستین خزشِ واقعی نشان داد که
 * غلط است: صفحهٔ ورودِ نپی ۲۲ دکمه دارد که هرکدام کارِ دیگری می‌کنند، و از
 * ۲۲ تا فقط ۳ تا امتحان شد. `role` وقتی نشانهٔ «خانواده» است که جمعیت داشته
 * باشد؛ پنج دکمهٔ متفاوت خانواده نیستند، صد پیوندِ یک فهرست هستند.
 *
 * و آستانه عمداً نزدیکِ سقفِ گره است (۲۰ در برابر ۲۵)، نه کمتر: کارِ این
 * قاعده فقط جلوگیری از این است که **یک** فهرست کلِ بودجهٔ گره را بخورد.
 * بقیهٔ محدودسازی کارِ `max` است. با آستانهٔ ۸، `/contents` نپی — که ۱۸ دکمهٔ
 * متفاوت دارد — سه‌تایی خزیده شد و نقشه پوچ درآمد.
 *
 * کنشی که قبلاً امتحان شده همیشه در سهمیه می‌ماند، وگرنه نقشه هر بازدید
 * نمونهٔ دیگری می‌گرفت و هیچ‌وقت تمام نمی‌شد.
 */
export function sampleActions(actions = [], { perRole = 3, family = 20, max = 25 } = {}) {
  const eligible = (action) => action.kind === 'unknown' || action.kind === 'nav';

  const population = new Map();
  for (const action of actions) {
    if (!eligible(action)) continue;
    population.set(action.role, (population.get(action.role) || 0) + 1);
  }

  const perRoleCount = new Map();
  const sampled = new Set();
  let total = 0;

  const ordered = [...actions].sort((a, b) => Number(Boolean(b.tried)) - Number(Boolean(a.tried)));
  for (const action of ordered) {
    if (!eligible(action)) continue;
    if (total >= max) break;
    const crowded = (population.get(action.role) || 0) > family;
    const used = perRoleCount.get(action.role) || 0;
    if (crowded && used >= perRole) continue;
    perRoleCount.set(action.role, used + 1);
    total++;
    sampled.add(action.key);
  }

  return actions.map((action) => ({ ...action, sampled: sampled.has(action.key) }));
}

/**
 * دو فهرستِ کنش از دو بازدید → یک فهرست.
 *
 * اجتماع است نه جایگزینی، با `seenIn` که می‌شمارد در چند بازدید دیده شده —
 * همان «تقویت با تقاطع» که `checks/contract.js` برای قرارداد می‌کند. کنشی که
 * در همهٔ بازدیدها بوده پوستهٔ اپ است؛ کنشی که یک بار دیده شده داده است.
 *
 * و نتیجهٔ امتحان (`tried`/`to`) هرگز پاک نمی‌شود: بازدیدِ تازه دانش اضافه
 * می‌کند، کم نمی‌کند.
 */
export function mergeActions(existing = [], incoming = []) {
  const byKey = new Map(existing.map((action) => [action.key, { ...action }]));

  for (const action of incoming) {
    const previous = byKey.get(action.key);
    if (!previous) {
      byKey.set(action.key, { ...action, seenIn: 1 });
      continue;
    }
    byKey.set(action.key, {
      ...previous,
      descriptor: action.descriptor,
      label: action.label || previous.label,
      role: action.role || previous.role,
      // دستِ آدم بر قاعده می‌چربد و هیچ حلقهٔ خودکاری عوضش نمی‌کند
      kind: previous.by === 'user' ? previous.kind : action.kind,
      by: previous.by === 'user' ? 'user' : previous.by || action.by,
      seenIn: (previous.seenIn || 1) + 1,
    });
  }

  return [...byKey.values()];
}
