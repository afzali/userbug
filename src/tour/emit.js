/**
 * گشت → چهار خروجی.
 *
 *   ۱. صفحه‌ها      `knowledge/<کلید>/pages/*.json` با جملهٔ خودِ کاربر
 *   ۲. سناریو       `scenarios/<کلید>/_drafts/tour-*.yml`، قابل اجرا
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
 * ── چرا پیش‌نویس، نه سناریوی رسمی ──
 *
 * ضبطِ کلیک، سناریوی خوب نمی‌سازد. کاربر مسیرِ اشتباه هم رفته، دوبار کلیک
 * کرده، و جایی که مهم بوده `expect` ننوشته. پس `status: draft` می‌ماند تا
 * آدم ببیندش — همان دروازه‌ای که `from-text` و `--author` هم دارند.
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import { scenarioDir } from '../scenario/load.js';
import { getEntry, loadCache, putEntry, saveCache } from '../steps/cache.js';
import { mergeIntoDossier } from '../knowledge/merge.js';
import { readDossier, writeDossier, writePage } from '../knowledge/store.js';

/**
 * قدم‌های ضبط‌شده → YAML.
 *
 * ── چرا `go` اول می‌آید ──
 *
 * کاربر از جایی شروع کرده که ما به آنجا رفته بودیم. پیش‌نویسی که با یک کلیک
 * شروع شود، روی صفحهٔ خالی اجرا می‌شود و همان قدمِ اول می‌شکند.
 *
 * ── چرا مسیرهای میانی هم `go` نمی‌گیرند ──
 *
 * ناوبریِ وسطِ گشت **نتیجهٔ** کلیک کاربر است، نه یک کنشِ جدا. افزودنش یعنی
 * سناریو به‌جای آزمودنِ پیوند، از رویش می‌پرد — و آن پیوند دقیقاً همان چیزی
 * است که ممکن است شکسته باشد.
 */
export function stepsToYaml({ steps, pages, name, startPath = '/' }) {
  const out = [{ clearState: true }, { go: startPath }];

  let lastUrl = null;
  for (const entry of steps) {
    // عنوانِ گروه وقتی کاربر وارد صفحهٔ تازه‌ای شده: گزارش خواناتر می‌شود
    if (entry.url && entry.url !== lastUrl) {
      const page = pages.find((item) => item.path === entry.url);
      const title = page?.purpose ? `${entry.url} — ${page.purpose}`.slice(0, 70) : entry.url;
      out.push({ as: title, ...entry.step });
      lastUrl = entry.url;
      continue;
    }
    out.push({ ...entry.step });
  }

  const uploads = steps.filter((item) => item.needsFixture).map((item) => item.needsFixture);

  const header = [
    '# ضبط‌شده از گشتِ زندهٔ کاربر.',
    '#',
    '# قدم‌ها با توصیفِ معنایی نوشته شده‌اند (نقش و نام)، نه سلکتور — همان',
    '# چیزی که `do:` می‌سازد. پس تغییرِ ساختارِ HTML نمی‌شکندشان.',
  ];
  if (uploads.length) {
    header.push(
      '#',
      '# این فایل‌ها باید در `knowledge/<پروژه>/fixtures/` گذاشته شوند، وگرنه',
      '# سناریو روی ماشین دیگری اجرا نمی‌شود:',
      ...uploads.map((file) => `#   ${file}`)
    );
  }
  header.push(
    '#',
    '# `status: draft` است چون ضبطِ کلیک سناریوی خوب نمی‌سازد: مسیرِ اشتباه و',
    '# کلیکِ تکراری هم ضبط شده، و `expect` جایی که مهم بوده نوشته نشده.',
    ''
  );

  return header.join('\n') + YAML.stringify({ name, status: 'draft', persona: 'novice', steps: out });
}

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
export async function emitTour({ target, state, name, landing = false }) {
  const title = String(name || '').trim() || (landing ? 'آشنایی با سامانه' : 'گشتِ ضبط‌شده');
  const written = { pages: 0, cached: 0, scenario: null, dossier: null };

  // ۱. صفحه‌ها
  for (const page of state.pages || []) {
    if (!page.path) continue;
    await writePage(
      target,
      {
        path: page.path,
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

  // ۲. سناریو
  const steps = state.steps || [];
  if (steps.length) {
    const dir = path.join(scenarioDir(target), '_drafts');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${landing ? 'آشنایی' : 'tour'}-${slugify(title)}.yml`);
    fs.writeFileSync(
      file,
      stepsToYaml({ steps, pages: state.pages || [], name: title, startPath: (state.pages || [])[0]?.path || '/' }),
      'utf8'
    );
    written.scenario = path.relative(scenarioDir(target), file).split(path.sep).join('/');

    // ۳. کش
    written.cached = seedCache({ target, scenarioId: path.basename(file, '.yml'), steps });
  }

  // ۴. پرونده
  const patch = {
    routes: (state.pages || [])
      .filter((page) => page.path)
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
