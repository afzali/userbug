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
import { benchGrep, normalizeBench } from '../src/runs/bench.js';
import { Budget } from '../src/models/provider.js';
import { loadTarget } from '../src/target.js';
import { assertNewProjectKey, assertProjectKey, renderTargetConfig } from '../src/target-template.js';
import {
  createSchedule,
  listSchedules,
  removeSchedule,
  runScheduleNow,
  scheduleArgs,
} from '../src/schedule.js';
import { renderJUnit } from '../src/report/junit.js';
import { clip, pad } from '../src/terminal.js';
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

  خروجی، تستِ پلی‌رایت است و در ریپوی خودِ پروژهٔ شما می‌نشیند.
  هزینهٔ مدل یک بار است: تألیف. اجرا رایگان و بی‌مدل.

  ── شروعِ سریع ──────────────────────────────────────────────

  userbug init <هدف> --base-url <آدرس>     تعریفِ پروژه
  userbug init <هدف> --workspace           ساختِ پوشه در ریپوی پروژه
  userbug tour <هدف>                       گشت بزنید، ابزار یاد بگیرد
  userbug author <هدف> "<کاربر چه می‌کند>" → tests/userbug/*.spec.js
  userbug expect <هدف> --from <فایل>       افزودنِ ادعا
  npx playwright test                       اجرا — رایگان، هر تغییر

  ────────────────────────────────────────────────────────────

  userbug author <هدف> "<متن>"    متنِ فارسی → فایلِ .spec.js
      --model <اسلاگ>             مدلِ تألیف؛ بر کانفیگ می‌چربد
      --force                     بازنویسیِ فایلِ موجود (ادعاها می‌روند)

  userbug map <هدف> [--headed]    خزشِ خودکار. حینش در همین ترمینال:
                                  n <متن> یادداشت · w کجاست · q بس است

  userbug fixtures <هدف>          فایل‌های نمونه — تستِ آپلود از این‌جا
      --add <مسیر> [--note <چرا>] افزودن
      --remove <نام>              حذف
      --note <نام> --as <متن>     یادداشت

  userbug test <هدف>              اجرای تست‌های پروژه — رایگان، بی‌مدل
      --ui                        تماشا و قدم‌به‌قدم
      --headed                    مرورگر دیده شود
      --last-failed               فقط آن‌هایی که شکستند

  userbug impact <هدف>            «کد عوض شد — کدام تست‌ها باید دوباره فکر
                                  شوند؟» گیت + پرونده + تست‌ها
      --base <مرجع>               مرجعِ مقایسه؛ پیش‌فرض HEAD

  userbug run [هدف] [گزینه‌ها]     اجرای سناریوها
      --scenario <مسیر>           فیلتر روی مسیر فایل سناریو
      --grep <عنوان>              فیلتر روی عنوان تست
      --only <نام>[,<نام>…]       فقط این سناریوها (نامِ کامل، نه الگو)
      --bench <نام>               اسمی روی این بار، که در تریاژ دیده می‌شود
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
                                  مسیرها ${'${VAR}'} می‌پذیرند؛ مقدار از .env

  userbug init <هدف> --workspace  ساختِ tests/userbug/ در ریپوی خودِ پروژه،
                                  با .gitignoreای که راز و نشستِ مرورگر را
                                  بیرون نگه می‌دارد

  userbug schedule list           زمان‌بندی‌های ثبت‌شده و وضعیتشان
  userbug schedule add <کلید> --target <هدف> --time HH:MM [گزینه‌ها]
                                  ساخت تسک در زمان‌بندِ سیستم
      --weekly --days MON,WED     هفتگی به‌جای روزانه
      --grep --only --bench --device --persona --model --depth --repeat
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
      --questions                 پرسش‌ها، شماره‌دار — بی‌جواب و جواب‌گرفته
      --answer <شماره> --as <متن> ثبت یا **اصلاح** جواب؛ تنها راهی که چیزی
                                  by:user می‌شود

  userbug docs <هدف>              مستنداتِ بیرونیِ این پروژه
      --add <آدرس> [--note <چرا>] واکشی و ذخیره؛ by: docs، نه by: user
      --remove <نام فایل>         حذف

  userbug invariants <هدف>        قاعده‌هایی که نباید بشکنند (باگ منطقی)
      --scan                      استخراج از schema، بی مدل
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
      --name <عنوان>              نامِ این گشت — هر پروژه می‌تواند چند تا داشته باشد
      --purpose <متن>             دربارهٔ چه بود؛ در سرصفحهٔ سناریو می‌نشیند
      --profile                   نشست را نگه دار؛ حساب و تنظیماتی که اینجا
                                  با دست ساختی، خزشِ بعدی با «همان مرورگر»
                                  می‌بیندشان

  userbug map <هدف> [گزینه‌ها]    نقشهٔ اپ: هر حالتی که می‌شود به آن رسید
      --from <سناریو>             مسیرِ ورود؛ قدم‌هایش پیش از خزش بازپخش می‌شوند
      --seed <سناریو>             دادهٔ اولیه؛ **یک بار** اجرا می‌شود، نه در هر
                                  برگشت به خانه. بی آن، نقشه از اپِ خالی
                                  درمی‌آید و صفحه‌های داده‌دار دیده نمی‌شوند
      --states <n> --actions <n> --minutes <n>
                                  سقف‌ها (پیش‌فرض ۶۰ · ۲۵ · ۲۰)
      --fresh                     از صفر، نه ادامهٔ نقشهٔ موجود
      --headed                     مرورگر دیده شود
      --device <نام>              دستگاه
      --allow-destructive         کنشِ برگشت‌ناپذیر هم زده شود
      --remember <شناسه>          بارِ اول کاربر بساز و ذخیره کن؛ دفعهٔ بعد با
                                  همان وارد شو. حسابی که خودتان در «حساب و چک»
                                  ساخته‌اید هم با همین شناسه استفاده می‌شود.
      --profile                   مرورگر را با پروفایلِ خزشِ قبلی باز کن —
                                  نشست و کش می‌مانند، پس ورود یک‌بار است
      --fresh-profile             پروفایل را اول پاک کن
      --scope <روت یا نما>[,…]    **فقط** اینجا را بگرد. رسیدن آزاد می‌ماند،
                                  فقط کنش‌های بیرونِ دامنه امتحان نمی‌شوند
      --focus <واژه‌ها>            اول سراغِ اینها برو (فیلتر نیست، اولویت است؛
                                  روت‌های نرسیدهٔ سورس خودکار اولویت دارند)
      --show                      نقشهٔ موجود را نشان بده، بی‌خزش
      --classify                  هر کنش چه می‌کند: از سورس، و برای باقی‌مانده
                                  یک فراخوانی به ازای هر گره (کش‌شده)
      --force                     طبقه‌بندیِ دوباره، حتی اگر مهرها بخورند
      --model <اسلاگ>             مدلِ طبقه‌بندی؛ بر تنظیمات می‌چربد

  userbug capabilities <هدف>      این اپ چه بخش‌ها و قابلیت‌هایی دارد — درختی
                                  از گشت و خزش و سورس، بی یک فراخوانی مدل
      --rebuild                   از نو بساز (پیش‌فرض: درختِ ذخیره‌شده)
      --all                       آنچه «حذف شده» زده‌اید را هم نشان بده
      --json                      خامِ درخت، برای ابزارهای دیگر
      --name                      نامِ خوانای فارسی با مدل — **یک** فراخوانی
                                  برای کلِ درخت، کش‌شونده. تنها قدمِ پولیِ
                                  این فرمان؛ بقیه‌اش از دیسک درمی‌آید
      --force                     با --name: نام‌های موجود را هم دوباره بساز
      --model <اسلاگ>             مدلِ نام‌گذاری؛ بر تنظیمات می‌چربد
      --set <شناسه> --title <نام> [--desc <متن>]
                                  نام و توضیحِ خودت؛ by: user، و هیچ
                                  استخراجی بعداً نمی‌بردش
      --set <شناسه> --status <active|gone|ignored>
                                  «این دیگر نیست» — تصمیمِ آدم، نه حدسِ ابزار
      --reset <شناسه>             برگشت به آنچه استخراج می‌گوید

  userbug rounds <هدف>            دورهای بررسی: هر بار زیر یک اسم، با تفاوتش
      --add <نام> [--note <چرا>] [--scope <شناسه>,…]
                                  ثبتِ قصدِ یک دور، پیش از اجرا
      --remove <نام>              حذفِ توضیح و دامنه (اجراها می‌مانند)
      --json                      خام، برای ابزارهای دیگر

  userbug checks <هدف>            چکِ همگانی: حالت، برخورد، و سروصدا
      --off <شناسه> --why <متن>   خاموش کردن؛ دلیل اجباری است
      --watch <شناسه>             یافته ثبت کن، ولی نشکن (پیش‌فرض)
      --expect <شناسه>            سخت بشکن — یعنی «این قاعده است»

  userbug bundle export <هدف>     همه‌چیزِ پروژه در یک فایل: شناخت، نقشه،
                                  سناریو، حساب (بی رمز)، فایلِ نمونه
      --out <فایل> --no-fixtures
  userbug bundle import <فایل>    بازگرداندنش
      --as <نامِ تازه> --force --show

  userbug coverage <هدف>          endpointهای بک‌اند: چه هست و صدایش نزده‌ایم
      --all                       مسیرهایی که صدا خوردند و در سورس نبودند
      --verbose                   شمارشِ آشکارسازها

  userbug entry <هدف>             ساختِ «مسیرِ ورود» از سناریویی که کار کرد
      --from <سناریو>             منبع؛ بی آن، خودش نامزدها را نشان می‌دهد
      --account <شناسه>           مقدارها به حسابِ ذخیره‌شده بسته شوند
      --seed                      به‌جای ورود، «دانه» بساز (ایمپورتِ فایل)
      --out <نام> --force

  userbug quest <هدف> "<چه را بررسی کنم>"
                                  ⚠ فعلاً بسته: خروجی‌اش YAML بود و اجرای
                                  YAML برداشته شد. یافتنِ نزدیک‌ترین نما از
                                  روی نقشه دست‌نخورده منتظرِ پورت است.

  userbug expect <هدف> --from <فایل .spec.js>
                                  «انتظار داشتیم چه ببینیم؟» — ادعاها را
                                  پیشنهاد می‌دهد، از عنصرهای واقعیِ گشت و نقشه
      --from <فایل>               بی آن، فهرست می‌دهد تا انتخاب کنید
      --list                      فقط فهرستِ عنصرهای واقعی (رایگان)
      --apply                     همه را بنویس، بی پرسش
      --hard                      expect به‌جای expect.soft (همان‌جا بشکند)
      --model <اسلاگ>

  userbug plan <هدف> "<جمله>"     جمله → نقشهٔ کار (یک فراخوانی)، ذخیره در
                                  فایل تا اصلاحش کنید — بعد خزشِ محدود
      --name <نام> --model <اسلاگ>
  userbug plan list <هدف>         نقشه‌های کارِ ذخیره‌شده
  userbug plan run <هدف> <نام>    اجرای همان نقشهٔ کار
      --states <n> --minutes <n> --headed
  userbug plan remove <هدف> <نام>

  userbug ai                      تنظیمات هوش مصنوعی: کلید، مدلِ هر نقش، بودجه
      --check                     هر مدل را با ارزان‌ترین درخواست بسنج
      --role <نقش>=<اسلاگ>        مدلِ یک نقش (resolve|author|analyze|default)
                                  مقدارِ خالی یعنی برگرد به پیش‌فرض
      --budget <دلار>             سقفِ هزینهٔ هر اجرا
      --key <کلید>                ذخیره در فایل .env؛ هرگز چاپ نمی‌شود

  userbug models [--free]         فهرست زندهٔ مدل‌های OpenRouter
  userbug repro <runId> [اثرانگشت]
                                  بازتولید یک یافته از اجرای گذشته
  userbug missions <هدف>          کدام سفر سالم است و از کی — در طولِ همهٔ
                                  اجراها، با آن‌هایی که هرگز اجرا نشده‌اند
      --json                      همان داده، برای ابزارِ دیگر

  userbug list [--limit n]        فهرست اجراها
  userbug remove <runId>          حذف یک اجرا با همهٔ عکس‌ها و traceهایش
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
  const bench = normalizeBench(flags.bench === true ? '' : flags.bench);

  for (const device of runs) {
    // مستقیم CLI پلی‌رایت با node، نه از راه npx و پوسته.
    //
    // با `shell: true` آرگومانِ فارسیِ `--grep` در پوستهٔ ویندوز مخدوش می‌شد و
    // نتیجه‌اش «صفر تست اجرا شد» بدون هیچ خطایی بود — یعنی همان شکستِ خاموشی
    // که این ابزار قرار است پیدایش کند، در خودش.
    const args = [PLAYWRIGHT_CLI, 'test'];

    // `--file` یک فایلِ YAML را به راه‌اندازِ YAML می‌سپرد. آن راه‌انداز
    // برداشته شد، پس این پرچم دیگر چیزی برای سپردن ندارد. `--scenario` همان
    // کار را روی یک فایلِ `.spec.js` می‌کند و باقی می‌ماند.
    if (flags.file)
      throw new Error(
        '`--file` برای اجرای یک فایلِ YAML بود و اجرای YAML برداشته شد.\n' +
          '  برای اجرای یک spec مشخص: userbug run <هدف> --scenario <مسیرِ فایل>',
      );
    if (flags.scenario) args.push(String(flags.scenario));
    // --scenario مسیر فایل را فیلتر می‌کند و --grep عنوان تست را. جدا نگه
    // داشته شدند چون یک بار «--scenario <عنوان>» بی‌صدا صفر تست اجرا کرد.
    /**
     * `--only` چند سناریو، `--grep` یک الگو.
     *
     * جدا نگه داشته شده‌اند چون جنسشان فرق دارد: `--grep` الگوست و کاربر
     * خودش مسئولِ درستی‌اش است؛ `--only` فهرستِ نامِ آدم است و باید escape
     * شود. یکی کردنشان یعنی نامِ سناویی که پرانتز دارد بی‌صدا هیچ تستی
     * نگیرد.
     */
    const only = benchGrep(String(flags.only || '').split(',')) || String(flags.grep || '');
    if (only) args.push('--grep', only);
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
    // نامِ بنچ در `run.json` می‌نشیند، نه فقط در این پروسه: ارزشش وقتی است
    // که هفتهٔ بعد کسی در تریاژ بپرسد این یافته از کدام بار بود
    if (bench) env.UB_BENCH = bench;

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

  /**
   * «فقط آن‌هایی که قرمز بودند» — نه فقط آن‌هایی که یافته داشتند.
   *
   * ── چرا عوض شد ──
   *
   * سناریویی که `expect`اش شکسته ولی هیچ خطای کنسولی نداده، صفرِ یافته است.
   * با معیارِ قبلی دقیقاً همان سناریویی که باید دوباره اجرا می‌شد، از فهرستِ
   * اجرای دوباره بیرون می‌ماند.
   */
  const wanted = flags['only-findings']
    ? scenarios.filter((s) => s.verdict === 'failed' || s.verdict === 'findings' || s.findings > 0)
    : scenarios;
  if (!wanted.length) throw new Error('آن اجرا هیچ سناریوی قرمزی نداشت؛ چیزی برای اجرای دوباره نیست');

  const grep = benchGrep(wanted.map((s) => s.name));

  console.log(`\n  اجرای دوبارهٔ ${runId}`);
  console.log(`  دستگاه: ${run.device}  ·  سناریو: ${wanted.length} از ${scenarios.length}\n`);

  cmdRun({
    flags: {
      ...flags,
      grep,
      // بنچِ همان اجرا ادامه پیدا می‌کند مگر کاربر اسمِ تازه بدهد: اجرای
      // دوباره همان بار است، یک قدم جلوتر
      bench: flags.bench ?? run.bench,
      device: run.device === 'desktop' ? undefined : run.device,
    },
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

/**
 * حذفِ یک اجرا.
 *
 * ── چرا در CLI هم هست ──
 *
 * قاعدهٔ پروژه: هیچ کاری نباید فقط از رابط ممکن باشد. و اینجا دلیلِ دومی هم
 * هست — پاک کردنِ چند اجرای آزمایشی با یک حلقهٔ shell کاری است که در رابط
 * ده کلیک می‌شود.
 *
 * `resolveRunId` پیشوندِ مبهم را رد می‌کند، پس `remove 2026-09` چیزی را
 * بی‌صدا نمی‌برد.
 */
function cmdRemove({ positional }) {
  const input = positional[0];
  if (!input) throw new Error('شناسهٔ اجرا لازم است: userbug remove <runId>');

  const runId = resolveRunId(input);
  const dir = runDir(runId);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  حذف شد: ${runId}\n`);
}

/**
 * «کدام سفر سالم است؟» — جدولی که تا امروز هیچ‌جا نبود.
 *
 * ── چرا لازم شد ──
 *
 * کاربر گفت مهم‌ترین چیزی که می‌خواهد بداند این است: ثبت‌نام، ورود، فراموشی
 * رمز، افزودن کتاب، هایلایت — همه بررسی شده‌اند و سالم‌اند؟
 *
 * ابزار همهٔ داده‌اش را داشت و این پرسش را جواب نمی‌داد: هر اجرا جداگانه
 * گزارش می‌شد و هیچ‌چیز در **طولِ زمان** نگاه نمی‌کرد.
 */
async function cmdMissions({ flags, positional }) {
  const target = positional[0];
  if (!target) throw new Error('نام هدف لازم است: userbug missions <هدف>');

  const { healthOf, summarize, daysSinceGreen } = await import('../src/runs/health.js');
  const { loadScenarios } = await import('../src/scenario/load.js');

  const runs = [];
  for (const id of listRunIds()) {
    let run;
    try {
      run = readRun(id);
    } catch {
      continue;
    }
    if (run?.target !== target) continue;
    runs.push({ ...run, runId: run.runId || id });
  }

  /**
   * سناریوهای روی دیسک هم می‌آیند، حتی آن‌هایی که هرگز اجرا نشده‌اند.
   *
   * بی این، فهرست سبز به نظر می‌رسد چون خطرناک‌ترین ردیف اصلاً در آن نیست.
   */
  let known = [];
  try {
    known = loadScenarios(target).map((one) => one.name);
  } catch {
    // پروژه‌ای که هنوز سناریویی ندارد؛ فهرستِ اجراها همچنان معنا دارد
  }

  const rows = healthOf(runs, { known });
  if (!rows.length) {
    console.log(`\n  هنوز هیچ سناریویی برای «${target}» نه اجرا شده نه نوشته.\n`);
    return;
  }

  const sum = summarize(rows);
  const MARK = { passed: '✓', failed: '✗', findings: '!', never: '—', skipped: '·', unknown: '?' };
  const WORD = {
    passed: 'سالم',
    failed: 'شکست',
    findings: 'ایراد داشت',
    never: 'هرگز اجرا نشد',
    skipped: 'اجرا نشد',
    unknown: 'نامعلوم',
  };

  console.log(`\n  مأموریت‌های «${target}»`);
  console.log(
    `  ${sum.passed} سالم · ${sum.failed} شکست · ${sum.findings} ایراد · ${sum.never} هرگز اجرا نشد` +
      (sum.unknown ? ` · ${sum.unknown} نامعلوم` : '')
  );
  console.log('  ' + '─'.repeat(74));

  for (const row of rows) {
    const when = row.at ? row.at.slice(0, 16).replace('T', ' ') : '—';
    // `pad`/`clip` و نه `padEnd`/`slice`: نامِ سناریو و واژهٔ وضعیت هر دو
    // فارسی‌اند و نیم‌فاصله واحدِ UTF-16 می‌گیرد ولی ستونی نمی‌گیرد.
    console.log(`  ${MARK[row.verdict] || '?'} ${pad(clip(row.name, 44), 44)} ${pad(WORD[row.verdict], 14)} ${when}`);

    if (row.error) console.log(`      ${row.error.slice(0, 90)}`);

    /**
     * سبزِ کهنه با سبزِ امروز یکی نیست.
     *
     * سفری که سه ماه پیش سبز بوده و از آن به بعد اجرا نشده، در فهرست «سالم»
     * است و این گمراه‌کننده است.
     */
    const days = daysSinceGreen(row);
    if (row.verdict === 'passed' && days !== null && days >= 7) {
      console.log(`      آخرین سبز ${days} روز پیش بود؛ از آن موقع دوباره اجرا نشده.`);
    }
    if (row.verdict !== 'passed' && row.lastGreen) {
      console.log(`      آخرین بارِ سالم: ${row.lastGreen.at.slice(0, 16).replace('T', ' ')}`);
    }
  }

  /**
   * «نامعلوم» یعنی داده نداریم، نه یعنی سالم.
   *
   * اجرایی که با `--reporter=line` رفته گزارشگرِ ما را کنار زده و وضعیتِ
   * تست‌هایش ثبت نشده. سکوت اینجا یعنی کاربر آن ردیف‌ها را سبز می‌خواند.
   */
  if (sum.unknown) {
    console.log(
      `\n  ${sum.unknown} ردیف «نامعلوم» است: آن اجرا با گزارشگرِ دیگری رفته و وضعیتِ تست‌ها ثبت نشده.`
    );
  }
  if (flags.json) console.log('\n' + JSON.stringify(rows, null, 2));
  console.log('');
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
      pad(id, 34),
      pad(r.target || '', 7),
      pad(r.device || '', 11),
      pad(String(r.steps ?? '—'), 4, 'start'),
      pad(String(r.findings ?? '—'), 6, 'start'),
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
async function cmdInvariants({ flags, positional }) {
  const name = positional[0];
  if (!name) throw new Error('نام هدف لازم است: userbug invariants <هدف>');

  /**
   * استخراج از schema، بی یک فراخوانی مدل.
   *
   * ── چرا این راه لازم شد ──
   *
   * ناوردا از `CREATE TABLE` درمی‌آید: `UNIQUE(email)` نحوِ ثابت دارد و حدس
   * نمی‌خواهد. ولی تنها راهِ ذخیره‌اش `userbug learn` بود که **مدل** لازم
   * دارد، و `--dry` هم عمداً چیزی ذخیره نمی‌کند.
   *
   * نتیجه‌اش روی نپی این بود: اسکن ۱۶۳ ناوردا پیدا می‌کرد و صفرشان روی دیسک
   * می‌نشست — صد و شصت و سه فکتِ ماشین‌خوانده که پشتِ یک کلیدِ API گیر
   * افتاده بودند.
   */
  if (flags.scan) {
    const target = await loadTarget(name);
    const { scanSource } = await import('../src/knowledge/digest.js');
    const scan = await scanSource(target);

    if (!scan.invariants?.length) {
      console.log('\n  هیچ ناوردایی در schema پیدا نشد.');
      console.log('  اگر پروژه SQL دارد، مطمئن شوید `source.root` به آن می‌رسد.\n');
      return;
    }

    const merged = mergeInvariants(name, scan.invariants);
    console.log(`\n  ${scan.files.length} فایل خوانده شد`);
    console.log(`  ${scan.invariants.length} ناوردا در schema  ·  ${merged.added} تازه · ${merged.kept} با حالتِ قبلی\n`);
    return;
  }

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

  const session = new TourSession({
    target: name,
    device: flags.device,
    // نشست را نگه دار: هرچه اینجا با دست تنظیم شود، خزشِ بعدی با
    // «همان مرورگر» (`map --profile`) می‌بیندش
    profile: Boolean(flags.profile),
  });

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
  console.log('    v <نام> نامِ لایهٔ فعلی (مودال/کشویی) — بر تشخیصِ خودکار می‌چربد');
  console.log('            با توضیح هم می‌شود:  v نامِ لایه | این پنجره چه می‌کند');
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
        /**
         * نام‌گذاریِ دستیِ لایه.
         *
         * `notePage` از روزِ اول `view` را می‌گرفت و `detectView` هم بود،
         * ولی تنها راهِ رسیدن به آن رابط گرافیکی بود. با رفتنِ رابط،
         * قابلیت بی‌صدا از دسترس خارج شد در حالی که موتور و خودآزماهایش
         * سرِ جایشان بودند — «نامِ دستی بر تشخیصِ خودکار می‌چربد».
         *
         * لازم است چون تشخیصِ خودکار هر لایه‌ای را نمی‌شناسد: مودالی که
         * `role="dialog"` ندارد، یا کشویی‌ای که فقط یک `div` است.
         */
        else if (text.startsWith('v ')) {
          const [view, ...rest] = text.slice(2).split('|');
          await session.notePage({ view: view.trim(), purpose: rest.join('|').trim() });
        } else if (text) await session.notePage({ purpose: text });
      } catch (cause) {
        console.error(`  خطا: ${cause.message}`);
      }
      rl.prompt();
    });

    rl.on('close', () => session.stop('ترمینال بسته شد').then(resolve, resolve));
  });

  const state = session.snapshotState();
  const landing = !flags.name && state.pages.length > 0;
  const written = await emitTour({
    target: name,
    state,
    name: flags.name,
    purpose: flags.purpose && flags.purpose !== true ? String(flags.purpose) : '',
    landing,
  });

  console.log(`\n  گشت تمام شد: ${state.steps.length} قدم · ${state.pages.length} صفحه · ${state.findings.length} یافته`);
  console.log(`  صفحه‌های ثبت‌شده: ${written.pages}  ·  کشِ آموخته: ${written.cached} مدخل`);
  if (written.file) console.log(`  تست: ${written.file}`);
  console.log(`  پرونده: ${written.dossier.replaced} تازه · ${written.dossier.conflicts} تعارض`);

  if (written.scenario) {
    console.log('\n  قدمِ بعد:');
    console.log(`    npx playwright test                             ببینید می‌دود`);
    console.log(`    userbug expect ${name} --from ${written.scenario}   ادعا اضافه کنید`);
    console.log('\n  تا ادعا نگرفته، فقط می‌گوید «چیزی نشکست».\n');
  } else {
    console.log('\n  قدمی ضبط نشد، پس تستی نوشته نشد.\n');
  }
}

/**
 * پوششِ بک‌اند — «چه چیزی در سورس هست و صدایش نزده‌ایم».
 *
 * ── چرا این فرمان لازم شد ──
 *
 * روی نپی اندازه گرفتیم: ۷۸۸ فایلِ سورس، و تنها ۱۱ فکت از آن درمی‌آمد —
 * هر یازده تا از فرانت. بک‌اند کاملاً نامرئی بود، با اینکه خودِ اسکنر
 * می‌گفت `backend: php`. حالا ۲۱ endpoint پیدا می‌شود و در برابر تماس‌های
 * واقعیِ اجراها گذاشته می‌شود.
 *
 * ── چرا هیچ فراخوانیِ مدلی ندارد ──
 *
 * هر دو طرفِ تفریق نحوی‌اند: `case 'GET /health'` در سورس، و رشتهٔ URL در
 * اجرا. حدس لازم ندارند.
 */
async function cmdCoverage({ flags, positional }) {
  const target = positional[0];
  if (!target) throw new Error('نام هدف لازم است: userbug coverage <هدف>');

  const [{ coverageSnapshot }, sourceAccess, { runDir }, { loadTarget }] = await Promise.all([
    import('../src/knowledge/endpoints.js'),
    import('../src/source-access.js'),
    import('../src/store/run-store.js'),
    import('../src/target.js'),
  ]);

  const config = await loadTarget(target);
  const roots = await sourceAccess.resolveSourceRoots({ key: target, source: config.source });
  const files = await sourceAccess.listAllSourceFiles(roots);
  const read = async (relative) =>
    (await sourceAccess.readAnySourceFile(roots, relative).catch(() => ({ content: '' }))).content || '';

  /**
   * خطِ فرمان همیشه از نو می‌خواند.
   *
   * کسی که این فرمان را می‌زند، همین حالا جواب می‌خواهد نه عکسِ دیروز. کش
   * برای رابط است، جایی که باز شدنِ صفحه نباید چند ثانیه طول بکشد.
   */
  const coverage = await coverageSnapshot({
    target,
    runsRoot: path.dirname(runDir('x')),
    rescan: true,
    scan: { files, read },
  });
  const endpoints = coverage.endpoints;
  const byDetector = coverage.byDetector;
  const calls = { length: coverage.calls };

  const touched = coverage.endpoints.length - coverage.untouched.length;

  console.log(`\n  پوششِ بک‌اندِ ${target}\n  ` + '-'.repeat(46));
  console.log(`  ${endpoints.length} endpoint در سورس  ·  ${calls.length} تماسِ ثبت‌شده`);
  console.log(`  آزموده: ${touched}  ·  نیازموده: ${coverage.untouched.length}\n`);

  if (!calls.length) {
    console.log('  هنوز هیچ تماسی ثبت نشده. یک اجرا یا خزش بروید تا پوشش معنا پیدا کند.\n');
  }

  if (coverage.untouched.length) {
    console.log('  هیچ اجرایی صدایشان نزده:');
    for (const row of coverage.untouched) {
      console.log(`   • ${(row.methods.join(',') || '?').padEnd(12)} ${row.path}`);
    }
    console.log('');
  }

  if (coverage.partial.length) {
    console.log('  مسیر آزموده شده ولی این فعل‌ها نه:');
    for (const row of coverage.partial) console.log(`   • ${row.untried.join(',').padEnd(12)} ${row.path}`);
    console.log('');
  }

  /**
   * مسیری که اپ صدا زده و در سورس نبود، خودش یک خبر است: یا آشکارساز کور
   * است یا سرویسِ بیرونی در کار است. سکوت دربارهٔ آن یعنی پوششِ خوش‌بینانه.
   */
  if (coverage.unknown.length && flags.all) {
    console.log('  صدا زده شد ولی در سورس پیدا نشد:');
    for (const row of coverage.unknown.slice(0, 20)) console.log(`   • ${row}`);
    console.log('');
  }

  if (flags.verbose) console.log('  آشکارسازها: ' + JSON.stringify(byDetector) + '\n');
}

/**
 * «این اپ چه بخش‌ها و قابلیت‌هایی دارد؟»
 *
 * ── چرا این فرمان، وقتی صفحهٔ رابط هم هست ──
 *
 * قاعدهٔ این مخزن: هر کاری که رابط می‌کند باید از خط فرمان هم بشود. ولی
 * اینجا یک دلیلِ دوم هم هست — درخت **مشتق** است، و چیزی که مشتق است باید
 * بشود بی باز کردنِ مرورگر از نو ساختش و دید چه درآمد. اولین بارِ اجرای
 * همین فرمان روی نپی، چهار ایراد را نشان داد که هیچ‌کدام خطا نمی‌دادند.
 */
async function cmdCapabilities({ flags, positional }) {
  const target = positional[0];
  if (!target) throw new Error('نام هدف لازم است: userbug capabilities <هدف>');

  const [caps, touch, { runDir }, artifacts] = await Promise.all([
    import('../src/knowledge/capabilities.js'),
    import('../src/runs/touch.js'),
    import('../src/store/run-store.js'),
    import('../src/knowledge/store.js'),
  ]);
  artifacts.assertKnowledgeKey(target);

  /* ── ویرایش‌ها: نام، توضیح، وضعیت ── */
  if (flags.reset) {
    caps.setEdit(target, flags.reset, null);
    console.log(`\n  «${flags.reset}» به آنچه استخراج می‌گوید برگشت.\n`);
    return;
  }

  if (flags.set) {
    const patch = {};
    if (flags.title !== undefined) patch.title = flags.title;
    if (flags.desc !== undefined) patch.desc = flags.desc;
    if (flags.status !== undefined) patch.status = flags.status;
    if (!Object.keys(patch).length) throw new Error('یکی از --title، --desc یا --status لازم است');
    caps.setEdit(target, flags.set, patch);
    console.log(`\n  ثبت شد — by: user. هیچ استخراجی بعداً عوضش نمی‌کند.\n`);
    return;
  }

  /**
   * خطِ فرمان پیش‌فرضْ از نو نمی‌سازد.
   *
   * برعکسِ `coverage` — و عمدی: آنجا اسکنِ سورس ارزان است و جواب باید تازه
   * باشد. اینجا ساختنِ دوباره، `map.json` و همهٔ صفحه‌ها را می‌خواند و
   * فایل می‌نویسد. کسی که فقط می‌خواهد **ببیند**، نباید بنویسد.
   */
  if (flags.rebuild) caps.rebuild(target);

  /**
   * نام‌گذاری — تنها قدمِ پولیِ این فرمان، و فقط با پرچمِ صریح.
   *
   * همان موضعِ `map --classify`: هر چیزی که پول خرج کند باید خواسته شده
   * باشد، نه دنبالهٔ کاری که کاربر برای چیزِ دیگری زده.
   */
  if (flags.name) {
    const { nameCapabilities } = await import('../src/knowledge/name-caps.js');
    const project = await loadTarget(target);
    /**
     * دو تلهٔ همین چند خط، که هر دو را نخستین اجرا نشان داد:
     *
     *   `model: ''` — زنجیرهٔ `??` در `resolveModel` فقط از `null` و
     *   `undefined` رد می‌شود. رشتهٔ خالی «مقدار» است و برنده می‌شود، پس
     *   اسلاگ خالی می‌ماند و سرور `No models provided` می‌دهد.
     *
     *   `target: project.models` — تابع خودش `target.models` را می‌خواند،
     *   پس این یعنی `project.models.models`. بی‌صدا به پیش‌فرض می‌افتاد.
     */
    const models = resolveModel({
      global: await loadGlobalConfig(),
      target: project,
      role: 'analyze',
      model: flags.model && flags.model !== true ? assertModelSlug(flags.model) : undefined,
    });

    const stats = await nameCapabilities({ target, models, force: Boolean(flags.force) });
    console.log(
      `
  ${stats.named} نام از ${stats.pending} بخش` +
        (stats.skipped ? `  ·  ${stats.skipped} را مدل نتوانست` : '') +
        `  ·  ${stats.calls} فراخوانی  ·  ${models.model}
`
    );
  }

  const index = touch.refreshTouch(target, path.dirname(runDir('x')));
  const tree = caps.buildTree(target, {
    counts: touch.countsByRoute(index, []),
    includeGone: Boolean(flags.all),
  });

  if (flags.json) {
    console.log(JSON.stringify(tree.roots, null, 2));
    return;
  }

  if (!tree.flat.length) {
    console.log(
      `\n  هنوز چیزی کشف نشده.\n` +
        `  یک گشت (userbug tour ${target}) یا خزش (userbug map ${target}) لازم است،\n` +
        `  بعد «userbug capabilities ${target} --rebuild».\n`
    );
    return;
  }

  console.log(`\n  قابلیت‌های ${target}\n  ` + '-'.repeat(52));

  const show = (list, depth = 0) => {
    for (const node of list) {
      const pad = '  '.repeat(depth + 1);
      const mark = node.view ? '·' : '▸';
      const where = node.view ? `${node.route} ▸ ${node.view}` : node.route;

      /**
       * نما و صفحه دو جنسِ متفاوتِ عدد دارند و قاطی کردنشان همان سبزِ
       * دروغینی است که `buildTree` جلویش را می‌گیرد: رخدادِ اجرا نما را
       * نمی‌شناسد، پس دربارهٔ یک مودال فقط می‌شود گفت خزش چند کنشش را
       * امتحان کرده.
       */
      const numbers = node.view
        ? node.actions
          ? `${node.tried}/${node.actions} کنش امتحان شد`
          : '—'
        : `${node.counts.scenarios.length} سناریو · ${node.counts.runs} اجرا` +
          (node.counts.openFindings ? ` · ${node.counts.openFindings} ایرادِ باز` : '');

      const flags2 = [
        node.edited ? 'ویرایش‌شده' : '',
        node.missing ? 'این بار دیده نشد' : '',
        node.shelf ? 'قفسه' : '',
        node.status === 'gone' ? 'حذف‌شده' : '',
      ].filter(Boolean);

      console.log(`${pad}${mark} ${node.title}`);
      console.log(
        `${pad}   ${where}  ·  ${numbers}${flags2.length ? '  ·  ' + flags2.join(' · ') : ''}`
      );
      console.log(`${pad}   ${node.id}`);
      show(node.children, depth + 1);
    }
  };
  show(tree.roots);

  const blind = tree.flat.filter((one) => !one.view && !one.counts.scenarios.length).length;
  console.log(`\n  ${tree.flat.length} قابلیت` + (blind ? `  ·  ${blind} بی‌سناریو` : ''));
  console.log(`  نامِ خودت: userbug capabilities ${target} --set <شناسه> --title <نام>\n`);
}

/**
 * دورهای بررسی.
 *
 * ── چرا خط فرمان هم لازمش دارد ──
 *
 * قاعدهٔ مخزن یکی است: هیچ کاری فقط-رابطی نیست. ولی اینجا یک دلیلِ عملی هم
 * هست — زمان‌بندیِ شبانه از خط فرمان می‌رود و `--bench` می‌دهد. بی این
 * فرمان، دوری که هر شب ساخته می‌شود هیچ‌وقت دامنه و توضیح نمی‌گیرد.
 */
async function cmdRounds({ flags, positional }) {
  const target = positional[0];
  if (!target) throw new Error('نام هدف لازم است: userbug rounds <هدف>');

  const [rounds, artifacts] = await Promise.all([
    import('../src/runs/rounds.js'),
    import('../src/knowledge/store.js'),
  ]);
  artifacts.assertKnowledgeKey(target);

  if (flags.remove) {
    rounds.removeRound(target, flags.remove === true ? '' : flags.remove);
    console.log(`\n  توضیح و دامنهٔ «${flags.remove}» حذف شد. اجراهایش سرِ جایشان‌اند.\n`);
    return;
  }

  if (flags.add) {
    const saved = rounds.saveRound(target, flags.add === true ? '' : flags.add, {
      note: flags.note === true ? '' : flags.note || '',
      scope: String(flags.scope === true ? '' : flags.scope || '')
        .split(',')
        .map((one) => one.trim())
        .filter(Boolean),
    });
    console.log(`\n  دورِ «${saved.name}» ثبت شد.`);
    console.log(`  حالا اجراهایش را با --bench "${saved.name}" بگیرید.\n`);
    return;
  }

  /**
   * خواندنِ اجراها بی لایهٔ رابط.
   *
   * `listRuns` در `ui/` است و خط فرمان نباید به رابط وابسته شود. پس همان
   * کارِ کوچک اینجا تکرار می‌شود: خواندنِ `run.json`ها. تکرارِ پنج خط بهتر
   * از وابستگیِ وارونه است.
   */
  const { runDir } = await import('../src/store/run-store.js');
  const runsRoot = path.dirname(runDir('x'));
  const list = [];
  if (fs.existsSync(runsRoot)) {
    for (const entry of fs.readdirSync(runsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(runsRoot, entry.name, 'run.json'), 'utf8'));
        if (meta?.target === target) list.push({ ...meta, runId: entry.name });
      } catch {
        // اجرایی که وسطِ نوشتن است یا خراب شده
      }
    }
  }
  list.sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));

  const grouped = rounds.groupRounds(list, rounds.readRounds(target));

  if (flags.json) {
    console.log(JSON.stringify(grouped, null, 2));
    return;
  }

  if (!grouped.length) {
    console.log(`\n  هنوز هیچ اجرایی برای «${target}» نبوده.\n`);
    return;
  }

  console.log(`\n  دورهای ${target}\n  ` + '-'.repeat(52));
  for (const round of grouped) {
    const kinds = Object.entries(round.kinds)
      .map(([kind, count]) => (count > 1 ? `${kind}×${count}` : kind))
      .join(' + ');
    console.log(`\n  ${round.name || '(بی‌نام)'}`);
    if (round.note) console.log(`    ${round.note}`);
    console.log(
      `    ${String(round.finishedAt || '').slice(0, 16).replace('T', ' ')}  ·  ` +
        `${round.runs.length} اجرا${kinds ? ` (${kinds})` : ''}  ·  ${round.findings} یافته`
    );
    if (round.scope?.length) console.log(`    دامنه: ${round.scope.length} قابلیت`);
    else if (round.name) console.log('    دامنه: کلِ اپ');
  }
  console.log('');
}

/**
 * بسته‌بندی و بازگرداندنِ یک پروژه.
 *
 * ── چرا این فرمان لازم شد ──
 *
 * گشتِ زنده وقتِ **آدم** است، نه وقتِ ماشین. تا امروز اگر کسی می‌خواست از
 * نو شروع کند یا روی ماشینِ دیگری ادامه دهد، باید همهٔ آن را با دست تکرار
 * می‌کرد: گشت، تنظیمات، حساب، آپلودِ فایلِ نمونه.
 */
async function cmdBundle({ flags, positional }) {
  const [action, name] = positional;
  const { exportBundle, importBundle, describeBundle } = await import('../src/knowledge/bundle.js');

  if (action === 'export') {
    if (!name) throw new Error('نام هدف لازم است: userbug bundle export <هدف>');
    const bundle = exportBundle(name, { fixtures: flags.fixtures !== false });
    const out = flags.out && flags.out !== true ? String(flags.out) : `${name}-bundle.json`;
    fs.writeFileSync(out, JSON.stringify(bundle, null, 2) + '\n', 'utf8');

    const info = describeBundle(bundle);
    const size = (fs.statSync(out).size / 1024).toFixed(0);
    console.log(`\n  بسته: ${out}  (${size} کیلوبایت)`);
    console.log(`  ${info.knowledge} فایلِ شناخت · ${info.scenarios} سناریو · ${info.fixtures} فایلِ نمونه`);
    if (info.missions || info.brief) console.log(`  ${info.missions} نقشهٔ کار${info.brief ? ' · توضیحِ پروژه' : ''}`);
    if (info.states) console.log(`  نقشه: ${info.states} حالت · ${info.pages} صفحهٔ ثبت‌شده`);
    for (const note of info.omitted) console.log(`  ! نیامد: ${note}`);
    console.log(`\n  بازگرداندن: userbug bundle import ${out}\n`);
    return;
  }

  if (action === 'import') {
    if (!name) throw new Error('مسیر فایل لازم است: userbug bundle import <فایل>');
    const file = path.resolve(name);
    if (!fs.existsSync(file)) throw new Error(`بسته پیدا نشد: ${file}`);

    const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
    const info = describeBundle(bundle);

    if (flags.show) {
      console.log(`\n  هدف: ${info.target}  ·  ساخته‌شده: ${info.at.slice(0, 16).replace('T', ' ')}`);
      console.log(`  ${info.knowledge} فایلِ شناخت · ${info.scenarios} سناریو · ${info.fixtures} فایلِ نمونه`);
    if (info.missions || info.brief) console.log(`  ${info.missions} نقشهٔ کار${info.brief ? ' · توضیحِ پروژه' : ''}`);
      if (info.states) console.log(`  نقشه: ${info.states} حالت`);
      for (const note of info.omitted) console.log(`  ! داخلش نیست: ${note}`);
      console.log('');
      return;
    }

    const result = importBundle(bundle, {
      as: flags.as && flags.as !== true ? String(flags.as) : '',
      force: Boolean(flags.force),
    });

    console.log(`\n  هدف: ${result.target}`);
    console.log(`  ${result.written.length} فایل نوشته شد`);
    if (result.skipped.length) {
      console.log(`  ${result.skipped.length} فایل رد شد چون از قبل بود (برای بازنویسی: --force)`);
      for (const one of result.skipped.slice(0, 5)) console.log(`    · ${one}`);
    }
    for (const note of result.omitted) console.log(`  ! در بسته نبود: ${note}`);
    console.log('');
    return;
  }

  throw new Error('userbug bundle export <هدف>  |  userbug bundle import <فایل>');
}

/**
 * ساختِ «مسیرِ ورود» از چیزی که یک بار کار کرد.
 *
 * ── چرا این فرمان لازم شد ──
 *
 * خزنده بلد نیست وارد شود؛ یک سناریوی ورود را بازپخش می‌کند. پروژه‌ای که آن
 * را نداشت، خزشش «موفق» تمام می‌شد با دو گرهِ `/login` — و کاربری که در
 * تنظیمات حساب ساخته بود، حق داشت فکر کند کارش را کرده.
 *
 * نوشتنش با دست سخت است (همه‌چیز باید زیر `when` برود، وگرنه اجرای دوم
 * می‌شکند)، ولی قدم‌هایش از قبل روی دیسک‌اند: در گشتِ زنده، یا در پیش‌نویسی
 * که کاوش نوشت.
 */
async function cmdEntry({ flags, positional }) {
  const target = positional[0];
  if (!target) throw new Error('نام هدف لازم است: userbug entry <هدف> --from <سناریو> --account <شناسه>');

  const { loadScenario, loadScenarios, scenarioDir } = await import('../src/scenario/load.js');
  const { buildEntry, buildSeed, entryYaml, seedPrefixFrom, seedYaml } = await import('../src/scenario/entry.js');
  const { listAccounts } = await import('../src/knowledge/credentials.js');

  /**
   * منبع: یا فایلی که گفته شده، یا — اگر نگفته — هر سناریویی که فیلدِ ورود
   * دارد. حدس نمی‌زنیم؛ اگر چند تا بود، فهرست را نشان می‌دهیم و می‌ایستیم.
   */
  let source = flags.from && flags.from !== true ? String(flags.from) : '';
  if (!source) {
    const dir = scenarioDir(target);
    const candidates = [];
    for (const sub of ['', '_drafts']) {
      const folder = sub ? path.join(dir, sub) : dir;
      if (!fs.existsSync(folder)) continue;
      for (const file of fs.readdirSync(folder)) {
        if (!/\.ya?ml$/.test(file)) continue;
        const full = path.join(folder, file);
        try {
          if (buildEntry({ steps: loadScenario(full).steps }).found) {
            candidates.push(path.relative(ROOT, full).split(path.sep).join('/'));
          }
        } catch {
          // فایلِ خراب اینجا خطا نیست، فقط نامزد نیست
        }
      }
    }
    if (!candidates.length) {
      throw new Error(
        'هیچ سناریویی با فرمِ ورود پیدا نشد.\n' +
          '  یک بار «گشتِ زنده» بروید و خودتان وارد شوید؛ قدم‌هایش ضبط می‌شود.'
      );
    }
    if (candidates.length > 1) {
      console.log('\n  چند نامزد پیدا شد؛ یکی را با --from بدهید:\n');
      for (const item of candidates) console.log('   • ' + item);
      console.log('');
      return;
    }
    source = candidates[0];
  }

  const file = path.resolve(source);
  if (!fs.existsSync(file)) throw new Error('سناریوی منبع پیدا نشد: ' + file);

  const accountId = flags.account && flags.account !== true ? String(flags.account) : '';
  if (accountId && !listAccounts(target).some((item) => item.id === accountId)) {
    throw new Error(
      `حسابِ «${accountId}» در این پروژه نیست.\n` +
        '  حساب‌ها: ' + (listAccounts(target).map((item) => item.id).join('، ') || '(هیچ)')
    );
  }

  const steps = loadScenario(file).steps;
  const relative = path.relative(scenarioDir(target), file).split(path.sep).join('/');
  const wantSeed = Boolean(flags.seed);

  const built = wantSeed ? buildSeed({ steps }) : buildEntry({ steps, accountId });
  if (!built.found) throw new Error(built.notes.join(String.fromCharCode(10)));

  /**
   * دانه‌ای که به منویی بسته بازمی‌گردد، از نقشه مسیر می‌گیرد.
   *
   * نخستین دانهٔ واقعی دقیقاً همین‌جا شکست: «وارد کردن اطلاعات» یک منوآیتم
   * بود و کلیکِ بازکنندهٔ منو در ضبطِ گشت نیامده بود.
   */
  if (wantSeed) {
    const { readMap } = await import('../src/map/store.js');
    const prefix = seedPrefixFrom(readMap(target), built.steps);
    if (prefix.length) {
      built.steps = [...prefix, ...built.steps];
      built.notes.push(`${prefix.length} قدمِ رسیدن از نقشه جلویش گذاشته شد.`);
    }
  }

  const yaml = wantSeed
    ? seedYaml({ ...built, source: relative })
    : entryYaml({ ...built, accountId, source: relative });

  const out =
    flags.out && flags.out !== true ? String(flags.out) : wantSeed ? 'دادهٔ-اولیه.yml' : 'ورود.yml';
  const destination = path.join(scenarioDir(target), out);

  // بازنویسیِ بی‌خبرِ مسیرِ ورود یعنی خزشِ فردا با فرمی برود که کسی ندیده
  if (fs.existsSync(destination) && !flags.force) {
    throw new Error(`«${out}» از قبل هست. برای بازنویسی --force بدهید.`);
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, yaml, 'utf8');

  console.log(`\n  ${wantSeed ? 'دانه' : 'مسیرِ ورود'}: scenarios/${target}/${out}`);
  console.log(`  از روی: ${source}`);
  if (!wantSeed) console.log(accountId ? `  با حسابِ «${accountId}»` : '  بی حسابِ ذخیره‌شده — هر اجرا کاربرِ تازه');
  for (const note of built.notes) console.log(`  · ${note}`);
  console.log(`\n  حالا: userbug map ${target} --${wantSeed ? 'seed' : 'from'} scenarios/${target}/${out}\n`);
}

/**
 * کاوشِ هدف‌دار — نقشه راه را می‌برد، کاوش فکر می‌کند.
 *
 * ── چرا این با `map` و با `run --author` فرق دارد ──
 *
 * نقشه کامل است ولی بی‌هدف. کاوش هدف دارد ولی از صفحهٔ اول و کور شروع
 * می‌کند، پس نیمی از فراخوانی‌هایش خرجِ رسیدن می‌شود نه گشتن.
 *
 * quest مسیرِ رسیدن را از نقشه برمی‌دارد (رایگان و قطعی) و فقط همان‌جا مدل
 * را صدا می‌زند. و چون قدم‌های ناوبری **پیش از** فعلِ `explore` می‌نشینند،
 * `ctx.executed` خودش آن‌ها را به‌عنوان مقدمهٔ پیش‌نویس می‌دهد.
 *
 * ── چرا اجراگرِ تازه‌ای ساخته نمی‌شود ──
 *
 * یک سناریوی کوچک نوشته می‌شود و از همان `playwright test` رد می‌شود که هر
 * اجرای دیگری. پس داور، چکِ همگانی، trace و گزارش همه بی یک خط کارِ اضافه
 * کار می‌کنند.
 */
/**
 * کدِ خروج: ۱ فقط وقتی یافتهٔ واقعی هست.
 *
 * در سطحِ ماژول است چون `run` و `quest` هر دو همان اجراگر را صدا می‌زنند و
 * باید همان‌طور خوانده شوند؛ دو نسخه یعنی روزی یکی‌شان «خطای اجراگر» را
 * «یافته» بخواند و CI سبز بماند.
 */
function classifyExit(result, runId) {
  if (result.error || !Number.isInteger(result.status)) return 2;
  if (result.status === 0) return 0;
  try {
    const run = readRun(runId);
    if (result.status === 1 && run.status !== 'running' && Number(run.findings || 0) > 0) return 1;
  } catch {
    // config/globalSetup ممکن است پیش از ساخت artifact شکسته باشد.
  }
  return 2;
}

async function cmdQuest({ flags, positional }) {
  const target = positional[0];
  const goal = positional.slice(1).join(' ').trim() || (flags.goal && flags.goal !== true ? String(flags.goal) : '');
  if (!target) throw new Error('نام هدف لازم است: userbug quest <هدف> "<چه چیزی را بررسی کنم>"');
  if (goal.length < 5) throw new Error('هدف را بنویسید: userbug quest <هدف> "آپلودِ فایلِ تکراری چه می‌کند"');

  /**
   * کاوشِ هدف‌دار موقتاً بسته است.
   *
   * این دستور سناریوی YAML می‌ساخت و همان‌جا اجرایش می‌کرد. اجرای YAML
   * برداشته شد، چون خروجیِ ابزار از این پس کدِ پلی‌رایت است نه فایلی که
   * مفسّر بخواهد.
   *
   * آنچه اینجا ارزش داشت — پیدا کردنِ نزدیک‌ترین نما به هدف از روی نقشه —
   * در `src/map/quest.js` دست‌نخورده مانده و همان‌جا منتظرِ `userbug author`
   * است: همین کاوش، با خروجیِ `.spec.js` به‌جای `.yml`.
   */
  throw new Error(
    '`userbug quest` فعلاً بسته است: اجرای YAML برداشته شد.\n' +
      '  تا آمدنِ `userbug author`، سناریو را مستقیم `.spec.js` بنویسید.\n' +
      '  نمونه: scenarios/nepi/ورود.spec.js',
  );

  const YAML = (await import('yaml')).default;
  const { readMap } = await import('../src/map/store.js');
  const { pickState, questScenario, questSlug } = await import('../src/map/quest.js');
  const { scenarioDir, loadScenario, resolveScenarioRef } = await import('../src/scenario/load.js');

  const map = readMap(target);
  const found = pickState(map, goal);

  if (!map.states?.length) {
    console.log('\n  نقشه‌ای نیست، پس کاوش از صفحهٔ اول شروع می‌کند.');
    console.log('  برای شروعِ نزدیک‌تر اول نقشه را بسازید: userbug map ' + target + '\n');
  } else if (found) {
    const view = found.state.view ? ' ▸ ' + found.state.view : '';
    console.log('\n  نزدیک‌ترین نما: ' + found.state.route + view);
    console.log('  چون: ' + found.hits.join('، ') + ' · ' + found.depth + ' قدمِ قطعی تا آنجا');
  } else {
    console.log('\n  هیچ نمایی با این هدف نخواند؛ کاوش از صفحهٔ اول شروع می‌شود.');
  }

  /**
   * مسیرِ ورود — و چرا نبودنش سکوت نیست.
   *
   * `state.path` که نقشه ضبط کرده، **نسبت به ورود** است نه از هیچ‌جا: خزنده
   * اول `entryPath` را می‌رود و بعد این قدم‌ها را. نخستین اجرای quest بی این،
   * روی `about:blank` کلیک کرد و چکِ همگانی درست گفت «صفحهٔ blank چیزی برای
   * کلیک ندارد» — یعنی مسیرِ نقشه بی مبدأ، مسیر نیست.
   *
   * و اگر کاربر `--from` ندهد، همان سناریویی برداشته می‌شود که خودِ نقشه با
   * آن ساخته شده؛ چون مسیرها فقط نسبت به همان معنا دارند.
   */
  const fromFlag = flags.from && flags.from !== true ? String(flags.from) : map.entry?.scenario || '';
  let entrySteps = [];
  if (fromFlag) {
    const file = resolveScenarioRef(target, fromFlag);
    entrySteps = loadScenario(file).steps;
    console.log('  مسیرِ ورود: ' + fromFlag);
  }

  const depth = parseDepth(flags.depth);
  const scenario = questScenario({ goal, entrySteps, path: found?.state.path || [], depth });
  const slug = questSlug(goal);
  /**
   * چرا در `_quests/` و نه `_drafts/`:
   *
   * `_drafts/` جای **خروجی** است — آنچه کاوش نوشته و آدم باید بازبینی کند.
   * این فایل ورودی است. اگر کنار هم می‌نشستند، اسلاگِ هم‌نام می‌توانست
   * رانندهٔ اجرا را با پیش‌نویسِ همان اجرا عوض کند.
   */
  const relative = '_quests/' + slug + '.yml';
  const file = path.join(scenarioDir(target), relative);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    '# رانندهٔ کاوشِ هدف‌دار — ساختهٔ `userbug quest`.\n' +
      '#\n' +
      '# این فایل **خروجی نیست، موتور است**: قدم‌های ناوبری از نقشه آمده‌اند\n' +
      '# (رایگان و قطعی) و فعلِ explore از همان‌جا به بعد را می‌گردد.\n' +
      '# آنچه باید بازبینی کنید، پیش‌نویسی است که این اجرا می‌نویسد.\n' +
      YAML.stringify(scenario),
    'utf8'
  );

  console.log('  رانندهٔ کاوش: scenarios/' + target + '/' + relative);
  console.log('  ' + (scenario.steps.length - 1) + ' قدمِ قطعی، بعد کاوشِ هدف‌دار\n');

  const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '_' + target + '_quest';
  const env = { ...process.env, UB_TARGET: target, UB_RUN_ID: runId, UB_AUTHOR: '1', UB_RUN_KIND: 'quest' };
  /**
   * کاوش هم می‌تواند بخشی از یک «دور» باشد.
   *
   * تا امروز `--bench` فقط به `run` می‌چسبید، پس دوری که هم سناریو می‌گرفت
   * هم جایی را می‌کاوید، نیمه‌اش بی‌نام می‌ماند و در فهرست از کاوشِ هفتهٔ
   * پیش جدا نمی‌شد.
   */
  const questBench = normalizeBench(flags.bench === true ? '' : flags.bench);
  if (questBench) env.UB_BENCH = questBench;
  if (depth) env.UB_DEPTH = String(depth);
  if (flags.model && flags.model !== true) env.UB_MODEL = assertModelSlug(flags.model);

  /**
   * چرا `UB_SCENARIO_FILE` و نه `--grep`:
   *
   * `loadScenarios` فقط ریشهٔ پوشهٔ سناریوها را می‌خواند، نه زیرپوشه‌ها را —
   * پس grep روی نامی که در `_quests/` است هیچ تستی پیدا نمی‌کرد و اجرا
   * «۰ تست» می‌شد؛ خطایی که شبیهِ «چیزی نشکست» به نظر می‌رسد.
   */
  env.UB_SCENARIO_FILE = file;
  const args = [PLAYWRIGHT_CLI, 'test', 'scenarios/yaml.spec.js'];
  if (flags.headed) args.push('--headed');

  const processResult = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env });
  process.exit(classifyExit(processResult, runId));
}

/**
 * «انتظار داشتیم چه ببینیم؟» — افزودنِ انتظار به یک سناریوی موجود.
 *
 * ── چرا این فرمان لازم شد ──
 *
 * سناریوی ورودی که همین ابزار ساخته بود، چهل‌وهفت خط `fill` و `click` داشت
 * و **صفر `expect`**. یعنی ابزار می‌گفت «چیزی نشکست»، نه «کار درست انجام
 * شد» — و کاربر دقیقاً دومی را می‌خواست.
 *
 * ── چرا بی `--apply` چیزی نمی‌نویسد ──
 *
 * انتظارِ غلط بدتر از نبودِ انتظار است: سناریو برای همیشه قرمز می‌ماند و
 * آدم یاد می‌گیرد قرمزها را نادیده بگیرد. پس پیش‌فرض **نشان دادن** است و
 * نوشتن یک پرچمِ صریح می‌خواهد.
 */
async function cmdExpect({ flags, positional }) {
  const target = positional[0];
  if (!target) throw new Error('نام هدف لازم است: userbug expect <هدف> --from <سناریو>');

  const { applyExpectations, candidatesFor, describeExpectation, proposeExpectations } = await import(
    '../src/scenario/expect.js'
  );
  const { knowledgeFor } = await import('../src/knowledge/select.js');
  const { stepNames, testTitle } = await import('../src/emit/spec.js');
  const { workspaceRoot } = await import('../src/emit/workspace.js');
  const { loadTarget } = await import('../src/target.js');

  /* ── فهرستِ نامزدها: رایگان، و بی سناریو هم معنا دارد ── */
  if (flags.list) {
    const candidates = candidatesFor(target);
    if (!candidates.length) {
      throw new Error(
        'هیچ نامزدی نیست: این پروژه نه گشتِ ثبت‌شده دارد نه نقشه.\n' +
          '  اول یکی از آن دو، وگرنه هر انتظاری فقط حدس است.'
      );
    }
    console.log(`\n  ${candidates.length} عنصرِ واقعی در «${target}»:\n`);
    for (const one of candidates) {
      console.log(`  ${one.ref.padEnd(5)} ${one.route}${one.view ? ` ▸ ${one.view}` : ''}  ${one.label}`);
    }
    console.log('');
    return;
  }

  const root = workspaceRoot(await loadTarget(target));
  let from = flags.from && flags.from !== true ? String(flags.from) : '';

  /**
   * بی `--from`، فهرست می‌دهد به‌جای خطا.
   *
   * نامِ فایل‌ها فارسی است و تایپِ دقیقشان آزاردهنده — همان اصطکاکی که
   * کاربر را از ابزار دور می‌کند بی آنکه بتواند بگوید چرا.
   */
  if (!from) {
    const { listSpecs } = await import('../src/emit/specs.js');
    const { choose } = await import('../src/ask.js');
    const specs = listSpecs(root);

    if (!specs.length) {
      throw new Error(
        `تستی در ${root} نیست.\n` +
          `  یکی بسازید: userbug tour ${target}   یا   userbug author ${target} "<متن>"`
      );
    }

    const [index] = await choose(specs, {
      message: 'کدام فایل؟',
      render: (item) => `${item.name}`,
      hint: (item) => `${item.id} · ${item.steps.length} قدم`,
    });
    if (index === undefined) {
      console.log('\n  چیزی انتخاب نشد.\n');
      return;
    }
    from = specs[index].id;
  }

  // مسیرِ نسبی از پوشهٔ userbug در خودِ پروژهٔ هدف خوانده می‌شود، چون تست‌ها
  // از این مخزن رفته‌اند و در ریپوی همان اپ می‌نشینند.
  const file = path.isAbsolute(from) ? from : path.join(root, from);
  if (!fs.existsSync(file)) throw new Error(`فایلِ تست پیدا نشد: ${file}`);

  const before = fs.readFileSync(file, 'utf8');
  const steps = stepNames(before);
  if (!steps.length) {
    throw new Error(
      'این فایل هیچ `ub.step()`ی ندارد.\n' +
        '  لنگرِ درجِ ادعا نامِ قدم است، پس بی قدم جایی برای گذاشتنش نیست.'
    );
  }

  const models = resolveModel({
    global: await loadGlobalConfig(),
    role: 'author',
    model: flags.model && flags.model !== true ? assertModelSlug(flags.model) : undefined,
  });

  const title = testTitle(before) || from;
  console.log(`\n  انتظارها برای «${title}» با ${models.model}…`);

  const result = await proposeExpectations({
    source: before,
    title,
    target,
    models,
    knowledge: knowledgeFor({ target, text: title, budget: 1200 }),
  });

  if (!result.expectations.length) {
    console.log('\n  مدل هیچ انتظارِ معتبری پیشنهاد نداد.');
    for (const note of result.dropped) console.log(`  ! ${note}`);
    console.log(`\n  فهرستِ عنصرهای واقعی: userbug expect ${target} --list\n`);
    return;
  }

  /**
   * آنچه افتاد، پیش از فهرست چاپ می‌شود.
   *
   * مدل گاهی عنصری می‌گوید که وجود ندارد؛ حذفِ بی‌صدایش یعنی کاربر فکر کند
   * آن هم سنجیده می‌شود.
   */
  if (result.dropped.length) {
    console.log('');
    for (const note of result.dropped) console.log(`  ! ${note}`);
  }

  /**
   * ── انتخابِ جزئی ──
   *
   * `describeExpectation` از روزِ اول نوشته بود «جمله‌ای که در فهرست دیده
   * می‌شود… آدم باید در یک نگاه بفهمد دارد چه چیزی را تأیید می‌کند» —
   * یعنی برای فهرستی نوشته شده بود که آدم از آن انتخاب کند. ولی CLI فقط
   * همه-یا-هیچ داشت؛ آن فهرست تنها در رابط گرافیکی بود.
   *
   * و این مهم است: مدل چهار ادعا می‌دهد و معمولاً دوتایش درست است. «همه یا
   * هیچ» یعنی یا ادعای مشکوک را می‌پذیرید یا حرفِ درست را هم دور می‌ریزید.
   */
  const { choose } = await import('../src/ask.js');

  const picked = flags.apply
    ? [...result.expectations.keys()]
    : await choose(result.expectations, {
        message: 'کدام‌ها نوشته شوند؟',
        render: (item) => `${item.confidence === 'low' ? '?' : '·'} ${describeExpectation(item)}`,
        hint: (item) => item.why,
      });

  if (!picked.length) {
    console.log('\n  چیزی نوشته نشد.');
    console.log('  برای نوشتنِ همه بی پرسش: همین فرمان با --apply');
    console.log('  و --hard اگر به‌جای expect.soft، expect بخواهید — یعنی همان‌جا بشکنند.\n');
    return;
  }

  /**
   * نرم پیش‌فرض است، سخت با پرچم.
   *
   * حرفِ نیازموده‌ی مدل نباید بتواند بقیهٔ تست را از اجرا بیندازد: یافته
   * ثبت می‌کند و می‌گذرد. سخت‌شدنش تصمیمِ آدم است.
   */
  const hard = Boolean(flags.hard);
  const chosen = picked.map((index) => result.expectations[index]);

  /**
   * حفظِ کامنت‌ها دیگر کاری نمی‌خواهد.
   *
   * در YAML باید هدرِ `#` را دستی جدا و دوباره سرِ جایش می‌گذاشتیم، چون
   * `YAML.stringify` از ساختار می‌ساخت و هرچه نوشته بودی می‌رفت. درج در
   * **متن** چنین مسئله‌ای ندارد: فایل همان است، فقط چند خط بیشتر دارد.
   */
  const next = applyExpectations(before, chosen.map((one) => ({ ...one, hard })));
  fs.writeFileSync(file, next, 'utf8');
  console.log(`\n  ${chosen.length} ادعا اضافه شد (${hard ? 'سخت' : 'نرم'}): ${file}`);
  console.log('  یک بار اجرا کنید و ببینید کدامشان واقعاً می‌خورند.\n');
}

/**
 * «نقشهٔ کار» — جمله → برنامهٔ خزش → اصلاحِ آدم → خزشِ محدود.
 *
 * نامش عوض شد: «مأموریت» حالا مالِ سفرهای کاربر است (`userbug missions`).
 * این یکی برنامه‌ای است برای اینکه خزنده کجا را بگردد.
 *
 * ── چرا این گام میانی ساخته شد ──
 *
 * `quest` و `map` هر دو مستقیم شروع می‌کنند. اگر جمله را بد فهمیده باشند،
 * بیست‌وپنج قدم و چند دقیقه و چند فراخوانی رفته تا معلوم شود. اصلاحِ یک
 * **نقشه** رایگان است؛ اصلاحِ یک **اجرا** گران.
 *
 * ── چرا خروجی یک فایل است و همان‌جا باز نمی‌شود ──
 *
 * در خط فرمان، «اصلاح» یعنی ویرایشِ فایل. پس نقشهٔ کار ذخیره می‌شود و مسیرش
 * چاپ؛ نه پرسشِ تعاملی، نه ویرایشگری که باز شود. همان فایل را رابط هم
 * می‌خواند و می‌نویسد.
 */
async function cmdPlan({ flags, positional }) {
  const {
    listMissions,
    missionSlug,
    missionToJob,
    proposeMission,
    removeMission,
    saveMission,
  } = await import('../src/map/plan.js');

  const USAGE =
    'userbug plan <هدف> "<جمله>"  |  plan list <هدف>  |  plan run <هدف> <نام>  |  plan remove <هدف> <نام>';

  /**
   * فعل اول، مثل `bundle`.
   *
   * پروژه‌ای که نامش «run» باشد اینجا گیر می‌کند — پذیرفته است: نامِ فرمان
   * پیش‌بینی‌پذیر بودن ارزشش بیشتر از آن حالتِ نادر است.
   */
  const verbs = new Set(['list', 'run', 'remove']);
  const verb = verbs.has(positional[0]) ? positional[0] : 'new';
  const target = verb === 'new' ? positional[0] : positional[1];
  if (!target) throw new Error(USAGE);

  const show = (mission) => {
    console.log(`\n  ${mission.goal}`);
    if (mission.why) console.log(`  چرا: ${mission.why}`);
    const start = mission.start || {};
    const how =
      start.mode === 'session'
        ? 'ادامهٔ نشستِ ذخیره‌شدهٔ گشت'
        : start.mode === 'account'
          ? `با حسابِ «${start.account}»${start.entry ? ` و سناریوی ${start.entry}` : ''}`
          : 'کاربرِ تازه می‌سازد';
    console.log(`  شروع: ${how}`);
    console.log(`  دامنه: ${mission.scope?.length ? mission.scope.join('، ') : '(همه‌جا — تنگش کنید)'}`);
    for (const one of mission.look || []) console.log(`    · ${one}`);
    if (mission.notes) console.log(`  یادداشت: ${mission.notes}`);
    /**
     * آنچه افتاد، چاپ می‌شود.
     *
     * دامنه‌ای که مدل اختراع کرده بی‌صدا حذف شود، خزش به جایی می‌رود که هیچ
     * کنشی امتحان نمی‌شود — و گزارشش «صف تمام شد» است، یعنی شبیهِ موفقیت.
     */
    for (const one of mission.dropped || []) console.log(`  ! ${one}`);
  };

  if (verb === 'list') {
    const missions = listMissions(target);
    if (!missions.length) {
      console.log(`\n  هنوز نقشهٔ کاری نیست.\n  ساختنش: userbug plan ${target} "برو داخل کتاب و ابزارهای متن را ببین"\n`);
      return;
    }
    console.log('');
    for (const mission of missions) {
      const runs = mission.runs?.length ? ` · ${mission.runs.length} اجرا` : '';
      console.log(`  ${mission.slug}${runs}`);
      console.log(`    ${mission.goal}`);
      console.log(`    دامنه: ${mission.scope?.length ? mission.scope.join('، ') : 'همه‌جا'}`);
    }
    console.log('');
    return;
  }

  if (verb === 'remove') {
    const slug = positional[2];
    if (!slug) throw new Error('نام نقشهٔ کار لازم است: userbug plan remove <هدف> <نام>');
    removeMission(target, slug);
    console.log(`\n  حذف شد: ${slug}\n`);
    return;
  }

  if (verb === 'run') {
    const slug = positional[2];
    if (!slug) throw new Error('نام نقشهٔ کار لازم است: userbug plan run <هدف> <نام>');
    const mission = listMissions(target).find((one) => one.slug === slug);
    if (!mission) throw new Error(`نقشهٔ کاری به نام «${slug}» نیست. فهرست: userbug plan list ${target}`);

    show(mission);
    const job = missionToJob(mission, { target });
    /**
     * ترجمه یک جاست: `missionToJob`.
     *
     * اگر اینجا و در رابط هر کدام ترجمهٔ خودشان را داشتند، دیر یا زود یکی‌شان
     * `profile` را می‌فرستاد و آن یکی نه — و کاربر می‌دید که «همان نقشهٔ کار»
     * در دو جا دو جور اجرا می‌شود.
     */
    const mapFlags = { ...flags };
    if (job.from) mapFlags.from = job.from;
    if (job.profile) mapFlags.profile = true;
    if (job.remember) mapFlags.remember = job.remember;
    if (job.scope) mapFlags.scope = job.scope;
    if (job.focus) mapFlags.focus = job.focus;
    if (mapFlags.states === undefined) mapFlags.states = job.states;
    if (mapFlags.minutes === undefined) mapFlags.minutes = job.minutes;

    console.log(`  خزشِ محدود شروع می‌شود…\n`);
    const session = await cmdMap({ flags: mapFlags, positional: [target] });

    /**
     * اجرا در خودِ فایلِ نقشهٔ کار ثبت می‌شود — مثل رابط.
     *
     * «چه چیزی از این نقشهٔ کار درآمد» پرسشی است که هفتهٔ بعد پرسیده می‌شود.
     * اگر فقط رابط ثبتش می‌کرد، همان نقشه بسته به اینکه از کجا اجرا شده
     * دو تاریخچهٔ متفاوت می‌داشت.
     */
    if (session?.runId) {
      saveMission(target, {
        ...mission,
        runs: [{ run: session.runId, at: new Date().toISOString(), by: 'cli' }, ...(mission.runs || [])].slice(0, 20),
      });
    }
    return;
  }

  /* ── ساختنِ نقشهٔ کار: تنها جایی که پول خرج می‌شود ── */
  const text = positional.slice(1).join(' ').trim();
  if (text.length < 5) throw new Error(USAGE);

  const { readMap } = await import('../src/map/store.js');
  const { knowledgeFor } = await import('../src/knowledge/select.js');
  const { listAccounts } = await import('../src/knowledge/credentials.js');
  const { readEndpoints } = await import('../src/knowledge/endpoints.js');
  const { knowledgeDir } = await import('../src/knowledge/store.js');
  const { scenarioDir } = await import('../src/scenario/load.js');

  const safely = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  const map = safely(() => readMap(target), null);
  const states = map?.states || [];
  const dossier = safely(() => readDossier(target), null);

  /**
   * روت‌ها از سه جا، نه فقط از نقشه.
   *
   * نقشه فقط جایی را می‌شناسد که رفته. نقشهٔ کاری که می‌خواهد جایی را بگردد
   * که هنوز نرفته‌ایم — دقیقاً ارزشمندترین حالت — با فهرستِ نقشه به
   * «دامنه‌ای که نشناختیم» می‌خورد و می‌افتد.
   */
  const routes = [
    ...new Set([
      ...states.map((one) => one.route).filter(Boolean),
      ...(dossier?.routes || []).map((one) => one.path).filter(Boolean),
      ...safely(() => readEndpoints(target).routes.map((one) => one.path), []).filter(Boolean),
    ]),
  ];

  const dir = safely(() => scenarioDir(target), '');
  const scenarios = dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.yml')) : [];

  const models = resolveModel({
    global: await loadGlobalConfig(),
    role: 'author',
    model: flags.model && flags.model !== true ? assertModelSlug(flags.model) : undefined,
  });

  console.log(`\n  نقشهٔ کار با ${models.model}…`);

  const mission = await proposeMission({
    text,
    target,
    models,
    map,
    knowledge: knowledgeFor({ target, text, budget: 1200 }),
    routes,
    views: [...new Set(states.map((one) => one.view).filter(Boolean))],
    accounts: safely(() => listAccounts(target).map((one) => one.id), []),
    scenarios,
    hasSession: fs.existsSync(path.join(knowledgeDir(target), 'profile')),
  });

  const saved = saveMission(target, {
    ...mission,
    slug: flags.name && flags.name !== true ? missionSlug(String(flags.name)) : undefined,
  });
  show(saved);

  const file = path.relative(ROOT, path.join(knowledgeDir(target), 'plans', `${saved.slug}.json`));
  console.log(`\n  فایل: ${file.split(path.sep).join('/')}`);
  console.log('  اصلاحش کنید (رایگان)، بعد:');
  console.log(`    userbug plan run ${target} ${saved.slug}\n`);
}

/**
 * تنظیماتِ هوش مصنوعی.
 *
 * ── چرا `--check` هست ──
 *
 * اسلاگِ رایگان یک روز رایگان نیست. پیش‌فرضِ نقشِ `analyze` روزی با ۴۰۴
 * برگشت و پیامش وسطِ صفحهٔ شناخت به کاربر رسید — یعنی وقتی فهمید که کارش
 * شکسته بود. این فرمان همان را پیش از کار می‌پرسد.
 */
async function cmdAi({ flags }) {
  const { checkAllModels, effectiveModels, setApiKey, setBudget, setModel } = await import(
    '../src/models/settings.js'
  );

  let changed = false;

  if (flags.key && flags.key !== true) {
    await setApiKey(flags.key);
    console.log('  کلید در .env ذخیره شد.');
    changed = true;
  }

  for (const pair of [].concat(flags.role || [])) {
    if (pair === true) throw new Error('--role مقدار می‌خواهد: --role analyze=<اسلاگ>');
    const index = String(pair).indexOf('=');
    if (index < 1) throw new Error(`--role باید «نقش=اسلاگ» باشد؛ «${pair}» نبود`);
    const role = String(pair).slice(0, index).trim();
    const slug = String(pair).slice(index + 1).trim();
    await setModel({ role, slug: slug || null });
    console.log(`  ${role}: ${slug || '(برگشت به پیش‌فرض)'}`);
    changed = true;
  }

  if (flags.budget && flags.budget !== true) {
    await setBudget(flags.budget);
    console.log(`  سقفِ بودجه: ${flags.budget}$`);
    changed = true;
  }

  const view = await effectiveModels();
  const checks = flags.check ? await checkAllModels() : null;

  console.log(`\n  کلید: ${view.key.present ? `هست (…${view.key.tail}، از ${view.key.from})` : 'نیست'}`);
  console.log(`  بودجهٔ هر اجرا: ${view.budgetPerRun}$ (${view.budgetFrom})`);
  console.log('');

  for (const item of view.roles) {
    const status = checks?.find((entry) => entry.role === item.role);
    const mark = !status ? ' ' : status.ok ? '✓' : '✗';
    console.log(`  ${mark} ${item.role.padEnd(8)} ${item.slug}   (${item.from})`);
    for (const hidden of item.shadowed) {
      console.log(`      ↳ «${hidden.slug}» از ${hidden.from} پوشانده شد`);
    }
    if (status && !status.ok) {
      console.log(`      ${status.error}`);
      if (status.suggestion) console.log(`      پیشنهادِ ارائه‌دهنده: ${status.suggestion}`);
    }
  }

  console.log(`\n  فایل تنظیمات: ${path.relative(ROOT, view.file)}`);
  if (!changed && !flags.check) console.log('  برای سنجشِ زنده: userbug ai --check\n');
  else console.log('');
}

/**
 * نقشهٔ اپ.
 *
 * ── چرا سقف‌ها اجباری‌اند و پیش‌فرض دارند ──
 *
 * خزش ذاتاً بی‌پایان است: هر کلیک می‌تواند حالتِ تازه بسازد. سقف‌ها همان
 * تصمیمی‌اند که `--depth` برای کاوش گرفت — عدد، نه نامی مثل «کامل»، چون عدد
 * همان هزینه است و «کامل» ادعایی است که هیچ خزشی نمی‌تواند بدهد.
 */
async function cmdMap({ flags, positional }) {
  const target = positional[0];
  if (!target) throw new Error('نام هدف لازم است: userbug map <هدف>');

  const { readMap } = await import('../src/map/store.js');
  const { renderMap } = await import('../src/map/render.js');
  const dossier = readDossier(target);
  const knownRoutes = (dossier.routes || []).map((route) => route.path).filter(Boolean);
  const loginPath = dossier.auth?.loginPath || '';

  if (flags.show) {
    console.log('\n' + renderMap(readMap(target), { knownRoutes, loginPath }) + '\n');
    return;
  }

  /**
   * طبقه‌بندی، جدا از خزش.
   *
   * ── چرا خودکار بعد از خزش انجام نمی‌شود ──
   *
   * تنها قدمِ مدل‌دارِ نقشه همین است. هر چیزی که پول خرج کند باید با یک
   * پرچمِ صریح شروع شود، نه به‌عنوان دنبالهٔ چیزی که کاربر برای کارِ دیگری
   * زده. همان موضعی که `--author` و تیکِ «سورس خوانده شود» دارند.
   */
  if (flags.classify) {
    const { resolveSourceRoots } = await import('../src/source-access.js');
    const { classifyMap } = await import('../src/map/classify-run.js');
    const { mispredictions } = await import('../src/map/classify.js');

    const project = await loadTarget(target);
    const roots = await resolveSourceRoots({ key: target, source: project.source });
    if (!roots.length) {
      throw new Error(
        `پروژهٔ «${target}» کلید source.root ندارد.\n` +
          '  طبقه‌بندی از روی سورس است؛ بی سورس فقط حدسِ مدل می‌ماند و آن را نمی‌فروشیم.'
      );
    }

    const models = resolveModel({
      global: await loadGlobalConfig(),
      role: 'analyze',
      model: flags.model && flags.model !== true ? assertModelSlug(flags.model) : undefined,
    });

    console.log(`\n  طبقه‌بندی با ${models.model}\n`);
    const { map, stats, spent, calls } = await classifyMap({
      target,
      roots,
      models,
      force: Boolean(flags.force),
      onState: (event) => {
        if (event.error) return console.log(`  ! ${event.state.route}: ${event.error.slice(0, 100)}`);
        console.log(
          `  ${event.state.route}${event.state.view ? ` ▸ ${event.state.view}` : ''}` +
            `  قاعده ${event.rules} · مدل ${event.model}`
        );
      },
    });

    console.log(
      `\n  ${stats.states} گره طبقه‌بندی شد · ${stats.skipped} دست‌نخورده (مهر می‌خورد)` +
        `\n  قاعده ${stats.byRule} کنش · مدل ${stats.byModel} کنش · ${calls} فراخوانی · ${spent.toFixed(4)}$`
    );
    if (stats.failed) console.log(`  ${stats.failed} گره با خطای مدل رد شد`);

    const wrong = mispredictions(map);
    if (wrong.length) {
      console.log(`\n  پیش‌بینی با واقعیت نخواند (${wrong.length}):`);
      for (const row of wrong.slice(0, 10)) {
        console.log(`    «${row.label.slice(0, 30)}» → پیش‌بینی ${row.predicted} · رسید ${row.actual}`);
      }
    }
    console.log('');
    return;
  }

  const caps = {};
  for (const [flag, key] of [
    ['states', 'states'],
    ['actions', 'actionsPerState'],
    ['minutes', 'minutes'],
  ]) {
    if (flags[flag] === undefined) continue;
    const value = Number(flags[flag]);
    if (!Number.isInteger(value) || value < 1 || value > 1000) {
      throw new Error(`--${flag} باید عددی صحیح بین ۱ و ۱۰۰۰ باشد؛ «${flags[flag]}» نبود`);
    }
    caps[key] = value;
  }

  /**
   * مسیرِ ورود از یک سناریو می‌آید، نه از پرچم‌های ورود.
   *
   * «چطور وارد می‌شوند» خودش دانش است و جای نوشتنش سناریوست. و آن سناریو از
   * قبل وجود دارد: خروجیِ گشت، همان‌جا که کاربر یک بار لاگین کرد.
   */
  let entrySteps = [];
  let entryLabel = '';
  if (flags.from && flags.from !== true) {
    /**
     * نام یا مسیر — هر دو، چون رابط نام می‌دهد و خط فرمان مسیر.
     *
     * پیش‌تر فقط مسیر بود و کشویی رابط نام می‌فرستاد؛ نتیجه‌اش خزشی بود که
     * یک ثانیه بعد بی‌صدا می‌مرد.
     */
    const { loadScenario, resolveScenarioRef } = await import('../src/scenario/load.js');
    const file = resolveScenarioRef(target, String(flags.from));
    const scenario = loadScenario(file);
    entrySteps = scenario.steps;
    entryLabel = path.relative(ROOT, file).split(path.sep).join('/');
  }

  /**
   * دانه — جدا از مسیرِ ورود، چون **یک بار** اجرا می‌شود.
   *
   * مسیرِ ورود در هر برگشت به خانه بازپخش می‌شود، پس باید بی‌اثر باشد.
   * «فایل نمونه را وارد کن» آنجا یعنی ده‌ها ایمپورتِ تکراری. و بی آن، نقشه
   * از اپِ خالی درمی‌آید: روی نپی چهارده گره پیدا شد و «ویرایشِ کتاب»
   * میانشان نبود، چون کتابی نبود.
   */
  let seedSteps = [];
  let seedLabel = '';
  if (flags.seed && flags.seed !== true) {
    const { loadScenario, resolveScenarioRef } = await import('../src/scenario/load.js');
    const file = resolveScenarioRef(target, String(flags.seed));
    if (!fs.existsSync(file)) throw new Error(`سناریوی دانه پیدا نشد: ${file}`);
    seedSteps = loadScenario(file).steps;
    seedLabel = path.relative(ROOT, file).split(path.sep).join('/');
  }

  /**
   * نامِ دور، از راهِ محیط — همان مسیری که `global-setup.js` هم می‌رود.
   *
   * `MapSession` در همین پروسه اجرا می‌شود، پس گذاشتنش روی `process.env`
   * کافی است. دو راهِ متفاوت برای یک چیز (پرچمِ سازنده و متغیرِ محیط) یعنی
   * روزی یکی‌شان از قلم بیفتد و خزشی بی‌نام ثبت شود.
   */
  const mapBench = normalizeBench(flags.bench === true ? '' : flags.bench);
  if (mapBench) process.env.UB_BENCH = mapBench;

  const { MapSession } = await import('../src/map/session.js');
  const session = new MapSession({
    target,
    device: flags.device === true ? undefined : flags.device,
    headless: !flags.headed,
    caps,
    entrySteps,
    entryLabel,
    seedSteps,
    seedLabel,
    fresh: Boolean(flags.fresh),
    allowDestructive: Boolean(flags['allow-destructive']),
    rememberAs: flags.remember && flags.remember !== true ? String(flags.remember) : '',
    focus: flags.focus && flags.focus !== true ? String(flags.focus) : '',
    // دامنه: مرز است نه اولویت — «فقط اینجا را بگرد»
    scope: flags.scope && flags.scope !== true ? String(flags.scope) : '',
    profile: Boolean(flags.profile || flags['fresh-profile']),
    freshProfile: Boolean(flags['fresh-profile']),
  });

  session.on('event', (event) => {
    if (event.type === 'state') console.log(`  + ${event.route}${event.view ? ` ▸ ${event.view}` : ''}  (${event.actions} کنش)`);
    else if (event.type === 'finding') console.log(`  ⚠ ${event.finding.message}`.slice(0, 160));
    else if (event.type === 'warning') console.log(`  ! ${event.message}`);
  });

  await session.start();
  console.log(`\n  خزش آغاز شد: ${session.runId}`);

  /**
   * کانالِ حرف زدن، وسطِ خزشِ خودکار.
   *
   * ── چرا لازم بود ──
   *
   * گشت از روزِ اول REPL داشت و خزش فقط رویداد بیرون می‌داد. یعنی وقتی
   * چیزی می‌دیدید که ماشین نمی‌فهمد — «این مودال باگ دارد»، «اینجا را
   * نگرد» — تنها کارتان تماشا بود.
   *
   * ── چرا با `--headed` معنا پیدا می‌کند ──
   *
   * خزش پیش‌فرض بی‌مرورگرِ دیده‌شدنی است. با `--headed` صفحه را می‌بینید و
   * همین‌جا دربارهٔ همان صفحه حرف می‌زنید.
   */
  const interactive = Boolean(process.stdin.isTTY) && !flags.quiet;
  let rl = null;

  if (interactive) {
    const readline = await import('node:readline');
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('  در همین ترمینال:');
    console.log('    n <متن>  یادداشت/ایراد دربارهٔ همین لحظه');
    console.log('    w        الان کجاست؟');
    console.log('    q        بس است — تمیز بایست و آنچه پیدا شده را نگه دار\n');

    rl.on('line', async (line) => {
      const text = line.trim();
      try {
        if (text === 'q') session.requestStop('خواستهٔ کاربر');
        else if (text === 'w') {
          const at = session.where();
          console.log(`  ▸ ${at.route || '؟'} · ${at.states} حالت · ${at.queued} در صف · ${at.findings} یافته`);
        } else if (text.startsWith('n ')) {
          await session.note(text.slice(2));
          console.log('  ✓ ثبت شد');
        } else if (text) {
          console.log('  ? فرمان‌ها: n <متن> · w · q');
        }
      } catch (cause) {
        console.error(`  ! ${cause.message}`);
      }
    });
  } else {
    console.log('');
  }

  let map;
  try {
    map = await session.crawl();
  } catch (cause) {
    // خطا در `run.json` می‌نشیند، وگرنه فهرستِ اجراها «پایان‌یافته» نشان می‌دهد
    rl?.close();
    await session.stop(cause);
    throw cause;
  }
  rl?.close();
  await session.stop();

  console.log('\n' + renderMap(map, { knownRoutes, loginPath }));

  /**
   * نقشهٔ محدود با نقشهٔ کامل یکی نیست.
   *
   * سکوت اینجا یعنی کسی بعداً «کجا را نیازموده‌ایم» را از روی نقشه‌ای
   * می‌خواند که **عمداً** ناقص است — همان پوششِ خوش‌بینانه‌ای که در
   * `endpointCoverage` هم از آن پرهیز شد.
   */
  if (session.scope) {
    const { outsideScope } = await import('../src/map/scope.js');
    const outside = outsideScope(map, session.scope);
    console.log(`  دامنه: ${session.scope.patterns.join('، ')}`);
    if (outside.length) console.log(`  ${outside.length} حالت بیرونِ دامنه ماند و گشته نشد.`);

    /**
     * دامنه‌ای که هیچ حالتی را نگرفت، **شکست است** نه نتیجه.
     *
     * نخستین نقشهٔ کارِ واقعی همین‌طور تمام شد: «صف تمام شد» و صفر کنش داخلِ
     * دامنه — یعنی گزارشی که شبیهِ موفقیت است و نیست. این همان شکستِ خاموشی
     * است که کلِ این ابزار برای شکارش ساخته شده، پس در خودش هم بلند گفته
     * می‌شود.
     */
    const inside = (map.states || []).length - outside.length;
    if (!inside) {
      console.log('');
      console.log('  ! هیچ حالتی داخلِ دامنه نبود؛ عملاً هیچ‌چیز گشته نشد.');
      console.log('    یا الگو با روت و نمای واقعی نمی‌خواند، یا رسیدن به آنجا');
      console.log('    از جایی می‌گذرد که خودش بیرونِ دامنه است. الگوی گشاد‌تر');
      console.log('    بدهید، یا روتِ مشخص تا مستقیم برود.');
    }
  }
  /**
   * خزشی که پشتِ درِ ورود ماند، **شکست است** نه نقشه.
   *
   * ── چرا این هشدار لازم شد ──
   *
   * یک پروژهٔ تازه از صفر ساخته شد و «خودت برو بگرد» زده شد. نتیجه: دو
   * حالت، هر دو روی `/login`، صفِ صفر، پنج قدم. خروجی هیچ‌چیزِ غیرعادی
   * نگفت و رابط تیکِ سبز گذاشت — «۱ اجرا تا امروز».
   *
   * ولی خزنده اصلاً وارد نشده بود. اپ ورود دارد و حسابی در کار نبود، پس
   * از همان صفحهٔ اول رد نشد. دقیقاً همان شکستِ خاموشی که این ابزار برای
   * شکارش ساخته شده، در خودِ ابزار.
   *
   * نشانه‌اش قطعی است و حدس نمی‌خواهد: همهٔ حالت‌ها روی یک روت، و آن روت
   * همان `auth.loginPath` است.
   */
  const routes = new Set((map.states || []).map((one) => one.route).filter(Boolean));
  const stuck = loginPath && routes.size === 1 && routes.has(loginPath);
  if (stuck) {
    console.log('');
    console.log('  ! خزش از صفحهٔ ورود رد نشد — همهٔ حالت‌ها روی ' + loginPath + ' ماندند.');
    console.log('    خزنده حسابی ندارد که با آن وارد شود، پس بقیهٔ اپ برایش وجود ندارد.');
    console.log('    یک بار گشتِ زنده بروید و وارد شوید (`userbug tour ' + target + ' --profile`)،');
    console.log('    بعد همین خزش را با `--profile` تکرار کنید — نشست می‌ماند.');
  }

  console.log(`\n  یافته‌ها: ${session.findings.length} ثبت‌شده از ${session.seenFindings.size} یکتا`);
  console.log(`  نقشه: knowledge/${target}/map.json  ·  اجرا: runs/${session.runId}/report.html\n`);

  // فراخوان (مثلاً `mission run`) باید بداند این خزش کدام اجرا بود
  return session;
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
    const answered = dossier.openQuestions.filter((item) => item.answer);
    const text = String(flags.as ?? '').trim();
    if (!text) throw new Error('جواب لازم است: --answer <شماره|متن> --as "<جواب>"');

    /**
     * شماره‌گذاری: اول بی‌جواب‌ها، بعد جواب‌گرفته‌ها.
     *
     * ── چرا جواب‌گرفته‌ها هم شماره می‌گیرند ──
     *
     * اصلاحِ جوابِ قبلی از اول ممکن بود، ولی فقط با تایپِ **متنِ کاملِ فارسیِ
     * پرسش** — که یعنی عملاً ممکن نبود. همان استدلالی که شماره را برای
     * بی‌جواب‌ها آورد، برای اصلاح هم برقرار است.
     */
    const all = [...open, ...answered];
    const index = Number(flags.answer);
    const question = Number.isInteger(index) && index >= 1 ? all[index - 1]?.q : String(flags.answer);
    if (!question) {
      throw new Error(
        `پرسشِ شمارهٔ ${flags.answer} وجود ندارد؛ ${open.length} بی‌جواب و ${answered.length} جواب‌گرفته هست`
      );
    }

    const previous = dossier.openQuestions.find((item) => item.q === question)?.answer;
    await writeDossier(target, answerQuestion(dossier, question, text), {
      by: 'user',
      why: previous ? 'اصلاح پاسخ' : 'پاسخ به پرسش',
    });
    console.log(`\n  ${previous ? 'اصلاح شد' : 'ثبت شد'} (by: user):\n    ${question}`);
    if (previous) console.log(`    ✗ ${previous}`);
    console.log(`    → ${text}\n`);
    return;
  }

  if (flags.questions) {
    const questions = readDossier(target).openQuestions;
    const open = questions.filter((item) => !item.answer);
    const answered = questions.filter((item) => item.answer);
    if (!questions.length) return console.log('\n  هیچ پرسشی در پرونده نیست.\n');

    console.log('');
    open.forEach((item, i) => console.log(`  ${String(i + 1).padStart(2)}. ${item.q}`));
    if (!open.length) console.log('  پرسشِ بی‌جوابی نیست.');

    if (answered.length) {
      console.log('\n  جواب‌گرفته‌ها (با همین شماره‌ها قابل اصلاح‌اند):');
      answered.forEach((item, i) =>
        console.log(`  ${String(open.length + i + 1).padStart(2)}. ${item.q}\n      → ${item.answer}`)
      );
    }
    console.log('\n  جواب یا اصلاح: userbug knowledge <هدف> --answer <شماره> --as "<جواب>"\n');
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
 * اجرای تست‌های پروژهٔ هدف.
 *
 * ── چرا رانر از اینجا می‌آید و نه از پروژه ──
 *
 * نخستین اجرای واقعیِ سرتاسری با «No tests found» شکست، در حالی که فایل
 * سرِ جایش بود و ایمپورتش هم حل می‌شد. علت: **دو نسخهٔ پلی‌رایت**.
 *
 * فایلِ تست `userbug/test` را وارد می‌کند و Node آن را از مسیرِ واقعیِ
 * userbug حل می‌کند، پس `src/fixtures.js` پلی‌رایتِ **اینجا** را بار
 * می‌کند. ولی رانر در پروژه اجرا می‌شد و پلی‌رایتِ **آنجا** را. تستی که با
 * یک نسخه ساخته شود، رانرِ نسخهٔ دیگر اصلاً نمی‌بیندش — و پیامش هم نمی‌گوید
 * چرا.
 *
 * پس یک نسخه: رانر از همین‌جا، کانفیگ از آنجا. نتیجه‌اش این هم هست که
 * پروژهٔ شما لازم نیست `@playwright/test` نصب کند — فقط خودِ userbug.
 */
async function cmdTest({ flags, positional }) {
  const target = positional[0];
  if (!target) throw new Error('نام هدف لازم است: userbug test <هدف> [--ui] [--headed]');

  const { workspaceRoot, contained } = await import('../src/emit/workspace.js');

  const root = workspaceRoot(await loadTarget(target));
  const config = contained(root, 'playwright.config.js');

  if (!fs.existsSync(config)) {
    throw new Error(
      `کانفیگی در ${root} نیست.\n` + `  یک بار بسازیدش: userbug init ${target} --workspace`
    );
  }

  const args = [PLAYWRIGHT_CLI, 'test', '--config', config];
  if (flags.ui) args.push('--ui');
  if (flags.headed) args.push('--headed');
  if (flags.grep && flags.grep !== true) args.push('--grep', String(flags.grep));
  if (flags['last-failed']) args.push('--last-failed');
  for (const rest of positional.slice(1)) args.push(rest);

  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

/**
 * فایل‌های نمونه — آنچه تستِ آپلود بی آن کار نمی‌کند.
 *
 * ── چرا از CLI نمی‌شد ──
 *
 * `knowledge/fixtures.js` کامل بود: ذخیره، حذف، یادداشت، و `resolveFixture`
 * که دروازهٔ امن است — فعلِ `upload` فقط از این پوشه می‌خوانَد، پس رشتهٔ آزاد
 * نمی‌تواند هر فایلی از دیسک را بفرستد. ولی گذاشتنِ فایل در آن پوشه تنها از
 * رابط گرافیکی ممکن بود.
 *
 * یعنی بعد از رفتنِ رابط، `.gitignore` پوشه‌ای را کنار می‌گذاشت که هیچ راهی
 * برای پر کردنش نبود.
 */
async function cmdFixtures({ flags, positional }) {
  const target = positional[0];
  if (!target) {
    throw new Error(
      'نام هدف لازم است:\n' +
        '  userbug fixtures <هدف>                      فهرست\n' +
        '  userbug fixtures <هدف> --add <مسیر> [--note <چرا>]\n' +
        '  userbug fixtures <هدف> --remove <نام>\n' +
        '  userbug fixtures <هدف> --note <نام> --as <متن>'
    );
  }

  const { listFixtures, saveFixture, removeFixture, setFixtureNote, readFixtureNotes, fixturesDir } =
    await import('../src/knowledge/fixtures.js');

  if (flags.add && flags.add !== true) {
    const from = path.resolve(String(flags.add));
    if (!fs.existsSync(from)) throw new Error(`فایل پیدا نشد: ${from}`);

    const saved = await saveFixture(target, {
      name: path.basename(from),
      bytes: await fs.promises.readFile(from),
      note: flags.note && flags.note !== true ? String(flags.note) : '',
    });
    console.log(`\n  اضافه شد: ${saved.relative}\n`);
    console.log('  در سناریو: { upload: { to: <ورودی>, file: ' + JSON.stringify(path.basename(from)) + ' } }\n');
    return;
  }

  if (flags.remove && flags.remove !== true) {
    const gone = await removeFixture(target, String(flags.remove));
    console.log(`\n  حذف شد: ${gone.relative}\n`);
    return;
  }

  if (flags.note && flags.note !== true) {
    const as = flags.as && flags.as !== true ? String(flags.as) : '';
    await setFixtureNote(target, String(flags.note), as);
    console.log(`\n  یادداشت ثبت شد.\n`);
    return;
  }

  const rows = await listFixtures(target);
  const notes = readFixtureNotes(target);

  if (!rows.length) {
    console.log(`\n  فایلِ نمونه‌ای نیست: ${fixturesDir(target)}`);
    console.log('  افزودن: userbug fixtures ' + target + ' --add <مسیر> --note "<چرا>"\n');
    return;
  }

  console.log(`\n  ${rows.length} فایلِ نمونه در «${target}»:\n`);
  for (const row of rows) {
    const key = String(row.relative || row.name || '').replace(/^fixtures\//, '');
    console.log(`  ${pad(clip(key, 34), 34)} ${pad(String(row.bytes ?? '—'), 9, 'start')} بایت`);
    if (notes[key]) console.log(`      ${notes[key]}`);
  }
  console.log('');
}

/**
 * «کد عوض شد — کدام تست‌ها باید دوباره فکر شوند؟»
 *
 * ── چرا این فرمان تا امروز نبود ──
 *
 * `src/knowledge/impact.js` از روزِ اول بود و مقدمه‌اش خودش را «ارزشمندترین
 * اتصالِ پروژه» می‌نامد: گیت می‌گوید چه عوض شد، پرونده می‌گوید هر فایل کدام
 * صفحه را می‌سازد، و تست‌ها می‌گویند کدام صفحه را لمس می‌کنند. زنجیره کامل
 * بود و هیچ فرمانی صدایش نمی‌زد — تنها مصرف‌کننده‌اش رابط گرافیکی بود.
 *
 * چهارمین قابلیتی است که با رفتنِ رابط بی‌صدا از دسترس خارج شده بود.
 */
async function cmdImpact({ flags, positional }) {
  const target = positional[0];
  if (!target) throw new Error('نام هدف لازم است: userbug impact <هدف> [--base <مرجع گیت>]');

  const { impactOf } = await import('../src/knowledge/impact.js');
  const { resolveSourceRoots } = await import('../src/source-access.js');
  const { listSpecs } = await import('../src/emit/specs.js');
  const { workspaceRoot } = await import('../src/emit/workspace.js');

  const loaded = await loadTarget(target);
  const roots = await resolveSourceRoots(loaded);
  const specs = listSpecs(workspaceRoot(loaded));
  const base = flags.base && flags.base !== true ? String(flags.base) : 'HEAD';

  const report = await impactOf(target, { roots, base, specs });

  console.log(`\n  ${report.changed} فایل از «${report.base}» تا حالا عوض شده.`);
  console.log(`  ${specs.length} تست در پوشهٔ پروژه.\n`);

  if (!report.changed) {
    console.log('  چیزی عوض نشده.\n');
    return;
  }

  if (report.scenarios.length) {
    console.log('  تست‌هایی که باید دوباره فکر شوند:\n');
    for (const item of report.scenarios) {
      // شاهدِ ضعیف علامت می‌خورد، نه حذف: صفحهٔ گذرگاه واقعاً لمس شده،
      // ولی به‌عنوان شاهد چیزی نمی‌گوید چون همه‌جا هست.
      const mark = item.weak ? '?' : '·';
      console.log(`  ${mark} ${pad(clip(item.name, 40), 40)} ${item.because.join('، ')}`);
    }
    console.log('');
  } else {
    console.log('  هیچ تستی به صفحه‌های عوض‌شده نمی‌خورد.\n');
  }

  /**
   * `unmapped` هم‌ارزِ بقیه چاپ می‌شود، نه به‌عنوان زیرنویس.
   *
   * فایلی که به هیچ صفحه‌ای نگاشت نشود خطرناک‌ترین حالت است: عوض شده، به
   * همه‌جا اثر دارد، و اگر بی‌صدا رد شود گزارش می‌گوید «چیزی لازم نیست» —
   * که دروغِ آرام است.
   */
  if (report.unmapped.length) {
    console.log(`  ${report.unmapped.length} فایل به هیچ صفحه‌ای نگاشت نشد:\n`);
    for (const file of report.unmapped.slice(0, 12)) console.log(`  ! ${file}`);
    if (report.unmapped.length > 12) console.log(`  … و ${report.unmapped.length - 12} تای دیگر`);
    console.log('\n  این‌ها ممکن است به همه‌جا اثر داشته باشند؛ خودتان قضاوت کنید.\n');
  }

  if (report.uncovered.length) {
    console.log('  صفحه‌هایی که عوض شدند و هیچ تستی ندارند:\n');
    for (const item of report.uncovered) console.log(`  ✗ ${item.path}`);
    console.log('');
  }
}

/**
 * متنِ فارسی → فایلِ `.spec.js`.
 *
 * ── قابلیتی که از رابط جا مانده بود ──
 *
 * `scenarioFromText` از روزِ اول بود ولی هیچ فرمانی صدایش نمی‌زد؛ تنها
 * مصرف‌کننده‌اش رابط گرافیکی بود. با رفتنِ رابط، «سناریو را به زبانِ خودت
 * بنویس» بی‌صدا از دسترس خارج شد.
 *
 * ── چرا خروجی مستقیم کد است ──
 *
 * مدل همان ساختار را می‌سازد که همیشه می‌ساخت؛ فقط به‌جای `toYaml` از
 * `scenarioToSpec` رد می‌شود. یعنی هزینهٔ مدل همان است و آنچه عوض شده،
 * چیزی است که روی دیسک می‌نشیند: فایلی که `npx playwright test` می‌فهمدش
 * و هیچ مفسری لازم ندارد.
 */
async function cmdAuthor({ flags, positional }) {
  const target = positional[0];
  const text = positional.slice(1).join(' ').trim();

  if (!target) throw new Error('نام هدف لازم است: userbug author <هدف> "<کاربر چه می‌کند>"');
  if (text.length < 10) {
    throw new Error(
      'متن را بنویسید: userbug author <هدف> "وارد می‌شوم و اولین کتاب را باز می‌کنم"\n' +
        '  بگویید کاربر چه کاری انجام می‌دهد، نه اینکه چه دکمه‌ای را بزند.'
    );
  }

  const { scenarioFromText } = await import('../src/scenario/from-text.js');
  const { scenarioToSpec } = await import('../src/emit/author.js');
  const { knowledgeFor } = await import('../src/knowledge/select.js');
  const { loadTarget } = await import('../src/target.js');
  const { workspaceRoot, ensureWorkspace, writeInside, contained } = await import('../src/emit/workspace.js');

  const models = resolveModel({
    global: await loadGlobalConfig(),
    role: 'author',
    model: flags.model && flags.model !== true ? assertModelSlug(flags.model) : undefined,
  });

  const loaded = await loadTarget(target);
  const root = workspaceRoot(loaded);
  ensureWorkspace(root);

  console.log(`\n  ساختِ تست برای «${target}» با ${models.model}…`);

  const result = await scenarioFromText({
    text,
    models,
    target,
    knowledge: knowledgeFor({ target, text, budget: 1800 }),
  });

  const source = scenarioToSpec(result.scenario);
  const name = `${result.slug}.spec.js`;

  /**
   * بازنویسیِ بی‌صدا بدترین حالت است.
   *
   * فایل ممکن است دستی ویرایش شده باشد یا ادعاهایی گرفته باشد که با یک
   * `author`ِ دوباره می‌روند — و کسی نمی‌فهمد.
   */
  if (fs.existsSync(contained(root, name)) && !flags.force) {
    throw new Error(
      `«${name}» از قبل هست.\n` +
        '  اگر می‌خواهید بازنویسی شود: همین فرمان با --force\n' +
        '  (ولی ادعاهایی که با userbug expect اضافه کرده‌اید از بین می‌روند)'
    );
  }

  const file = writeInside(root, name, source);

  console.log(`\n  ${result.steps} قدم نوشته شد: ${file}`);
  if (result.notes) console.log(`  یادداشتِ مدل: ${result.notes}`);
  console.log('\n  قدمِ بعد:');
  console.log(`    userbug expect ${target} --from ${name}     ادعا اضافه کن`);
  console.log(`    npx playwright test                        اجرا\n`);
  console.log('  این فایل هنوز ادعایی ندارد، پس فقط می‌گوید «چیزی نشکست».\n');
}

/**
 * ساختِ کانفیگ یک هدفِ تازه.
 *
 * همان کاری که فرمِ «پروژهٔ تازه» در رابط می‌کند، با همان قالب. قاعدهٔ پروژه
 * این است: هر کاری از رابط می‌شود، از CLI هم بشود.
 *
 * `--log` تکرارشدنی است: `--log php=D:/x/err.log --log vite=D:/y/out.log`
 */
async function cmdInit({ flags, positional }) {
  /**
   * ── `--workspace`: آماده کردنِ پوشهٔ userbug در خودِ پروژهٔ هدف ──
   *
   * این شاخه هدفِ **موجود** را می‌گیرد، نه تازه. چون تست‌ها از این مخزن
   * رفته‌اند و در ریپوی اپ می‌نشینند، یک بار باید آن پوشه ساخته شود و
   * `.gitignore`اش سرِ جایش بنشیند — وگرنه نخستین `git add` رازِ حساب و
   * نشستِ لاگین‌شدهٔ مرورگر را کامیت می‌کند.
   */
  if (flags.workspace) {
    const key = positional[0];
    if (!key) throw new Error('نام هدف لازم است: userbug init <هدف> --workspace');

    const { loadTarget } = await import('../src/target.js');
    const { workspaceRoot, ensureWorkspace, writeInside, contained, LOCAL } = await import(
      '../src/emit/workspace.js'
    );
    const { renderProjectConfig } = await import('../src/project-config.js');

    const loaded = await loadTarget(key);
    const root = workspaceRoot(loaded);
    const result = ensureWorkspace(root);

    /**
     * کانفیگِ پلی‌رایت — بی آن، فایلِ تست روی دیسک می‌نشیند و هیچ اجرا
     * نمی‌شود.
     *
     * بازنویسی نمی‌شود اگر هست: ممکن است کاربر پروژه‌ها یا reporter خودش
     * را افزوده باشد.
     */
    const configPath = contained(root, 'playwright.config.js');
    const hadConfig = fs.existsSync(configPath);
    if (!hadConfig) writeInside(root, 'playwright.config.js', renderProjectConfig(key));

    console.log(`\n  پوشهٔ userbug برای «${key}»:`);
    console.log(`  ${root}\n`);
    console.log(`  پوشه: ${result.created ? 'ساخته شد' : 'از قبل بود'}`);
    console.log(`  .gitignore: ${result.gitignore === 'written' ? 'نوشته شد' : 'از قبل بود و دست نخورد'}`);
    console.log(`  playwright.config.js: ${hadConfig ? 'از قبل بود و دست نخورد' : 'نوشته شد'}\n`);

    console.log('  در گیتِ پروژهٔ شما می‌ماند:');
    console.log('    *.spec.js              تست‌ها — با کد بازبینی می‌شوند');
    console.log('    playwright.config.js   تنظیمات از userbug می‌آید');
    console.log('    knowledge/             شناختِ اپ');
    console.log('    triage/                قضاوتِ شما');
    console.log('    findings.md            فهرستِ باگ\n');
    console.log(`  و نمی‌ماند (${LOCAL.root}/):`);
    console.log('    رازِ حساب · نشستِ مرورگر · نقشه · خروجیِ اجراها\n');

    /**
     * یک بار در پروژه نصب می‌شود، مثل هر ابزارِ تستِ دیگری.
     *
     * فایلِ تولیدشده `userbug/test` را وارد می‌کند و Node بستهٔ bare را از
     * کنارِ **خودِ فایل** پیدا می‌کند، نه از جایی که فرمان اجرا شده. پس
     * بی این پیوند، ایمپورت حل نمی‌شود.
     */
    console.log('  یک بار در پروژه نصب کنید:\n');
    console.log(`    cd ${loaded.source?.root || '<پروژه>'}`);
    console.log('    npm i -D @playwright/test');
    console.log(`    npm i -D "file:${ROOT.split(path.sep).join('/')}"\n`);
    console.log('  بعد از آن:\n');
    console.log(`    userbug tour ${key}                 گشت بزنید → تست ساخته می‌شود`);
    console.log(`    userbug expect ${key} --from <فایل>  ادعا اضافه کنید`);
    console.log('    npx playwright test                 اجرا (از پوشهٔ پروژه)\n');
    return;
  }

  // ساختِ تازه سخت‌گیر است؛ بقیهٔ فرمان‌ها با کلیدِ موجود کار می‌کنند.
  const key = assertNewProjectKey(positional[0]);
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
    case 'test':
      await cmdTest(parsed);
      break;
    case 'fixtures':
      await cmdFixtures(parsed);
      break;
    case 'impact':
      await cmdImpact(parsed);
      break;
    case 'author':
      await cmdAuthor(parsed);
      break;
    case 'init':
      await cmdInit(parsed);
      break;
    case 'schedule':
      await cmdSchedule(parsed);
      break;
    case 'repro':
      cmdRepro(parsed);
      break;
    case 'remove':
      cmdRemove(parsed);
      break;
    case 'list':
      cmdList(parsed);
      break;
    case 'missions':
      await cmdMissions(parsed);
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
    case 'map':
      await cmdMap(parsed);
      break;
    case 'ai':
      await cmdAi(parsed);
      break;
    case 'quest':
      await cmdQuest(parsed);
      break;
    case 'plan':
      await cmdPlan(parsed);
      break;
    case 'expect':
      await cmdExpect(parsed);
      break;
    case 'entry':
      await cmdEntry(parsed);
      break;
    case 'coverage':
      await cmdCoverage(parsed);
      break;
    case 'capabilities':
      await cmdCapabilities(parsed);
      break;
    case 'rounds':
      await cmdRounds(parsed);
      break;
    case 'bundle':
      await cmdBundle(parsed);
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
    /**
     * خواستنِ راهنما خطا نیست.
     *
     * تا امروز `help` به شاخهٔ `default` می‌افتاد و چون دستوری داده شده بود،
     * با کدِ ۱ بیرون می‌رفت. متن درست چاپ می‌شد، پس کسی نمی‌فهمید — تا
     * روزی که یک اسکریپت یا CI به آن کدِ خروج نگاه کند.
     */
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      break;

    default:
      console.log(HELP);
      // دستورِ ناشناس خطاست؛ نبودِ دستور نه.
      process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  console.error(`\n  خطا: ${e.message}\n`);
  process.exit(2);
}
