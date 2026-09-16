/**
 * یک نقشه — از هر سه منبعی که «جاهای اپ» را می‌شناسند.
 *
 * ── چرا این فایل لازم شد ──
 *
 * کاربر پرسید: «آیا گشت خودش یک نوع نقشه نیست؟»
 *
 * بود، و ما دو انبار داشتیم که هر دو یک چیز را ثبت می‌کردند:
 *
 *   `knowledge/<t>/pages/*.json`  گشت و اجرای سناریو می‌نویسندش:
 *                                 عنوان، هدفِ نوشتهٔ آدم، و **قرارداد**
 *                                 (عناصری که در چند بازدید پایدار مانده‌اند)
 *
 *   `knowledge/<t>/map.json`      خزش می‌نویسدش: نما، کنش‌ها، و **مسیرِ
 *                                 رسیدن** (که بازپخش‌شدنی است)
 *
 * و یک منبعِ سوم که اصلاً گره نمی‌ساخت: روت‌هایی که سورس می‌شناسد و هیچ‌کدامِ
 * آن دو ندیده‌اند.
 *
 * ── چرا ادغام در **خواندن** است، نه در نوشتن ──
 *
 * این دو فایل دو **وجه** از یک گره‌اند، نه دو نسخهٔ رقیب: یکی می‌گوید «اینجا
 * چه چیزی همیشه هست»، آن یکی «چطور به اینجا می‌رسم و چه می‌شود کلیک کرد».
 * یکی کردنشان در یک فایل یعنی هر نویسنده باید وجهِ دیگر را هم بفهمد.
 *
 * ولی **خواندن** باید یکی باشد، وگرنه هر صفحه‌ای که «اپ چه دارد» را نشان
 * می‌دهد، نصفِ جواب را می‌دهد — که دقیقاً وضعِ امروز بود: صفحهٔ نقشه
 * گره‌های گشت را نداشت و صفحهٔ شناخت کنش‌ها را.
 */
import { listPages, readDossier } from '../knowledge/store.js';
import { readEndpoints } from '../knowledge/endpoints.js';
import { readMap } from './store.js';

function safely(fn, fallback) {
  try {
    return fn() ?? fallback;
  } catch {
    return fallback;
  }
}

/** کلیدِ یکی بودن: یک گره = یک روت + یک نما. */
export function nodeKey(route, view = '') {
  return `${String(route || '').trim()}|${String(view || '').trim()}`;
}

/**
 * همهٔ جاهای شناخته‌شدهٔ یک هدف، در یک فهرست.
 *
 * هر گره می‌گوید **از کجا شناخته شده**:
 *   `crawl`  خزش رفته و کنش‌هایش را دیده
 *   `tour`   آدم آنجا بوده (یا سناریویی رد شده) و قرارداد دارد
 *   `source` فقط در سورس هست؛ هیچ‌کس هنوز نرفته
 *
 * ترتیب عمدی است: `by` از ارزان به گران نیست، از **کم‌خبر به پرخبر** است.
 * گرهی که هم خزیده شده هم گشت، `crawl` می‌ماند ولی قراردادش را هم دارد.
 */
export function unifiedStates(target) {
  const nodes = new Map();

  const touch = (route, view, patch) => {
    const key = nodeKey(route, view);
    const previous = nodes.get(key) || {
      key,
      route,
      view,
      title: '',
      purpose: '',
      by: [],
      actions: 0,
      tried: 0,
      contract: 0,
      path: null,
      stale: false,
      shot: '',
    };
    nodes.set(key, { ...previous, ...patch, by: [...new Set([...previous.by, ...(patch.by || [])])] });
    return nodes.get(key);
  };

  /* ── خزش ── */
  for (const state of safely(() => readMap(target).states, []) || []) {
    const actions = state.actions || [];
    touch(state.route, state.view || '', {
      by: ['crawl'],
      title: state.title || '',
      actions: actions.length,
      tried: actions.filter((one) => one.tried).length,
      path: state.path || [],
      id: state.id,
      sample: state.sample || '',
    });
  }

  /* ── گشت و اجرای سناریو ── */
  for (const page of safely(() => listPages(target), [])) {
    touch(page.path, page.view || '', {
      by: ['tour'],
      title: page.title || '',
      purpose: page.purpose || '',
      contract: page.contract?.must?.length || 0,
      contractMode: page.contract?.mode || 'watch',
      seenIn: page.contract?.seenIn || 0,
      stale: Boolean(page.stale),
      shot: page.shot || '',
    });
  }

  /* ── سورس: جایی که هست و هیچ‌کس نرفته ── */
  const known = new Set([...nodes.values()].map((one) => one.route));

  /**
   * دو منبع، دو شکلِ داده — و یک بارِ `.path` روی هر دو.
   *
   * ── باگی که ستونِ «فقط در سورس» را همیشه صفر نگه داشت ──
   *
   * `dossier.routes` آرایه‌ای از **شیء** است (`{ path, purpose }`) ولی
   * `endpoints.routes` آرایه‌ای از **رشته** (`'/login'`). هر دو `.map(one =>
   * one.path)` می‌خوردند، پس نیمهٔ دوم `undefined` می‌شد و `filter(Boolean)`
   * بی‌صدا دورش می‌ریخت.
   *
   * نتیجه: پروژه‌ای که ۱۱ روت از سورس داشت، در «جاهای اپ» می‌دید «۰ فقط در
   * سورس» — یعنی سومین منبعِ همان نقشهٔ یکپارچه‌ای که گام ۴ ساخت، مرده بود و
   * هیچ خطایی هم نمی‌داد. خروجیِ صفر همیشه شبیهِ «چیزی نیست» است، نه شبیهِ
   * «خراب است».
   */
  const pathOf = (one) => (typeof one === 'string' ? one : one?.path);
  const fromSource = [
    ...safely(() => (readDossier(target).routes || []).map(pathOf), []),
    ...safely(() => (readEndpoints(target).routes || []).map(pathOf), []),
  ].filter(Boolean);

  for (const route of new Set(fromSource)) {
    if (known.has(route)) continue;
    touch(route, '', { by: ['source'] });
  }

  return [...nodes.values()].sort(
    (a, b) => a.route.localeCompare(b.route, 'fa') || a.view.localeCompare(b.view, 'fa')
  );
}

/**
 * چقدرش را واقعاً لمس کرده‌ایم؟
 *
 * ── چرا یک عدد، و چرا اینجا ──
 *
 * تا امروز دو نمرهٔ پوشش داشتیم که هیچ‌کدام کامل نبودند: `coverageOf` فقط
 * روت‌های پرونده را می‌شمرد و صفحهٔ نقشه فقط گره‌های خزش را. هر دو از
 * واقعیت خوش‌بین‌تر بودند، چون مخرجشان ناقص بود.
 */
export function coverage(states = []) {
  const count = (fn) => states.filter(fn).length;
  return {
    total: states.length,
    crawled: count((one) => one.by.includes('crawl')),
    toured: count((one) => one.by.includes('tour')),
    /** فقط در سورس دیده شده — هیچ مرورگری آنجا نرفته */
    untouched: count((one) => one.by.length === 1 && one.by[0] === 'source'),
    /** خزیده شده ولی قرارداد ندارد: نمی‌دانیم «اینجا چه چیزی همیشه هست» */
    withoutContract: count((one) => one.by.includes('crawl') && !one.contract),
    contracts: states.reduce((sum, one) => sum + (one.contract || 0), 0),
  };
}

/** برچسبِ خواندنی برای هر منبع. */
export const BY_LABEL = { crawl: 'خزش', tour: 'گشت', source: 'سورس' };
