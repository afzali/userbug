/**
 * شناخت → فهرستِ «چه چیزهایی باید آزموده شود».
 *
 * ── چرا این فایل حلقهٔ مفقود بود ──
 *
 * `absorb.js` و گشت و هضمِ سورس، شناخت را **می‌سازند**. `coverage.js` آن را
 * **می‌سنجد**. ولی هیچ‌کدام نمی‌گویند با آن چه باید کرد.
 *
 * نتیجه‌اش این بود: ابزار می‌دانست «`/login` هست و کارش ورود است» و می‌دانست
 * «حذف کتاب مخرب است»، و کاربر باز هم باید می‌نشست و از صفر فکر می‌کرد چه
 * سناریویی لازم است. یعنی همان کاری که قرار بود نکند.
 *
 * ── چرا هیچ مدلی اینجا صدا زده نمی‌شود ──
 *
 * پیدا کردنِ **شکاف** حساب است نه قضاوت: «کدام روتِ شناخته‌شده در هیچ
 * سناریویی نیامده» یک عملیات مجموعه‌ای است. مدل تازه یک قدم بعد لازم می‌شود،
 * برای نوشتنِ خودِ سناریو — و آن راه از قبل هست (`from-text.js`).
 *
 * پس هر پیشنهاد یک `text` دارد: همان جمله‌ای که اگر کاربر خودش می‌نوشت. دکمهٔ
 * «بساز» آن را به همان مسیرِ متن→YAML می‌دهد. یک مسیرِ ساخت، نه دو تا.
 *
 * ── چرا پیشنهادِ بی‌شاهد ساخته نمی‌شود ──
 *
 * هر پیشنهاد به یک بندِ واقعیِ پرونده گره خورده و `why` نقلِ همان بند است.
 * فهرستی که از هوا پر شود، همان «یافتهٔ بی‌بازتولید» است در لباس دیگر: کاربر
 * دو بار بررسی می‌کند، دو بار چیزی پیدا نمی‌کند، و بار سوم کل فهرست را
 * می‌بندد.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadScenarios } from '../scenario/load.js';
import { normalizeRoutePath } from './schema.js';
import { knowledgeDir, listPages, readDossier } from './store.js';
import { readMap } from '../map/store.js';

/**
 * پیشنهادهای ردشده — `knowledge/<کلید>/dismissed.json`.
 *
 * ── چرا لازم است ──
 *
 * فهرست از فکت ساخته می‌شود، پس اگر کاربر تصمیم بگیرد «`/sqlite` کنسولِ
 * توسعه است و آزمودن نمی‌خواهد»، دفعهٔ بعد باز همان‌جاست. فهرستی که نشود
 * کوتاهش کرد، خوانده نمی‌شود.
 *
 * ── چرا حذف نمی‌شود بلکه علامت می‌خورد ──
 *
 * `why` کاربر می‌ماند. شش ماه بعد، «چرا این آزموده نمی‌شود» پرسشی است که
 * جوابش باید جایی باشد — و آن جا همین‌جاست، نه حافظهٔ کسی.
 */
function dismissedFile(target) {
  return path.join(knowledgeDir(target), 'dismissed.json');
}

export function readDismissed(target) {
  try {
    const raw = JSON.parse(fs.readFileSync(dismissedFile(target), 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

/** رد کردن (`why` دلخواه) یا برگرداندن (`why: null`). */
export function setDismissed(target, id, why) {
  const all = readDismissed(target);
  if (why === null) delete all[id];
  else all[id] = { why: String(why || '').slice(0, 500), at: new Date().toISOString() };

  const file = dismissedFile(target);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 2) + '\n', 'utf8');
  return all;
}

/**
 * شناسهٔ پایدارِ یک پیشنهاد.
 *
 * از `kind` و کلیدِ موضوع ساخته می‌شود، نه از عنوان — چون عنوان روزی بازنویسی
 * می‌شود و آن‌وقت هر پیشنهادِ ردشده‌ای دوباره برمی‌گردد.
 */
function idOf(kind, key) {
  return `${kind}:${crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 8)}`;
}

/**
 * روت‌هایی که یک سناریو لمس می‌کند.
 *
 * از `go:` و از `expect: {url}` — دو جایی که مسیر به‌شکل صریح در YAML نوشته
 * می‌شود. عمداً کشِ `_learned` خوانده نمی‌شود: آن می‌گوید اجرا **کجا رفت**، و
 * ما می‌پرسیم سناریو **چه ادعایی دارد**. سناریویی که اتفاقی از صفحه‌ای رد شود
 * آن صفحه را نیازموده.
 */
export function routesTouchedBy(scenario) {
  const found = new Set();

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);

    for (const [key, value] of Object.entries(node)) {
      if ((key === 'go' || key === 'url') && typeof value === 'string') {
        const routePath = normalizeRoutePath(value);
        if (routePath) found.add(routePath);
      }
      visit(value);
    }
  };

  visit(scenario?.steps);
  return found;
}

/**
 * تطبیقِ روتِ پویا با روتِ مشخص.
 *
 * `/content/[id_book]` در پرونده هست ولی سناریو `/content/42` می‌نویسد. بدون
 * این، هر صفحهٔ پارامتردار همیشه «بی‌سناریو» می‌ماند و فهرست پر از شکافِ
 * دروغین می‌شود.
 */
function matches(routePath, touched) {
  if (touched.has(routePath)) return true;
  if (!routePath.includes('[') && !routePath.includes(':')) return false;

  const pattern = new RegExp(
    '^' + routePath.replace(/\[[^\]]+\]|:[A-Za-z_]\w*/g, '[^/]+').replace(/\//g, '\\/') + '$'
  );
  for (const item of touched) if (pattern.test(item)) return true;
  return false;
}

/**
 * متنِ قابل‌جست‌وجوی یک سناریو: نامش به‌اضافهٔ همهٔ برچسب‌های `as:`.
 *
 * ── چرا فقط نامِ فایل کافی نبود ──
 *
 * نخستین اجرا نُه پیشنهادِ «موجودیت» داد که چند تایشان از قبل پوشش داشتند —
 * `editor-keyboard.yml` پاراگراف را می‌سازد و از دیتابیس می‌خواند، ولی
 * نامش این را نمی‌گوید. برچسب‌های `as:` می‌گویند، چون همان‌ها هستند که در
 * گزارش هم خوانده می‌شوند.
 *
 * فهرستِ پیشنهادی که چیزهای انجام‌شده را پیشنهاد بدهد، دو بار که این اتفاق
 * بیفتد بسته می‌شود و دیگر باز نمی‌شود.
 */
function haystackOf(scenario) {
  const parts = [String(scenario.name || '')];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    for (const [key, value] of Object.entries(node)) {
      if ((key === 'as' || key === 'note' || key === 'finding') && typeof value === 'string') {
        parts.push(value);
      }
      visit(value);
    }
  };
  visit(scenario.steps);
  return parts.join(' ').toLowerCase();
}

/** آیا واژه‌ای از این فهرست در متنِ سناریویی آمده؟ نشانهٔ ضعیف، ولی بهتر از هیچ. */
function mentionedIn(haystacks, words) {
  const terms = words.filter(Boolean).map((word) => String(word).toLowerCase()).filter((word) => word.length > 2);
  if (!terms.length) return false;
  return haystacks.some((text) => terms.some((word) => text.includes(word)));
}

/**
 * پیشنهاد از روی نقشه.
 *
 * ── چرا نقشه چیزی می‌گوید که پرونده نمی‌گوید ──
 *
 * `routes` در پرونده فقط **آدرس** دارد. نقشه حالت دارد: مودالِ «افزودن کتاب
 * جدید» و کشوی «همه نویسندگان» هیچ آدرسی ندارند، پس تا امروز در هیچ
 * پیشنهادی نمی‌آمدند — و همان‌ها بودند که کسی تست نداشت.
 *
 * ── و چرا این پیشنهاد از بقیه اجراپذیرتر است ──
 *
 * `preamble` مسیرِ واقعیِ رسیدن به آن حالت است، همان‌طور که خزنده رفت. بقیهٔ
 * پیشنهادها متن می‌دهند و مدل باید مسیر را حدس بزند؛ این یکی مسیر را
 * **می‌داند**. حدس زدنِ چیزی که یک بار قطعی دیده شده، همان «پول دادن برای
 * چیزی که readdir جواب می‌دهد» است، یک پله بالاتر.
 */
function fromMap(target, { touched, haystacks }) {
  const map = readMap(target);
  const out = [];

  for (const state of map.states || []) {
    // حالتِ بی‌نما همان صفحه است و بند ۱ سراغش رفته
    if (!state.view) continue;

    /**
     * فقط مودال، نه منو و کشو.
     *
     * ── چرا فهرست کوتاه می‌ماند ──
     *
     * نقشهٔ نپی پنج کشوی فیلتر و یک منوی کاربر دارد که نامشان از متنِ
     * دکمه‌شان می‌آید — یکی‌شان ایمیلِ کاربرِ همان اجرا بود. پیشنهادی به نامِ
     * «منوی U ub-620883b2@userbug.test» هم بی‌معناست هم ناپایدار.
     *
     * مودال جایی است که کارِ کاربر انجام می‌شود؛ منو فقط راه است. و همان
     * قاعدهٔ همیشگی: فهرستی که دو بار چیزِ بی‌ربط پیشنهاد بدهد، بار سوم بسته
     * می‌شود.
     */
    if (state.viewKind && state.viewKind !== 'dialog') continue;
    if (mentionedIn(haystacks, [state.view])) continue;

    /**
     * حالتی که هیچ کنشِ امتحان‌نشده‌ای نداشته، چیزِ زیادی برای گفتن ندارد.
     *
     * ولی حالتی که ۳۹ کنش دارد و ۲ تایش امتحان شده، دقیقاً همان جایی است که
     * نه خزش رسید و نه سناریویی هست.
     */
    const actions = state.actions || [];
    const tried = actions.filter((action) => action.tried).length;

    /**
     * فقط چیزی که **مالِ خودِ این نماست**، نه آنچه پشتش دیده می‌شود.
     *
     * ── چرا لازم شد ──
     *
     * نخستین فهرستِ واقعی این متن را داد: «چیزهایی که در این نما هست: مطالب
     * مطالعه و نظر، خانه، … ، U ub-657c0be8@userbug.test کاربر سامانه».
     * هیچ‌کدام در مودال نبودند — نوارِ کناری بود که پشتِ مودال هنوز در DOM
     * است. و یکی‌شان ایمیلِ کاربرِ همان اجرا بود، که هم بی‌ربط است هم هر بار
     * عوض می‌شود.
     *
     * تفاضل با گرهِ والد (همان که یالش به اینجا رسیده) این را حل می‌کند، و
     * والد را نقشه از قبل می‌داند.
     */
    const parentId = (map.edges || []).find((edge) => edge.to === state.id)?.from;
    const parent = parentId ? (map.states || []).find((item) => item.id === parentId) : null;
    const inherited = new Set((parent?.actions || []).map((action) => action.key));

    const labels = actions
      .filter((action) => action.kind === 'unknown' || action.kind === 'nav')
      .filter((action) => !inherited.has(action.key))
      .map((action) => action.label)
      .filter(Boolean)
      .slice(0, 8);

    out.push({
      id: idOf('state', `${state.route}|${state.view}`),
      kind: 'state',
      title: `«${state.view}» آزموده نمی‌شود`,
      why: `نقشه این نما را روی ${state.route} دیده و هیچ سناریویی سراغش نمی‌رود.`,
      evidence: `${actions.length} کنش، ${tried} امتحان‌شده · ${state.path?.length || 0} قدم تا اینجا`,
      routes: [state.route],
      // مسیرِ قطعی، نه متن: مصرف‌کننده‌اش `scenarioFromText` است
      preamble: state.path || [],
      text:
        `«${state.view}» را باز کن و کارِ اصلی‌اش را تا آخر انجام بده.\n` +
        (labels.length ? `چیزهایی که در این نما هست: ${labels.join('، ')}.\n` : '') +
        'بررسی کن نتیجه واقعاً ذخیره یا اعمال شد، و بستنش چیزی را خراب نمی‌کند.',
    });
  }

  return out;
}

/**
 * پیشنهادها، از پروندهٔ شناخت.
 *
 * @param {string} target کلید پروژه
 * @returns {{proposals: object[], coveredRoutes: number, totalRoutes: number}}
 */
export function proposalsFor(target) {
  const dossier = readDossier(target);

  let scenarios = [];
  try {
    scenarios = loadScenarios(target);
  } catch {
    // سناریوی خراب نباید فهرست پیشنهادها را از کار بیندازد؛ پیشنهاد دادن
    // کاری است که دقیقاً وقتی سناریوها به‌هم‌ریخته‌اند بیشتر لازم است.
    scenarios = [];
  }

  const live = scenarios.filter((item) => item.status !== 'draft');
  const haystacks = live.map(haystackOf);
  const touched = new Set();
  for (const scenario of live) for (const routePath of routesTouchedBy(scenario)) touched.add(routePath);

  const out = [];

  /* ── ۱. صفحه‌ای که هیچ سناریویی سراغش نمی‌رود ── */
  for (const route of dossier.routes || []) {
    const routePath = route.path;
    if (!routePath || matches(routePath, touched)) continue;

    // روتی که خودِ پرونده هم نمی‌داند برای چیست، پیشنهادِ خوبی نمی‌سازد:
    // متنش می‌شود «صفحهٔ /x را بیازما» که مدل هم از آن چیزی درنمی‌آورد.
    if (!route.purpose) continue;

    out.push({
      id: idOf('route', routePath),
      kind: 'route',
      title: `صفحهٔ ${routePath} آزموده نمی‌شود`,
      why: route.purpose,
      evidence: route.sourceFile ? `از ${route.sourceFile}` : `منبع: ${route.by}`,
      routes: [routePath],
      text:
        `به عنوان کاربر وارد ${routePath} شو. ${route.purpose}\n` +
        'مسیر اصلی این صفحه را تا آخر برو و بررسی کن که چیزی نمی‌شکند.',
    });
  }

  /* ── ۲. کارِ بازگشت‌ناپذیر، بدون سناریویی که سراغش برود ── */
  for (const risk of dossier.risks || []) {
    const label = risk.label;
    if (!label || mentionedIn(haystacks, [label])) continue;

    /**
     * متن نمی‌گوید «باید تأیید بگیرد».
     *
     * نسخهٔ اول می‌گفت، و برای «خروج از حساب» بی‌معنا بود: خروج بازگشت‌ناپذیر
     * است ولی دیالوگ تأیید نمی‌خواهد. پیشنهادی که انتظارِ غلط را از پیش در
     * دهانِ سناریو بگذارد، همان «یافتهٔ اشتباه» را می‌سازد — فقط یک مرحله
     * زودتر.
     *
     * پس می‌پرسد چه می‌شود، و قضاوت را به خودِ سناریو می‌سپارد.
     */
    out.push({
      id: idOf('risk', label),
      kind: 'risk',
      title: `«${label}» آزموده نمی‌شود`,
      why: risk.why,
      evidence: `کارِ بازگشت‌ناپذیر، ثبت‌شده در شناخت (${risk.by})`,
      routes: [],
      text:
        `«${label}» را انجام بده. ${risk.why}\n` +
        'بررسی کن دقیقاً همان چیزی که باید از بین می‌رفت از بین رفته و نه بیشتر — ' +
        'دادهٔ کاربرِ دیگر، یا چیزی که انتخاب نشده بود، دست‌نخورده مانده باشد.',
    });
  }

  /* ── ۳. موجودیتی که رفت‌وبرگشتش با دیتابیس سنجیده نشده ── */
  for (const entity of dossier.entities || []) {
    const name = entity.name;
    if (!name || mentionedIn(haystacks, [name, entity.label])) continue;

    out.push({
      id: idOf('entity', name),
      kind: 'entity',
      title: `${entity.label || name}: ساخته می‌شود، ولی ذخیره‌اش سنجیده نمی‌شود`,
      why: entity.where,
      evidence: `جدول «${name}»`,
      routes: [],
      text:
        `یک ${entity.label || name} تازه بساز و ذخیره کن.\n` +
        `بعد با query از جدول ${name} بخوان و بررسی کن دقیقاً همان چیزی که وارد شد ذخیره شده.`,
    });
  }

  /* ── ۴. ورود: مسیرِ شکست، نه فقط مسیرِ موفق ── */
  const loginPath = dossier.auth?.loginPath;
  if (loginPath && !mentionedIn(haystacks, ['رمز اشتباه', 'ورود ناموفق', 'wrong password'])) {
    out.push({
      id: idOf('auth', loginPath),
      kind: 'auth',
      title: 'ورود با رمز اشتباه آزموده نمی‌شود',
      why: `صفحهٔ ورود ${loginPath} است و سناریوهای موجود فقط مسیرِ موفق را می‌روند.`,
      evidence: `auth.kind: ${dossier.auth?.kind || 'نامعلوم'}`,
      routes: [loginPath],
      text:
        `در ${loginPath} با ایمیل درست و رمز غلط وارد شو.\n` +
        'بررسی کن پیام خطای روشن می‌آید، کاربر وارد نمی‌شود، و رمز در هیچ لاگی نمی‌افتد.',
    });
  }

  /* ── ۵. صفحه‌ای که گشت دیده ولی شناختش کهنه شده ── */
  for (const page of listPages(target)) {
    if (!page.stale) continue;
    out.push({
      id: idOf('stale', page.path),
      kind: 'stale',
      title: `شناختِ ${page.path} کهنه است`,
      why: 'ساختار این صفحه از آخرین باری که دیده شده عوض شده.',
      evidence: 'از heal‌های مکررِ کش',
      routes: [page.path],
      text: `${page.path} را دوباره از اول تا آخر برو و بررسی کن چه چیزی عوض شده.`,
    });
  }

  /* ── ۶. حالتی که نقشه پیدا کرده و هیچ سناریویی سراغش نمی‌رود ── */
  for (const proposal of fromMap(target, { touched, haystacks })) out.push(proposal);

  /**
   * ردشده‌ها حذف نمی‌شوند، علامت می‌خورند.
   *
   * فیلترشان کارِ رابط است. اگر همین‌جا حذف می‌شدند، کاربر راهی نداشت
   * ببیند چه چیزی را رد کرده و برش گرداند — و تصمیمِ نامرئی، تصمیمی است که
   * هیچ‌وقت بازبینی نمی‌شود.
   */
  const dismissed = readDismissed(target);
  for (const item of out) {
    if (dismissed[item.id]) item.dismissed = dismissed[item.id];
  }

  return {
    proposals: out,
    open: out.filter((item) => !item.dismissed).length,
    coveredRoutes: touched.size,
    totalRoutes: (dossier.routes || []).length,
  };
}
