/**
 * فایل‌هایی که سناریو آپلود می‌کند — `knowledge/<کلید>/fixtures/`.
 *
 * ── چرا این هم محصورسازیِ خودش را دارد ──
 *
 * سناریو را ممکن است **مدل** نوشته باشد. `{upload: {file: '…'}}` یعنی یک
 * رشته که از خروجی یک مدل آمده، مستقیم به `setInputFiles` می‌رود و محتوای
 * آن فایل به اپِ تحت تست فرستاده می‌شود. اگر مسیر آزاد بود،
 * `../../../.env` یک آپلودِ کامل بود.
 *
 * پس همان چهار قاعدهٔ `source-access.js`، با یک تفاوت: ریشه اینجا ثابت است
 * (`knowledge/<کلید>/fixtures/`) و از کانفیگ نمی‌آید، چون این فایل‌ها را خودِ
 * ابزار نگه می‌دارد نه پروژهٔ کاربر.
 *
 *   ۱. **فقط داخل پوشه.** `..` و symlink هر دو راه فرارند و هر دو بسته‌اند.
 *   ۲. **فقط خواندن.** آپلود نباید چیزی بنویسد.
 *   ۳. **فایلِ رازدار هرگز.** همان الگوهای `source-access.js`؛ کسی ممکن است
 *      از سرِ عادت `.env` را در fixtures بگذارد.
 *   ۴. **سقفِ اندازه.** فایلِ صدمگابایتی اجرا را می‌خواباند، نه اپ را.
 *
 * ── چرا پسوند محدود نیست ──
 *
 * برخلاف سورس، اینجا **باید** باینری پذیرفته شود: کلِ نکتهٔ آپلود همین است
 * که PDF و تصویر و ZIP فرستاده شود. پس فهرستِ پسوند نداریم؛ محصورسازی و
 * الگوهای راز کار می‌کنند.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { isSecretPath } from '../source-access.js';
import { knowledgeDir } from './store.js';

/** سقفِ یک فایل. بزرگ‌تر از این، آزمونِ آپلود نیست؛ آزمونِ صبر است. */
const MAX_BYTES = 25 * 1024 * 1024;

export function fixturesDir(target) {
  return path.join(knowledgeDir(target), 'fixtures');
}

function comparable(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function assertInside(root, candidate) {
  const rootKey = comparable(root);
  const candidateKey = comparable(candidate);
  if (candidateKey !== rootKey && !candidateKey.startsWith(rootKey + path.sep)) {
    throw new Error('مسیر بیرون از پوشهٔ fixtures است');
  }
}

/**
 * مسیرِ واقعیِ یک fixture، پس از همهٔ بررسی‌ها.
 *
 * پیشوندِ `fixtures/` پذیرفته می‌شود چون سناریو خواناتر می‌شود و پرونده هم
 * همین‌طور می‌نویسدش؛ ولی چیزی که واقعاً حل می‌شود همیشه نسبت به همان پوشه
 * است.
 *
 * @param {string} target کلید پروژه
 * @param {string} relative مسیر نسبی، مثل `fixtures/sample.pdf` یا `sample.pdf`
 * @returns {Promise<{file: string, relative: string, bytes: number}>}
 */
export async function resolveFixture(target, relative) {
  const raw = String(relative ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^fixtures\//, '');

  if (!raw) throw new Error('نام فایلِ آپلود خالی است');
  if (raw.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`مسیر fixture نامعتبر است: «${relative}»`);
  }
  if (isSecretPath(raw)) throw new Error(`این فایل آپلود نمی‌شود چون ممکن است راز داشته باشد: ${raw}`);

  const root = fixturesDir(target);
  let realRoot;
  try {
    realRoot = await fsp.realpath(root);
  } catch {
    throw new Error(
      `پوشهٔ fixtures برای «${target}» وجود ندارد.\n` +
        `  فایل‌های آپلود در ${root} می‌نشینند تا سناریو روی هر ماشینی تکرارپذیر باشد.`
    );
  }

  const candidate = path.resolve(realRoot, raw);
  assertInside(realRoot, candidate);

  // پیوند نمادین می‌تواند داخلِ ریشه باشد و به بیرون اشاره کند
  let real;
  try {
    real = await fsp.realpath(candidate);
  } catch {
    throw new Error(`فایلِ آپلود پیدا نشد: fixtures/${raw}`);
  }
  assertInside(realRoot, real);

  const stat = await fsp.stat(real);
  if (!stat.isFile()) throw new Error(`مسیر، فایل نیست: fixtures/${raw}`);
  if (stat.size > MAX_BYTES) throw new Error(`فایل بزرگ‌تر از ${MAX_BYTES} بایت است: fixtures/${raw}`);

  return { file: real, relative: `fixtures/${raw}`, bytes: stat.size };
}

/** فهرست fixtureها، برای رابط و برای پیامِ خطای «کدام‌ها هستند». */
/**
 * توضیحِ هر fixture — «این فایل برای چیست».
 *
 * ── چرا کنارِ خودِ فایل‌ها و نه در پرونده ──
 *
 * `fixtures/` در `.gitignore` است، چون دادهٔ حجیمِ همین ماشین است. توضیحی که
 * در پرونده بنشیند، با هم‌تیمی سفر می‌کند ولی فایلش نه — یعنی فهرستی از
 * توضیح‌های بی‌فایل. پس توضیح هم همان‌جا می‌ماند که فایل هست.
 *
 * ولی **خودِ نامِ فایل شناسه است**: سناریو با `fixtures/<نام>` صدایش می‌کند و
 * همان رشته در گیت می‌ماند. توضیح برای آدم است، نه برای ماشین.
 */
function notesFile(target) {
  return path.join(fixturesDir(target), '_notes.json');
}

export function readFixtureNotes(target) {
  try {
    const raw = JSON.parse(fs.readFileSync(notesFile(target), 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export async function setFixtureNote(target, relative, note) {
  const key = String(relative || '').replace(/^fixtures\//, '');
  if (!key) throw new Error('نامِ فایل لازم است');

  const notes = readFixtureNotes(target);
  const text = String(note ?? '').trim().slice(0, 500);
  if (text) notes[key] = text;
  else delete notes[key];

  await fsp.mkdir(fixturesDir(target), { recursive: true });
  await fsp.writeFile(notesFile(target), JSON.stringify(notes, null, 2) + '\n', 'utf8');
  return notes;
}

/**
 * افزودنِ فایل از رابط.
 *
 * ── چرا نامِ فایل دوباره ساخته می‌شود ──
 *
 * نامی که از مرورگر می‌آید هرچه می‌خواهد باشد: `../../.env`، نامِ ویندوزیِ
 * رزرو، یا دویست نویسه. تنها چیزی که از آن نگه می‌داریم حروف و رقم و نقطه
 * است، و بعد `assertInside` دوباره می‌سنجد — دو لایه، چون این تنها جایی است
 * که کاربر مستقیم روی دیسکِ پروژه می‌نویسد.
 */
export async function saveFixture(target, { name, bytes, note = '' }) {
  const safe = String(name || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 120);
  if (!safe) throw new Error('نامِ فایل معتبر نیست');
  if (isSecretPath(safe)) throw new Error(`این نام شبیهِ فایلِ رازدار است: ${safe}`);

  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!buffer.length) throw new Error('فایل خالی است');
  if (buffer.length > MAX_BYTES) {
    throw new Error(`فایل بزرگ‌تر از ${Math.round(MAX_BYTES / 1024 / 1024)} مگابایت است`);
  }

  const root = fixturesDir(target);
  const file = path.join(root, safe);
  assertInside(root, file);

  await fsp.mkdir(root, { recursive: true });
  await fsp.writeFile(file, buffer);
  if (note) await setFixtureNote(target, safe, note);

  return { relative: `fixtures/${safe}`, bytes: buffer.length };
}

export async function removeFixture(target, relative) {
  const { file, relative: clean } = await resolveFixture(target, relative);
  await fsp.rm(file, { force: true });
  await setFixtureNote(target, clean, '');
  return { relative: `fixtures/${clean}` };
}

export async function listFixtures(target) {
  const root = fixturesDir(target);
  const notes = readFixtureNotes(target);
  const out = [];

  async function walk(dir, prefix = '') {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), relative);
        continue;
      }
      if (!entry.isFile() || isSecretPath(relative)) continue;
      // دفترِ توضیح‌ها خودش fixture نیست و نباید در فهرست بیاید
      if (relative === '_notes.json') continue;
      const stat = await fsp.stat(path.join(dir, entry.name)).catch(() => null);
      if (stat) out.push({ relative: `fixtures/${relative}`, bytes: stat.size, note: notes[relative] || '' });
    }
  }

  await walk(root);
  return out;
}
