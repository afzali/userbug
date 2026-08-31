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
export async function listFixtures(target) {
  const root = fixturesDir(target);
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
      const stat = await fsp.stat(path.join(dir, entry.name)).catch(() => null);
      if (stat) out.push({ relative: `fixtures/${relative}`, bytes: stat.size });
    }
  }

  await walk(root);
  return out;
}
