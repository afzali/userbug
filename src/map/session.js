/**
 * خزشِ نقشه — مرورگری که **ابزار** می‌راند و کسی تماشا نمی‌کند.
 *
 * ── نسبتش با گشت و با کاوش ──
 *
 * گشت (`src/tour/`) همان مرورگر است با آدمِ راننده: `purpose` و جملهٔ کاربر را
 * می‌آورد که هیچ خزشی نمی‌آورد. کاوش (`src/steps/explore.js`) با هدف می‌گردد و
 * هر قدمش یک فراخوانی مدل است. این یکی هیچ‌کدام نیست: **فهرست می‌سازد**،
 * قطعی، و بی یک فراخوانی.
 *
 * ── چرا زیر `playwright test` نمی‌رود ──
 *
 * همان استدلالِ گشت: خزش دقیقه‌ها طول می‌کشد و چرخهٔ عمرِ تست برای کارِ دیگری
 * ساخته شده. پس پروسهٔ مستقل، ولی با **همان** رصدگرها — و این تصادفی نیست:
 * خزشی که همهٔ دکمه‌های اپ را بزند، پرکاوش‌ترین شکارِ باگی است که این ابزار
 * دارد. نقشه بهانه است؛ یافته‌ها محصولِ جانبیِ گران‌ترند.
 *
 * طرحِ کامل و دلیلِ هر تصمیم: `MAP.md`.
 */
import { chromium, devices } from '@playwright/test';
import { EventEmitter } from 'node:events';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { loadTarget } from '../target.js';
import { INIT_SCRIPT, attachClientObservers } from '../observe/client.js';
import {
  collectorWarning,
  createServerCollectors,
  describeCollectors,
  drainAll,
  startAll,
  stopAll,
} from '../observe/server.js';
import { judge } from '../observe/oracle.js';
import { dismissBlockers } from '../observe/blockers.js';
import { routeOf } from '../observe/route.js';
import { GUI_RUN_MARKER, RunStore, newRunId, runDir, setCurrentRun } from '../store/run-store.js';
import { snapshotPage } from '../steps/snapshot.js';
import { resolveTarget } from '../scenario/resolve.js';
import { runUniversalChecks } from '../checks/run.js';
import { readChecksConfig } from '../checks/config.js';
import { knowledgeDir, readDossier } from '../knowledge/store.js';
import { avoidFrom } from '../knowledge/select.js';
import { freshIdentity } from '../data/persian.js';
import { accountsFor, listAccounts, readAccounts, saveAccount } from '../knowledge/credentials.js';

import {
  actionsFrom,
  focusWords,
  maskAction,
  priorityOf,
  profileOf,
  routePatternOf,
  sampleActions,
  stateIdOf,
} from './state.js';
import {
  DEFAULT_CAPS,
  addEdge,
  dropFrontierFor,
  emptyMap,
  findState,
  pushFrontier,
  readMap,
  takeFrontier,
  upsertState,
  writeMap,
} from './store.js';
import { callRecorder } from '../knowledge/endpoints.js';
import { gatewayRoutes, makeScope } from './scope.js';
import { replayPath, unsupportedVerbs } from './replay.js';

/** بیشتر از این از یک یافته ثبت نمی‌شود. خزش همان باگ را صدها بار می‌بیند. */
const MAX_PER_FINGERPRINT = 5;

/**
 * نشستنِ صفحه با **سنجش**، نه با مکثِ ثابت.
 *
 * ── چرا مکثِ ثابت غلط است ──
 *
 * نخستین خزشِ واقعی روی نپی یک گره ثبت کرد با یک کنش: «در حال بارگذاری نپی…».
 * ۷۰۰ میلی‌ثانیه برای این اپ کم بود و برای اپِ دیگری زیاد است. همان یافتهٔ
 * قلابی که گشت هم داد («صفحهٔ / چیزی برای دیدن ندارد») و همان‌جا با تایمری حل
 * شد که با هر ناوبری از نو می‌افتد.
 *
 * اینجا معیارِ بهتری در دست است: خودِ **نمای نقش‌ها**. صفحه نشسته است وقتی
 * سطحِ کنشی‌اش دو بار پشت سر هم یکی باشد. یعنی همان چیزی که هویتِ گره است،
 * شرطِ خواندنش هم هست.
 */
const SETTLE_TRIES = 20;
const SETTLE_GAP = 400;

/** کلیکِ مرده باید ارزان بمیرد: هر عنصرِ غیرقابل‌کلیک تمامِ این مهلت را می‌سوزاند. */
const CLICK_TIMEOUT = 5000;

/**
 * آیا این صفحه چیزی جز خبر دارد؟
 *
 * ── چرا «پایدار بودن» تنها شرطِ نشستن نیست ──
 *
 * اسپینرِ «در حال بارگذاری نپی…» **پایدار** است: دو نمونهٔ پشت سر هم دقیقاً یکی
 * درمی‌آیند و معیارِ پایداری همان‌جا راضی می‌شود. خزشِ دومِ واقعی دقیقاً همین‌جا
 * ماند و کلِ نقشه شد یک گره با یک اسپینر.
 *
 * صفحه‌ای که واقعاً چیزی برای خزیدن ندارد (متنِ خالص) بودجهٔ نشستن را
 * می‌سوزاند و بعد رد می‌شود — بهایی که در برابرِ نقشهٔ پوچ ارزشش را دارد.
 */
function hasRealAction(snapshot) {
  return actionsFrom(snapshot).some((action) => action.kind !== 'noise');
}

/**
 * اپِ هدف بالاست؟
 *
 * ── چرا این چک لازم شد ──
 *
 * خزشی که روی اپِ خاموش اجرا شود، این را می‌دهد:
 *
 *     page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/
 *
 * پیامی که شبیهِ باگِ ابزار است، نه شبیهِ «اپت را بالا بیاور». و چون
 * مرورگر تا آن لحظه باز شده و یک پوشهٔ اجرا ساخته شده، کاربر فکر می‌کند
 * خزش شروع شده و وسطِ کار شکسته.
 *
 * `fetch` ساده کافی است: هر پاسخی — حتی ۴۰۴ — یعنی کسی آنجا هست.
 */
async function assertReachable(baseURL) {
  /**
   * فقط `http(s)`.
   *
   * هدف می‌تواند یک فایلِ محلی باشد (`file:///…`) — خودآزمای گشت دقیقاً
   * همین کار را می‌کند. `fetch` روی `file:` در Node می‌شکند، و آن شکست
   * ربطی به «اپ بالا نیست» ندارد.
   */
  if (!/^https?:/i.test(String(baseURL || ''))) return;

  try {
    await fetch(baseURL, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000) });
  } catch (cause) {
    throw new Error(
      `اپِ هدف روی ${baseURL} بالا نیست (${cause.message.slice(0, 60)}).\n` +
        '  اول اپتان را خودتان بالا بیاورید، بعد خزش را بزنید.\n' +
        '  آدرس را در «پیکربندی پروژه» می‌شود عوض کرد.'
    );
  }
}

export class MapSession extends EventEmitter {
  constructor({
    target,
    device,
    headless = true,
    caps = {},
    entrySteps = [],
    entryLabel = '',
    seedSteps = [],
    seedLabel = '',
    fresh = false,
    allowDestructive = false,
    rememberAs = '',
    profile = false,
    freshProfile = false,
    focus = '',
    scope = '',
  } = {}) {
    super();
    this.targetName = target;
    this.deviceName = device;
    this.headless = headless;
    this.caps = { ...DEFAULT_CAPS, ...caps };
    this.entrySteps = entrySteps;
    this.entryLabel = entryLabel;
    /**
     * دانه — **یک بار** در کلِ خزش، نه در هر برگشت به خانه.
     *
     * ── چرا از مسیرِ ورود جداست ──
     *
     * مسیرِ ورود ده‌ها بار بازپخش می‌شود (هر بار که خزنده می‌خواهد به گرهی
     * برگردد)، پس باید بی‌اثر باشد. ولی «فایل نمونه را وارد کن» ذاتاً
     * جهش‌زاست: اگر آنجا می‌نشست، همان فایل ده‌ها بار ایمپورت می‌شد و
     * نقشه‌ای از اپی درمی‌آمد که هیچ کاربری نمی‌سازدش.
     *
     * و بی آن، نقشهٔ اپِ **خالی** ساخته می‌شود: «ویرایشِ کتاب» وقتی کتابی
     * نیست، اصلاً وجود ندارد و در صف هم نمی‌آید.
     */
    this.seedSteps = seedSteps;
    this.seedLabel = seedLabel;
    this.fresh = fresh;
    this.allowDestructive = allowDestructive;
    this.rememberAs = rememberAs;
    this.profile = profile;
    this.freshProfile = freshProfile;
    this.focus = focusWords(focus);
    /**
     * دامنه — «فقط اینجا را بگرد».
     *
     * `focus` اولویت است و ترتیب را عوض می‌کند؛ این یکی مرز است. روی نپی
     * ۹ حالت از ۲۲ در `/ai-chat` افتاد در حالی که خواسته کتاب بود، و
     * اولویت هیچ کاری از دستش برنمی‌آمد.
     */
    this.scope = makeScope(scope);

    this.status = 'starting';
    this.events = [];
    this.findings = [];
    this.seenFindings = new Map();
    this.stepIndex = 0;
    this.tried = 0;
    this.skipped = 0;

    /**
     * کنشی که کلیک نپذیرفت — شمرده، به ازای **توصیف**، نه به ازای حالت.
     *
     * ── چرا سراسری ──
     *
     * در خزشِ واقعی یک دکمهٔ نوارِ کناری در دوازده حالتِ مختلف امتحان شد و هر
     * دوازده بار پنج ثانیه timeout خورد: یک دقیقه، برای فکتی که بار دوم
     * معلوم شده بود. دکمه‌ای که در دو حالت کلیک نپذیرد، در حالتِ سوم هم
     * نمی‌پذیرد.
     */
    this.unclickable = new Map();
  }

  emitEvent(type, data = {}) {
    const event = { type, at: new Date().toISOString(), ...data };
    this.emit('event', event);
    return event;
  }

  async start() {
    const target = await loadTarget(this.targetName);
    this.target = target;

    await assertReachable(target.baseURL);

    const bad = unsupportedVerbs(this.entrySteps);
    if (bad.length) {
      throw new Error(
        `مسیرِ ورود فعلی دارد که خزش اجرا نمی‌کند: ${bad.join('، ')}. ` +
          'یک سناریوی کوچکِ ورود بنویسید (go/click/fill/press/check) یا همان قدم‌ها را از آن حذف کنید.'
      );
    }

    const badSeed = unsupportedVerbs(this.seedSteps);
    if (badSeed.length) {
      throw new Error(`سناریوی دانه فعلی دارد که خزش اجرا نمی‌کند: ${badSeed.join('، ')}.`);
    }

    /**
     * روی تولید، هیچ کلیکی.
     *
     * نقشهٔ محیطِ تولیدی فقط از راهِ ناوبری ساخته می‌شود — همان موضعِ
     * `guard.js`: محیطِ اعلام‌نشده تولیدی فرض می‌شود و کنشِ برگشت‌ناپذیر روی
     * آن اجرا نمی‌شود. اینجا حتی «برگشت‌پذیرِ نامعلوم» هم اجرا نمی‌شود، چون
     * خزنده صدها بارش می‌کند.
     */
    this.navOnly = target.environment === 'production';
    if (this.navOnly) {
      this.emitEvent('warning', {
        message: 'محیط تولیدی: فقط ناوبری خزیده می‌شود، هیچ دکمه‌ای زده نمی‌شود.',
      });
    }

    this.runId = newRunId(this.targetName);
    setCurrentRun(this.runId);
    this.store = new RunStore(this.runId);
    await this.store.init({
      target: this.targetName,
      baseURL: target.baseURL,
      environment: target.environment,
      device: this.deviceName || target.device,
      isolation: 'map',
      kind: 'map',
    });

    /**
     * نشانِ اجرای زنده برای رابط.
     *
     * همان چیزی که `global-setup.js` برای `run` چاپ می‌کند. با همین یک خط،
     * خزش در رابط دقیقاً مثل هر اجرای دیگری زنده دیده می‌شود — قدم، عکس،
     * یافته — بی یک خط تغییر در لولهٔ SSE. چون خزش هم واقعاً یک اجراست.
     */
    if (process.env.UB_GUI_JOB) {
      console.log(
        `${GUI_RUN_MARKER}${JSON.stringify({ job: process.env.UB_GUI_JOB, runId: this.runId, target: this.targetName })}`
      );
    }

    /**
     * هویتِ خزش — تازه، یا همانی که بارِ قبل ساخته شد.
     *
     * ── چرا «به خاطر سپردن» مهم است ──
     *
     * هویتِ تازه در هر خزش یعنی **حسابِ خالی** در هر خزش: نه کتابی، نه
     * یادداشتی، نه پوشه‌ای. نقشه‌ای که از حسابِ خالی درمی‌آید، پوستهٔ اپ را
     * می‌بیند و محتوا را نه — و بیشترِ باگ‌ها آن‌جایند که داده هست.
     *
     * پس بارِ اول کاربر ساخته می‌شود و در همان انبارِ حساب‌های پروژه ذخیره
     * (`credentials.json`)، و دفعهٔ بعد با همان وارد می‌شویم. حسابی که
     * خزشِ قبلی پُرش کرده، خزشِ بعدی را عمیق‌تر می‌کند.
     *
     * سناریوی ورود عوض نمی‌شود: همان `{{identity.email}}` می‌ماند و فقط
     * مقدارش از انبار می‌آید.
     */
    this.identity = this.rememberAs ? this.recallIdentity() : freshIdentity(this.runId);
    this.entryPath = this.entrySteps.length ? this.entrySteps : [{ go: '/' }];
    this.checksConfig = readChecksConfig(this.targetName);

    const dossier = readDossier(this.targetName);
    this.knownRoutes = (dossier.routes || []).map((route) => route.path).filter(Boolean);
    // برای تشخیصِ «وارد نشدیم» و برای اینکه حسابِ نساخته ذخیره نشود
    this.loginPath = dossier.auth?.loginPath ? routePatternOf(dossier.auth.loginPath) : '';

    /**
     * فهرستِ ممنوع، از دو جا و ادغام‌شده — همان قاعدهٔ `explore.js`.
     *
     * `explore.avoid` دستِ کاربر است؛ `risks` چیزی است که هضمِ سورس یا گشت
     * پیدا کرده. ادغام است نه جایگزینی، چون هرکدام می‌تواند چیزی بداند که آن
     * یکی نمی‌داند.
     */
    this.avoid = [...new Set([...(target.explore?.avoid || []), ...avoidFrom(this.targetName)])].map(
      (pattern) => new RegExp(pattern, 'i')
    );

    const emulation = this.deviceName && this.deviceName !== 'desktop' ? devices[this.deviceName] : {};
    if (this.deviceName && this.deviceName !== 'desktop' && !emulation) {
      throw new Error(`دستگاهِ ناشناخته: «${this.deviceName}»`);
    }

    /**
     * پروفایلِ ماندگار — اگر خواسته شده باشد.
     *
     * ── چرا ارزش دارد ──
     *
     * contextِ تازه یعنی هر خزش از صفر: نه کوکی، نه localStorage، نه کش. پس
     * مسیرِ ورود در **هر** خزش دوباره طی می‌شود، با همهٔ شکنندگی‌اش. با
     * پروفایلِ ماندگار، نشستِ خزشِ قبلی زنده می‌ماند و شرط‌های `when` در
     * سناریوی ورود خودشان رد می‌شوند — یعنی ورود از «هر بار» به «یک بار»
     * تبدیل می‌شود.
     *
     * ── و چرا پیش‌فرض نیست ──
     *
     * حالتِ ماندگار یعنی خزشِ امروز به خزشِ دیروز وابسته است: پروفایلی که
     * خراب شود یا نشستی که منقضی شود، شکستی می‌سازد که علتش در این اجرا
     * نیست. پس صریح خواسته می‌شود و `--fresh-profile` پاکش می‌کند.
     *
     * جایش کنارِ شناختِ پروژه است و در `.gitignore`: نشستِ لاگین‌شده روی
     * دیسک، دادهٔ همین ماشین است.
     */
    if (this.profile) {
      this.profileDir = path.join(knowledgeDir(this.targetName), 'profile');
      if (this.freshProfile) await fsp.rm(this.profileDir, { recursive: true, force: true }).catch(() => {});
      await fsp.mkdir(this.profileDir, { recursive: true });

      this.context = await chromium.launchPersistentContext(this.profileDir, {
        headless: this.headless,
        locale: target.locale || undefined,
        acceptDownloads: true,
        ...emulation,
      });
      this.emitEvent('warning', {
        message: this.freshProfile
          ? 'پروفایلِ مرورگر از صفر ساخته شد.'
          : 'پروفایلِ مرورگرِ خزشِ قبلی باز شد — نشست و کش سرِ جایشان‌اند.',
      });
    } else {
      this.browser = await chromium.launch({ headless: this.headless });
      this.context = await this.browser.newContext({
        locale: target.locale || undefined,
        acceptDownloads: true,
        ...emulation,
      });
    }
    /**
     * trace برای خزش هم — به همان دلیلِ گشت.
     *
     * خزش صدها کلیک می‌زند و یافته‌هایش بازتولیدپذیر باید باشند. بی trace،
     * تنها چیزی که از یک کلیکِ مشکوک می‌ماند یک عکس است و یک خط متن.
     */
    await this.context
      .tracing.start({ screenshots: true, snapshots: true, sources: false })
      .then(() => (this.tracing = true))
      .catch(() => {});

    await this.context.addInitScript(INIT_SCRIPT);

    this.collectors = await startAll(createServerCollectors(target.logs));
    /**
     * «۰ خط لاگ سرور» دو معنی دارد؛ گزارش باید بگوید کدام.
     *
     * یا سرور ساکت بود، یا اصلاً گوش نمی‌دادیم. جمع‌کننده‌ای که فایلش نیست
     * بی‌صدا ساکت می‌ماند، و آن سکوت از «خطایی نبود» قابل تشخیص نیست.
     */
    {
      const row = {
        kind: 'collectors',
        source: 'server',
        severity: 'info',
        message: collectorWarning(this.collectors) || 'لاگ سرور وصل است',
        collectors: describeCollectors(this.collectors),
        at: new Date().toISOString(),
      };
      this.events.push(row);
      await this.store?.appendEvent(row).catch(() => {});
    }
    this.page = this.context.pages()[0] || (await this.context.newPage());
    attachClientObservers(
      this.page,
      (raw) => this.events.push({ ...raw, at: new Date().toISOString() }),
      // خزش بیش از هر اجرای دیگری endpoint لمس می‌کند؛ پوشش از همین‌جا پر می‌شود
      { onCall: callRecorder(this.store) }
    );

    this.status = 'running';
    this.emitEvent('started', { runId: this.runId, baseURL: target.baseURL });
    return this;
  }

  /**
   * حسابِ ذخیره‌شده، یا یکی تازه که بعداً ذخیره می‌شود.
   *
   * رمز اینجا **متنی** روی دیسک می‌نشیند و این یک استثناست، نه قاعده: حسابی
   * که خودِ ابزار ساخته، رازِ کسی نیست و متغیر محیطی برایش یعنی کاربر باید
   * دستی چیزی را که ندیده جایی بگذارد. `saveAccount` همین را با
   * `allowPlain` صریح می‌خواهد، و روی محیطِ تولیدی اصلاً اجازه نمی‌دهد.
   */
  recallIdentity() {
    const saved = listAccounts(this.targetName).find((item) => item.id === this.rememberAs);
    const secret = readAccounts(this.targetName).find((item) => item.id === this.rememberAs);

    /**
     * رمز از متغیر محیطی **یا** از فایل.
     *
     * ── چرا هر دو ──
     *
     * حسابی که خودِ خزش ساخته، رمزش متنی روی دیسک است و رازِ کسی نیست. ولی
     * حسابی که **کاربر** تعریف کرده — همان‌جا در صفحهٔ «حساب و چک» — رمزش
     * در متغیر محیطی است، چون قاعدهٔ این پروژه همان است.
     *
     * نسخهٔ اول فقط رمزِ متنی را می‌خواند، پس حسابِ واقعیِ کاربر بی‌صدا
     * نادیده گرفته می‌شد و خزش کاربرِ تازه می‌ساخت: دقیقاً برعکسِ چیزی که
     * کاربر خواسته بود.
     */
    const password = secret?.passwordEnv ? process.env[secret.passwordEnv] : secret?.password;

    if (saved && password && (saved.email || saved.username)) {
      this.recalled = true;
      this.emitEvent('warning', { message: `با حسابِ ذخیره‌شدهٔ «${this.rememberAs}» وارد می‌شود.` });
      return { ...freshIdentity(this.runId), email: saved.email || saved.username, password };
    }

    if (saved && !password) {
      this.emitEvent('warning', {
        message: `حسابِ «${this.rememberAs}» رمز در دسترس ندارد (${secret?.passwordEnv || '—'})؛ کاربرِ تازه ساخته می‌شود.`,
      });
    }
    return freshIdentity(this.runId);
  }

  /**
   * هویتِ تازه را فقط وقتی ذخیره کن که **واقعاً وارد شده باشیم**.
   *
   * ذخیرهٔ حسابی که ثبت‌نامش نگرفته، بدترین حالت است: خزشِ بعدی با آن تلاش
   * می‌کند، می‌افتد، و کسی نمی‌فهمد چرا. پس شرطش این است که حالتِ آغاز روی
   * صفحهٔ ورود نمانده باشد.
   */
  async rememberIdentity(root) {
    if (!this.rememberAs || this.recalled || !root) return;
    if (this.loginPath && root.route === this.loginPath) return;

    try {
      saveAccount({
        target: this.targetName,
        environment: this.target.environment,
        id: this.rememberAs,
        email: this.identity.email,
        password: this.identity.password,
        allowPlain: true,
        note: `ساختهٔ خزشِ نقشه — ${this.runId}`,
      });
      this.emitEvent('warning', {
        message: `حسابِ «${this.rememberAs}» ذخیره شد؛ خزشِ بعدی با همین وارد می‌شود.`,
      });
    } catch (cause) {
      this.emitEvent('warning', { message: `ذخیرهٔ حساب نشد: ${cause.message}` });
    }
  }

  /* ─────────────────────────── حالت ─────────────────────────── */

  /**
   * نمای باز روی صفحه — مودال، **و منو و کشو**.
   *
   * ── چرا از تشخیصِ گشت فراتر رفت ──
   *
   * گشت فقط `dialog` را می‌دید، چون آنجا آدم می‌نشیند و خودش نام می‌گذارد.
   * خزش نامگذار ندارد، و نخستین نقشهٔ واقعی پنج گرهِ بی‌نام داد که همه
   * `/contents ▪` بودند: یکی منوی باز، یکی listbox، یکی breadcrumb. گره‌ای
   * که نامش را نداند، در نقشه قابلِ فهم نیست.
   *
   * پیشوند (مودال/منو/فهرست) می‌ماند چون نوعِ لایه خودش معنا دارد: مودال
   * مسیر را می‌بندد و منو نه.
   */
  async detectView() {
    return await this.page
      .evaluate(() => {
        const visible = (el) => {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        };

        const nameOf = (el) => {
          const labelledBy = el.getAttribute('aria-labelledby');
          const labelled = labelledBy && document.getElementById(labelledBy);
          const heading = el.querySelector('h1,h2,h3,[role="heading"]');
          const raw = el.getAttribute('aria-label') || labelled?.textContent || heading?.textContent || '';
          return String(raw).replace(/\s+/g, ' ').trim().slice(0, 80);
        };

        // ترتیب همان ترتیبِ لایه‌هاست: مودال روی همه‌چیز می‌نشیند
        for (const [selector, prefix, kind] of [
          ['[role="alertdialog"],[role="dialog"],dialog[open]', '', 'dialog'],
          ['[role="menu"]', 'منوی', 'menu'],
          ['[role="listbox"]', 'فهرستِ', 'listbox'],
        ]) {
          const layers = [...document.querySelectorAll(selector)].filter(visible);
          if (!layers.length) continue;
          const top = layers[layers.length - 1];
          const name = nameOf(top);
          if (!prefix) return { view: name, viewKind: kind };

          /**
           * منو معمولاً نام ندارد؛ نامش را از دکمه‌ای می‌گیریم که بازش کرده.
           * بی این، همهٔ منوها یک نام می‌گرفتند و دوباره قابلِ تفکیک نبودند.
           */
          const trigger = [...document.querySelectorAll('[aria-expanded="true"]')].filter(visible).pop();
          const label = name || String(trigger?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
          return { view: `${prefix} ${label || 'بی‌نام'}`.trim(), viewKind: kind };
        }
        return { view: '', viewKind: '' };
      })
      .catch(() => ({ view: '', viewKind: '' }));
  }

  /** هویتِ حالتِ فعلی، بی هیچ نوشتنی. برای سنجیدنِ «آیا سرِ جایم هستم». */
  async identifyState() {
    const snapshot = await snapshotPage(this.page).catch(() => null);
    if (!snapshot) return null;
    const { view, viewKind } = await this.detectView();
    const sample = routeOf(this.page.url()) || '/';
    const route = routePatternOf(sample, this.knownRoutes);
    const profile = profileOf(snapshot.items);
    return { id: stateIdOf({ route, view, profile }), route, sample, view, viewKind, profile, snapshot };
  }

  /**
   * صبر کن تا سطحِ کنشیِ صفحه دو بار پشت سر هم یکی شود.
   *
   * زنجیرهٔ تغییرمسیرِ سمتِ کلاینت هم از همین رد می‌شود: `/` که روتر بعداً به
   * `/login` می‌بردش، در نمونهٔ اول یک هویت دارد و در نمونهٔ بعد هویتی دیگر، پس
   * تا مقصدِ نهایی صبر می‌شود.
   */
  async settle() {
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    // سقفِ کوتاه عمدی است: اپی که اتصالِ زنده دارد هرگز idle نمی‌شود و این
    // انتظار در هر قدم تکرار می‌شود. سنجشِ واقعیِ نشستن، حلقهٔ پایین است.
    await this.page.waitForLoadState('networkidle', { timeout: 1200 }).catch(() => {});

    let previous = null;
    for (let attempt = 0; attempt < SETTLE_TRIES; attempt++) {
      const current = await this.identifyState();
      if (previous && current && previous.id === current.id && hasRealAction(current.snapshot)) {
        return current;
      }
      previous = current;
      await this.page.waitForTimeout(SETTLE_GAP);
    }
    return previous;
  }

  /**
   * حالتِ فعلی را در نقشه بنشان.
   *
   * @param {object[]} pathSteps مسیرِ رسیدن، **بی** مسیرِ ورود
   * @param {object} [known] هویتِ از قبل خوانده‌شده، تا snapshot دو بار گرفته نشود
   */
  async observeState(pathSteps, known = null) {
    const current = known || (await this.settle());
    if (!current) return null;

    /**
     * ماسکِ دادهٔ اجرا **پیش از** هر کار دیگری.
     *
     * ترتیب مهم است: هویتِ گره، کلیدِ کنش و مسیرِ رسیدن همه از همین برچسب‌ها
     * ساخته می‌شوند. اگر بعد از آن ماسک می‌زدیم، نقشه با ایمیلِ اجرای امروز
     * ساخته می‌شد و فردا هیچ‌کدامشان نمی‌خواندند — همان چیزی که «بازپخشِ
     * مسیر شکست» را سه بار پشت سر هم داد.
     */
    const secrets = this.maskSecrets();
    const raw = actionsFrom(current.snapshot)
      .map((action) => maskAction(action, secrets))
      .map((action) =>
        this.avoid.some((rx) => rx.test(action.label)) ? { ...action, kind: 'avoided' } : action
      );

    const { state, created } = upsertState(this.map, {
      id: current.id,
      route: current.route,
      sample: current.sample,
      view: current.view,
      viewKind: current.viewKind,
      profile: current.profile,
      title: await this.page.title().catch(() => ''),
      path: pathSteps,
      actions: raw,
    });

    // نمونه‌گیری روی فهرستِ **ادغام‌شده** است، وگرنه هر بازدید نمونهٔ دیگری
    // می‌گرفت و گره هیچ‌وقت تمام نمی‌شد
    state.actions = sampleActions(state.actions, { max: this.map.caps.actionsPerState });

    if (created) {
      this.emitEvent('state', {
        id: state.id,
        route: state.route,
        view: state.view,
        actions: state.actions.length,
      });
    }

    this.enqueue(state);
    return state;
  }

  /** کنش‌هایی که ارزشِ امتحان دارند. یک تعریف، چون صف و حلقه هر دو لازمش دارند. */
  untriedOf(state) {
    return (state?.actions || []).filter((action) => {
      if (action.tried || !action.sampled) return false;
      if (action.kind === 'avoided' || action.kind === 'input' || action.kind === 'noise') return false;
      if (action.kind === 'destructive' && !this.allowDestructive) return false;
      if (this.navOnly && action.kind !== 'nav') return false;
      /**
       * دامنه: فقط **گشتن** را محدود می‌کند، نه رسیدن را.
       *
       * حالتی که بیرونِ دامنه است هنوز ثبت و بازپخش می‌شود — مسیرِ رسیدن به
       * کتاب از منو و فهرست می‌گذرد و بستنِ آن یعنی اصلاً نرسیدن. فقط
       * کنش‌هایش امتحان نمی‌شوند.
       */
      if (this.scope && !this.scope.covers(state)) return false;
      if ((this.unclickable.get(action.key) || 0) >= 2) return false;
      return true;
    });
  }

  enqueue(state) {
    /**
     * «اول کجا برود» — نه «کجا برود».
     *
     * `wanted` روت‌هایی است که سورس می‌شناسد و خزش هنوز ندیده. کنشی که
     * پیش‌بینی می‌شود به آن‌جا ببرد، جلو می‌افتد — بی آنکه کسی چیزی تایپ کرده
     * باشد.
     */
    const wanted = this.unreachedRoutes();
    pushFrontier(
      this.map,
      this.untriedOf(state).map((action) => ({
        state: state.id,
        action: action.key,
        depth: priorityOf(action, state, { focus: this.focus, wanted }),
      }))
    );
  }

  /** روتِ سورس که هنوز گرهی رویش نداریم. */
  unreachedRoutes() {
    const seen = new Set((this.map?.states || []).map((state) => state.route));
    return this.knownRoutes.map((route) => routePatternOf(route)).filter((route) => !seen.has(route));
  }

  /* ─────────────────────────── حرکت ─────────────────────────── */

  /**
   * مسیرِ ورود، تنها.
   *
   * نبودِ سناریوی ورود یعنی `go: /` — و این باید **صریح** باشد نه ضمنی: نسخهٔ
   * اول مسیرِ خالی را بازپخش می‌کرد، یعنی هیچ ناوبری‌ای نمی‌شد، پس هر برگشت به
   * ریشه شکست می‌خورد و کلِ صف با یک «مسیر شکسته» خالی شد.
   */
  /**
   * زمینهٔ جای‌گذاری برای بازپخش.
   *
   * ── چرا حساب‌ها هم باید اینجا باشند ──
   *
   * تا امروز فقط `identity` می‌رفت، چون مسیرهای ورودِ دست‌نویس هم فقط از آن
   * استفاده می‌کردند. نخستین «مسیرِ ورودِ خودکار» که به حسابِ ذخیره‌شده بسته
   * شد، همین‌جا ایستاد: «متغیر ناشناخته در سناریو: {{account.a.email}}».
   *
   * و این دقیقاً همان توقعی است که کاربر دارد: حسابی که در تنظیمات ساخته،
   * باید همانی باشد که خزش با آن وارد می‌شود.
   */
  /**
   * چیزهایی که نباید در نقشه بمانند: ایمیل و نامِ کاربریِ همین اجرا.
   *
   * هم هویتِ موقت، هم حساب‌های ذخیره‌شده — چون خزش ممکن است با هرکدام وارد
   * شده باشد و برچسبِ منو همان را نشان می‌دهد.
   */
  maskSecrets() {
    const out = [];
    if (this.identity?.email) out.push({ value: this.identity.email, as: '{{identity.email}}' });
    const { accounts } = accountsFor(this.targetName);
    for (const [id, data] of Object.entries(accounts || {})) {
      if (data?.email) out.push({ value: data.email, as: `{{account.${id}.email}}` });
    }
    return out;
  }

  replayCtx() {
    const { accounts } = accountsFor(this.targetName);
    return { identity: this.identity, account: accounts };
  }

  async enterRoot() {
    await replayPath({
      page: this.page,
      steps: [this.entryPath[0]],
      ctx: this.replayCtx(),
      baseURL: this.target.baseURL,
      target: this.targetName,
    });

    /**
     * مزاحم فقط **در مسیرِ ورود** بسته می‌شود، نه بعد از هر کنش.
     *
     * نخستین اجرای واقعی پشتِ مودالِ «بروزرسانی دیتابیس» ماند و به فرمِ ورود
     * نرسید. ولی بستنِ خودکارِ هر پنجره‌ای در **حینِ** خزش یعنی مودال‌ها هرگز
     * نقشه نمی‌شوند — و مودال و کشو دقیقاً همان نیمه‌ای‌اند که آدرس ندارند و
     * کسی تست ننوشته.
     *
     * سه دور، چون بستنِ یکی دومی را رو می‌کند و دومی چند صد میلی‌ثانیه بعد
     * می‌آید: یک دور، همان تلهٔ «اسپینر را دیدم و پنجره را ندیدم» است یک پله
     * بالاتر. و هر دور با `settle` شروع می‌شود، وگرنه پنجرهٔ در راه دیده
     * نمی‌شود.
     *
     * یافته ثبت نمی‌شود: مزاحمی که پیش از شروعِ کار بسته شود قدمِ کاربر را
     * نشکسته. جای ثبتش سناریوست، جایی که قدمی واقعاً گرفته شده.
     */
    const blockers = [];
    for (let round = 0; round < 3; round++) {
      await this.settle();
      const closed = await dismissBlockers(this.page).catch(() => []);
      if (!closed.length) break;
      blockers.push(...closed);
    }
    if (blockers.length && !this.blockersSeen) {
      this.blockersSeen = true;
      this.emitEvent('warning', {
        message: `پنجرهٔ مزاحم در مسیرِ ورود بسته شد: ${[...new Set(blockers)].join('، ')}`,
      });
    }

    const rest = this.entryPath.slice(1);
    try {
      await replayPath({ page: this.page, steps: rest, ctx: this.replayCtx(), baseURL: this.target.baseURL, target: this.targetName });
    } catch (cause) {
      /**
       * مزاحمی که **وسطِ** مسیرِ ورود می‌آید.
       *
       * سه دورِ بستن در ابتدای ورود، پنجره‌ای را می‌گیرد که با بارگذاری
       * می‌آید. ولی نپی یک `alertdialog` دارد که چند ثانیه بعد می‌نشیند —
       * و همان‌جا روی دکمهٔ «ورود / ثبت‌نام» می‌افتد و کلیک را می‌خورد.
       *
       * پس شکستِ کلیک در مسیرِ ورود یک بار بخشیده می‌شود: می‌بندیم و دوباره
       * از اولِ همان قدم‌ها می‌رویم. بارِ دوم اگر باز شکست، واقعاً شکست است.
       *
       * فقط در مسیرِ ورود، نه در خزش: آنجا بستنِ خودکارِ پنجره یعنی مودال‌ها
       * هرگز نقشه نشوند.
       */
      if (!/Timeout|intercepts pointer events/i.test(String(cause.message))) throw cause;

      this.emitEvent('warning', { message: 'مسیرِ ورود پشتِ یک پنجره ماند؛ بسته شد و دوباره رفت.' });
      await this.settle();
      await dismissBlockers(this.page).catch(() => {});
      await replayPath({ page: this.page, steps: rest, ctx: this.replayCtx(), baseURL: this.target.baseURL, target: this.targetName });
    }
    return await this.settle();
  }

  /** مسیرِ ورود + مسیرِ گره. همیشه از ابتدا، چون حالتِ میانی قابل اتکا نیست. */
  async goTo(state) {
    await this.enterRoot();
    await replayPath({
      page: this.page,
      steps: state.path || [],
      ctx: this.replayCtx(),
      baseURL: this.target.baseURL,
      target: this.targetName,
    });
    const current = await this.settle();
    return current?.id === state.id;
  }

  /**
   * سرِ جایم هستم یا باید برگردم؟
   *
   * ── چرا سنجیده می‌شود و بی‌بررسی بازپخش نمی‌شود ──
   *
   * مسیرِ ذخیره‌شده می‌شکند: اپ عوض می‌شود و مسیرِ دیروز به گرهِ دیگری می‌رسد.
   * بازپخشی که بی‌بررسی ادامه بدهد، یال‌های دروغ می‌سازد — و یالِ دروغ از
   * نبودِ یال بدتر است، چون سناریویی از آن درمی‌آید که هیچ‌وقت کار نمی‌کند.
   */
  async ensureAt(state) {
    const current = await this.settle();
    if (current?.id === state.id) return true;

    /**
     * اگر مودالی باز است، اول Escape — بعد بازپخشِ کامل.
     *
     * برگشت به گرهٔ والد با بازپخشِ مسیرِ ورود چند ثانیه می‌گیرد و در خزشی با
     * صدها کنش، همان چند ثانیه تمامِ بودجهٔ زمانی است. بستنِ مودال معمولاً
     * همان کار را در یک کلیدفشار می‌کند.
     *
     * شرطش این است که واقعاً برسیم: اگر Escape ما را جای دیگری برد، مسیرِ
     * کامل همان‌جا پشتش اجرا می‌شود.
     */
    if (current?.view) {
      await this.page.keyboard.press('Escape').catch(() => {});
      const after = await this.settle();
      if (after?.id === state.id) return true;
    }

    try {
      if (await this.goTo(state)) return true;
    } catch (cause) {
      this.emitEvent('warning', { message: `بازپخشِ مسیر شکست: ${cause.message}` });
    }

    /**
     * مسیر شکست — ولی خزش نباید بمیرد.
     *
     * حالتِ گذرا (مودالِ «بروزرسانی دیتابیس» که یک بار می‌آید) باعث می‌شود
     * گرهِ دیروز امروز پیدا نشود. نسخهٔ اول در همین نقطه کلِ صف را خالی کرد و
     * نقشه یک گره ماند.
     *
     * پس برمی‌گردیم سرِ خانه و **هرچه آنجاست** ثبت می‌شود: ادعای صادقانه این
     * است که «بعد از مسیرِ ورود، اینجاییم» — نه اینکه گرهِ گم‌شده را به مسیرِ
     * تازه بچسبانیم.
     */
    try {
      const root = await this.enterRoot();
      if (root) await this.observeState([], root);
    } catch {
      // برگشت به خانه هم نشد؛ حلقه با گرهٔ بعدی ادامه می‌دهد
    }
    return false;
  }

  /**
   * یک کنش را بزن و ببین کجا رسیدیم.
   *
   * شکستِ کنش، خزش را نمی‌کشد: «این در بسته بود، سراغ در بعدی» — همان تصمیمِ
   * `explore.js`. ولی برخلافِ آنجا، اینجا ثبت هم می‌شود: دکمه‌ای که کلیک
   * نمی‌پذیرد، خودش یک فکت دربارهٔ اپ است.
   */
  async tryAction(state, action) {
    const label = `نقشه ${this.stepIndex + 1}: ${action.label || action.role}`.slice(0, 80);
    const from = this.events.length;
    const started = Date.now();
    let failure = null;

    try {
      const { locator } = resolveTarget(this.page, action.descriptor);
      await locator.click({ timeout: CLICK_TIMEOUT });
    } catch (cause) {
      // ۳۰۰ نویسه، نه ۱۴۰: پلی‌رایت در همان call log می‌گوید **چه چیزی** جلوی
      // کلیک را گرفت، و بی آن، «شکست خورد» فقط یک عدد است نه یک سرنخ
      failure = String(cause.message).replace(/\s+/g, ' ').slice(0, 300);
    }
    const settled = await this.settle();

    action.tried = true;
    action.at = new Date().toISOString();
    if (failure) {
      action.failed = failure;
      this.unclickable.set(action.key, (this.unclickable.get(action.key) || 0) + 1);
    }
    this.tried++;

    const shot = await this.closeStep(label, started, from);

    if (failure) return null;

    const next = await this.observeState([...(state.path || []), { click: action.descriptor }], settled);
    if (!next) return null;

    action.to = next.id;
    /**
     * کنشی که هیچ حالتی را عوض نکرد، خودش یک فکت است.
     *
     * چکِ «کنش بی‌اثر» در `checks/universal.js` همین را از سمتِ یافته می‌گیرد؛
     * اینجا از سمتِ نقشه ثبت می‌شود تا بشود شمرد چند دکمهٔ این اپ کاری
     * نمی‌کنند.
     */
    if (next.id === state.id) action.inert = true;
    else addEdge(this.map, { from: state.id, action: action.key, to: next.id });

    return { next, shot };
  }

  /**
   * پایانِ یک قدم: لاگ سرور، داور، چکِ همگانی، عکس، و رخدادِ قدم.
   *
   * عیناً همان کاری که `ub.step` می‌کند. تکرارش عمدی نیست، ناچاری است:
   * `ub.step` به fixtureِ `playwright test` بند است و خزش زیر آن نمی‌رود.
   * هر تغییری در آن مرز باید اینجا هم بیاید — و خودآزما همین را می‌سنجد.
   */
  async closeStep(name, started, from) {
    for (const line of await drainAll(this.collectors || []).catch(() => [])) {
      this.events.push({ ...line, at: new Date().toISOString() });
    }

    let shot = null;
    try {
      shot = await this.store.saveShot(++this.stepIndex, name, await this.page.screenshot());
    } catch {
      // صفحه‌ای که وسط ناوبری است عکس نمی‌دهد؛ نبودِ عکس خزش را نمی‌شکند
    }

    const route = routeOf(this.page.url());
    const device = this.deviceName || this.target.device;
    const slice = this.events.slice(from);

    const { findings } = judge(slice, { allowlist: this.target.allowlist, step: name, route, device });
    for (const finding of findings) await this.record(finding);

    try {
      const checked = await runUniversalChecks({
        page: this.page,
        target: this.targetName,
        config: this.checksConfig,
        step: name,
        device,
      });
      for (const finding of checked.findings) await this.record(finding);
    } catch {
      // نبودِ چک، شکستِ قدم نیست
    }

    for (const event of slice) await this.store.appendEvent(event).catch(() => {});
    await this.store
      .appendEvent({
        kind: 'step',
        step: name,
        scenario: 'نقشهٔ اپ',
        ms: Date.now() - started,
        shot,
        route,
        errorCount: findings.length,
      })
      .catch(() => {});
    // فقط همان بازه پاک می‌شود، نه دنباله: رصدگر async است و ممکن است همین
    // حالا رخدادِ تازه‌ای پشتش نشسته باشد که مالِ قدمِ بعدی است.
    this.events.splice(from, slice.length);
    return shot;
  }

  /**
   * ثبتِ یافته، با سقف به ازای هر اثرانگشت.
   *
   * خزش همان باگ را صدها بار می‌بیند (هر بازدیدِ همان صفحه). بی سقف،
   * `findings.ndjson` می‌شود چند مگابایت از یک ردیفِ تکراری و گزارش هم کند
   * می‌شود. پنج نمونه برای «در کدام قدم‌ها دیده شد» کافی است.
   */
  async record(finding) {
    const seen = this.seenFindings.get(finding.fingerprint) || 0;
    this.seenFindings.set(finding.fingerprint, seen + 1);
    if (seen >= MAX_PER_FINGERPRINT) return;

    this.findings.push(finding);
    await this.store.appendFinding(finding).catch(() => {});
    if (seen === 0) this.emitEvent('finding', { finding });
  }

  /* ─────────────────────────── حلقه ─────────────────────────── */

  capExceeded() {
    if (this.map.states.length >= this.map.caps.states) return 'سقفِ حالت';
    if (Date.now() > this.deadline) return 'سقفِ زمان';
    return '';
  }

  async crawl() {
    this.map = this.fresh
      ? emptyMap(this.targetName, { baseURL: this.target.baseURL, caps: this.caps })
      : readMap(this.targetName);
    this.map.baseURL = this.target.baseURL;
    this.map.caps = { ...this.map.caps, ...this.caps };
    this.map.entry = this.entrySteps.length
      ? { scenario: this.entryLabel, steps: this.entrySteps.length }
      : null;
    this.map.stats.runs = [...(this.map.stats.runs || []), this.runId].slice(-20);

    this.deadline = Date.now() + this.map.caps.minutes * 60_000;

    /**
     * گرهِ آغاز از مسیرِ ورود می‌آید، نه از `baseURL`.
     *
     * اپی که ثبت‌نام و ورود دارد برای ناشناس یک صفحه است. پس مسیرِ ورود یک بار
     * بازپخش می‌شود و **مسیرِ همهٔ گره‌ها از آن‌جا حساب می‌شود** — وگرنه هر
     * سناریویی که بعداً از نقشه درآید، روی صفحهٔ ورود می‌افتد.
     */
    const started = Date.now();
    const from = this.events.length;
    const settled = await this.enterRoot();
    await this.closeStep('نقشه: مسیرِ ورود', started, from);

    /**
     * دانه، پیش از نخستین مشاهده.
     *
     * ترتیب عمدی است: اگر بعد از `observeState` می‌آمد، گرهِ ریشه با پروفایلِ
     * اپِ **خالی** ثبت می‌شد و بعد از ایمپورت دیگر با خودش نمی‌خواند — یعنی
     * هر بار که خزنده به خانه برمی‌گشت، فکر می‌کرد جای دیگری است.
     */
    let settledAfterSeed = settled;
    if (this.seedSteps.length) {
      const seedStarted = Date.now();
      const seedFrom = this.events.length;
      try {
        await replayPath({
          page: this.page,
          steps: this.seedSteps,
          ctx: this.replayCtx(),
          baseURL: this.target.baseURL,
          target: this.targetName,
        });
        settledAfterSeed = (await this.settle()) || settled;
        this.emitEvent('warning', { message: `دانه اجرا شد: ${this.seedLabel || 'سناریوی داده'}` });
      } catch (cause) {
        /**
         * شکستِ دانه خزش را نمی‌کشد، ولی **بلند** گفته می‌شود.
         *
         * نقشهٔ اپِ خالی نقشهٔ غلط نیست، ناقص است. سکوت اینجا یعنی کاربر
         * نقشه‌ای می‌بیند بی «ویرایشِ کتاب» و فکر می‌کند اپش همین است.
         */
        this.emitEvent('warning', {
          message: `دانه اجرا نشد (${cause.message.slice(0, 120)}) — نقشه از اپِ خالی درمی‌آید.`,
        });
      }
      await this.closeStep('نقشه: دانه', seedStarted, seedFrom);
    }
    this.map.seed = this.seedSteps.length ? { scenario: this.seedLabel, steps: this.seedSteps.length } : null;

    const root = await this.observeState([], settledAfterSeed);
    if (!root) throw new Error('حالتِ آغاز خوانده نشد — صفحه بالا نیامد؟');
    await this.rememberIdentity(root);
    await writeMap(this.targetName, this.map);

    /**
     * از همان‌جا که ایستاده‌ایم ادامه بده — برگشت، آخرین چاره است.
     *
     * ── چرا حلقهٔ اول اشتباه بود ──
     *
     * نسخهٔ اول صفِ سطح‌اول را دنبال می‌کرد و برای هر کنش به گرهِ صاحبش
     * برمی‌گشت. هر برگشت یعنی بازپخشِ کاملِ مسیرِ ورود: ۱۵ تا ۳۰ ثانیه. در
     * خزشِ واقعی، ده دقیقه صرفِ ۱۸ کنش شد و بیشترِ وقت در رفت‌وبرگشت گذشت.
     *
     * حالا اگر گرهی که در آن ایستاده‌ایم کنشِ نیازموده دارد، همان زده می‌شود.
     * ترتیبِ سطح‌اول را این کمی به هم می‌ریزد، ولی سقفِ زمان واقعی است و
     * خزشی که ۹۰٪ وقتش را در بازپخش بگذراند، نقشه‌ای نمی‌سازد که ترتیبش مهم
     * باشد.
     */
    /**
     * دروازهٔ دامنه — رفتنِ مستقیم به جایی که گفته‌ای بگرد.
     *
     * ── چه شد که لازم شد ──
     *
     * نخستین نقشهٔ کارِ واقعی دامنه‌اش `/content/f2e9a6d428` بود (یک کتاب). خزش
     * تمام شد و گزارش داد «۱۵ حالت بیرونِ دامنه ماند» — یعنی **هیچ کنشی
     * امتحان نشد**، چون رسیدن به کتاب از کلیک روی کارتِ کتاب در `/contents`
     * می‌گذرد و آن کلیک خودش بیرونِ دامنه بود.
     *
     * قاعدهٔ «دامنه فقط گشتن را محدود می‌کند نه رسیدن را» درست است، ولی
     * رسیدن هم با امتحان کردنِ کنش انجام می‌شود. پس دامنهٔ عمیق، بی یک درِ
     * مستقیم، غیرقابلِ دسترس بود — و شکستش خاموش: «صف تمام شد».
     *
     * حلش همان کاری است که آدم می‌کند: آدرس را در نوار می‌زند. رایگان،
     * قطعی، و مسیرِ ثبت‌شده‌اش (`[{go}]`) خودکفاست — پس سناریویی که بعداً از
     * این گره دربیاید، بی این خزش هم به همان‌جا می‌رسد.
     *
     * فقط روتِ مشخص، نه الگو: `/content/[id]` آدرس نیست و مرورگر نمی‌تواند
     * برود. آن یکی باید با کلیک پیدا شود.
     */
    let current = root;
    for (const route of gatewayRoutes(this.scope)) {
      const gateStarted = Date.now();
      const gateFrom = this.events.length;
      try {
        await replayPath({
          page: this.page,
          steps: [{ go: route }],
          ctx: this.replayCtx(),
          baseURL: this.target.baseURL,
          target: this.targetName,
        });
        const here = await this.settle();
        const state = await this.observeState([{ go: route }], here);
        if (state) {
          current = state;
          this.emitEvent('warning', { message: `دروازهٔ دامنه: مستقیم رفت به ${route}` });
        }
      } catch (cause) {
        /**
         * باز نشدنِ در، خزش را نمی‌کشد ولی **بلند** گفته می‌شود: بی این،
         * نقشه‌ای درمی‌آید که فقط بیرونِ دامنه را دیده و «موفق» گزارش می‌شود.
         */
        this.emitEvent('warning', {
          message: `دروازهٔ دامنه «${route}» باز نشد (${cause.message.slice(0, 120)})`,
        });
      }
      await this.closeStep(`نقشه: دروازهٔ دامنه ${route}`, gateStarted, gateFrom);
    }
    await writeMap(this.targetName, this.map);

    let reason = '';
    while (true) {
      /**
       * سقف در **سرِ** هر دور سنجیده می‌شود، نه فقط بعد از یک کنشِ موفق.
       *
       * نسخهٔ اول در ته حلقه می‌سنجید، و هر مسیرِ `continue` (کنشِ از قبل
       * امتحان‌شده، یا شکستِ برگشت) از کنارش رد می‌شد. نتیجه در خزشِ واقعی:
       * سقفِ هشت‌دقیقه‌ای گذشت و خزش بیست دقیقهٔ بعد هنوز می‌چرخید — دقیقاً
       * همان «پرچمی که بی‌صدا نادیده گرفته شود» که این مخزن جای دیگر
       * (`--depth`) با شکستنِ بلند جوابش را داده.
       */
      reason = this.capExceeded();
      if (reason) break;

      let state = current && this.untriedOf(current).length ? current : null;
      if (!state) {
        const item = takeFrontier(this.map);
        if (!item) {
          reason = 'صف تمام شد';
          break;
        }
        state = findState(this.map, item.state);
        const queued = state?.actions.find((candidate) => candidate.key === item.action);
        if (!state || !queued || queued.tried) {
          this.skipped++;
          continue;
        }
      }

      /**
       * داخلِ گره هم اولویت، نه ترتیبِ سند.
       *
       * حلقه اول کنش‌های همان گره را تمام می‌کند و تازه بعد سراغِ صف می‌رود،
       * پس وزنی که فقط به صف بخورد عملاً دیده نمی‌شود: نخستین خزشِ با
       * `--focus` هیچ تفاوتی نشان نداد.
       */
      const wanted = this.unreachedRoutes();
      const action = this.untriedOf(state)
        .slice()
        .sort((a, b) => priorityOf(a, state, { focus: this.focus, wanted }) - priorityOf(b, state, { focus: this.focus, wanted }))[0];
      if (!action) {
        this.skipped++;
        continue;
      }

      // در گرهی که همین حالا در آن ایستاده‌ایم، رفتن لازم نیست — و هر رفتنِ
      // لازم‌نبوده یک `settle` کامل هزینه دارد
      if (state !== current && !(await this.ensureAt(state))) {
        current = null;
        /**
         * سه شکستِ پیاپی، بعد رها کردن.
         *
         * یک شکست دلیلِ کافی نیست: اپ می‌تواند یک بار toast نشان دهد یا
         * درخواستی کند شود. ولی گرهی که سه بار پیدا نشد، دیگر پیدا نمی‌شود و
         * هر تلاشِ تازه یک بازپخشِ کاملِ مسیرِ ورود است.
         */
        state.pathFails = (state.pathFails || 0) + 1;
        this.skipped++;
        if (state.pathFails >= 3) {
          state.pathBroken = true;
          dropFrontierFor(this.map, state.id);
        }
        await writeMap(this.targetName, this.map);
        continue;
      }
      state.pathFails = 0;

      const result = await this.tryAction(state, action);
      // جایی که واقعاً ایستاده‌ایم، نه جایی که می‌خواستیم برویم
      current = result?.next || null;
      this.map.stats = { ...this.map.stats, tried: this.tried, skipped: this.skipped };
      await writeMap(this.targetName, this.map);
    }

    this.map.stats = {
      ...this.map.stats,
      tried: this.tried,
      skipped: this.skipped,
      findings: this.seenFindings.size,
      stoppedBecause: reason,
    };
    await writeMap(this.targetName, this.map);
    this.emitEvent('done', { reason, states: this.map.states.length, edges: this.map.edges.length });
    return this.map;
  }

  /** همان شکلِ ردیفی که `reporter.js` می‌نویسد؛ مصرف‌کننده یکی است. */
  async saveTrace() {
    if (!this.tracing) return null;
    this.tracing = false;

    try {
      const dir = runDir(this.runId);
      const relative = `traces/نقشه-${Date.now()}.zip`;
      await fsp.mkdir(path.join(dir, 'traces'), { recursive: true });
      await this.context.tracing.stop({ path: path.join(dir, relative) });
      await fsp.appendFile(
        path.join(dir, 'traces.ndjson'),
        JSON.stringify({ at: new Date().toISOString(), file: relative, scenario: 'نقشهٔ اپ', status: 'passed', retry: 0 }) + '\n',
        'utf8'
      );
      return relative;
    } catch (cause) {
      this.emitEvent('warning', { message: `ذخیرهٔ trace ناموفق بود: ${cause.message}` });
      return null;
    }
  }

  /**
   * @param {Error} [cause] اگر خزش با خطا مرد
   *
   * ── چرا خطا باید در `run.json` بنشیند ──
   *
   * تا امروز `stop()` همیشه `finished` می‌نوشت، حتی وقتی `crawl()` پرتاب
   * کرده بود. نتیجه‌اش روی نپی این شد: اجرایی با **صفر قدم** در فهرست
   * «پایان‌یافته» نشست و هیچ‌جا ننوشت چه شد. کاربر چند بار خزش زد، هر بار
   * خطایی وسطِ ترمینال دید، و فهرستِ اجراها هیچ نشانی از آن نداشت.
   *
   * همان شکستِ خاموشی که این ابزار برای شکارش ساخته شده — این بار در خودش.
   */
  async stop(cause = null) {
    if (this.status === 'stopped') return;
    this.status = 'stopped';
    for (const line of await drainAll(this.collectors || []).catch(() => [])) {
      this.events.push({ ...line, at: new Date().toISOString() });
      await this.store?.appendEvent(line).catch(() => {});
    }

    // جمع‌کنندهٔ فرمانی یک فرآیند است؛ بی این، هر خزش یکی جا می‌گذارد
    await stopAll(this.collectors || []);

    await this.saveTrace();
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    await this.store
      ?.finish({
        status: cause ? 'failed' : 'finished',
        kind: 'map',
        steps: this.stepIndex,
        findings: this.findings.length,
        ...(cause ? { error: String(cause.message || cause).slice(0, 2000) } : {}),
      })
      .catch(() => {});
  }
}
