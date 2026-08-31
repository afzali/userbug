/**
 * «این اجرا چه چیزی به شناخت اضافه می‌کند؟»
 *
 * ── چرا این فایل هستهٔ «به مرور بهتر می‌شود» است ──
 *
 * بخش‌های دیگر شناخت را **می‌سازند**: هضم سورس یک بار، گشت یک بار، پرسش‌ها
 * یک بار. این یکی تنها جایی است که شناخت **بی‌آنکه کسی کاری کند** رشد
 * می‌کند — از هر اجرایی که به‌هر‌حال دارد انجام می‌شود.
 *
 * ── چرا هیچ‌کدام مدل نمی‌خواهد ──
 *
 * سه چیزی که اینجا استخراج می‌شود، همه فکت‌اند: کجا رفتیم، کدام صفحه عوض
 * شده، چند بار کش heal خورد. اگر مدل لازم داشتند، هزینهٔ هر اجرا بالا می‌رفت
 * و کسی روشنش نمی‌گذاشت.
 *
 * ── چرا هیچ‌چیزِ `by: user` عوض نمی‌شود ──
 *
 * قاعدهٔ آخرِ بخش ۹ طرح: خودکارها می‌توانند اضافه کنند، علامت بزنند، و
 * پیشنهاد بدهند. عوض کردنِ چیزی که آدم گفته، فقط با خودِ آدم. `mergeIntoDossier`
 * این را با اعتماد اعمال می‌کند و اینجا هم `by: 'run'` پایین‌تر از هر منبعِ
 * انسانی است.
 */
import { loadCache } from '../steps/cache.js';
import { mergeIntoDossier } from './merge.js';
import { markStale, readDossier, writeDossier } from './store.js';
import { normalizeRoutePath } from './schema.js';

/**
 * آستانهٔ heal که یعنی «این گوشهٔ رابط ناپایدار است».
 *
 * `healCount` از روزِ اول در `_learned/*.json` نوشته می‌شود و **هیچ‌کس
 * نمی‌خواندش**. عددِ ۳ محافظه‌کارانه است: یک heal یعنی اپ یک بار عوض شد، دو
 * تا هنوز تصادف است، سه تا یعنی الگو.
 */
const HEAL_THRESHOLD = 3;

/** مسیرهای یکتایی که در این اجرا دیده شدند. */
function routesFrom(events) {
  const seen = new Map();
  for (const event of events) {
    const path = normalizeRoutePath(event.route || '');
    if (!path) continue;
    seen.set(path, (seen.get(path) || 0) + 1);
  }
  return [...seen.keys()];
}

/**
 * صفحه‌هایی که کشِ سناریوهایشان مدام heal می‌خورد.
 *
 * ── چرا این سیگنال از خودش مهم‌تر است ──
 *
 * کامنتِ `cache.js` از روزِ اول می‌گوید «نرخ heal یک سیگنال است، نه یک عددِ
 * بی‌مصرف: قدمی که مدام heal می‌خورد یعنی آن گوشهٔ رابط ناپایدار است». تا
 * امروز کسی مصرفش نمی‌کرد. حالا صفحه‌ای که آنجا نشسته `stale` می‌گیرد و در
 * رابط دیده می‌شود.
 */
function unstableIntents(target, scenarioIds) {
  const out = [];
  for (const id of scenarioIds) {
    const cache = loadCache(target, id);
    for (const [intent, entry] of Object.entries(cache.steps || {})) {
      if ((entry.healCount || 0) >= HEAL_THRESHOLD) out.push({ intent, healCount: entry.healCount, scenario: id });
    }
  }
  return out;
}

/**
 * یک اجرا → افزوده‌های شناخت.
 *
 * ── چرا شکستش اجرا را نمی‌شکند ──
 *
 * این در `finalizeRun` صدا زده می‌شود، بعد از اینکه گزارش و JUnit ساخته
 * شده‌اند. شکستنِ اجرا به‌خاطر نتوانستنِ نوشتنِ شناخت یعنی نتیجه‌ای که واقعاً
 * گرفته شده از دست برود — و آن نتیجه گران‌تر از این افزوده است.
 *
 * @param {object} o
 * @param {string} o.target کلید پروژه
 * @param {object[]} o.events رخدادهای اجرا
 * @param {string} o.runId
 * @returns {Promise<{routes: number, stale: number, unstable: object[]}>}
 */
export async function absorbRun({ target, events = [], runId = '' }) {
  const result = { routes: 0, stale: 0, unstable: [] };
  if (!target) return result;

  const dossier = readDossier(target);
  const known = new Set((dossier.routes || []).map((route) => route.path));

  /**
   * فقط مسیرهای **تازه**.
   *
   * فرستادنِ همهٔ مسیرها به `mergeIntoDossier` بی‌خطر است (اعتماد نگهشان
   * می‌دارد) ولی تاریخچه را از سطرهای بی‌معنا پر می‌کند: هر اجرا یک
   * «update» برای هر روتی که دیده شده.
   */
  const fresh = routesFrom(events).filter((path) => !known.has(path));

  if (fresh.length) {
    const merged = mergeIntoDossier(dossier, {
      routes: fresh.map((path) => ({ path, by: 'run' })),
      /**
       * هر مسیرِ تازه یک پرسش می‌سازد.
       *
       * مسیری که ابزار خودش پیدا کرده، `purpose` ندارد — و بدون آن، در
       * prompt فقط یک آدرس است. پرسیدن ارزان‌تر از حدس زدن است.
       */
      openQuestions: fresh.map((path) => ({
        q: `صفحهٔ ${path} برای چیست؟`,
        field: '',
        askedAt: new Date().toISOString(),
      })),
    });

    await writeDossier(target, merged.dossier, { by: 'run', why: `اجرای ${runId}`, ref: runId });
    result.routes = fresh.length;
  }

  const scenarioIds = [...new Set(events.map((event) => event.scenario).filter(Boolean))];
  result.unstable = unstableIntents(target, scenarioIds);

  /**
   * کهنگی از **امضای صفحه** می‌آید، نه از نرخ heal.
   *
   * heal می‌گوید «چیزی عوض شده»، ولی نمی‌گوید کدام صفحه. امضای صفحه دقیق
   * است. پس heal فقط گزارش می‌شود و کهنگی از مسیرِ خودش می‌آید — وگرنه
   * صفحه‌ای که سناریویش ناپایدار است ولی خودش سالم است هم کهنه علامت
   * می‌خورد.
   */
  for (const event of events) {
    if (event.kind !== 'page-signature' || !event.route || !event.signature) continue;
    const marked = await markStale(target, event.route, {
      signature: event.signature,
      why: `امضای صفحه در اجرای ${runId} عوض شد`,
    }).catch(() => null);
    if (marked) result.stale++;
  }

  return result;
}
