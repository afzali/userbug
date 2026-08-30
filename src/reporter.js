/**
 * گزارشگر.
 *
 * کارِ سنگین اینجا نیست — در `finalize.js` است که `globalTeardown` هم صدایش
 * می‌زند. این کلاس فقط وضعیت واقعی تست‌ها را اضافه می‌کند، چون تنها جایی است
 * که آن را می‌داند.
 *
 * اگر کسی با `--reporter=line` این را کنار بزند، اجرا همچنان نهایی و گزارشش
 * ساخته می‌شود؛ فقط `status` به‌جای `passed`/`failed` می‌شود `finished`.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { finalizeRun, hasRunDir } from './finalize.js';
import { getCurrentRun, runDir } from './store/run-store.js';

function safeName(value) {
  return String(value || 'trace')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'trace';
}

async function persistTraces(test, result, runId) {
  const attachments = (result.attachments || []).filter((item) => item.name === 'trace' && item.path);
  if (!attachments.length) return;

  const dir = runDir(runId);
  const traceDir = path.join(dir, 'traces');
  await fsp.mkdir(traceDir, { recursive: true });

  for (let index = 0; index < attachments.length; index++) {
    const attachment = attachments[index];
    const suffix = `${result.retry || 0}-${Date.now()}-${index}`;
    const name = `${safeName(test.title)}-${suffix}.zip`;
    const destination = path.join(traceDir, name);
    await fsp.copyFile(attachment.path, destination);
    await fsp.appendFile(
      path.join(dir, 'traces.ndjson'),
      JSON.stringify({
        at: new Date().toISOString(),
        file: `traces/${name}`,
        scenario: test.title,
        titlePath: test.titlePath(),
        testId: test.id,
        status: result.status,
        retry: result.retry || 0,
      }) + '\n',
      'utf8'
    );
  }
}

export default class UserbugReporter {
  constructor() {
    this.runId = getCurrentRun();
    this.traceWrites = [];
  }

  onTestEnd(test, result) {
    this.traceWrites.push(
      persistTraces(test, result, this.runId).catch((e) => {
        console.error('  نگهداری trace ناموفق بود:', e.message);
      })
    );
  }

  async onEnd(result) {
    await Promise.all(this.traceWrites);

    // `--list` گزارشگر را هم صدا می‌زند ولی اجرایی نساخته است.
    if (!hasRunDir(this.runId)) return;

    try {
      await finalizeRun(this.runId, { status: result.status });
    } catch (e) {
      console.error('  نهایی‌سازی اجرا ناموفق بود:', e.message);
    }
  }
}
