/**
 * «کدام سفر سالم است، و از کی؟»
 *
 * ── چرا این نبود و باید می‌بود ──
 *
 * کاربر گفت: «مأموریت‌هایی مثل ثبت‌نام، ورود، فراموشی رمز، افزودن کتاب،
 * خواندن کتاب، هایلایت و بازیابی آن — برای من مهم است که بدانم اینها همه
 * بررسی شده‌اند.»
 *
 * ابزار همهٔ داده‌اش را داشت و هیچ‌وقت این پرسش را جواب نمی‌داد. هر اجرا
 * جداگانه گزارش می‌شد؛ هیچ‌چیز **در طولِ زمان** نگاه نمی‌کرد. پس «ورود
 * آخرین بار کی سبز بود» جوابی نداشت جز باز کردنِ ده گزارشِ HTML.
 *
 * ── چرا «هرگز اجرا نشد» یک ردیف است، نه یک غیبت ──
 *
 * سناریویی که وجود دارد و هیچ اجرایی سراغش نرفته، خطرناک‌ترین حالت است:
 * فهرست سبز به نظر می‌رسد چون آن ردیف اصلاً در فهرست نیست. همان درسِ
 * `endpointCoverage` — پوششِ خوش‌بینانه بدتر از پوششِ صفر است.
 *
 * ── چرا اینجا و نه در رابط ──
 *
 * خط فرمان هم باید همین جدول را بدهد. یک تابعِ خالص روی `run.json`ها، تا
 * هیچ‌وقت دو تعریف از «سبز» نداشته باشیم.
 */
import { stableName, verdictOf } from '../report/tests.js';

/**
 * خودآزماهای خودِ userbug، سفرِ کاربر نیستند.
 *
 * ── چرا اینجا فیلتر می‌شوند و نه در اجراگر ──
 *
 * `testDir` کلِ `scenarios/` است، پس `_selftest/*` در هر اجرا هم می‌رود — و
 * این عمدی است: می‌خواهیم با هر اجرای واقعی، سلامتِ خودِ ابزار هم سنجیده
 * شود. ولی نشستنشان در فهرستِ «کدام سفرِ من سالم است» آن فهرست را بی‌مصرف
 * می‌کند: روی نپی ۲۰ ردیف از ۲۲ ردیف، تستِ خودِ ابزار بود.
 */
const SELFTEST = /(^|\/)_selftest\//;

/** بدترین‌ها اول: چیزی که آدم باید ببیند، بالا می‌نشیند. */
const ORDER = { failed: 0, findings: 1, never: 2, unknown: 3, skipped: 4, passed: 5 };

function startedMs(run) {
  const value = Date.parse(run?.startedAt || '');
  return Number.isFinite(value) ? value : 0;
}

/**
 * تاریخچهٔ سلامتِ هر سناریو، از روی `run.json`های یک هدف.
 *
 * @param {object[]} runs شیءهای `run.json` — به هر ترتیبی
 * @param {{known?: string[], selftests?: boolean}} [options] `known` نامِ
 *   سناریوهایی که روی دیسک هستند — هرکدام که در هیچ اجرایی نبوده، ردیفِ
 *   «هرگز اجرا نشد» می‌گیرد. `selftests` خودآزماهای خودِ ابزار را هم می‌آورد.
 */
export function healthOf(runs = [], { known = [], selftests = false } = {}) {
  const rows = new Map();

  const touch = (name) => {
    if (!rows.has(name)) {
      rows.set(name, {
        name,
        verdict: 'never',
        at: '',
        runId: '',
        error: '',
        findings: 0,
        runs: 0,
        lastGreen: null,
        lastRed: null,
      });
    }
    return rows.get(name);
  };

  for (const name of known) touch(String(name));

  /**
   * نامِ خودآزماها **یک بار** جمع می‌شود، پیش از ساختنِ ردیف‌ها.
   *
   * ── چرا دو پاس ──
   *
   * فیلترِ تک‌پاسی کافی نبود: اجراهای پیش از افزوده‌شدنِ `file` این ستون را
   * ندارند، پس یک خودآزما با اجرای قدیمی ردیف می‌ساخت و اجرای تازه فقط از
   * کنارش رد می‌شد — ردیف با وضعیتِ کهنه سرِ جایش می‌ماند و هرگز پاک
   * نمی‌شد. حالا هر نامی که **در هر اجرایی** خودآزما شناخته شده، اصلاً وارد
   * نمی‌شود.
   */
  const selftestNames = new Set();
  if (!selftests) {
    for (const run of runs) {
      for (const scenario of run?.scenarios || []) {
        if (SELFTEST.test(scenario?.file || '')) selftestNames.add(String(scenario.name || '').trim());
      }
    }
  }

  /**
   * از قدیم به جدید، تا «آخرین» واقعاً آخرین باشد.
   *
   * ترتیبِ پوشهٔ `runs/` الفبایی است و با تاریخ می‌خواند، ولی تکیه بر آن
   * یعنی یک اجرای دست‌ساز یا واردشده از بسته می‌تواند ترتیب را به‌هم بزند و
   * «آخرین وضعیت» را بی‌صدا غلط کند.
   */
  for (const run of [...runs].sort((a, b) => startedMs(a) - startedMs(b))) {
    const at = run?.startedAt || '';
    const runId = run?.runId || '';

    for (const scenario of run?.scenarios || []) {
      /**
       * `stableName` برای اجراهای قدیمی است.
       *
       * پیش از ثبتِ نامِ پایدار، `name` همان عنوان بود — یعنی پیش‌نویس‌ها با
       * پسوند ثبت شده‌اند. بی این، یک سفر در تاریخچه دو ردیف می‌ماند: یکی
       * پیش از تأیید و یکی پس از آن.
       */
      const name = stableName(scenario?.name || '');
      if (!name) continue;
      if (selftestNames.has(name)) continue;

      const row = touch(name);
      const verdict = scenario.verdict || verdictOf(scenario);

      row.runs++;
      row.verdict = verdict;
      row.at = at;
      row.runId = runId;
      row.error = scenario.error || '';
      row.findings = scenario.findings || 0;

      if (verdict === 'passed') row.lastGreen = { at, runId };
      if (verdict === 'failed' || verdict === 'findings') row.lastRed = { at, runId, error: scenario.error || '' };
    }
  }

  return [...rows.values()].sort(
    (a, b) => (ORDER[a.verdict] ?? 9) - (ORDER[b.verdict] ?? 9) || a.name.localeCompare(b.name, 'fa')
  );
}

/** خلاصهٔ یک خطی — همان چیزی که سرِ صفحه و سرِ ترمینال می‌نشیند. */
export function summarize(rows = []) {
  const count = (verdict) => rows.filter((row) => row.verdict === verdict).length;
  return {
    total: rows.length,
    passed: count('passed'),
    failed: count('failed'),
    findings: count('findings'),
    never: count('never'),
    skipped: count('skipped'),
    unknown: count('unknown'),
  };
}

/**
 * از آخرین سبز چند روز گذشته؟
 *
 * ── چرا لازم است ──
 *
 * سفری که سه ماه پیش سبز بوده و از آن به بعد اجرا نشده، در فهرست «سالم»
 * است — و این گمراه‌کننده است. سبزِ کهنه با سبزِ امروز یکی نیست.
 *
 * @returns {number|null} `null` یعنی هرگز سبز نبوده
 */
export function daysSinceGreen(row, now = Date.now()) {
  const at = Date.parse(row?.lastGreen?.at || '');
  if (!Number.isFinite(at)) return null;
  return Math.floor((now - at) / 86_400_000);
}
