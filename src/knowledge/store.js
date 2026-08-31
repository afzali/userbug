/**
 * انبارِ پروندهٔ شناخت.
 *
 * ── این پوشه با `targets/` و `scenarios/` فرق دارد ──
 *
 * آن دو را **کاربر** می‌نویسد و ابزار می‌خواند. این یکی را **ابزار** می‌نویسد
 * و هر جلسه بزرگ‌تر می‌شود. برای همین جدا نشست: اگر داخل کانفیگ هدف می‌رفت،
 * ابزار باید فایلی را بازنویسی می‌کرد که کامنت‌های دست‌نویسِ کاربر در آن است.
 *
 * ── چرا محصورسازیِ خودش ──
 *
 * همان دلیلِ `source-access.js`: هر محصورسازی یک ریشه دارد و ریشه‌ها یکی
 * نیستند. اینجا ریشه `knowledge/` است و هرگز عوض نمی‌شود، پس محصورسازی‌اش
 * ساده‌تر از آن یکی است — ولی وجودش لازم است، چون کلیدِ پروژه از رابط می‌آید
 * و رابط ورودیِ بیرونی می‌گیرد.
 *
 * ── چرا نبودِ پرونده خطا نیست ──
 *
 * هر پروژه‌ای که امروز در `targets/` هست، پرونده ندارد. اگر خواندن بشکند،
 * تزریقِ شناخت به `from-text` و `explore` باید همه‌جا `try` بگیرد و آن `try`
 * دیر یا زود خطای واقعی را هم می‌بلعد. پس نبودِ پرونده یعنی «پروندهٔ خالی».
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../target.js';
import { appendHistory, diffDossier } from './history.js';
import { DOSSIER_VERSION, emptyDossier, normalizeDossier, normalizePage, pageSlug } from './schema.js';

/**
 * ریشهٔ شناخت — هر بار حساب می‌شود، نه یک بار هنگام import.
 *
 * `ROOT` در `src/target.js` لحظهٔ import ثابت می‌شود. برای CLI و رابط فرقی
 * ندارد، ولی یعنی `USERBUG_ROOT` که **بعد از** import تنظیم شود بی‌اثر است —
 * و همین یک بار پیش آمد: خودآزما ریشهٔ موقت گذاشت و انبار در `knowledge/`ِ
 * واقعیِ مخزن نوشت، بی‌آنکه چیزی بشکند.
 *
 * چون این پوشه **نوشتنی** است، آن سکوت گران است. پس متغیر محیطی هر بار
 * خوانده می‌شود؛ `ROOT` فقط پیش‌فرضِ نبودنش است.
 */
export function knowledgeRoot() {
  const override = process.env.USERBUG_ROOT;
  return path.join(override ? path.resolve(override) : ROOT, 'knowledge');
}

/**
 * کلیدِ پروژه، همان قاعده‌ای که `assertProjectKey` و `assertSafeSegment`
 * دارند. سه جا یک قاعده، چون هر سه به نامِ فایل تبدیل می‌شوند.
 */
export function assertKnowledgeKey(value) {
  const key = String(value ?? '').trim();
  if (!/^[\p{L}\p{N}_.-]+$/u.test(key) || key === '.' || key === '..' || key.length > 60) {
    throw new Error(`کلید پروژه نامعتبر است: «${value}»`);
  }
  return key;
}

export function knowledgeDir(target) {
  return path.join(knowledgeRoot(), assertKnowledgeKey(target));
}

function pagesDir(target) {
  return path.join(knowledgeDir(target), 'pages');
}

/** خواندنِ JSON که نبودش و خرابی‌اش هر دو یعنی «نداریم». */
function readJsonOr(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * نوشتنِ اتمیک.
 *
 * پروندهٔ شناخت را چند نویسنده می‌زنند — رابط، CLI، و پایانِ هر اجرا. نوشتنِ
 * مستقیم یعنی یک کرش وسط `writeFile` فایل را نیمه‌کاره می‌گذارد و همهٔ شناختِ
 * جمع‌شده می‌رود. `rename` روی یک فایل‌سیستم اتمیک است.
 */
async function writeJsonAtomic(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fsp.rename(temporary, file);
}

export function dossierFile(target) {
  return path.join(knowledgeDir(target), 'dossier.json');
}

/**
 * پروندهٔ یک پروژه. نداشتنش یعنی پروندهٔ خالی، نه خطا.
 *
 * همیشه از `normalizeDossier` رد می‌شود، حتی وقتی خودمان نوشته‌ایمش: پرونده
 * را می‌شود دستی ویرایش کرد و ویرایشِ دستی همان‌قدر بدشکل می‌شود که خروجی
 * مدل.
 */
export function readDossier(target) {
  const key = assertKnowledgeKey(target);
  const raw = readJsonOr(dossierFile(key), null);
  if (!raw) return emptyDossier(key);
  try {
    return normalizeDossier(raw, { target: key });
  } catch {
    return emptyDossier(key);
  }
}

/** آیا این پروژه اصلاً شناختی دارد؟ برای رابط، تا «هنوز شروع نشده» را نشان بدهد. */
export function hasDossier(target) {
  return fs.existsSync(dossierFile(assertKnowledgeKey(target)));
}

/**
 * ذخیرهٔ پرونده، با ثبتِ تفاوت در تاریخچه.
 *
 * تفاوت **قبل از** نوشتن حساب می‌شود و بعد از موفقیتِ نوشتن ثبت. برعکسش
 * یعنی تاریخچه‌ای که تغییرِ نانوشته را ادعا می‌کند.
 *
 * @param {string} target کلید پروژه
 * @param {object} next پروندهٔ تازه (نرمال می‌شود)
 * @param {{by?: string, why?: string, ref?: string}} [meta] چه کسی و چرا
 */
export async function writeDossier(target, next, meta = {}) {
  const key = assertKnowledgeKey(target);
  const previous = readDossier(key);
  const dossier = normalizeDossier(next, { target: key });
  dossier.version = DOSSIER_VERSION;
  dossier.updatedAt = new Date().toISOString();

  const changes = diffDossier(previous, dossier);
  await writeJsonAtomic(dossierFile(key), dossier);

  if (changes.length) {
    await appendHistory(knowledgeDir(key), changes.map((change) => ({ ...change, why: meta.why, ref: meta.ref })));
  }
  return { dossier, changes };
}

/**
 * تغییرِ پرونده با یک تابع، به‌جای خواندن و نوشتنِ دستی.
 *
 * هر جای دیگری که «بخوان، عوض کن، بنویس» را دستی بنویسد، دیر یا زود
 * `updatedAt` یا تاریخچه را جا می‌اندازد.
 */
export async function updateDossier(target, mutate, meta = {}) {
  const current = readDossier(target);
  const next = (await mutate(structuredClone(current))) ?? current;
  return await writeDossier(target, next, meta);
}

/* ────────────────────────────── صفحه‌ها ────────────────────────────── */

export function readPage(target, routePath) {
  const key = assertKnowledgeKey(target);
  const slug = pageSlug(routePath);
  if (!slug) return null;
  const raw = readJsonOr(path.join(pagesDir(key), `${slug}.json`), null);
  if (!raw) return null;
  try {
    return normalizePage(raw, { path: routePath });
  } catch {
    return null;
  }
}

export async function writePage(target, page, meta = {}) {
  const key = assertKnowledgeKey(target);
  const normalized = normalizePage(page);
  const slug = pageSlug(normalized.path);
  const existed = Boolean(readPage(key, normalized.path));

  await writeJsonAtomic(path.join(pagesDir(key), `${slug}.json`), normalized);
  await appendHistory(knowledgeDir(key), {
    op: existed ? 'update' : 'add',
    path: `pages[${normalized.path}]`,
    by: normalized.by,
    why: meta.why,
    ref: meta.ref,
  });
  return normalized;
}

/** همهٔ صفحه‌های شناخته‌شده. فایلِ خراب رد می‌شود؛ بقیه باید دیده شوند. */
export function listPages(target) {
  const dir = pagesDir(assertKnowledgeKey(target));
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }

  const pages = [];
  for (const name of names.sort()) {
    const raw = readJsonOr(path.join(dir, name), null);
    if (!raw) continue;
    try {
      pages.push(normalizePage(raw));
    } catch {
      // صفحهٔ بی‌مسیر. حذفش نمی‌کنیم — فقط نشانش نمی‌دهیم.
    }
  }
  return pages;
}

/**
 * علامتِ کهنگی.
 *
 * صفحهٔ کهنه **حذف نمی‌شود**. آدم برای نوشتن `purpose` وقت گذاشته و آن جمله
 * حتی وقتی DOM عوض شده هنوز درست است. فقط علامت می‌خورد تا در رابط دیده شود.
 */
export async function markStale(target, routePath, { signature, why } = {}) {
  const page = readPage(target, routePath);
  if (!page || page.stale) return null;
  if (signature && page.domSignature && page.domSignature === signature) return null;

  return await writePage(target, { ...page, stale: true }, { why: why || 'امضای صفحه عوض شد' });
}
