/**
 * خروجی JUnit — تنها زبانی که هر CI بلد است.
 *
 * ── نگاشت ──
 *
 * یک سناریو = یک `testcase`. یافتهٔ یکتای همان سناریو = `failure`. این نگاشت
 * عمدی است: در CI چیزی که باید بیلد را قرمز کند «یافته» است، نه «تست پلی‌رایت
 * افتاد». سناریویی که سالم اجرا شود ولی سه خطای کنسول بدهد، از دید ما شکست
 * است و باید همان‌طور هم گزارش شود.
 *
 * ولی عکسش هم لازم است: سناریویی که روی `expect` سخت بشکند ممکن است هیچ
 * یافته‌ای ثبت نکند. آن حالت از `traces.ndjson` می‌آید که وضعیت واقعی هر تست
 * را دارد. بدون آن، یک تستِ افتاده در CI سبز خوانده می‌شد.
 *
 * ── چرا فایل خالی ممنوع است ──
 *
 * اگر اجرا پیش از رسیدن به سناریو بشکند (کانفیگ، دستگاه ناشناخته، قلاب
 * ریست)، فایلِ بی‌`testcase` تولید می‌شود و تقریباً همهٔ CIها آن را سبز
 * می‌خوانند. یعنی «اجراگر نرسید» به «همه‌چیز سالم بود» ترجمه می‌شود — همان
 * شکستِ خاموشی که این ابزار قرار است پیدایش کند. پس در آن حالت یک
 * `testcase` با `error` نوشته می‌شود.
 */
import { dedupe } from '../observe/oracle.js';

// XML 1.0 این بازه را نمی‌پذیرد؛ لاگ سرور و stack گاهی داخلش دارند و یک
// کاراکتر کنترلی، کل فایل را برای CI غیرقابل‌تجزیه می‌کند.
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

const FAILED_TEST_STATUSES = new Set(['failed', 'timedOut', 'timedout', 'interrupted']);

/**
 * وضعیت‌هایی که یعنی «اجرا به نتیجه رسید» — فهرستِ خوب‌ها، نه فهرستِ بدها.
 *
 * فهرستِ بدها fail-open است: `undefined` یا هر وضعیت ناشناختهٔ آیندهٔ پلی‌رایت
 * از کنارش رد می‌شد و اجرا سالم خوانده می‌شد. اینجا هر چیزی که در این سه نباشد
 * خطاست.
 *
 * `failed` عمداً «رسیدیم» است: حالتِ عادیِ «تست افتاد» که از راه یافته یا
 * وضعیت خودِ تست گزارش می‌شود. در عوض `timedout` و `interrupted` — که پلی‌رایت
 * با kill شدن job، `SIGINT` یا `--max-failures` می‌دهد — یعنی اجرا نیمه‌کاره
 * قطع شد: تست‌های رسیده سبزند و تست‌های نرسیده اصلاً در فایل نیستند.
 */
const HEALTHY_RUN_STATUSES = new Set(['passed', 'failed', 'finished']);

function esc(value) {
  return String(value ?? '')
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function seconds(ms) {
  return (Math.max(0, Number(ms) || 0) / 1000).toFixed(3);
}

/** یافته یا خودش سناریو را می‌داند، یا از قدمی که در آن دیده شد پیدا می‌شود. */
function scenarioOf(finding, steps) {
  if (finding.scenario) return finding.scenario;
  return steps.find((step) => step.step === finding.step && step.scenario)?.scenario || null;
}

function describeFinding(finding) {
  const where = (finding.steps || [finding.step]).filter(Boolean).join(' · ');
  const head = `[${finding.source}] ${finding.fingerprint}${where ? ` — ${where}` : ''} (${finding.count || 1}×)`;
  const detail = finding.detail ? `\n    ${String(finding.detail).split(/\r?\n/)[0]}` : '';
  return `${head}\n    ${finding.message}${detail}`;
}

function properties(run) {
  const rows = [
    ['runId', run.runId],
    ['target', run.target],
    ['device', run.device],
    ['environment', run.environment],
    ['baseURL', run.baseURL],
    ['status', run.status],
    ['findings', run.findings],
    ['serverLines', run.serverLines],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');

  return rows.map(([name, value]) => `      <property name="${esc(name)}" value="${esc(value)}"/>`).join('\n');
}

/**
 * @param {object} input
 * @param {object} input.run محتوای `run.json` پس از نهایی‌سازی
 * @param {object[]} input.steps رخدادهای `kind: 'step'`
 * @param {object[]} input.findings یافته‌های واقعی (بدون `synthetic`)
 * @param {object[]} [input.traces] سطرهای `traces.ndjson` برای وضعیت واقعی تست‌ها
 */
export function renderJUnit({ run, steps, findings, traces = [] }) {
  const real = findings.filter((finding) => !finding.synthetic);

  /**
   * وضعیت واقعی تست‌ها — در دو مرحله، چون «آخرین سطر برنده است» غلط بود.
   *
   * ۱) هر `testId` یک تست است و `retry` بالاتر نتیجهٔ نهایی همان تست. این
   *    ترتیب را از خودِ داده می‌گیریم نه از ترتیب سطرها، چون `persistTraces`
   *    موازی append می‌کند و ترتیب نوشتن قطعی نیست.
   *
   * ۲) `--repeat-each` همان عنوان را چند بار می‌برد و هر تکرار `testId` خودش
   *    را دارد. پس یک سناریو وقتی سالم است که **هیچ** تکراری نیفتد — وگرنه
   *    تکرارِ افتاده زیر تکرارِ سالم دفن می‌شد، یعنی همان بی‌ثباتی که
   *    `--repeat` برای شکارش هست.
   */
  const attempts = new Map();
  for (const trace of traces) {
    if (!trace?.scenario) continue;
    const key = trace.testId || `${trace.scenario}#legacy`;
    const retry = Number(trace.retry || 0);
    const previous = attempts.get(key);
    if (!previous || retry >= previous.retry) {
      attempts.set(key, { scenario: trace.scenario, retry, status: trace.status });
    }
  }

  const testStatus = new Map();
  for (const attempt of attempts.values()) {
    const current = testStatus.get(attempt.scenario);
    if (current && FAILED_TEST_STATUSES.has(String(current))) continue;
    testStatus.set(attempt.scenario, attempt.status);
  }

  /**
   * سناریوها از دو جا می‌آیند، نه یکی.
   *
   * تستی که پیش از نخستین `ub.step` بشکند هیچ قدمی ثبت نمی‌کند و اگر فقط از
   * قدم‌ها فهرست بسازیم، همان تستِ افتاده از فایل حذف می‌شود و CI سبز
   * می‌بیند — بدترین حالت ممکن.
   */
  const names = [...new Set([...steps.map((step) => step.scenario), ...testStatus.keys()].filter(Boolean))];

  const grouped = new Map(names.map((name) => [name, []]));
  const orphans = [];
  for (const finding of real) {
    const name = scenarioOf(finding, steps);
    if (name && grouped.has(name)) grouped.get(name).push(finding);
    else orphans.push(finding);
  }

  const cases = names.map((name) => {
    const own = steps.filter((step) => step.scenario === name);
    const unique = dedupe(grouped.get(name) || []);
    const status = testStatus.get(name);
    const brokenTest = FAILED_TEST_STATUSES.has(String(status));
    const reasons = [];
    if (unique.length) reasons.push(`${unique.length} یافتهٔ یکتا`);
    if (brokenTest) reasons.push(`تست با وضعیت ${status} تمام شد`);

    return {
      name,
      time: own.reduce((sum, step) => sum + (step.ms || 0), 0),
      steps: own.length,
      failure: reasons.length
        ? {
            message: reasons.join(' · '),
            type: unique.length ? 'finding' : 'test',
            body: unique.length ? unique.map(describeFinding).join('\n\n') : `وضعیت تست: ${status}`,
          }
        : null,
    };
  });

  if (orphans.length) {
    const unique = dedupe(orphans);
    cases.push({
      name: 'یافته‌های بیرون از سناریو',
      time: 0,
      steps: 0,
      failure: {
        message: `${unique.length} یافتهٔ یکتا بدون سناریوی مشخص`,
        type: 'finding',
        body: unique.map(describeFinding).join('\n\n'),
      },
    });
  }

  // اجرایی که هیچ سناریویی نبرد، یا نیمه‌کاره ماند: صریح خطا بده.
  const errors = [];
  const context = () =>
    [
      `runId: ${run.runId}`,
      `هدف: ${run.target || '—'} · دستگاه: ${run.device || '—'}`,
      run.error ? `خطا: ${run.error}` : null,
    ]
      .filter(Boolean)
      .join('\n');

  if (!cases.length || !HEALTHY_RUN_STATUSES.has(String(run.status))) {
    errors.push({
      name: cases.length ? 'وضعیت اجرا' : 'اجرا',
      message: cases.length
        ? `اجرا با وضعیت ${run.status || 'نامشخص'} بسته شد`
        : `اجراگر هیچ سناریویی را نبرد (وضعیت: ${run.status || 'نامشخص'})`,
      body: context(),
    });
  }

  /**
   * «اجرا failed بود ولی هیچ سناریویی failure نگرفت» یعنی اطلاعات کم داریم.
   *
   * وضعیت واقعی تست‌ها از `traces.ndjson` می‌آید و آن را گزارشگر می‌نویسد. با
   * `--reporter=line` یا کرشِ worker آن فایل ناقص می‌ماند، پس تستی که افتاده
   * ولی یافته‌ای نساخته بی‌صدا سبز می‌شد. اینجا صریح گفته می‌شود که نتیجه
   * ناقص است.
   */
  if (
    HEALTHY_RUN_STATUSES.has(String(run.status)) &&
    String(run.status) === 'failed' &&
    cases.length &&
    !cases.some((item) => item.failure)
  ) {
    errors.push({
      name: 'نتیجهٔ ناقص',
      message: 'اجرا failed بود ولی هیچ سناریویی failure نگرفت؛ وضعیت تست‌ها ثبت نشده است',
      body: [context(), 'traces.ndjson خالی یا ناقص است (گزارشگر کنار رفته یا worker کرش کرده).'].join('\n'),
    });
  }

  const total = cases.length + errors.length;
  const failures = cases.filter((item) => item.failure).length;

  /**
   * زمان از جمع قدم‌ها می‌آید، نه از `startedAt` تا `finishedAt`.
   *
   * `finish()` هر بار که گزارش بازسازی شود `finishedAt` را تازه می‌کند، پس
   * فاصلهٔ دیواری بعد از یک `userbug report` ساعت‌ها می‌شد و نمودار زمانِ CI
   * را بی‌معنا می‌کرد. جمع قدم‌ها قطعی است و با بازسازی عوض نمی‌شود.
   */
  const suiteTime = cases.reduce((sum, item) => sum + item.time, 0);

  const suiteName = [run.target || 'userbug', run.device].filter(Boolean).join(' · ');
  const className = ['userbug', run.target, run.device]
    .filter(Boolean)
    .map((part) => String(part).replace(/\s+/g, '-'))
    .join('.');

  const body = [
    ...cases.map((item) => {
      const open = `    <testcase classname="${esc(className)}" name="${esc(item.name)}" time="${seconds(item.time)}"`;
      if (!item.failure) return `${open}/>`;
      return [
        `${open}>`,
        `      <failure message="${esc(item.failure.message)}" type="${esc(item.failure.type)}">${esc(item.failure.body)}</failure>`,
        '    </testcase>',
      ].join('\n');
    }),
    ...errors.map((item) =>
      [
        `    <testcase classname="${esc(className)}" name="${esc(item.name)}" time="0.000">`,
        `      <error message="${esc(item.message)}" type="runner">${esc(item.body)}</error>`,
        '    </testcase>',
      ].join('\n')
    ),
  ].join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="userbug" tests="${total}" failures="${failures}" errors="${errors.length}" time="${seconds(suiteTime)}">
  <testsuite name="${esc(suiteName)}" tests="${total}" failures="${failures}" errors="${errors.length}" skipped="0" time="${seconds(suiteTime)}" timestamp="${esc(run.startedAt || '')}">
    <properties>
${properties(run)}
    </properties>
${body}
    <system-out>${esc(`گزارش: ${run.runId}/report.html · قدم: ${run.steps ?? 0} · خط لاگ سرور: ${run.serverLines ?? 0}`)}</system-out>
  </testsuite>
</testsuites>
`;
}
