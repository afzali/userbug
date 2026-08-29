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
      --persona <novice|pro>      سرعت و رفتار کاربر؛ بر سناریو می‌چربد
      --device <a,b>              یک یا چند دستگاه؛ هر کدام یک اجرای جدا
      --author                    از کاوش، پیش‌نویس سناریو بنویس
      --headed                    مرورگر دیده شود
      --repeat <n>                هر سناریو n بار

  userbug replay <runId> [--only-findings]
                                  اجرای دوبارهٔ همان سناریوها روی همان دستگاه

  userbug models [--free]         فهرست زندهٔ مدل‌های OpenRouter
  userbug repro <runId> [اثرانگشت]
                                  بازتولید یک یافته از اجرای گذشته
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

    // با --file فقط همان یک سناریو باید اجرا شود. بدون این خط، راه‌اندازِ
    // YAML فایل را برمی‌داشت ولی specهای جاوااسکریپتی هم کنارش می‌رفتند و
    // «بازتولیدِ یک یافته» عملاً کل مجموعه را اجرا می‌کرد.
    if (flags.file) args.push('scenarios/yaml.spec.js');
    else if (flags.scenario) args.push(String(flags.scenario));
    // --scenario مسیر فایل را فیلتر می‌کند و --grep عنوان تست را. جدا نگه
    // داشته شدند چون یک بار «--scenario <عنوان>» بی‌صدا صفر تست اجرا کرد.
    if (flags.grep) args.push('--grep', String(flags.grep));
    if (flags.headed) args.push('--headed');
    if (flags.repeat) args.push(`--repeat-each=${flags.repeat}`);

    const env = { ...process.env, UB_TARGET: target };
    if (device) env.UB_DEVICE = device;
    if (flags.persona) env.UB_PERSONA = String(flags.persona);
    if (flags.author) env.UB_AUTHOR = '1';
    if (flags.file) env.UB_SCENARIO_FILE = String(flags.file);

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

/**
 * اجرای دوبارهٔ یک اجرای قبلی: همان هدف، همان دستگاه، همان سناریوها.
 *
 * ── چرا «resume» نداریم ──
 *
 * ادامه دادن از قدمی که ماند، یعنی بازگرداندن وضعیت مرورگر و اپ به همان نقطه.
 * آن وضعیت — نشست، دیتابیس محلی، کش — با پایان اجرا رفته و مرورگر راهی برای
 * برگرداندنش نمی‌دهد. پس به‌جای وعدهٔ نادرست، `replay` را داریم که از اول
 * اجرا می‌کند و `--only-findings` که فقط سناریوهای مشکل‌دار را برمی‌دارد.
 */
function cmdReplay({ flags, positional }) {
  const runId = resolveRunId(positional[0]);
  const run = readRun(runId);
  const scenarios = run.scenarios || [];

  if (!scenarios.length) {
    throw new Error(`اجرای ${runId} سناریویی ثبت نکرده است؛ شاید پیش از افزوده‌شدن این قابلیت بوده`);
  }

  const wanted = flags['only-findings'] ? scenarios.filter((s) => s.findings > 0) : scenarios;
  if (!wanted.length) throw new Error('آن اجرا یافته‌ای نداشت؛ چیزی برای اجرای دوباره نیست');

  const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const grep = wanted.map((s) => escape(s.name)).join('|');

  console.log(`\n  اجرای دوبارهٔ ${runId}`);
  console.log(`  دستگاه: ${run.device}  ·  سناریو: ${wanted.length} از ${scenarios.length}\n`);

  cmdRun({
    flags: { ...flags, grep, device: run.device === 'desktop' ? undefined : run.device },
    positional: [run.target],
  });
}

/**
 * فهرست زندهٔ مدل‌ها.
 *
 * اسلاگ‌ها را از حافظه ننویسید: عوض می‌شوند، و مدلی که وجود ندارد با یک ۴۰۰
 * وسط اجرا خودش را نشان می‌دهد نه پیش از آن.
 */
async function cmdModels({ flags }) {
  const { loadEnv } = await import('../src/env.js');
  loadEnv();

  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: process.env.OPENROUTER_API_KEY
      ? { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }
      : {},
  });
  if (!res.ok) throw new Error(`فهرست مدل‌ها نیامد: ${res.status}`);

  const all = (await res.json()).data || [];
  const rows = flags.free ? all.filter((m) => m.id.endsWith(':free')) : all;

  rows
    .map((m) => ({ id: m.id, ctx: m.context_length || 0 }))
    .sort((a, b) => b.ctx - a.ctx)
    .slice(0, Number(flags.limit || 30))
    .forEach((m) => console.log('  ' + m.id.padEnd(52) + String(m.ctx).padStart(9)));

    console.log(`\n  ${rows.length} مدل${flags.free ? ' رایگان' : ''}\n`);
}

/**
 * بازتولید یک یافته.
 *
 * قانون سوم: یافته بدون بازتولید، یافته نیست. این زیرفرمان همان فایلی را
 * اجرا می‌کند که هنگام دیده‌شدنِ یافته ساخته شد — نه بیشتر، نه کمتر.
 */
function cmdRepro({ flags, positional }) {
  const runId = resolveRunId(positional[0]);
  const dir = path.join(runDir(runId), 'repro');

  if (!fs.existsSync(dir)) throw new Error(`اجرای ${runId} فایل بازتولید ندارد`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yml'));
  if (!files.length) throw new Error(`اجرای ${runId} یافته‌ای نداشت`);

  const wanted = positional[1];
  if (!wanted) {
    console.log(`\n  ${files.length} یافتهٔ قابل بازتولید در ${runId}:\n`);
    for (const f of files) {
      const head = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/);
      const line = head.find((l) => l.startsWith('# یافته:')) || '';
      console.log(`   ${f.replace('.yml', '')}  ${line.replace('# یافته:', '').trim().slice(0, 90)}`);
    }
    console.log('\n  اجرا: userbug repro ' + runId + ' <اثرانگشت>\n');
    return;
  }

  const match = files.find((f) => f.startsWith(wanted));
  if (!match) throw new Error(`یافته‌ای با اثرانگشت «${wanted}» در آن اجرا نیست`);

  const run = readRun(runId);
    console.log(`\n  بازتولید ${match.replace('.yml', '')} از ${runId}\n`);

  cmdRun({
    flags: { ...flags, file: path.join(dir, match), device: run.device === 'desktop' ? undefined : run.device },
    positional: [run.target],
  });
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

  /**
   * هشدارِ مقایسهٔ ناهم‌جنس.
   *
   * یک بار اجرای کاملِ پیش از اصلاح را با اجرای تک‌سناریوییِ پس از آن مقایسه
   * کردیم و `diff` گفت «۷ یافته رفت». چهارتایشان اصلاً اجرا نشده بودند.
   * عددی که راست می‌گوید ولی معنایش غلط است، از عددِ غلط خطرناک‌تر است.
   */
  const setA = new Set((readRun(a).scenarios || []).map((s) => s.name));
  const setB = new Set((readRun(b).scenarios || []).map((s) => s.name));
  const onlyA = [...setA].filter((n) => !setB.has(n));
  const onlyB = [...setB].filter((n) => !setA.has(n));

  if (onlyA.length || onlyB.length) {
    console.log('');
    console.log('  ⚠ دو اجرا سناریوهای یکسانی نداشتند — «رفته» و «تازه» را با احتیاط بخوانید.');
    if (onlyA.length) console.log(`    فقط در اولی: ${onlyA.join('، ')}`);
    if (onlyB.length) console.log(`    فقط در دومی: ${onlyB.join('، ')}`);
  }

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
    case 'replay':
      cmdReplay(parsed);
      break;
    case 'models':
      await cmdModels(parsed);
      break;
    case 'repro':
      cmdRepro(parsed);
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
