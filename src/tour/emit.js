/**
 * گشت → چهار خروجی.
 *
 *   ۱. صفحه‌ها      `knowledge/<کلید>/pages/*.json` با جملهٔ خودِ کاربر
 *   ۲. تست          `<پروژه>/tests/userbug/گشت-*.spec.js`، قابل اجرا
 *   ۳. کشِ آموخته   `scenarios/<کلید>/_learned/*.json` با `resolvedBy: human`
 *   ۴. پرونده       روت‌های تازه، فایل‌ها، و آخرین گشت
 *
 * ── سومی همان چیزی است که هزینهٔ گشت را برمی‌گرداند ──
 *
 * کش امروز با **پولِ مدل** پر می‌شود: هر قدمِ زبان‌طبیعی یک بار حل می‌شود و
 * بعد رایگان تکرار. گشت همان کش را با **وقتِ آدم** پر می‌کند — که یک بار
 * داده می‌شود و دیگر خواسته نمی‌شود.
 *
 * کاربر یک بار روی «ورود» کلیک کرده و ما دیده‌ایم کدام عنصر بوده. از آن به
 * بعد `do: دکمهٔ ورود را بزن` بدون هیچ فراخوانی حل می‌شود، با
 * `resolvedBy: "human"` — پراعتمادترین منبعی که این کش می‌تواند داشته باشد.
 *
 * ── چرا تستِ تازه ادعایی ندارد ──
 *
 * ضبطِ کلیک، تستِ خوبی نمی‌سازد. کاربر مسیرِ اشتباه هم رفته، دوبار کلیک
 * کرده، و جایی که مهم بوده ادعا ننوشته. پس فایل فقط قدم‌ها را دارد و
 * سرصفحه‌اش می‌گوید قدمِ بعد `userbug expect` است — همان دروازهٔ بازبینیِ
 * آدم که `author` هم دارد.
 */
import path from 'node:path';

import { getEntry, loadCache, putEntry, saveCache } from '../steps/cache.js';
import { mergeIntoDossier } from '../knowledge/merge.js';
import { readDossier, writeDossier, writePage } from '../knowledge/store.js';


/**
 * قدم‌های ضبط‌شده → کشِ آموخته.
 *
 * فقط قدم‌هایی که نیتِ خوانا دارند (کلیک، تیک، پر کردن). `press` نیت ندارد و
 * `upload` به فایل بند است.
 *
 * ── چرا `resolvedBy: 'human'` ──
 *
 * کش برای هر مدخل می‌نویسد چه کسی حلش کرده. مدخلی که آدم دیده و انجام داده،
 * از مدخلی که مدلِ ارزان حدس زده معتبرتر است — و وقتی روزی امضای صفحه عوض
 * شود و `heal` لازم باشد، این تفاوت باید دیده شود.
 */
export function seedCache({ target, scenarioId, steps }) {
  const cache = loadCache(target, scenarioId);
  let added = 0;

  for (const entry of steps) {
    if (!entry.intent || !entry.target) continue;
    if (!['click', 'check', 'fill'].includes(entry.action)) continue;
    // مدخلِ موجود دست‌نخورده می‌ماند: کش با پول پر شده و بازنویسی‌اش رایگان نیست
    if (getEntry(cache, entry.intent)) continue;

    putEntry(cache, entry.intent, {
      intent: entry.intent,
      action: entry.action,
      target: entry.target,
      resolvedBy: 'human',
      healCount: 0,
      firstLearned: new Date().toISOString(),
      lastVerified: new Date().toISOString(),
    });
    added++;
  }

  if (added) saveCache(target, scenarioId, cache);
  return added;
}

function slugify(value) {
  return (
    String(value)
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'gasht'
  );
}

/**
 * همه‌چیزِ یک گشت را بنویس.
 *
 * ── چرا سناریو نوشته می‌شود ولی بازپخش نه ──
 *
 * بازپخشِ فوری کارِ درستی است («پیش‌نویسی که یک بار اجرا نشده سناریو نیست»)،
 * ولی جایش اینجا نیست: این تابع فایل می‌نویسد و اجرای پلی‌رایت یک پروسهٔ
 * دیگر است. CLI و رابط پس از این تابع `userbug run --scenario …` را صدا
 * می‌زنند — همان مسیری که هر سناریوی دیگری هم از آن می‌گذرد.
 *
 * @param {object} o
 * @param {string} o.target کلید پروژه
 * @param {object} o.state خروجی `session.snapshotState()`
 * @param {string} [o.name] نامِ سناریو
 * @param {boolean} [o.landing] این نخستین گشتِ پروژه است؟
 */
export async function emitTour({ target, state, name, purpose = '', landing = false }) {
  const title = String(name || '').trim() || (landing ? 'آشنایی با سامانه' : 'گشتِ ضبط‌شده');
  /**
   * «این گشت دربارهٔ چه بود» — به زبانِ خودِ آدم.
   *
   * ── چرا لازم شد ──
   *
   * گشت گران‌ترین ورودیِ این ابزار است: وقتِ آدم. ولی همه‌شان در یک پرونده
   * ادغام می‌شدند و هیچ‌جا نمی‌ماند که گشتِ سوم دربارهٔ «اشتراک‌گذاری» بود و
   * چهارمی دربارهٔ «واردکردنِ فایل». بعد از یک هفته، پنج فایلِ هم‌شکل
   * می‌ماند به‌نامِ «گشتِ ضبط‌شده».
   */
  const why = String(purpose || '').trim().slice(0, 500);
  const written = { pages: 0, cached: 0, scenario: null, dossier: null };

  // ۱. صفحه‌ها
  for (const page of state.pages || []) {
    if (!page.path) continue;
    await writePage(
      target,
      {
        path: page.path,
        view: page.view,
        title: page.title,
        purpose: page.purpose,
        shot: page.shot,
        by: page.by || 'tour',
        contract: {
          // قرارداد از رفتارِ **فعلی** ضبط می‌شود، پس `watch` است نه `expect`:
          // وگرنه باگِ امروز رسمی می‌شد. ارتقا کارِ آدم است.
          mode: 'watch',
          must: (page.mustHave || []).slice(0, 20),
          // یک بازدید هنوز قاعده نمی‌سازد؛ `LEARNING_VISITS` تصمیم می‌گیرد
          seenIn: 1,
          lastSeen: new Date().toISOString(),
        },
      },
      { why: `گشت ${state.runId}` }
    );
    written.pages++;
  }

  /**
   * ۲. تست — در ریپوی خودِ پروژه، نه اینجا.
   *
   * ── چرا `.spec.js` و نه YAML ──
   *
   * پیش‌نویسِ YAML مفسر می‌خواست و آن مفسر برداشته شد؛ یعنی خروجیِ گشت
   * دیگر نمی‌دوید. حالا همان قدم‌ها کدِ پلی‌رایت می‌شوند و `npx playwright
   * test` بی هیچ واسطه‌ای اجرایشان می‌کند.
   *
   * و عنوانِ هر بلوک از مسیر و از **توضیحی که کاربر حین گشت تایپ کرده**
   * ساخته می‌شود — یعنی حرفِ شما در گزارشِ تست دیده می‌شود.
   */
  const steps = state.steps || [];
  if (steps.length) {
    const { tourToSpec } = await import('../emit/author.js');
    const { workspaceRoot, ensureWorkspace, writeInside } = await import('../emit/workspace.js');
    const { loadTarget } = await import('../target.js');

    const root = workspaceRoot(await loadTarget(target));
    ensureWorkspace(root);

    const name = `${landing ? 'آشنایی' : 'گشت'}-${slugify(title)}.spec.js`;
    const file = writeInside(
      root,
      name,
      tourToSpec({
        steps,
        pages: state.pages || [],
        name: title,
        purpose: why,
        startPath: (state.pages || [])[0]?.path || '/',
      })
    );

    written.scenario = name;
    written.file = file;

    // ۳. کش — همان شناسه، بی پسوند
    written.cached = seedCache({ target, scenarioId: path.basename(name, '.spec.js'), steps });
  }

  // ۴. پرونده
  const patch = {
    /**
     * فقط نماهای بی‌مودال به `routes` می‌روند.
     *
     * `routes` نقشهٔ آدرس‌هاست و `/contents` یک ردیف دارد، نه چهار تا برای
     * چهار مودالش. توضیحِ مودال‌ها در `pages/` می‌ماند که جای درستشان است؛
     * ریختنشان اینجا نقشه را با چیزی پر می‌کرد که آدرس نیست.
     */
    routes: (state.pages || [])
      .filter((page) => page.path && !page.view)
      .map((page) => ({
        path: page.path,
        title: page.title,
        purpose: page.purpose,
        by: page.purpose ? 'user' : 'tour',
      })),
    sources: [{ kind: 'tour', id: state.runId, at: new Date().toISOString(), note: `${steps.length} قدم` }],
  };
  if (state.downloads?.length) patch.files = { downloads: state.downloads.map((item) => ({ ...item, by: 'tour' })) };

  const merged = mergeIntoDossier(readDossier(target), patch);
  await writeDossier(target, merged.dossier, { by: 'tour', why: `گشت ${state.runId}` });
  written.dossier = { kept: merged.kept, replaced: merged.replaced, conflicts: merged.conflicts };

  return written;
}
