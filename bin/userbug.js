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
import { assertModelSlug, listModels, loadGlobalConfig, resolveModel } from '../src/models/config.js';
import { Budget } from '../src/models/provider.js';
import { loadTarget } from '../src/target.js';
import { assertProjectKey, renderTargetConfig } from '../src/target-template.js';
import {
  createSchedule,
  listSchedules,
  removeSchedule,
  runScheduleNow,
  scheduleArgs,
} from '../src/schedule.js';
import { renderJUnit } from '../src/report/junit.js';
import { knowledgeDir, readDossier, writeDossier } from '../src/knowledge/store.js';
import { digestSource } from '../src/knowledge/digest.js';
import { answerQuestion, mergeIntoDossier } from '../src/knowledge/merge.js';
import { listAccounts, removeAccount, saveAccount } from '../src/knowledge/credentials.js';
import { addUserInvariant, listInvariants, mergeInvariants, setInvariantMode } from '../src/knowledge/invariants.js';
import { fetchDoc, listDocs, removeDoc } from '../src/knowledge/docs.js';
import { readHistory } from '../src/knowledge/history.js';
import { renderDossier } from '../src/knowledge/render.js';
import { DEFAULT_MODE, readChecksConfig, setCheckMode } from '../src/checks/config.js';
import { UNIVERSAL, UNIVERSAL_IDS } from '../src/checks/universal.js';
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
      --depth <n>                 سقف قدمِ هر کاوش؛ بر سناریو می‌چربد
      --model <اسلاگ>             مدل هوش مصنوعی؛ بر کانفیگ می‌چربد
      --device <a,b>              یک یا چند دستگاه؛ هر کدام یک اجرای جدا
      --author                    از کاوش، پیش‌نویس سناریو بنویس
      --headed                    مرورگر دیده شود
      --repeat <n>                هر سناریو n بار
      --junit <مسیر>              کپی خروجی JUnit برای CI

  userbug replay <runId> [--only-findings]
                                  اجرای دوبارهٔ همان سناریوها روی همان دستگاه

  userbug init <کلید> --base-url <آدرس> [گزینه‌ها]
                                  ساخت کانفیگ یک پروژهٔ تازه در targets/
      --title <نام>               نام خوانا (پیش‌فرض: همان کلید)
      --api-url <آدرس>            آدرس API، برای فعل request
      --environment <local|staging|production>
      --device <نام>              پیش‌فرض desktop
      --locale <fa> --dir <rtl|ltr>
      --log <نام=مسیر>            لاگ سرور؛ تکرارشدنی
      --source <مسیر>             پوشهٔ سورس پروژه

  userbug schedule list           زمان‌بندی‌های ثبت‌شده و وضعیتشان
  userbug schedule add <کلید> --target <هدف> --time HH:MM [گزینه‌ها]
                                  ساخت تسک در زمان‌بندِ سیستم
      --weekly --days MON,WED     هفتگی به‌جای روزانه
      --grep --device --persona --model --depth --repeat
                                  همان پرچم‌های run
  userbug schedule remove <کلید>  حذف تسک و فایل‌هایش (لاگ می‌ماند)
  userbug schedule run <کلید>     اجرای دستیِ همان تسک، برای آزمودن

  userbug learn <هدف> [گزینه‌ها]  خواندن سورس و ساختنِ شناخت
      --dry                       فقط ساختار (روت و استک)؛ بی‌مدل و بی‌ذخیره
      --model <اسلاگ>             مدل تحلیل؛ بر کانفیگ می‌چربد

  userbug knowledge <هدف> [گزینه‌ها]
                                  شناختی که از این پروژه داریم
      --json                      پروندهٔ خام، برای ابزارهای دیگر
      --history [n]               تاریخچهٔ تغییرِ شناخت، تازه‌ترین اول
      --questions                 پرسش‌های بی‌جواب، شماره‌دار
      --answer <شماره> --as <متن> ثبت جواب؛ تنها راهی که چیزی by:user می‌شود

  userbug docs <هدف>              مستنداتِ بیرونیِ این پروژه
      --add <آدرس> [--note <چرا>] واکشی و ذخیره؛ by: docs، نه by: user
      --remove <نام فایل>         حذف

  userbug invariants <هدف>        قاعده‌هایی که نباید بشکنند (باگ منطقی)
      --off <شناسه> --why <متن>   خاموش کردن؛ دلیل اجباری
      --watch/--expect <شناسه>    تغییر حالت
      --add <شناسه> --statement <جمله> --query <SQL>
                                  ناوردای دستی؛ by: user

  userbug accounts <هدف>          حساب‌های ذخیره‌شدهٔ این پروژه
      --add <شناسه> --email <ایمیل> --password-env <NAME>
                                  افزودن؛ رمز از متغیر محیطی خوانده می‌شود
      --remove <شناسه>            حذف
      --allow-production          تأییدِ جدا برای هدفِ تولیدی

  userbug tour <هدف> [--device <نام>] [--name <عنوان>]
                                  گشتِ زنده: مرورگر باز می‌شود، شما کار
                                  می‌کنید، و ابزار ضبط و شناخت می‌سازد

  userbug checks <هدف>            چکِ همگانی: حالت، برخورد، و سروصدا
      --off <شناسه> --why <متن>   خاموش کردن؛ دلیل اجباری است
      --watch <شناسه>             یافته ثبت کن، ولی نشکن (پیش‌فرض)
      --expect <شناسه>            سخت بشکن — یعنی «این قاعده است»

  userbug models [--free]         فهرست زندهٔ مدل‌های OpenRouter
  userbug repro <runId> [اثرانگشت]
                                  بازتولید یک یافته از اجرای گذشته
  userbug list [--limit n]        فهرست اجراها
  userbug report <runId|latest> [--junit <مسیر>]
                                  بازسازی گزارش از مخزن، بدون اجرای دوباره
  userbug diff <runA> <runB>      چه یافته‌ای تازه است و چه یافته‌ای رفته

  runId می‌تواند «latest» یا پیشوندِ یکتا باشد.

  کد خروج: ۰ بدون یافته · ۱ یافته دارد · ۲ خطای اجراگر.
  هر اجرا کنار گزارش، یک junit.xml هم در پوشهٔ خودش می‌گذارد.
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
      const value = next === undefined || next.startsWith('--') ? true : argv[++i];

      // پرچمِ تکرارشده جمع می‌شود، نه اینکه قبلی را دور بریزد: `--log` باید
      // چند بار بیاید (`--log php=… --log vite=…`). پیش‌تر آخری برنده بود و
      // بقیه بی‌صدا گم می‌شدند.
      if (key in flags) flags[key] = [].concat(flags[key], value);
      else flags[key] = value;
    } else positional.push(a);
  }
  return { flags, positional };
}

function runStartedAtMs(runId, startedAt) {
  const metadataTime = Date.parse(String(startedAt || ''));
  if (Number.isFinite(metadataTime)) return metadataTime;

  const match = String(runId).match(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})/);
  if (!match) return Number.NEGATIVE_INFINITY;
  const idTime = Date.parse(`${match[1]}:${match[2]}:${match[3]}Z`);
  return Number.isFinite(idTime) ? idTime : Number.NEGATIVE_INFINITY;
}

function compareRunEntries(left, right) {
  const timeDifference = runStartedAtMs(left.runId, left.startedAt) - runStartedAtMs(right.runId, right.startedAt);
  if (timeDifference) return timeDifference;
  return left.runId === right.runId ? 0 : left.runId < right.runId ? -1 : 1;
}

function listRunIds() {
  if (!fs.existsSync(RUNS)) return [];
  return fs
    .readdirSync(RUNS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      let startedAt = null;
      try {
        startedAt = readRun(entry.name).startedAt;
      } catch {
        // پوشهٔ تازه یا artifact قدیمی با timestamp خود شناسه مرتب می‌شود.
      }
      return { runId: entry.name, startedAt };
    })
    .sort(compareRunEntries)
    .map((entry) => entry.runId);
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

/**
 * مسیر کپی JUnit برای یک اجرا.
 *
 * `--junit` بدون مقدار یعنی «همان فایلِ داخل پوشهٔ اجرا کافی است» و مسیر
 * دلخواهی ساخته نمی‌شود.
 */
function junitPathFor(flag, device, multiDevice) {
  if (!flag || flag === true) return null;
  const requested = path.resolve(String(flag));

  /**
   * پسوند همیشه `.xml` می‌شود، حتی اگر مسیر پسوند دیگری داشته باشد.
   *
   * دو دلیل: الگوهای `*.xml` در CI فایلِ بی‌پسوند را نمی‌بینند، و مهم‌تر —
   * `clearJUnitTarget` این مسیر را پیش از اجرا پاک می‌کند. با تحمیل `.xml`،
   * یک `--junit src/finalize.js` اشتباهی به `src/finalize.js.xml` می‌خورد،
   * نه به خود فایل.
   */
  const stem = requested.toLowerCase().endsWith('.xml') ? requested.slice(0, -4) : requested;
  if (!multiDevice) return `${stem}.xml`;

  const slug = String(device || 'default').replace(/[^\p{L}\p{N}_-]+/gu, '-');
  return `${stem}.${slug}.xml`;
}

/**
 * مسیر JUnit را پیش از اجرا خالی کن.
 *
 * روی رانرِ self-hosted یا با کشِ ورک‌اسپیس، فایلِ سبزِ بیلد قبلی همان‌جا
 * نشسته است. اگر پاک نشود، اجرایی که امروز می‌شکند نتیجهٔ دیروز را به ارث
 * می‌دهد و CI سبز می‌شود. با پاک کردنِ اول، وجودِ فایل بعد از اجرا دقیقاً
 * یعنی «همین اجرا نوشتش».
 */
function clearJUnitTarget(file) {
  if (!file) return;
  try {
    fs.rmSync(file, { force: true });
  } catch (cause) {
    console.error(`  پاک کردن JUnit قبلی ناموفق بود: ${cause.message}`);
  }
}

/**
 * JUnit برای اجرایی که هیچ‌وقت شروع نشد.
 *
 * دستگاه ناشناخته یا کانفیگ شکسته پیش از `globalTeardown` می‌شکند، پس
 * نهایی‌سازی اجرا نمی‌شود و فایلی ساخته نمی‌شود. CI که آن مسیر را می‌خواند
 * «نتیجه‌ای نیست» می‌بیند و بسته به تنظیمش، بی‌صدا سبز می‌شود. کد خروج ۲
 * درست است ولی کافی نیست؛ فایل هم باید وجود داشته باشد و صریح بگوید چه شد.
 */
function writeRunnerFailureJUnit(file, { runId, target, device, detail }) {
  // اینجا وجودِ فایل یعنی نهایی‌سازیِ همین اجرا نوشتش؛ مسیر پیش از spawn
  // خالی شده بود.
  if (!file || fs.existsSync(file)) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      renderJUnit({
        run: { runId, target, device: device || 'desktop', status: 'error', error: detail },
        steps: [],
        findings: [],
      }),
      'utf8'
    );
    console.error(`  JUnit خطای اجراگر: ${file}`);
  } catch (cause) {
    console.error(`  نوشتن JUnit خطای اجراگر ناموفق بود: ${cause.message}`);
  }
}

/**
 * `--depth` — سقف قدمِ هر کاوش.
 *
 * عمق را عمداً به‌شکل عددِ قدم می‌گیریم، نه نامی مثل «کم/متوسط/زیاد». هر قدمِ
 * کاوش یک فراخوانی مدل است، پس عدد همان هزینه است؛ نامِ خوش‌آهنگ فقط پنهانش
 * می‌کرد.
 *
 * ورودیِ نامعتبر بلند می‌شکند، نه اینکه بی‌صدا نادیده گرفته شود: یک `--depth`
 * تایپیِ رد‌شده یعنی کاربر فکر می‌کند عمق را عوض کرده و نکرده — همان شکستِ
 * خاموشی که این ابزار برای شکارش هست.
 */
function parseDepth(flag) {
  if (flag === undefined) return null;
  const depth = Number(flag);
  if (!Number.isInteger(depth) || depth < 1 || depth > 100) {
    throw new Error(`--depth باید عددی صحیح بین ۱ و ۱۰۰ باشد؛ «${flag}» نبود`);
  }
  return depth;
}

// ── زیرفرمان‌ها ──

function cmdRun({ flags, positional }) {
  const target = positional[0] || 'nepi';
  // پیش از spawn اعتبارسنجی می‌شوند تا خطای پرچم، وسط اجرا پیدا نشود
  const depth = parseDepth(flags.depth);
  const model = flags.model === undefined ? null : assertModelSlug(flags.model);
  const devices = String(flags.device || '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);

  // بدون --device، پیش‌فرضِ کانفیگ هدف. با چند دستگاه، چند اجرای مستقل —
  // چون یک اجرا باید یک روایت باشد و مخلوط کردن دستگاه‌ها گزارش را بی‌معنا می‌کند.
  const runs = devices.length ? devices : [null];
  const results = [];

  const classifyExit = (result, runId) => {
    if (result.error || !Number.isInteger(result.status)) return 2;
    if (result.status === 0) return 0;
    try {
      const run = readRun(runId);
      if (result.status === 1 && run.status !== 'running' && Number(run.findings || 0) > 0) return 1;
    } catch {
      // config/globalSetup ممکن است پیش از ساخت artifact شکسته باشد.
    }
    return 2;
  };

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

    // هر invocation پلی‌رایت هویت مستقل دارد؛ workerها و reporter این مقدار را
    // به ارث می‌برند و دیگر برای مالکیت artifact به runs/.current نگاه نمی‌کنند.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const runId = `${stamp}_${target}_${process.pid.toString(16)}${Math.random().toString(16).slice(2, 10)}`;
    const env = { ...process.env, UB_TARGET: target, UB_RUN_ID: runId };
    if (device) env.UB_DEVICE = device;
    if (flags.persona) env.UB_PERSONA = String(flags.persona);
    if (depth) env.UB_DEPTH = String(depth);
    if (model) env.UB_MODEL = model;
    if (flags.author) env.UB_AUTHOR = '1';
    if (flags.file) env.UB_SCENARIO_FILE = String(flags.file);

    // اجرای چنددستگاهی چند اجرای مستقل است؛ یک مسیر ثابت JUnit یعنی آخرین
    // دستگاه بقیه را پاک می‌کند و CI فقط یکی را می‌بیند.
    const junit = junitPathFor(flags.junit, device, runs.length > 1);
    if (junit) env.UB_JUNIT = junit;
    clearJUnitTarget(junit);

    if (device) console.log(`\n──── دستگاه: ${device} ────`);
    const processResult = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env });
    const code = classifyExit(processResult, runId);
    if (code === 2) {
      const detail = processResult.error?.message || `کد Playwright: ${processResult.status ?? 'نامشخص'}`;
      console.error(`\n  خطای اجراگر برای ${device || 'دستگاه پیش‌فرض'} — ${detail}\n`);
      writeRunnerFailureJUnit(junit, { runId, target, device, detail });
    }
    results.push({ device: device || '(پیش‌فرض)', code });
  }

  if (runs.length > 1) {
    console.log('\n  خلاصهٔ ماتریس:');
    for (const r of results) {
      const label = r.code === 0 ? 'بدون یافته' : r.code === 1 ? 'یافته دارد' : 'خطای اجراگر';
      console.log(`   • ${r.device}: ${label}`);
    }
    console.log('');
  }

  // ۱ فقط finding معتبر است؛ خرابی config/spawn/setup با ۲ به GUI می‌رسد.
  const exitCode = results.some((r) => r.code === 2) ? 2 : results.some((r) => r.code === 1) ? 1 : 0;
  process.exit(exitCode);
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
 * واکشی در `src/models/config.js` است، نه اینجا: رابط گرافیکی هم همین فهرست را
 * برای کشویی انتخاب مدل می‌خواهد و دو واکشیِ جدا دیر یا زود واگرا می‌شوند.
 */
async function cmdModels({ flags }) {
  const rows = await listModels({ free: Boolean(flags.free), limit: Number(flags.limit || 30) });

  for (const row of rows) {
    console.log('  ' + row.id.padEnd(52) + String(row.context).padStart(9));
  }

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

/**
 * هضمِ سورس → پروندهٔ شناخت.
 *
 * ── چرا `--dry` هست ──
 *
 * نیمهٔ اولِ این کار (روت و استک) قطعی و رایگان است؛ نیمهٔ دوم پول خرج
 * می‌کند. `--dry` فقط نیمهٔ اول را نشان می‌دهد، تا بشود پیش از خرج کردن دید
 * که آشکارساز چیزی پیدا کرده یا نه. روی پروژه‌ای که هیچ روتی پیدا نشود،
 * فراخوانیِ مدل فقط پول سوزاندن است.
 */
async function cmdLearn({ flags, positional }) {
  const name = positional[0];
  if (!name) throw new Error('نام هدف لازم است: userbug learn <هدف>');

  const target = await loadTarget(name);
  const withModel = !flags.dry;

  let models;
  if (withModel) {
    models = resolveModel({
      global: await loadGlobalConfig(),
      target,
      role: 'analyze',
      model: flags.model ? assertModelSlug(flags.model) : undefined,
    });
    if (!models.apiKey) {
      throw new Error(
        'کلید مدل نیست. یا `OPENROUTER_API_KEY` را بگذارید،\n' +
          '  یا با `--dry` فقط ساختار را بخوانید (روت و استک، بی‌مدل).'
      );
    }
  }

  const budget = withModel ? new Budget(models.budgetPerRun) : undefined;
  const { partial, scan, usedModel, note } = await digestSource({ target, models, budget });

  console.log(`\n  سورس: ${scan.root}`);
  console.log(`  ${scan.files.length} فایل خوانده شد  ·  ${scan.routes.length} روت پیدا شد`);
  const detectors = Object.entries(scan.byDetector).filter(([, count]) => count);
  if (detectors.length) console.log(`  آشکارساز: ${detectors.map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  if (note) console.log(`  ${note}`);

  if (scan.invariants?.length) {
    console.log(`  ${scan.invariants.length} ناوردا از schema استخراج شد`);
  }

  if (flags.dry) {
    for (const route of scan.routes) console.log(`    ${route.path}`);
    console.log('\n  «--dry» بود؛ چیزی ذخیره نشد.\n');
    return;
  }

  /**
   * ناوردا جدا از پرونده ذخیره می‌شود، ولی همین‌جا — چون از همان پیمایش
   * درآمده و دو بار خواندنِ سورس بی‌دلیل است.
   */
  if (scan.invariants?.length) {
    const merged = mergeInvariants(name, scan.invariants);
    console.log(`  ناوردا: ${merged.added} تازه · ${merged.kept} با حالتِ قبلی حفظ شد`);
  }

  const current = readDossier(name);
  const { dossier, kept, replaced, conflicts } = mergeIntoDossier(current, partial);
  const { changes } = await writeDossier(name, dossier, { by: 'source', why: 'userbug learn --source' });

  console.log(`  ادغام: ${replaced} تازه یا جایگزین  ·  ${kept} دست‌نخورده  ·  ${conflicts} تعارض`);
  if (conflicts) console.log('  تعارض یعنی حرفِ کاربر ماند و حرفِ تازه کنارش ثبت شد. در رابط ببینیدش.');
  console.log(`  ${changes.length} تغییر در تاریخچه ثبت شد.`);

  const open = dossier.openQuestions.filter((item) => !item.answer);
  if (open.length) {
    console.log(`\n  ${open.length} پرسشِ بی‌جواب — جوابشان از حدسِ مدل معتبرتر است:`);
    for (const item of open.slice(0, 10)) console.log(`    · ${item.q}`);
  }

  if (budget) console.log(`\n  مدل: ${models.model}  ·  ${budget.calls} فراخوانی  ·  ${budget.spent.toFixed(4)}$`);
  else if (!usedModel) console.log('\n  بی‌مدل اجرا شد؛ فقط ساختار.');
  console.log('');
}

/**
 * مستنداتِ بیرونی.
 *
 * ── چرا `--add` صریح لازم است و کشفِ خودکار نداریم ──
 *
 * این تنها جای ابزار است که به شبکه وصل می‌شود و محتوای یک صفحهٔ وب را وارد
 * شناخت می‌کند. ابزاری که خودش تصمیم بگیرد کجا وصل شود، ابزارِ دیگری است.
 */
async function cmdDocs({ flags, positional }) {
  const name = positional[0];
  if (!name) throw new Error('نام هدف لازم است: userbug docs <هدف>');

  if (flags.remove) {
    await removeDoc(name, String(flags.remove));
    console.log('');
    console.log(`  حذف شد: ${flags.remove}`);
    console.log('');
    return;
  }

  if (flags.add) {
    const saved = await fetchDoc({ target: name, url: String(flags.add), note: String(flags.note ?? '') });
    console.log('');
    console.log(`  واکشی شد: ${saved.relative}  (${saved.bytes} نویسه)`);
    if (saved.title) console.log(`  عنوان: ${saved.title}`);
    console.log(`  منبع: ${saved.url}`);
    console.log('');
    console.log('  این متن `by: docs` است — داده، نه دستور. در ساختِ سناریو و هضم سورس دیده می‌شود.');
    console.log('');
    return;
  }

  const docs = await listDocs(name);
  if (!docs.length) {
    console.log('');
    console.log('  مستندی ذخیره نشده.');
    console.log('  افزودن: userbug docs <هدف> --add <آدرس> [--note <چرا>]');
    console.log('');
    return;
  }

  console.log('');
  for (const doc of docs) console.log(`  ${doc.relative.padEnd(50)} ${doc.bytes} بایت`);
  console.log('');
}

/**
 * ناوردا — قاعده‌هایی که هرگز نباید بشکنند.
 *
 * ── چرا اینجا فقط نمایش و تنظیم است ──
 *
 * استخراج کارِ `learn` است، چون از همان پیمایشِ سورس درمی‌آید. اینجا فقط
 * دیدن، خاموش کردن، و افزودنِ دستی.
 */
function cmdInvariants({ flags, positional }) {
  const name = positional[0];
  if (!name) throw new Error('نام هدف لازم است: userbug invariants <هدف>');

  for (const [flag, mode] of [
    ['off', 'off'],
    ['watch', 'watch'],
    ['expect', 'expect'],
  ]) {
    if (flags[flag] === undefined) continue;
    const saved = setInvariantMode(name, String(flags[flag]), mode, String(flags.why ?? ''));
    console.log('');
    console.log(`  ${saved.id} → ${saved.mode}${saved.why ? `  («${saved.why}»)` : ''}`);
    console.log('');
    return;
  }

  if (flags.add) {
    const saved = addUserInvariant(name, {
      id: String(flags.add),
      statement: String(flags.statement ?? ''),
      query: String(flags.query ?? ''),
      expect: String(flags.expect ?? 'empty'),
    });
    console.log('');
    console.log(`  ثبت شد (by: user): ${saved.id} — ${saved.statement}`);
    console.log('');
    return;
  }

  const invariants = listInvariants(name);
  if (!invariants.length) {
    console.log('');
    console.log('  ناوردایی ثبت نشده.');
    console.log('  استخراج از schema: userbug learn <هدف>');
    console.log('  افزودن دستی: userbug invariants <هدف> --add <شناسه> --statement <جمله> --query <SQL>');
    console.log('');
    return;
  }

  console.log('');
  for (const item of invariants) {
    console.log(`  [${item.mode.padEnd(6)}] ${item.id}`);
    console.log(`            ${item.statement}`);
    console.log(`            منبع: ${item.by}${item.from ? ` · ${item.from}` : ''}${item.why ? ` · «${item.why}»` : ''}`);
  }
  console.log('');
  console.log('  اجرا: در پایان هر سناریو، اگر هدف state.sql داشته باشد.');
  console.log('');
}

/**
 * حساب‌های ذخیره‌شده.
 *
 * ── چرا رمز از آرگومان گرفته نمی‌شود ──
 *
 * `--password` در خط فرمان یعنی رمز در تاریخچهٔ shell و در فهرست پروسه‌ها
 * می‌نشیند. پس فقط `--password-env` هست: نامِ متغیری که رمز در آن است.
 * برای رمزِ متنی باید از رابط رفت، جایی که هشدارش دیده می‌شود.
 */
async function cmdAccounts({ flags, positional }) {
  const name = positional[0];
  if (!name) throw new Error('نام هدف لازم است: userbug accounts <هدف>');

  if (flags.remove) {
    const removed = removeAccount(name, String(flags.remove));
    console.log(removed ? `\n  حسابِ «${flags.remove}» حذف شد.\n` : `\n  حسابی به نام «${flags.remove}» نبود.\n`);
    return;
  }

  if (flags.add) {
    const target = await loadTarget(name);
    const saved = saveAccount({
      target: name,
      environment: target.environment,
      id: String(flags.add),
      email: String(flags.email ?? ''),
      username: String(flags.username ?? ''),
      passwordEnv: String(flags['password-env'] ?? ''),
      note: String(flags.note ?? ''),
      allowProduction: flags['allow-production'] === true,
    });
    console.log(`\n  ثبت شد: ${saved.id} · ${saved.email || saved.username} · رمز از ${saved.passwordEnv}`);
    if (!saved.hasPassword) console.log(`  ⚠ متغیر ${saved.passwordEnv} هنوز تنظیم نشده.`);
    console.log(`\n  در سناریو: {{account.${saved.id}.email}} و {{account.${saved.id}.password}}\n`);
    return;
  }

  const accounts = listAccounts(name);
  if (!accounts.length) {
    console.log('\n  حسابی ثبت نشده.');
    console.log('  افزودن: userbug accounts <هدف> --add <شناسه> --email <ایمیل> --password-env <NAME>\n');
    return;
  }

  console.log('');
  console.log('  شناسه            ایمیل/کاربر                منبع رمز        وضعیت');
  console.log('  ' + '─'.repeat(74));
  for (const account of accounts) {
    console.log(
      '  ' +
        [
          account.id.padEnd(16),
          (account.email || account.username).padEnd(26),
          (account.passwordEnv || (account.source === 'plain' ? '(متنی)' : '—')).padEnd(15),
          account.hasPassword ? 'آماده' : 'رمز در دسترس نیست',
        ].join(' ')
    );
  }
  console.log('');
}

/**
 * گشتِ زنده از خط فرمان.
 *
 * ── چرا اینجا هم هست، وقتی جای اصلی‌اش رابط است ──
 *
 * قاعدهٔ پروژه: هر کاری که رابط می‌کند از CLI هم بشود. ولی تفاوتشان واقعی
 * است و پنهان نمی‌شود: رابط پنلِ زنده دارد و اینجا فقط ترمینال. پس توضیحِ
 * صفحه از stdin گرفته می‌شود و قدم‌ها همان‌طور که ضبط می‌شوند چاپ می‌شوند.
 */
async function cmdTour({ flags, positional }) {
  const name = positional[0];
  if (!name) throw new Error('نام هدف لازم است: userbug tour <هدف>');

  const { TourSession } = await import('../src/tour/session.js');
  const { emitTour } = await import('../src/tour/emit.js');

  const session = new TourSession({ target: name, device: flags.device });

  session.on('event', (event) => {
    if (event.type === 'step') console.log(`  ● ${event.step.label || event.step.action}`);
    else if (event.type === 'finding') console.log(`  ⚠ ${event.finding.message}`);
    else if (event.type === 'navigated') console.log(`  → ${event.url}`);
    else if (event.type === 'warning') console.log(`  ! ${event.message}`);
  });

  await session.start();
  console.log(`\n  گشت آغاز شد: ${session.runId}`);
  console.log('  مرورگر باز است. کار کنید؛ هرچه می‌کنید ضبط می‌شود.\n');
  console.log('  فرمان‌ها (در همین ترمینال):');
  console.log('    <متن>   توضیحِ صفحهٔ فعلی را ثبت کن');
  console.log('    p       صفحهٔ فعلی را بی‌توضیح ثبت کن');
  console.log('    n <متن> یادداشت/ایراد ثبت کن');
  console.log('    r       ضبطِ قدم‌ها را روشن/خاموش کن');
  console.log('    q       پایان و نوشتنِ خروجی\n');

  /**
   * خواندنِ خط‌به‌خطِ ترمینال.
   *
   * `readline` به‌جای حلقهٔ دستی، چون کاربر فارسی می‌نویسد و شکستنِ درستِ
   * چندبایتی کارِ خودش است.
   */
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'گشت> ' });
  rl.prompt();

  await new Promise((resolve) => {
    session.on('event', (event) => {
      if (event.type === 'stopped') {
        rl.close();
        resolve();
      }
    });

    rl.on('line', async (line) => {
      const text = line.trim();
      try {
        if (text === 'q') return void (await session.stop('پایان از ترمینال'));
        if (text === 'p') await session.notePage({});
        else if (text === 'r') session.setRecording(!session.recording);
        else if (text.startsWith('n ')) await session.note(text.slice(2));
        else if (text) await session.notePage({ purpose: text });
      } catch (cause) {
        console.error(`  خطا: ${cause.message}`);
      }
      rl.prompt();
    });

    rl.on('close', () => session.stop('ترمینال بسته شد').then(resolve, resolve));
  });

  const state = session.snapshotState();
  const landing = !flags.name && state.pages.length > 0;
  const written = await emitTour({ target: name, state, name: flags.name, landing });

  console.log(`\n  گشت تمام شد: ${state.steps.length} قدم · ${state.pages.length} صفحه · ${state.findings.length} یافته`);
  console.log(`  صفحه‌های ثبت‌شده: ${written.pages}  ·  کشِ آموخته: ${written.cached} مدخل`);
  if (written.scenario) console.log(`  پیش‌نویس: scenarios/${name}/${written.scenario}`);
  console.log(`  پرونده: ${written.dossier.replaced} تازه · ${written.dossier.conflicts} تعارض`);
  console.log('\n  پیش‌نویس را بازبینی و اجرا کنید؛ تا اجرا نشده، سناریو نیست.\n');
}

/**
 * چک‌ها — دیدن و تنظیم کردن.
 *
 * ── چرا `--off` دلیل می‌خواهد ──
 *
 * چکی که روی یک پروژه همیشه قلابی است باید بشود خاموشش کرد؛ وگرنه کاربر کلِ
 * گزارش را نادیده می‌گیرد و آن بدتر است. ولی خاموشیِ بی‌دلیل همان
 * `allowlist`ِ بلندی می‌شود که README دربارهٔ آن نوشته «یعنی داریم مشکل را
 * زیر فرش می‌کنیم».
 */
function cmdChecks({ flags, positional }) {
  const target = positional[0];
  if (!target) throw new Error('نام هدف لازم است: userbug checks <هدف>');

  for (const [flag, mode] of [
    ['off', 'off'],
    ['watch', 'watch'],
    ['expect', 'expect'],
  ]) {
    if (flags[flag] === undefined) continue;
    const id = String(flags[flag]);
    if (!UNIVERSAL_IDS.includes(id)) {
      throw new Error(`چکی به نام «${id}» نیست. موجودها:\n    ${UNIVERSAL_IDS.join('\n    ')}`);
    }
    const entry = setCheckMode(target, id, mode, String(flags.why ?? ''));
    console.log(`\n  ${id} → ${entry.mode}${entry.why ? `  («${entry.why}»)` : ''}\n`);
    return;
  }

  const config = readChecksConfig(target);
  console.log('');
  console.log('  چک                      حالت     برخورد  قلابی  دلیلِ خاموشی');
  console.log('  ' + '─'.repeat(74));
  for (const check of UNIVERSAL) {
    const entry = config.checks[check.id] || {};
    console.log(
      '  ' +
        [
          check.id.padEnd(23),
          (entry.mode || DEFAULT_MODE).padEnd(8),
          String(entry.hits ?? 0).padStart(6),
          String(entry.noise ?? 0).padStart(6),
          entry.why || (check.risky ? '(پرخطر — احتمال قلابی بیشتر)' : ''),
        ].join(' ')
    );
  }
  console.log('\n  watch: یافته ثبت می‌کند · expect: سخت می‌شکند · off: اصلاً اجرا نمی‌شود\n');
}

/**
 * شناختِ یک پروژه.
 *
 * سه خروجی از یک منبع: متنِ خواندنی (پیش‌فرض)، JSON خام برای ابزارِ دیگر، و
 * تاریخچه. هیچ‌کدام چیزی نمی‌نویسد — این فرمان فقط می‌خواند، تا بشود بی‌ترس
 * صدایش زد.
 */
async function cmdKnowledge({ flags, positional }) {
  const target = positional[0];
  if (!target) throw new Error('نام هدف لازم است: userbug knowledge <هدف>');

  /**
   * جواب دادن به یک پرسش — تنها راهی که چیزی `by: user` می‌شود.
   *
   * شماره پذیرفته می‌شود چون پرسش‌ها جملهٔ کامل فارسی‌اند و تایپِ دوباره‌شان
   * در ترمینال یعنی این قابلیت عملاً استفاده نمی‌شود.
   */
  if (flags.answer !== undefined) {
    const dossier = readDossier(target);
    const open = dossier.openQuestions.filter((item) => !item.answer);
    const text = String(flags.as ?? '').trim();
    if (!text) throw new Error('جواب لازم است: --answer <شماره|متن> --as "<جواب>"');

    const index = Number(flags.answer);
    const question = Number.isInteger(index) && index >= 1 ? open[index - 1]?.q : String(flags.answer);
    if (!question) throw new Error(`پرسشِ شمارهٔ ${flags.answer} وجود ندارد؛ ${open.length} پرسشِ باز هست`);

    await writeDossier(target, answerQuestion(dossier, question, text), {
      by: 'user',
      why: 'پاسخ به پرسش',
    });
    console.log(`\n  ثبت شد (by: user):\n    ${question}\n    → ${text}\n`);
    return;
  }

  if (flags.questions) {
    const open = readDossier(target).openQuestions.filter((item) => !item.answer);
    if (!open.length) return console.log('\n  پرسشِ بی‌جوابی نیست.\n');
    console.log('');
    open.forEach((item, i) => console.log(`  ${String(i + 1).padStart(2)}. ${item.q}`));
    console.log('\n  جواب: userbug knowledge <هدف> --answer <شماره> --as "<جواب>"\n');
    return;
  }

  if (flags.history) {
    const limit = flags.history === true ? 40 : Number(flags.history) || 40;
    const rows = readHistory(knowledgeDir(target), { limit });
    if (!rows.length) return console.log('\n  تاریخچه‌ای ثبت نشده.\n');

    console.log('');
    for (const row of rows) {
      console.log(`  ${row.at}  ${String(row.op).padEnd(8)} ${String(row.by).padEnd(7)} ${row.path}${row.why ? `  — ${row.why}` : ''}`);
    }
    console.log('');
    return;
  }

  if (flags.json) return console.log(JSON.stringify(readDossier(target), null, 2));
  console.log('\n' + renderDossier(target));
}

async function cmdReport({ flags, positional }) {
  const runId = resolveRunId(positional[0]);
  printSummary(await finalizeRun(runId, { junitPath: junitPathFor(flags.junit, null, false) }));
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

  /**
   * دستگاهِ ناهم‌جنس، همان تلهٔ بالا با لباس دیگر.
   *
   * مقایسهٔ یک اجرای دسکتاپ با یک اجرای موبایل، «رفته» را جای «فقط روی دسکتاپ
   * بود» می‌گذارد. رابط گرافیکی این هشدار را داشت و خط فرمان نه.
   */
  const deviceA = readRun(a).device;
  const deviceB = readRun(b).device;
  if (deviceA !== deviceB) {
    console.log('');
    console.log(`  ⚠ دستگاه دو اجرا یکی نیست: ${deviceA || '—'} در برابر ${deviceB || '—'}`);
    console.log('    «رفته» ممکن است یعنی «روی این دستگاه اصلاً دیده نمی‌شود».');
  }

  const fa = new Map(readFindings(a).map((f) => [f.fingerprint, f]));
  const fb = new Map(readFindings(b).map((f) => [f.fingerprint, f]));

  const added = [...fb.values()].filter((f) => !fa.has(f.fingerprint));
  const gone = [...fa.values()].filter((f) => !fb.has(f.fingerprint));
  const kept = [...fb.values()].filter((f) => fa.has(f.fingerprint));

  console.log(`\n  ${a}\n  ${b}\n`);
  console.log(`  تازه: ${added.length}  ·  رفته: ${gone.length}  ·  مانده: ${kept.length}\n`);

  // برچسب دستگاه فقط وقتی چاپ می‌شود که یافته خودش می‌داند. اجراهای قدیمی‌تر
  // این فیلد را ندارند و نبودش بهتر از حدس است.
  const where = (f) => {
    const devices = (f.devices || [f.device]).filter(Boolean);
    return devices.length ? ` (${devices.join('، ')})` : '';
  };

  for (const f of added) console.log(`   + [${f.source}] ${f.normalized.slice(0, 110)}${where(f)}`);
  for (const f of gone) console.log(`   − [${f.source}] ${f.normalized.slice(0, 110)}${where(f)}`);
  console.log('');
}

/**
 * ساختِ کانفیگ یک هدفِ تازه.
 *
 * همان کاری که فرمِ «پروژهٔ تازه» در رابط می‌کند، با همان قالب. قاعدهٔ پروژه
 * این است: هر کاری از رابط می‌شود، از CLI هم بشود.
 *
 * `--log` تکرارشدنی است: `--log php=D:/x/err.log --log vite=D:/y/out.log`
 */
function cmdInit({ flags, positional }) {
  const key = assertProjectKey(positional[0]);
  const file = path.join(ROOT, 'targets', `${key}.config.js`);

  // بازنویسیِ بی‌صدا بدترین حالت است: کانفیگی که کسی دستی کاملش کرده بود
  // می‌رفت و کسی نمی‌فهمید.
  if (fs.existsSync(file)) throw new Error(`هدف «${key}» از قبل وجود دارد: ${file}`);

  const logs = (Array.isArray(flags.log) ? flags.log : flags.log ? [flags.log] : []).map((entry) => {
    const text = String(entry);
    const eq = text.indexOf('=');
    if (eq < 1) throw new Error(`--log باید «نام=مسیر» باشد؛ «${text}» نبود`);
    return { name: text.slice(0, eq), path: text.slice(eq + 1) };
  });

  const content = renderTargetConfig({
    key,
    name: flags.title || key,
    baseURL: flags['base-url'],
    apiURL: flags['api-url'],
    environment: flags.environment || 'local',
    device: flags.device,
    locale: flags.locale,
    dir: flags.dir,
    logs,
    sourceRoot: flags.source,
  });

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');

  console.log(`\n  هدف «${key}» ساخته شد: ${file}`);
  console.log(`  سناریوها را در scenarios/${key}/ بگذارید، بعد: node bin/userbug.js run ${key}\n`);
}

/**
 * زمان‌بندی — همان کاری که رابط می‌کند.
 *
 * زمان‌بندِ واقعی سیستم است؛ این فرمان فقط ورودی‌هایش را می‌سازد و مدیریت
 * می‌کند. جزئیاتش در `src/schedule.js`.
 */
async function cmdSchedule({ flags, positional }) {
  const [action, key] = positional;

  if (!action || action === 'list') {
    const rows = await listSchedules();
    if (!rows.length) {
      console.log('\n  زمان‌بندی‌ای ثبت نشده. نمونه:');
      console.log('  node bin/userbug.js schedule add nightly --target nepi --time 02:00\n');
      return;
    }

    console.log('');
    for (const row of rows) {
      if (row.broken) {
        console.log(`  ${row.key.padEnd(20)} فایلش خوانده نشد: ${row.broken}`);
        continue;
      }
      const when = row.frequency === 'weekly' ? `هفتگی ${row.days.join(',')} ${row.time}` : `روزانه ${row.time}`;
      // «در زمان‌بند نیست» مهم‌ترین چیزی است که باید دیده شود
      console.log(
        `  ${row.key.padEnd(20)} ${row.target.padEnd(14)} ${when.padEnd(24)} ` +
          `${row.installed ? 'فعال' : '⚠ در زمان‌بند نیست'}`
      );
      if (row.lastLog) console.log(`  ${' '.repeat(20)} ${row.lastLog}`);
    }
    console.log('');
    return;
  }

  if (action === 'add') {
    const created = await createSchedule({
      key,
      target: flags.target,
      frequency: flags.weekly ? 'weekly' : 'daily',
      time: flags.time,
      days: flags.days,
      grep: flags.grep,
      device: flags.device,
      persona: flags.persona,
      model: flags.model,
      depth: flags.depth,
      repeat: flags.repeat,
    });
    console.log(`\n  زمان‌بندی «${created.key}» ساخته شد: ${created.taskName}`);
    console.log(`  فرمان: userbug ${scheduleArgs(created).join(' ')}\n`);
    return;
  }

  if (action === 'remove') {
    await removeSchedule(key);
    console.log(`\n  زمان‌بندی «${key}» حذف شد. لاگش در schedules/ می‌ماند.\n`);
    return;
  }

  if (action === 'run') {
    await runScheduleNow(key);
    console.log(`\n  تسک «${key}» به زمان‌بند سپرده شد. نتیجه در schedules/${key}.log\n`);
    return;
  }

  throw new Error(`زیرفرمان ناشناخته: «${action}». مجاز: list | add | remove | run`);
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
    case 'init':
      cmdInit(parsed);
      break;
    case 'schedule':
      await cmdSchedule(parsed);
      break;
    case 'repro':
      cmdRepro(parsed);
      break;
    case 'list':
      cmdList(parsed);
      break;
    case 'knowledge':
      await cmdKnowledge(parsed);
      break;
    case 'docs':
      await cmdDocs(parsed);
      break;
    case 'invariants':
      cmdInvariants(parsed);
      break;
    case 'accounts':
      await cmdAccounts(parsed);
      break;
    case 'tour':
      await cmdTour(parsed);
      break;
    case 'checks':
      cmdChecks(parsed);
      break;
    case 'learn':
      await cmdLearn(parsed);
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
