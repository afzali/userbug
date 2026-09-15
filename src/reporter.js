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

const NEWLINE = String.fromCharCode(10);

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

/**
 * وضعیتِ هر تست — جدا از trace، و بی هیچ شرطی.
 *
 * ── چرا از trace بیرون آمد ──
 *
 * وضعیت پیش‌تر فقط کنارِ **فایلِ trace** نوشته می‌شد، پس وجودش به تنظیمِ
 * `trace` گره خورده بود: اجرایی که trace نمی‌سازد، وضعیتِ هیچ تستی را ثبت
 * نمی‌کرد و `junit.xml` همه را «نامعلوم» می‌دید. سبز/قرمز بودنِ یک سناریو
 * داده‌ای است که هرگز نباید به یک تنظیمِ تشخیصی وابسته باشد.
 *
 * ── چرا پیامِ خطا هم می‌آید ──
 *
 * «ورود قرمز شد» بی دلیلش یعنی باز کردنِ گزارشِ HTML برای هر ردیف. یک جملهٔ
 * اول کافی است تا در فهرست بشود فهمید چه شد.
 */
/** مسیرِ فایلِ تست، نسبت به ریشهٔ پروژه و با `/` — تا روی ویندوز هم یکسان باشد. */
function relativeFile(test) {
  const file = String(test.location?.file || '').split(path.sep).join('/');
  const index = file.indexOf('/scenarios/');
  return index >= 0 ? file.slice(index + 1) : '';
}

/** یادداشتِ اعلامیِ سناریو — `yaml.spec.js` می‌نویسدش. */
function annotationOf(test, type) {
  return (test.annotations || []).find((one) => one.type === type)?.description || '';
}

async function persistOutcome(test, result, runId) {
  const error = String(result.error?.message || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split(NEWLINE)
    .find((line) => line.trim())
    ?.slice(0, 300);

  await fsp.appendFile(
    path.join(runDir(runId), 'tests.ndjson'),
    JSON.stringify({
      at: new Date().toISOString(),
      scenario: test.title,
      /**
       * نامِ پایدار — عنوان `[پیش‌نویس]` می‌گیرد و روزی که تأیید شود عوض
       * می‌شود؛ تاریخچهٔ سلامت آن‌وقت یک سفر را دو تا می‌بیند.
       */
      name: annotationOf(test, 'ub-name') || test.title,
      draft: annotationOf(test, 'ub-status') === 'draft',
      /**
       * فایلِ منبع — تا خودآزماهای خودِ userbug از سلامتِ پروژهٔ کاربر جدا شوند.
       *
       * `testDir` کلِ `scenarios/` است، پس `_selftest/*` هم در هر اجرا
       * می‌رود. آن‌ها تستِ **این ابزار**اند، نه سفرِ کاربر؛ نشستنشان در
       * فهرستِ «کدام سفر سالم است» آن فهرست را بی‌مصرف می‌کند.
       */
      file: relativeFile(test),
      titlePath: test.titlePath(),
      testId: test.id,
      status: result.status,
      retry: result.retry || 0,
      ms: Math.round(result.duration || 0),
      error: error || '',
    }) + NEWLINE,
    'utf8'
  );
}

export default class UserbugReporter {
  constructor() {
    this.runId = getCurrentRun();
    this.traceWrites = [];
  }

  onTestEnd(test, result) {
    this.traceWrites.push(
      persistOutcome(test, result, this.runId).catch((e) => {
        console.error('  ثبت وضعیت تست ناموفق بود:', e.message);
      }),
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
