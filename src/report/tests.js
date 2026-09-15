/**
 * سبز یا قرمز — برای هر سناریو، جدا.
 *
 * ── چرا این فایل لازم شد ──
 *
 * کاربر پرسید: «می‌خواهم بدانم ثبت‌نام و ورود و فراموشی رمز و هایلایت همه
 * بررسی شده‌اند و سالم‌اند.» بررسی کردیم و معلوم شد جوابش را نداریم.
 *
 * `run.json` برای هر سناریو فقط این را می‌نوشت:
 *
 *     { name, steps, findings }
 *
 * یعنی سناریویی که `expect`اش شکسته ولی هیچ خطای کنسولی نداده، در همان
 * فهرستی که رابط و تاریخچه می‌خوانند **صفرِ یافته** است — درست شبیهِ سبز.
 * بدترین نوعِ شکستِ خاموش، در خودِ ابزاری که برای شکارش ساخته شده.
 *
 * وضعیتِ واقعی از قبل وجود داشت ولی فقط `junit.xml` آن را می‌دید، و منطقش
 * داخلِ همان فایل دفن بود. اینجا بیرون آمد تا **یک** تعریف از «سبز» داشته
 * باشیم که هم گزارشِ CI، هم `run.json`، هم تاریخچهٔ سلامت از آن بخوانند.
 *
 * ── چرا منبعش `tests.ndjson` است و نه `traces.ndjson` ──
 *
 * آن یکی کنارِ **فایلِ trace** نوشته می‌شد، پس وجودش به تنظیمِ `trace` گره
 * خورده بود: با `trace: 'off'` (یا هر اجرایی که trace نمی‌سازد) هیچ سطری
 * نبود و وضعیتِ همهٔ تست‌ها «نامعلوم» می‌شد. وضعیتِ تست داده‌ای است که
 * هیچ‌وقت نباید به یک تنظیمِ تشخیصی وابسته باشد.
 *
 * سطرهای قدیمی همچنان خوانده می‌شوند (`traces.ndjson` به‌عنوان جانشین)، تا
 * اجراهای پیش از این تغییر بی‌وضعیت نشوند.
 */

/**
 * وضعیت‌هایی که یعنی «نشد» — با هر دو املای `timedOut`.
 *
 * نسخه‌های مختلفِ پلی‌رایت هر دو را داده‌اند و `junit.js` هم هر دو را داشت.
 * یک املای جامانده یعنی تستِ افتاده سبز شمرده شود.
 */
const FAILED_RAW = ['failed', 'timedout', 'interrupted'];
export const FAILED = new Set(FAILED_RAW);
export const SKIPPED = new Set(['skipped']);

/**
 * پسوندی که عنوانِ یک پیش‌نویس می‌گیرد — یک تعریف، دو مصرف‌کننده.
 *
 * `yaml.spec.js` می‌چسباندش و `health.js` از ردیف‌های قدیمی می‌کَنَدش. اگر
 * هر کدام رشتهٔ خودش را داشت، روزی یکی عوض می‌شد و تاریخچهٔ سلامت بی‌صدا یک
 * سفر را دو تا می‌دید.
 */
export const DRAFT_SUFFIX = ' [پیش‌نویس]';

/** نامِ پایدار از عنوان — برای اجراهایی که پیش از ثبتِ `name` ضبط شده‌اند. */
export function stableName(title) {
  const text = String(title ?? '').trim();
  return text.endsWith(DRAFT_SUFFIX) ? text.slice(0, -DRAFT_SUFFIX.length).trim() : text;
}

const norm = (status) => String(status ?? '').toLowerCase();
export const isFailed = (status) => FAILED.has(norm(status));
export const isSkipped = (status) => SKIPPED.has(norm(status));

/**
 * سطرهای خام → وضعیتِ نهاییِ هر سناریو.
 *
 * ── دو مرحله، چون «آخرین سطر برنده است» غلط بود ──
 *
 * ۱) هر `testId` یک تست است و `retry` بالاتر نتیجهٔ نهاییِ همان تست. ترتیب
 *    را از خودِ داده می‌گیریم نه از ترتیبِ سطرها، چون گزارشگر موازی append
 *    می‌کند و ترتیبِ نوشتن قطعی نیست.
 *
 * ۲) `--repeat-each` همان عنوان را چند بار می‌برد و هر تکرار `testId` خودش
 *    را دارد. پس یک سناریو وقتی سالم است که **هیچ** تکراری نیفتد — وگرنه
 *    تکرارِ افتاده زیر تکرارِ سالم دفن می‌شود، یعنی همان بی‌ثباتی که
 *    `--repeat` برای شکارش هست.
 *
 * @param {object[]} rows سطرهای `tests.ndjson` (یا `traces.ndjson` قدیمی)
 * @returns {Map<string, {status: string, ms: number, error: string, retries: number}>}
 */
export function outcomesOf(rows = []) {
  const attempts = new Map();
  for (const row of rows) {
    if (!row?.scenario) continue;
    /**
     * نامِ پایدار، نه عنوانِ نمایشی.
     *
     * عنوان برای پیش‌نویس `[پیش‌نویس]` دارد و روزِ تأیید عوض می‌شود؛ بی این،
     * تاریخچه یک سفر را دو سفر می‌بیند و هر دو ناقص.
     */
    const name = String(row.name || stableName(row.scenario));
    const key = row.testId || `${name}#legacy`;
    const retry = Number(row.retry || 0);
    const previous = attempts.get(key);
    if (!previous || retry >= previous.retry) {
      attempts.set(key, {
        scenario: name,
        title: String(row.scenario || name),
        draft: Boolean(row.draft),
        file: String(row.file || ''),
        retry,
        status: String(row.status || ''),
        ms: Number(row.ms || 0),
        error: String(row.error || ''),
      });
    }
  }

  const out = new Map();
  for (const attempt of attempts.values()) {
    const current = out.get(attempt.scenario);
    // شکست بر موفقیت می‌چربد، و اولین شکست دلیلش را نگه می‌دارد
    if (current && isFailed(current.status)) {
      current.retries += attempt.retry;
      continue;
    }
    out.set(attempt.scenario, {
      status: attempt.status,
      title: attempt.title,
      draft: attempt.draft,
      file: attempt.file,
      ms: attempt.ms,
      error: attempt.error,
      retries: attempt.retry,
    });
  }
  return out;
}

/**
 * وضعیتِ یک سناریو در یک اجرا — جمعِ «تست افتاد» و «یافته داشت».
 *
 * ── چرا یافته هم وضعیت را قرمز می‌کند ──
 *
 * تستی که هیچ `expect`ی ندارد (که امروز اکثرشان همین‌اند) همیشه `passed`
 * تمام می‌شود، حتی وقتی سرور وسطش ۵۰۰ داده. اگر «سبز» را فقط از وضعیتِ تست
 * می‌خواندیم، همان اپِ خرابی که این ابزار برای پیدا کردنش هست، سبز گزارش
 * می‌شد.
 *
 * ── و چرا «نامعلوم» یک وضعیتِ واقعی است ──
 *
 * اجرایی که گزارشگرِ ما در آن فعال نبوده (`--reporter=line`) وضعیتِ تست
 * ندارد. نوشتنش به‌عنوان «سبز» دروغ است و به‌عنوان «قرمز» ترساندنِ بی‌جا.
 */
export function verdictOf({ status = '', findings = 0 } = {}) {
  if (isFailed(status)) return 'failed';
  if (isSkipped(status)) return 'skipped';
  if (findings > 0) return 'findings';
  if (norm(status) === 'passed') return 'passed';
  return 'unknown';
}

/** آیا این حکم یعنی «دست نزن، سالم است»؟ */
export function isGreen(verdict) {
  return verdict === 'passed';
}

export const VERDICT_LABEL = {
  passed: 'سالم',
  failed: 'شکست',
  findings: 'ایراد داشت',
  skipped: 'اجرا نشد',
  unknown: 'نامعلوم',
};
