#!/usr/bin/env node
/**
 * userbug — خط فرمان.
 *
 * عمداً بدون کتابخانهٔ آرگومان. چیزی که اینجا لازم است چند زیرفرمان و چند
 * پرچم است، و یک وابستگی کمتر یعنی یک چیز کمتر برای شکستن.
 *
 * قانون: هر کاری که بعداً رابط گرافیکی می‌کند، باید از همین‌جا هم بشود.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizeRun, printSummary } from '../src/finalize.js';
import { runDir } from '../src/store/run-store.js';
import { dedupe } from '../src/observe/oracle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = path.join(ROOT, 'runs');
const PLAYWRIGHT_CLI = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');

const HELP = `
userbug — شبیه‌ساز کاربر برای تست اپ‌های وب

  userbug run [هدف] [گزینه‌ها]     اجرای سناریوها
      --scenario <مسیر>           فیلتر روی مسیر فایل سناریو
      --grep <عنوان>              فیلتر روی عنوان تست
      --device <a,b>              یک یا چند دستگاه؛ هر کدام یک اجرای جدا
      --headed                    مرورگر دیده شود
      --repeat <n>                هر سناریو n بار

  userbug list [--limit n]        فهرست اجراها
  userbug report <runId|latest>   بازسازی گزارش از مخزن، بدون اجرای دوباره
  userbug diff <runA> <runB>      چه یافته‌ای تازه است و چه یافته‌ای رفته

  runId می‌تواند «latest» یا پیشوندِ یکتا باشد.
`;

// ── ابزار ──

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else flags[key] = argv[++i];
    } else positional.push(a);
  }
  return { flags, positional };
}

function listRunIds() {
  if (!fs.existsSync(RUNS)) return [];
  return fs
    .readdirSync(RUNS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/** «latest» یا پیشوندِ یکتا را به شناسهٔ کامل تبدیل کن. */
function resolveRunId(input) {
  const ids = listRunIds();
  if (!ids.length) throw new Error('هیچ اجرایی در runs/ نیست');
  if (!input || input === 'latest') return ids[ids.length - 1];
  if (ids.includes(input)) return input;
  const matches = ids.filter((id) => id.startsWith(input));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) throw new Error(`اجرایی با شناسهٔ «${input}» نیست`);
  throw new Error(`«${input}» به ${matches.length} اجرا می‌خورد؛ دقیق‌تر بنویسید`);
}

function readRun(runId) {
  const file = path.join(runDir(runId), 'run.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readFindings(runId) {
  const file = path.join(runDir(runId), 'findings.ndjson');
  if (!fs.existsSync(file)) return [];
  const all = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  return dedupe(all.filter((f) => !f.synthetic));
}

// ── زیرفرمان‌ها ──

function cmdRun({ flags, positional }) {
  const target = positional[0] || 'nepi';
  const devices = String(flags.device || '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);

  // بدون --device، پیش‌فرضِ کانفیگ هدف. با چند دستگاه، چند اجرای مستقل —
  // چون یک اجرا باید یک روایت باشد و مخلوط کردن دستگاه‌ها گزارش را بی‌معنا می‌کند.
  const runs = devices.length ? devices : [null];
  const results = [];

  for (const device of runs) {
    // مستقیم CLI پلی‌رایت با node، نه از راه npx و پوسته.
    //
    // با `shell: true` آرگومانِ فارسیِ `--grep` در پوستهٔ ویندوز مخدوش می‌شد و
    // نتیجه‌اش «صفر تست اجرا شد» بدون هیچ خطایی بود — یعنی همان شکستِ خاموشی
    // که این ابزار قرار است پیدایش کند، در خودش.
    const args = [PLAYWRIGHT_CLI, 'test'];
    if (flags.scenario) args.push(String(flags.scenario));
    // --scenario مسیر فایل را فیلتر می‌کند و --grep عنوان تست را. جدا نگه
    // داشته شدند چون یک بار «--scenario <عنوان>» بی‌صدا صفر تست اجرا کرد.
    if (flags.grep) args.push('--grep', String(flags.grep));
    if (flags.headed) args.push('--headed');
    if (flags.repeat) args.push(`--repeat-each=${flags.repeat}`);

    const env = { ...process.env, UB_TARGET: target };
    if (device) env.UB_DEVICE = device;

    if (device) console.log(`\n──── دستگاه: ${device} ────`);
    const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env });
    results.push({ device: device || '(پیش‌فرض)', code: r.status });
  }

  if (runs.length > 1) {
    console.log('\n  خلاصهٔ ماتریس:');
    for (const r of results) {
      console.log(`   • ${r.device}: ${r.code === 0 ? 'بدون یافته' : 'یافته دارد'}`);
    }
    console.log('');
  }

  // کد خروج غیرصفر یعنی یافته‌ای هست — نه اینکه ابزار خراب شده
  process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
}

function cmdList({ flags }) {
  const limit = Number(flags.limit || 20);
  const ids = listRunIds().slice(-limit).reverse();
  if (!ids.length) return console.log('هیچ اجرایی ثبت نشده.');

  console.log('');
  console.log('  اجرا                                هدف     دستگاه      قدم  یافته  وضعیت');
  console.log('  ' + '─'.repeat(78));
  for (const id of ids) {
    let r;
    try {
      r = readRun(id);
    } catch {
      continue;
    }
    const row = [
      id.padEnd(34),
      String(r.target || '').padEnd(7),
      String(r.device || '').padEnd(11),
      String(r.steps ?? '—').padStart(4),
      String(r.findings ?? '—').padStart(6),
      r.status === 'running' ? 'ناتمام' : r.status,
    ];
    console.log('  ' + row.join(' '));
  }
  console.log('');
}

async function cmdReport({ positional }) {
  const runId = resolveRunId(positional[0]);
  printSummary(await finalizeRun(runId));
}

function cmdDiff({ positional }) {
  const a = resolveRunId(positional[0]);
  const b = resolveRunId(positional[1]);

  const fa = new Map(readFindings(a).map((f) => [f.fingerprint, f]));
  const fb = new Map(readFindings(b).map((f) => [f.fingerprint, f]));

  const added = [...fb.values()].filter((f) => !fa.has(f.fingerprint));
  const gone = [...fa.values()].filter((f) => !fb.has(f.fingerprint));
  const kept = [...fb.values()].filter((f) => fa.has(f.fingerprint));

  console.log(`\n  ${a}\n  ${b}\n`);
  console.log(`  تازه: ${added.length}  ·  رفته: ${gone.length}  ·  مانده: ${kept.length}\n`);

  for (const f of added) console.log(`   + [${f.source}] ${f.normalized.slice(0, 110)}`);
  for (const f of gone) console.log(`   − [${f.source}] ${f.normalized.slice(0, 110)}`);
  console.log('');
}

// ── ورودی ──

const [, , cmd, ...rest] = process.argv;
const parsed = parseArgs(rest);

try {
  switch (cmd) {
    case 'run':
      cmdRun(parsed);
      break;
    case 'list':
      cmdList(parsed);
      break;
    case 'report':
      await cmdReport(parsed);
      break;
    case 'diff':
      cmdDiff(parsed);
      break;
    default:
      console.log(HELP);
      process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  console.error(`\n  خطا: ${e.message}\n`);
  process.exit(2);
}
