/**
 * گزارشگر.
 *
 * در فرآیند اصلی اجرا می‌شود، پس جایی است که می‌شود همه‌چیزِ کارگرها را کنار
 * هم گذاشت و یک گزارش ساخت.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { RunStore, getCurrentRun } from './store/run-store.js';
import { renderReport } from './report/html.js';
import { dedupe } from './observe/oracle.js';

export default class UserbugReporter {
  async onEnd(result) {
    const runId = getCurrentRun();
    const store = new RunStore(runId);

    const events = await store.readNdjson('events.ndjson');
    const findings = await store.readNdjson('findings.ndjson');
    const realFindings = findings.filter((f) => !f.synthetic);
    const synthetic = findings.filter((f) => f.synthetic);
    const steps = events.filter((e) => e.kind === 'step');
    const unique = dedupe(realFindings);

    await store.finish({
      status: result.status,
      steps: steps.length,
      findings: unique.length,
      findingEvents: realFindings.length,
      syntheticEvents: synthetic.length,
      serverLines: events.filter((e) => e.source === 'server').length,
    });

    const run = await store.readJson('run.json');
    const html = renderReport({ run, steps, findings: realFindings, synthetic, events });
    const file = path.join(store.dir, 'report.html');
    await fs.writeFile(file, html, 'utf8');

    console.log(`\n  گزارش: ${file}`);
    console.log(`  قدم: ${steps.length}  ·  یافتهٔ یکتا: ${unique.length}  ·  خط لاگ سرور: ${run.serverLines}\n`);

    if (unique.length) {
      console.log('  یافته‌ها:');
      for (const f of unique) {
        console.log(`   • [${f.source}] ${f.step} — ${f.normalized.slice(0, 120)} (${f.count}×)`);
      }
      console.log('');
    }
  }
}
