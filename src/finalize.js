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
import fs from 'node:fs/promises';
import path from 'node:path';
import { RunStore, getCurrentRun } from './store/run-store.js';
import { renderReport } from './report/html.js';
import { dedupe } from './observe/oracle.js';

/**
 * جمعِ آمار مدل در کل اجرا.
 *
 * نسبت «کش» به «مدل» مهم‌ترین عددِ فاز ۲ است: اگر بالا نماند، یعنی یا کش کار
 * نمی‌کند یا رابط مدام عوض می‌شود — هر دو ارزش دانستن دارند.
 */
function summarizeAi(events) {
  const rows = events.filter((e) => e.kind === 'ai');
  if (!rows.length) return null;
  return rows.reduce(
    (acc, r) => ({
      cache: acc.cache + (r.cache || 0),
      model: acc.model + (r.model || 0),
      healed: acc.healed + (r.healed || 0),
      calls: acc.calls + (r.budget?.calls || 0),
      costUsd: Number((acc.costUsd + (r.budget?.costUsd || 0)).toFixed(6)),
    }),
    { cache: 0, model: 0, healed: 0, calls: 0, costUsd: 0 }
  );
}

/**
 * @param {string} [runId]
 * @param {{status?: string}} [opts] وضعیت واقعی، اگر فراخوان می‌داندش
 */
export async function finalizeRun(runId = getCurrentRun(), { status } = {}) {
  const store = new RunStore(runId);

  const events = await store.readNdjson('events.ndjson');
  const findings = await store.readNdjson('findings.ndjson');
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
  const scenarios = [...new Set(steps.map((s) => s.scenario).filter(Boolean))].map((name) => ({
    name,
    steps: steps.filter((s) => s.scenario === name).length,
    findings: real.filter((f) => f.scenario === name || steps.some((s) => s.scenario === name && s.step === f.step))
      .length,
  }));

  await store.finish({
    // بدون وضعیتِ داده‌شده، وضعیت قبلی می‌ماند — مگر اینکه هنوز «running» باشد
    status: status ?? (before.status === 'running' ? 'finished' : before.status),
    steps: steps.length,
    findings: unique.length,
    findingEvents: real.length,
    syntheticEvents: synthetic.length,
    serverLines: events.filter((e) => e.source === 'server').length,
    serverCollectors: [...new Set(events.filter((e) => e.source === 'server').map((e) => e.collector))],
    scenarios,
    ai: summarizeAi(events),
  });

  const run = await store.readJson('run.json');
  const file = path.join(store.dir, 'report.html');
  await fs.writeFile(file, renderReport({ run, steps, findings: real, synthetic, events }), 'utf8');

  return { run, store, steps, unique, synthetic, file };
}

/** خلاصهٔ کنسولی — همان چیزی که آدم بعد از اجرا می‌خواهد ببیند. */
export function printSummary({ run, steps, unique, file }) {
  console.log(`\n  گزارش: ${file}`);
  console.log(
    `  قدم: ${steps.length}  ·  یافتهٔ یکتا: ${unique.length}  ·  خط لاگ سرور: ${run.serverLines ?? 0}\n`
  );

  if (run.ai) {
    const a = run.ai;
    console.log(
      `  مدل: کش ${a.cache} · مدل ${a.model} · heal ${a.healed} · ` +
        `${a.calls} فراخوانی · $${a.costUsd}
`
    );
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
