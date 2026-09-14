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
import { listInvariants } from './invariants.js';
import { readMap } from '../map/store.js';
import { mergeActions } from '../map/state.js';

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
 * یک نما، یک پیشنهاد — نه یک پیشنهاد به ازای هر حالتِ داخلی.
 *
 * ── چرا لازم شد، و چرا فقط با خطا معلوم شد ──
 *
 * مودالِ «تنظیمات هوش مصنوعی» سه تب دارد، و هر تب برای نقشه یک حالتِ جدا
 * است (نمای نقش‌هایشان فرق می‌کند). ولی شناسهٔ پیشنهاد از `route|view`
 * ساخته می‌شود، پس هر سه یک شناسه گرفتند.
 *
 * نتیجه‌اش در رابط یک شکستِ کامل بود، نه یک ردیفِ تکراری: فهرست با
 * `{#each … (item.id)}` کلید می‌خورد و Svelte روی کلیدِ تکراری **رندر را
 * می‌شکند**. آدرس عوض می‌شد و صفحه همان قبلی می‌ماند — که از بیرون شبیه
 * «لینک کار نمی‌کند» بود.
 *
 * ادغام درست‌تر هم هست: کاربر نمی‌خواهد بداند مودال سه حالتِ داخلی دارد،
 * می‌خواهد یک سناریو برای «افزودن کتاب جدید» داشته باشد. کوتاه‌ترین مسیر
 * برنده است، چون همان مقدمهٔ سناریو می‌شود.
 */
function statesByView(map) {
  const groups = new Map();

  for (const state of map.states || []) {
    const key = `${state.route}|${state.view || ''}`;
    const previous = groups.get(key);
    if (!previous) {
      groups.set(key, state);
      continue;
    }

    const shorter = (state.path?.length ?? Infinity) < (previous.path?.length ?? Infinity);
    const merged = shorter ? { ...state } : { ...previous };
    // کنش‌های همهٔ حالت‌های هم‌نما، یک‌جا: تبِ دوم هم چیزی برای گفتن دارد
    merged.actions = mergeActions(previous.actions || [], state.actions || []);
    groups.set(key, merged);
  }

  return [...groups.values()];
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

  for (const state of statesByView(map)) {
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
      evidence:
        `${actions.length} کنش، ${tried} امتحان‌شده · ${state.path?.length || 0} قدم تا اینجا` +
        // «از کجا آمده» همان‌قدر لازم است که خودِ پیشنهاد: بی آن، کاربر
        // نمی‌داند این ردیف حاصلِ کدام خزش است و چقدر تازه
        (map.updatedAt ? ` · از خزشِ ${map.updatedAt.slice(0, 10)}` : ''),
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
/**
 * ستون‌هایی که کاربر پرشان می‌کند، در برابر ستون‌هایی که ماشین پر می‌کند.
 *
 * ── چرا این تفکیک لازم بود ──
 *
 * روی نپی ۱۴۹ ناوردای `not-null` هست و بیشترشان `id` و `created_at` و
 * `*_hash`اند — چیزهایی که هیچ فرمی از کاربر نمی‌پرسد. پیشنهاد دادن برای
 * آن‌ها یعنی صد و چهل ردیفِ بی‌معنا که صفحهٔ «چه باید آزمود» را دفن می‌کند و
 * چهارده تای مفید را با خودش می‌برد.
 */
const MACHINE_COLUMN = /^(id|.*_id|.*_hash|.*_at|created|updated|deleted|rowid|uuid|seq|order|position|version|revision|checksum|salt|iv|nonce)$/i;

/**
 * چیزهایی که آدم واقعاً در یک فرم می‌نویسد.
 *
 * عمداً کوتاه است. بلند کردنش یعنی دوباره همه‌چیز «کاربری» شود و رتبه‌بندی
 * بی‌اثر — همان اتفاقی که با فهرستِ منفی افتاد.
 */
const USER_FACING = /^(e?mail|name|title|slug|username|user_?name|phone|mobile|code|label|nickname|handle)$/i;

/**
 * ناوردا → پیشنهادِ سناریو.
 *
 * ── چرا این جهت، در حالی که ناوردا از قبل چک می‌شود ──
 *
 * `checks/invariant.js` همین قاعده‌ها را به‌شکل SQL روی دیتابیس می‌سنجد —
 * ولی **پس از** اینکه تخطی رخ داده. این جهت برعکس است: سناریویی که
 * **تلاش می‌کند** تخطی کند، از راه رابط. اولی می‌گوید «خراب شد»، دومی
 * می‌پرسد «آیا اصلاً می‌شود خرابش کرد؟».
 *
 * ── و چرا هیچ فراخوانیِ مدلی ندارد ──
 *
 * ناوردا از `CREATE TABLE` درآمده و جمله‌اش از قبل فارسی نوشته شده. آنچه
 * اینجا ساخته می‌شود فقط **متنِ خواسته** است؛ مدل وقتی می‌آید که کاربر
 * «بساز» بزند — مثل هر پیشنهادِ دیگری.
 */
function fromInvariants(target, { haystacks }) {
  /**
   * `mode: 'off'` اینجا معنای دیگری دارد.
   *
   * ── چرا فیلترِ اولیه غلط بود ──
   *
   * اول `mode !== 'off'` گذاشتیم و صفر پیشنهادِ «فرمِ خالی» درآمد. علتش را
   * که دنبال کردیم: هر ۱۴۹ ناوردای `not-null` پیش‌فرض `off`اند، و درست هم
   * هست — به‌عنوان **پرس‌وجوی SQL** بی‌معنا هستند، چون خودِ دیتابیس
   * اجبارشان می‌کند و هیچ‌وقت نقض نمی‌شوند.
   *
   * ولی به‌عنوان **ایدهٔ آزمون** دقیقاً همان‌ها جالب‌اند: آیا فرم می‌گذارد
   * فیلدِ اجباری خالی برود و خطای خامِ دیتابیس بالا بیاید؟ «این چک را اجرا
   * نکن» با «این فکت بی‌ارزش است» یکی نیست.
   *
   * پس فقط چیزی کنار می‌رود که **آدم** با دلیل خاموشش کرده باشد.
   */
  const all = listInvariants(target).filter((item) => !item.why);
  const out = [];

  /* ── یکتایی: هر کدام یک جریانِ کاربریِ واقعی است ── */
  for (const item of all.filter((one) => one.kind === 'unique')) {
    const columns = (item.columns || []).join('، ');
    if (!item.table || !columns) continue;
    if (mentionedIn(haystacks, [item.table, ...(item.columns || [])])) continue;

    out.push({
      id: idOf('invariant', item.id),
      kind: 'invariant',
      // جنسِ آزمون، صریح — نه حدس از روی عنوان
      shape: 'unique',
      title: `تکراری بودنِ «${columns}» آزموده نمی‌شود`,
      why: item.statement,
      evidence: `از ${item.from || 'schema'} · by: ${item.by}`,
      routes: [],
      columns: item.columns || [],
      text:
        `از راه رابط، دو بار چیزی در «${item.table}» بساز که «${columns}» یکسان داشته باشند.\n` +
        `بارِ دوم باید **رد شود** و پیامِ روشنی به کاربر بدهد؛ نه خطای خام، نه سکوت.\n` +
        `اگر ساخته شد، قاعده‌ای که در schema نوشته شده از راه رابط شکسته است.`,
    });
  }

  /**
   * اجباری بودن: یک پیشنهاد به‌ازای **جدول**، نه به‌ازای ستون.
   *
   * «عنوان نباید خالی باشد» و «متن نباید خالی باشد» یک آزمونند: فرم را
   * خالی بفرست. جدا کردنشان یعنی پنج ردیف برای یک کلیک.
   */
  const byTable = new Map();
  for (const item of all.filter((one) => one.kind === 'not-null')) {
    const human = (item.columns || []).filter((column) => !MACHINE_COLUMN.test(column));
    if (!human.length || !item.table) continue;
    const list = byTable.get(item.table) || [];
    for (const column of human) if (!list.includes(column)) list.push(column);
    byTable.set(item.table, list);
  }

  for (const [table, columns] of byTable) {
    if (mentionedIn(haystacks, [table, ...columns])) continue;
    out.push({
      id: idOf('invariant', `not-null:${table}`),
      kind: 'invariant',
      shape: 'required',
      title: `فرمِ خالیِ «${table}» آزموده نمی‌شود`,
      why: `این ستون‌ها در schema اجباری‌اند: ${columns.join('، ')}`,
      evidence: `از schema · ${columns.length} ستونِ اجباری`,
      routes: [],
      columns,
      text:
        `فرمی که «${table}» می‌سازد را پیدا کن و **خالی** بفرست.\n` +
        `باید جلویش گرفته شود و بگوید کدام فیلد لازم است.\n` +
        `بعد همان را با فاصله‌های خالی («   ») پر کن و دوباره بفرست.`,
    });
  }

  /**
   * ترتیب: آن‌هایی که **کاربر** می‌تواند بشکندشان، اول.
   *
   * ── چرا ──
   *
   * `UNIQUE(email)` یک جریانِ واقعی است: دو بار ثبت‌نام. ولی
   * `UNIQUE(user_id, generation, chunk_index)` ماشینِ همگام‌سازی است و هیچ
   * فرمی نمی‌سازدش. هر دو در schema یکسان‌اند و برای آدم اصلاً یکی نیستند.
   *
   * حذف نمی‌شوند، فقط عقب می‌روند: روزی ممکن است کسی دقیقاً همان را بخواهد.
   */
  /**
   * رتبه‌بندی با فهرستِ **مثبت**، نه با حذفِ ماشینی‌ها.
   *
   * ── چرا نسخهٔ اول کار نکرد ──
   *
   * اول «هر ستونی که ماشینی نیست، انسانی است» گرفتیم. نتیجه‌اش وارونه شد:
   * `UNIQUE(user_id, generation, chunk_index)` — ماشینِ همگام‌سازی — رتبهٔ
   * اول گرفت چون «generation» و «chunk_index» در فهرستِ ماشینی نبودند، و
   * `UNIQUE(email_hash)` ته فهرست افتاد چون به `_hash` ختم می‌شد.
   *
   * فهرستِ مثبت پیش‌بینی‌پذیرتر است: می‌دانیم آدم چه چیزهایی را در فرم
   * می‌نویسد، و نمی‌دانیم چند اسمِ داخلیِ تازه فردا ساخته می‌شود.
   */
  const score = (proposal) => {
    const columns = proposal.columns || [];
    const facing = columns.filter((column) => USER_FACING.test(String(column).replace(/_(hash|id)$/i, ''))).length;
    // هر ستونِ اضافه یعنی کلیدِ ترکیبی، و کلیدِ ترکیبی معمولاً دامنه‌بندی است نه قاعدهٔ کاربری
    return facing * 10 - columns.length;
  };
  out.sort((a, b) => score(b) - score(a));

  /**
   * سقف — و سقفِ **هر جنس** جدا.
   *
   * ── چرا نه یک سقفِ کلی ──
   *
   * روی نپی ۱۴ ناوردای یکتایی هست و همه‌شان امتیازشان از گروه‌های
   * «اجباری‌بودن» بالاتر بود. با یک سقفِ دوازده‌تایی، هر دوازده ردیف یک جنس
   * می‌شدند و «فرمِ خالی بفرست» — که آزمونِ کاملاً متفاوتی است — هیچ‌وقت
   * پیشنهاد نمی‌شد.
   *
   * و کلاً سقف لازم است: این‌ها ارزان تولید می‌شوند و گران خوانده می‌شوند.
   * سی ردیفِ هم‌شکل، پیشنهادهای نقشه را هم با خودش دفن می‌کند.
   */
  const pick = (shape, count) => out.filter((one) => one.shape === shape).slice(0, count);
  return [...pick('unique', 8), ...pick('required', 4)];
}

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

  /* ── ۷. قاعده‌ای که schema گفته و هیچ سناریویی تلاش نمی‌کند بشکندش ── */
  for (const proposal of fromInvariants(target, { haystacks })) out.push(proposal);

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
