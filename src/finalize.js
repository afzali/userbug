/**
 * بستنِ یک اجرا: نهایی کردن `run.json` و ساختن گزارش.
 *
 * ── چرا جدا از گزارشگر ──
 *
 * این کار اول داخل `UserbugReporter.onEnd` بود. ولی گزارشگرِ کانفیگ با یک
 * `--reporter=line` در خط فرمان کنار می‌رود، و آن‌وقت اجرا کامل انجام می‌شود،
 * عکس‌ها و رخدادها روی دیسک می‌نشینند، و `run.json` تا ابد `status: running`
 * می‌ماند بدون هیچ گزارشی. دو اجرای نهایی فاز ۰ دقیقاً همین‌طور از دست رفتند.
 *
 * پس نهایی‌سازی از گزارشگر بیرون آمد: `globalTeardown` همیشه اجرا می‌شود، هر
 * رپورتری که در خط فرمان بدهید. گزارشگر — اگر فعال باشد — همین را دوباره صدا
 * می‌زند تا وضعیت واقعی تست‌ها را هم بنویسد. تابع idempotent است، پس ترتیبِ
 * این دو اهمیتی ندارد.
 */
import nodeFs from 'node:fs';
import { absorbRun } from './knowledge/absorb.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { RunStore, getCurrentRun, runDir } from './store/run-store.js';
import { renderReport } from './report/html.js';
import { renderJUnit } from './report/junit.js';
import { dedupe } from './observe/oracle.js';
import { outcomesOf, verdictOf } from './report/tests.js';

/**
 * جمعِ آمار مدل در کل اجرا.
 *
 * نسبت «کش» به «مدل» مهم‌ترین عددِ فاز ۲ است: اگر بالا نماند، یعنی یا کش کار
 * نمی‌کند یا رابط مدام عوض می‌شود — هر دو ارزش دانستن دارند.
 */
function summarizeAi(events) {
  const rows = events.filter((e) => e.kind === 'ai');
  if (!rows.length) return null;

  const totals = rows.reduce(
    (acc, r) => ({
      cache: acc.cache + (r.cache || 0),
      model: acc.model + (r.model || 0),
      healed: acc.healed + (r.healed || 0),
      verified: acc.verified + (r.verified || 0),
      calls: acc.calls + (r.budget?.calls || 0),
      costUsd: Number((acc.costUsd + (r.budget?.costUsd || 0)).toFixed(6)),
    }),
    { cache: 0, model: 0, healed: 0, verified: 0, calls: 0, costUsd: 0 }
  );

  // فهرست است نه یک رشته، چون `--model` روی کل اجرا اثر می‌گذارد ولی کانفیگِ
  // هدف می‌تواند برای هر نقش مدل دیگری بدهد.
  totals.slugs = [...new Set(rows.map((r) => r.slug).filter(Boolean))];
  return totals;
}

/**
 * آیا این اجرا واقعاً روی دیسک هست؟
 *
 * `playwright test --list` هیچ اجرایی نمی‌سازد چون `globalSetup` صدا زده
 * نمی‌شود. هر دو فراخوانِ نهایی‌سازی — `globalTeardown` و گزارشگر — باید پیش
 * از کار این را بپرسند، وگرنه لاگ CI یک «نهایی‌سازی اجرا ناموفق بود: ENOENT»
 * می‌گیرد که هیچ ربطی به سلامت تست‌ها ندارد.
 */
export function hasRunDir(runId = null) {
  try {
    return nodeFs.existsSync(runDir(runId || getCurrentRun()));
  } catch {
    // شناسهٔ اجرا هنوز ساخته نشده؛ چیزی برای بستن نیست.
    return false;
  }
}

/**
 * @param {string} [runId]
 * @param {{status?: string, junitPath?: string}} [opts] وضعیت واقعی اگر فراخوان
 *   می‌داندش، و مسیر دلخواه برای کپی JUnit
 */
export async function finalizeRun(runId = getCurrentRun(), { status, junitPath } = {}) {
  const store = new RunStore(runId);

  const events = await store.readNdjson('events.ndjson');
  const findings = await store.readNdjson('findings.ndjson');
  const traces = await store.readNdjson('traces.ndjson');
  /**
   * وضعیتِ واقعیِ تست‌ها. `traces` جانشینِ اجراهای قدیمی است.
   *
   * پیش از این فایل وجود نداشت و وضعیت فقط کنارِ trace نوشته می‌شد — نگاه
   * به `src/report/tests.js` برای اینکه چرا آن اشتباه بود.
   */
  const testRows = await store.readNdjson('tests.ndjson');
  const outcomes = outcomesOf(testRows.length ? testRows : traces);
  const real = findings.filter((f) => !f.synthetic);
  const synthetic = findings.filter((f) => f.synthetic);
  const steps = events.filter((e) => e.kind === 'step');
  const unique = dedupe(real);

  const before = (await store.readJson('run.json')) || {};

  /**
   * چه سناریوهایی اجرا شدند و کدامشان یافته داشتند.
   *
   * بدون این، `replay` نمی‌داند چه چیزی را دوباره اجرا کند و مجبور است کل
   * مجموعه را ببرد — که با پنج سناریو هنوز قابل تحمل است و با پنجاه تا نه.
   */
  /**
   * نامِ سناریوها از **دو** جا می‌آید، نه یکی.
   *
   * تستی که پیش از نخستین `ub.step` بشکند هیچ قدمی ثبت نمی‌کند؛ اگر فهرست
   * فقط از قدم‌ها ساخته شود، همان تستِ افتاده از `run.json` حذف می‌شود و
   * تاریخچهٔ سلامت آن را «هرگز اجرا نشد» می‌بیند — نه «شکست». همان درسی که
   * `junit.js` قبلاً گرفته بود و اینجا تکرار نشده بود.
   */
  /**
   * قدم‌ها با **عنوان** ثبت شده‌اند، وضعیت‌ها با **نامِ پایدار**.
   *
   * بی این نگاشت، یک پیش‌نویس دو ردیف می‌شود: «ورود» با وضعیت و صفر قدم، و
   * «ورود [پیش‌نویس]» با قدم‌ها و بی وضعیت. هر دو هم ناقص.
   */
  const nameOfTitle = new Map([...outcomes].map(([name, one]) => [one.title || name, name]));
  const canonical = (title) => nameOfTitle.get(title) || title;

  const scenarios = [
    ...new Set([...steps.map((s) => canonical(s.scenario)), ...outcomes.keys()].filter(Boolean)),
  ].map(
    (name) => {
      const own = real.filter(
        (f) =>
          canonical(f.scenario) === name ||
          steps.some((s) => canonical(s.scenario) === name && s.step === f.step)
      );
      const outcome = outcomes.get(name) || {};
      const findings = dedupe(own).length;
      return {
        name,
        steps: steps.filter((s) => canonical(s.scenario) === name).length,
        findings,
        /** وضعیتِ خودِ تست: passed/failed/timedOut/skipped — یا خالی اگر گزارشگر نبود */
        status: outcome.status || '',
        /** عنوانی که در گزارش دیده می‌شود — با `[پیش‌نویس]`، اگر باشد */
        title: outcome.title || name,
        draft: Boolean(outcome.draft),
        /** فایلِ منبع — تا خودآزماهای خودِ ابزار از سلامتِ پروژه جدا بمانند */
        file: outcome.file || '',
        /**
         * حکمِ نهایی: شکستِ تست **و** یافته، هر دو قرمزش می‌کنند.
         *
         * سناریویی که هیچ `expect`ی ندارد همیشه `passed` تمام می‌شود، حتی
         * وقتی سرور وسطش ۵۰۰ داده. بی این ترکیب، همان اپِ خرابی که این ابزار
         * برای پیدا کردنش هست، سبز گزارش می‌شد.
         */
        verdict: verdictOf({ status: outcome.status, findings }),
        ms: outcome.ms || 0,
        error: outcome.error || '',
      };
    }
  );

  await store.finish({
    // بدون وضعیتِ داده‌شده، وضعیت قبلی می‌ماند — مگر اینکه هنوز «running» باشد
    status: status ?? (before.status === 'running' ? 'finished' : before.status),
    steps: steps.length,
    findings: unique.length,
    findingEvents: real.length,
    syntheticEvents: synthetic.length,
    serverLines: events.filter((e) => e.kind !== 'collectors' && e.source === 'server').length,
    /**
     * چه چیزی **تنظیم** شده بود و کدامشان واقعاً وصل بودند.
     *
     * ── چرا فهرستِ «کی حرف زد» غلط بود ──
     *
     * پیش‌تر اینجا نامِ جمع‌کننده‌هایی می‌نشست که خطی تولید کرده بودند. یعنی
     * سروری که ساکت بود با سروری که اصلاً گوش نمی‌دادیم، یک‌شکل گزارش
     * می‌شد — و «۰ خط لاگ» به‌عنوان خبرِ خوب خوانده می‌شد.
     */
    /**
     * `null` یعنی «این اجرا اصلاً مرورگری باز نکرد».
     *
     * آرایهٔ خالی یعنی مرورگر باز شد ولی هیچ لاگی تنظیم نشده بود — و آن یک
     * هشدارِ واقعی است. یکی کردنِ این دو باعث شد خودآزماهای خالص هم پیامِ
     * «هیچ لاگ سروری تنظیم نشده» بگیرند، که دروغ بود.
     */
    serverCollectors: events.findLast((e) => e.kind === 'collectors')?.collectors ?? null,
    scenarios,
    /** شمارشِ سرِ دستی، تا تاریخچه و رابط مجبور نباشند هر بار جمع بزنند */
    green: scenarios.filter((one) => one.verdict === 'passed').length,
    red: scenarios.filter((one) => one.verdict === 'failed' || one.verdict === 'findings').length,
    ai: summarizeAi(events),
  });

  /**
   * شناخت از همین اجرا تغذیه می‌شود.
   *
   * ── چرا اینجا و چرا با catch ──
   *
   * اینجا، چون تنها نقطه‌ای است که همهٔ مسیرها از آن رد می‌شوند: CLI،
   * زمان‌بندی، و `userbug report`. با catch، چون گزارش و JUnit از قبل ساخته
   * شده‌اند و شکستنِ اجرا به‌خاطر نتوانستنِ نوشتنِ یک افزودهٔ شناخت، نتیجه‌ای
   * را که واقعاً گرفته شده از دست می‌دهد.
   */
  const absorbed = await absorbRun({
    target: before.target || process.env.UB_TARGET || '',
    events,
    runId,
  }).catch(() => null);

  const run = await store.readJson('run.json');
  const file = path.join(store.dir, 'report.html');
  await fs.writeFile(file, renderReport({ run, steps, findings: real, synthetic, events }), 'utf8');

  /**
   * JUnit همیشه ساخته می‌شود، مثل `report.html`.
   *
   * پرچم نمی‌خواهد چون CI نباید برای دیدن نتیجه، فراخوانی متفاوتی لازم داشته
   * باشد؛ و اگر یک روز لازم شد، همان فایل از قبل کنار بقیهٔ artifactها هست.
   */
  const junit = path.join(store.dir, 'junit.xml');
  const junitXml = renderJUnit({ run, steps, findings: real, tests: testRows, traces });
  await fs.writeFile(junit, junitXml, 'utf8');

  // کپیِ مسیر دلخواه، برای CI که فایل را جای ثابتی می‌خواهد.
  const extra = junitPath || process.env.UB_JUNIT || null;
  let junitCopy = null;
  if (extra) {
    junitCopy = path.resolve(extra);
    await fs.mkdir(path.dirname(junitCopy), { recursive: true });
    await fs.writeFile(junitCopy, junitXml, 'utf8');
  }

  return { run, store, steps, unique, synthetic, file, junit, junitCopy, absorbed };
}

/** خلاصهٔ کنسولی — همان چیزی که آدم بعد از اجرا می‌خواهد ببیند. */
export function printSummary({ run, steps, unique, file, junitCopy, absorbed }) {
  console.log(`\n  گزارش: ${file}`);
  if (junitCopy) console.log(`  JUnit: ${junitCopy}`);
  console.log(
    `  قدم: ${steps.length}  ·  یافتهٔ یکتا: ${unique.length}  ·  خط لاگ سرور: ${run.serverLines ?? 0}`
  );

  /**
   * «۰ خط لاگ سرور» بی توضیح، خبرِ خوب خوانده می‌شود.
   *
   * ولی معنیِ دیگرش این است که اصلاً گوش نمی‌دادیم — و آن‌وقت هر ۵۰۰ که
   * سرور داده و UI پنهانش کرده، از گزارش بیرون مانده. پس وضعیتِ
   * جمع‌کننده‌ها همیشه گفته می‌شود، نه فقط وقتی خطی آمده.
   */
  const collectors = run.serverCollectors;
  if (Array.isArray(collectors)) {
    if (!collectors.length) {
      console.log('  ! هیچ لاگ سروری تنظیم نشده — خطای سمتِ سرور دیده نمی‌شود (کلید logs در کانفیگ هدف).');
    }
    for (const one of collectors.filter((row) => !row.available)) {
      console.log(`  ! لاگ «${one.name}» نیامد: ${one.why || 'در دسترس نبود'}`);
    }
  }
  console.log('');

  if (run.ai) {
    const a = run.ai;
    console.log(
      `  مدل: کش ${a.cache} · مدل ${a.model} · heal ${a.healed} · بازبینی ${a.verified} · ` +
        `${a.calls} فراخوانی · $${a.costUsd}` +
        (a.slugs?.length ? `\n  ${a.slugs.join(' · ')}` : '') +
        `
`
    );
  }

  /**
   * آنچه این اجرا به شناخت اضافه کرد.
   *
   * چاپش لازم است، وگرنه «به مرور بهتر می‌شود» یک ادعای نامرئی می‌ماند:
   * کاربر باید ببیند که اجرای امروز چیزی یاد داد.
   */
  if (absorbed && (absorbed.routes || absorbed.stale || absorbed.unstable?.length)) {
    const parts = [];
    if (absorbed.routes) parts.push(`${absorbed.routes} مسیر تازه`);
    if (absorbed.stale) parts.push(`${absorbed.stale} صفحهٔ کهنه`);
    if (absorbed.unstable?.length) parts.push(`${absorbed.unstable.length} قدمِ ناپایدار`);
    console.log(`  شناخت: ${parts.join(' · ')}`);
    for (const item of absorbed.unstable || []) {
      console.log(`    ناپایدار (${item.healCount}× heal): «${item.intent}» در ${item.scenario}`);
    }
    console.log('');
  }

  if (unique.length) {
    console.log('  یافته‌ها:');
    for (const f of unique) {
      const where = (f.steps || [f.step]).join(' · ');
      console.log(`   • [${f.source}] ${where} — ${f.normalized.slice(0, 120)} (${f.count}×)`);
    }
    console.log('');
  }
}
