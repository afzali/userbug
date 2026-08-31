/**
 * هضمِ سورس — از پوشهٔ پروژه به پروندهٔ شناخت.
 *
 * ── دو نیمه که عمداً از هم جدا شده‌اند ──
 *
 * **نیمهٔ اول بی‌مدل است:** فهرست روت، استک، و فهرست مستندات. این‌ها فکت‌اند
 * و `readdir` جوابشان را می‌دهد. پس این نیمه بی‌کلید، بی‌هزینه و قطعی اجرا
 * می‌شود — و برای پروژه‌ای که هنوز کلید مدل ندارد، همین به‌تنهایی مفید است.
 *
 * **نیمهٔ دوم با مدل است:** خلاصه، ورود، موجودیت‌ها، واژه‌نامه، خطرها، و
 * پرسش‌ها. این‌ها معنا هستند نه ساختار.
 *
 * جدا بودنشان یعنی شکستِ نیمهٔ دوم، نیمهٔ اول را نمی‌برد. اجرایی که به سقفِ
 * بودجه بخورد باز هم روت‌ها را نوشته است.
 *
 * ── چرا مدل حق ندارد حرفِ کاربر را عوض کند ──
 *
 * هر چیزی که از اینجا بیرون می‌آید `by: 'source'` یا `by: 'model'` می‌گیرد.
 * ادغام در `merge.js` است و آنجا اعتماد تصمیم می‌گیرد، نه تازگی. یعنی
 * `learn` را می‌شود ده بار زد بی‌آنکه جمله‌ای که آدم نوشته از بین برود.
 */
import path from 'node:path';
import { askJson } from '../models/provider.js';
import { listSourceFiles, readSourceFile, resolveSourceRoot } from '../source-access.js';
import { detectStack, discoverRoutes } from './routes.js';
import { mineInvariants } from './schema-mine.js';

/** سقفِ متنی که از مستندات به مدل می‌رود. بلندتر از این، فصل است نه معرفی. */
const DOC_BUDGET = 6000;
/** چند روت به مدل نشان داده می‌شود. بیشترش فقط بودجه می‌خورد. */
const ROUTE_SAMPLE = 80;

const SYSTEM = `تو یک اپ وب را از روی ساختار سورسش می‌شناسی، برای ابزاری که می‌خواهد مثل کاربر واقعی آن را بیازماید.

خروجی فقط JSON، بدون توضیح و بدون حصار markdown:
{
  "summary": "…",
  "auth": {"kind":"form|oauth|magic-link|none|unknown","loginPath":"/…","signupOpen":true|false|null,"logoutLabel":"…","sessionStore":"…"},
  "routePurposes": [{"path":"/…","purpose":"…","requiresAuth":true|false|null}],
  "entities": [{"name":"…","label":"…","where":"…"}],
  "glossary": [{"term":"…","meaning":"…"}],
  "risks": [{"label":"…","why":"…"}],
  "openQuestions": ["…"]
}

قواعد:
- «summary» یک پاراگراف فارسی: این اپ چیست و کاربرش چه می‌خواهد.
- «routePurposes» فقط برای مسیرهایی که در فهرستِ داده‌شده هستند. مسیرِ تازه نساز.
- «glossary» واژه‌های خودِ اپ است که کاربر روی صفحه می‌بیند، با معنایشان.
- «risks» چیزهایی که کلیک کردنشان داده را از بین می‌برد یا کاربر را بیرون می‌اندازد
  (خروج، حذف، ریست). «label» باید دقیقاً همان متنی باشد که روی دکمه دیده می‌شود.
- «openQuestions» مهم‌ترین بخش است: هر چیزی که از سورس **نفهمیدی** اینجا بپرس،
  به‌جای اینکه حدس بزنی. حساب تستی، محیط امن، رفتار موردانتظار.
- چیزی را که در سورس ندیدی ننویس. فیلدِ خالی از فیلدِ حدسی بهتر است.`;

/** خواندنی که خطایش اجرا را نمی‌شکند — فایلِ بزرگ یا رازدار فقط رد می‌شود. */
function readerFor(root) {
  return async (relative) => {
    try {
      const { content } = await readSourceFile(root, relative);
      return content;
    } catch {
      return '';
    }
  };
}

/**
 * فایل‌های معرفیِ پروژه.
 *
 * README ریشه اول می‌آید چون نزدیک‌ترین چیز به «این پروژه چیست» است؛ بقیهٔ
 * `docs/` بعد از آن و فقط تا سقفِ بودجه.
 */
function documentationFiles(files) {
  const readme = files.filter((file) => /^readme\.md$/i.test(file));
  const docs = files.filter((file) => /^docs\//i.test(file) && file.endsWith('.md'));
  return [...readme, ...docs].slice(0, 12);
}

/**
 * نیمهٔ بی‌مدل.
 *
 * جدا export شده تا هم `digestSource` از آن استفاده کند و هم بشود بی‌کلید و
 * بی‌هزینه صدایش زد — مثلاً برای نشان دادنِ پیش‌نمایش در رابط، پیش از آنکه
 * کاربر تصمیم بگیرد پول خرج کند.
 */
export async function scanSource(target) {
  const root = await resolveSourceRoot(target);
  const files = await listSourceFiles(root);
  const read = readerFor(root);

  const [stack, discovered, invariants] = await Promise.all([
    detectStack({ files, read }),
    discoverRoutes({ files, read }),
    // ناوردا هم فکت است، نه معنا: `UNIQUE(email)` نحوِ ثابت دارد
    mineInvariants({ files, read }),
  ]);

  return {
    root,
    files,
    stack,
    routes: discovered.routes,
    invariants,
    byDetector: discovered.byDetector,
    docs: documentationFiles(files),
  };
}

/**
 * متنِ ورودیِ مدل.
 *
 * ── چرا سرِ فایلِ هر روت می‌رود، نه کلِ فایل ──
 *
 * عنوان و برچسب‌های یک صفحه معمولاً در چهل خطِ اول‌اند. فرستادنِ کلِ فایل
 * برای هشتاد روت یعنی بودجهٔ یک اجرا در یک فراخوانی.
 */
async function buildUser({ scan, read }) {
  const lines = [];
  const stackText = Object.entries(scan.stack)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ');
  if (stackText) lines.push(`استک: ${stackText}`);

  lines.push('', `روت‌های کشف‌شده (${scan.routes.length}):`);
  for (const route of scan.routes.slice(0, ROUTE_SAMPLE)) {
    lines.push(`- ${route.path}${route.sourceFile ? `  ← ${route.sourceFile}` : ''}`);
  }

  let used = 0;
  const heads = [];
  for (const file of scan.docs) {
    if (used >= DOC_BUDGET) break;
    const content = await read(file);
    if (!content) continue;
    const slice = content.slice(0, Math.min(2500, DOC_BUDGET - used));
    heads.push(`# ${file}\n${slice}`);
    used += slice.length;
  }
  if (heads.length) lines.push('', 'مستندات پروژه:', ...heads);

  /**
   * سرِ فایلِ چند روت، تا برچسب‌های واقعی دیده شوند.
   *
   * بدون این، مدل `purpose` را از نامِ مسیر می‌ساخت — یعنی `/library` را
   * «صفحهٔ کتابخانه» می‌نوشت که همان مسیر است با لباسِ دیگر.
   */
  const samples = [];
  let sampleBudget = 8000;
  for (const route of scan.routes.slice(0, 25)) {
    if (!route.sourceFile || sampleBudget <= 0) continue;
    const content = await read(route.sourceFile);
    if (!content) continue;
    const head = content.split(/\r?\n/).slice(0, 40).join('\n').slice(0, 1200);
    samples.push(`# ${route.path} (${route.sourceFile})\n${head}`);
    sampleBudget -= head.length;
  }
  if (samples.length) lines.push('', 'سرِ فایلِ روت‌ها:', ...samples);

  return lines.join('\n');
}

/**
 * سورس → تکه‌ای از پرونده، آمادهٔ ادغام.
 *
 * چیزی نمی‌نویسد. خروجی به `mergeIntoDossier` داده می‌شود، همان‌طور که
 * `scenarioFromText` هم فایل نمی‌نویسد — یک مسیرِ نوشتن، یک اعتبارسنجی.
 *
 * @param {object} o
 * @param {object} o.target کانفیگ هدف (باید `source.root` داشته باشد)
 * @param {object} [o.models] تنظیمات مدل. نبودش یعنی فقط نیمهٔ بی‌مدل
 * @param {object} [o.budget]
 * @returns {Promise<{partial: object, scan: object, usedModel: boolean, note: string}>}
 */
export async function digestSource({ target, models, budget } = {}) {
  const scan = await scanSource(target);
  const read = readerFor(scan.root);

  const partial = {
    stack: { ...scan.stack, by: 'source' },
    routes: scan.routes.map((route) => ({
      path: route.path,
      sourceFile: route.sourceFile,
      by: 'source',
    })),
    sources: [{ kind: 'source', id: path.basename(scan.root), at: new Date().toISOString(), note: `${scan.files.length} فایل` }],
  };

  if (!models) {
    return {
      partial,
      scan,
      usedModel: false,
      note: 'فقط ساختار خوانده شد؛ برای معنا و پرسش‌ها مدل لازم است',
    };
  }

  const { json } = await askJson(
    models,
    { system: SYSTEM, user: await buildUser({ scan, read }) },
    budget
  );

  /**
   * هدفِ روت‌ها از مدل می‌آید، ولی خودِ فهرست نه.
   *
   * مدل حق دارد بگوید `/library` برای چیست؛ حق ندارد `/library` را اختراع
   * کند. پس هر مسیری که در کشفِ قطعی نبود، دور ریخته می‌شود — وگرنه پرونده
   * آدرسی را ادعا می‌کرد که وجود ندارد و `go:` بعدی به ۴۰۴ می‌خورد.
   */
  const known = new Map(partial.routes.map((route) => [route.path, route]));
  let invented = 0;
  for (const item of Array.isArray(json?.routePurposes) ? json.routePurposes : []) {
    const route = known.get(normalizePath(item?.path));
    if (!route) {
      invented++;
      continue;
    }
    route.purpose = String(item?.purpose ?? '').trim();
    route.requiresAuth = item?.requiresAuth === true ? true : item?.requiresAuth === false ? false : null;
    // هدف را مدل گفته، مسیر را سورس. بندی که هر دو را دارد به کم‌اعتمادترشان می‌رود.
    route.by = route.purpose ? 'model' : 'source';
  }

  return {
    partial: {
      ...partial,
      summary: String(json?.summary ?? '').trim(),
      auth: { ...(json?.auth || {}), by: 'model' },
      entities: asList(json?.entities).map((item) => ({ ...item, by: 'model' })),
      glossary: asList(json?.glossary).map((item) => ({ ...item, by: 'model' })),
      risks: asList(json?.risks).map((item) => ({ ...item, by: 'model' })),
      openQuestions: asList(json?.openQuestions)
        .map((item) => (typeof item === 'string' ? { q: item } : item))
        .filter((item) => item?.q)
        .map((item) => ({ ...item, askedAt: new Date().toISOString() })),
    },
    scan,
    usedModel: true,
    note: invented ? `${invented} مسیرِ ساختگیِ مدل دور ریخته شد` : '',
  };
}

function asList(value) {
  return (Array.isArray(value) ? value : []).filter((item) => item && (typeof item === 'string' || typeof item === 'object'));
}

function normalizePath(value) {
  let raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!raw.startsWith('/')) raw = '/' + raw;
  if (raw.length > 1) raw = raw.replace(/\/+$/, '') || '/';
  return raw;
}
