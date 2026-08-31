/**
 * گشتِ زنده — مرورگری که **کاربر** می‌راند و ابزار تماشا می‌کند.
 *
 * ── چرا زیر `playwright test` نمی‌رود ──
 *
 * اجرای تست چرخهٔ عمرِ خودش را دارد: timeout، ترتیب، و بستنِ مرورگر در پایان.
 * گشت دقیقه‌ای تا ساعتی طول می‌کشد و **سرعتش را آدم تعیین می‌کند**. جا دادنش
 * در `test()` یعنی جنگیدن با هر مکانیزمِ ایمنیِ آن چارچوب — و باختن، چون آن
 * مکانیزم‌ها درست‌اند و فقط برای کارِ دیگری ساخته شده‌اند.
 *
 * پس یک پروسهٔ مستقل، ولی با **همان** رصدگرها:
 *
 *   INIT_SCRIPT + attachClientObservers   همان رخدادها
 *   createServerCollectors + drainAll     لاگ سرور
 *   judge()                               همان داور
 *   RunStore                              گشت هم یک اجراست
 *   snapshotPage / descriptorFor          همان توصیف‌گر
 *   runUniversalChecks                    همان چک‌ها
 *
 * یعنی باگی که کاربر حین گشت ببیند، **یافتهٔ واقعی** است و در همان تریاژ
 * می‌نشیند. این تصادفی نیست: نخستین دقایقی که یک آدم با اپ کار می‌کند،
 * پربارترین دقایقِ کشفِ باگ است و حیف است که فقط «آموزش» شمرده شود.
 *
 * ── چرا HUD به صفحهٔ اپ تزریق نمی‌شود ──
 *
 * پنلِ کنترل در رابطِ خودِ userbug است. تزریقِ عنصر به صفحهٔ تحت تست دقیقاً
 * همان کاری است که این پروژه جای دیگر با دقت از آن پرهیز می‌کند (پنجرهٔ
 * مزاحمِ نپی که ثبت شد و خاموش). ابزاری که برای کشفِ تداخل ساخته شده، خودش
 * نباید تداخل بسازد.
 */
import { chromium, devices } from '@playwright/test';
import { EventEmitter } from 'node:events';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { loadTarget } from '../target.js';
import { INIT_SCRIPT, attachClientObservers } from '../observe/client.js';
import { createServerCollectors, drainAll, startAll } from '../observe/server.js';
import { fingerprint, judge, normalizeMessage } from '../observe/oracle.js';
import { RunStore, newRunId, setCurrentRun } from '../store/run-store.js';
import { snapshotPage } from '../steps/snapshot.js';
import { runUniversalChecks } from '../checks/run.js';
import { readChecksConfig } from '../checks/config.js';
import { routeOf } from '../observe/route.js';
import { contractFrom } from '../checks/contract.js';
import { BINDING, describe, recorderScript, toStep } from './recorder.js';

/** بی‌فعالیتیِ بیشتر از این، گشت را می‌بندد. مرورگرِ فراموش‌شده بدترین حالت است. */
const IDLE_MS = 30 * 60 * 1000;

export class TourSession extends EventEmitter {
  constructor({ target, device, headless = false } = {}) {
    super();
    this.targetName = target;
    this.deviceName = device;
    this.headless = headless;

    this.status = 'starting';
    this.steps = [];
    this.findings = [];
    this.pages = [];
    this.recording = true;
    this.lastActivity = Date.now();
  }

  emitEvent(type, data = {}) {
    const event = { type, at: new Date().toISOString(), ...data };
    this.emit('event', event);
    return event;
  }

  async start() {
    const target = await loadTarget(this.targetName);
    this.target = target;

    /**
     * گشت روی تولید ممکن است، ولی صدادار.
     *
     * کاربر با «اکانت واقعی» لاگین می‌کند و ممکن است روی محیط تولیدی باشد.
     * خواندنی است پس ممنوع نیست؛ ولی قلاب‌های مخرب اجرا نمی‌شوند و پنل باید
     * هشدار را دائم نشان بدهد.
     */
    if (target.environment === 'production') {
      this.emitEvent('warning', { message: 'این هدف روی محیط تولیدی است. هیچ قلاب یا ریستی اجرا نمی‌شود.' });
    }

    this.runId = newRunId(this.targetName);
    setCurrentRun(this.runId);
    this.store = new RunStore(this.runId);
    await this.store.init({
      target: this.targetName,
      baseURL: target.baseURL,
      environment: target.environment,
      device: this.deviceName || target.device,
      isolation: 'tour',
      kind: 'tour',
    });

    /**
     * پروفایلِ ماندگار، در پوشهٔ موقت.
     *
     * ── چرا ماندگار و نه context ساده ──
     *
     * کاربر لاگین می‌کند و ممکن است وسط گشت صفحه را رفرش کند یا تبِ تازه باز
     * کند. `launchPersistentContext` نشست را نگه می‌دارد. پوشه‌اش موقت است تا
     * گشتِ بعدی از صفر شروع شود — مگر اینکه روزی «ادامهٔ همان نشست» خواسته
     * شود، که آن‌وقت مسیرِ ثابت می‌گیرد.
     */
    this.profileDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ub-tour-'));

    const emulation = this.deviceName && this.deviceName !== 'desktop' ? devices[this.deviceName] : {};
    if (this.deviceName && this.deviceName !== 'desktop' && !emulation) {
      throw new Error(`دستگاهِ ناشناخته: «${this.deviceName}»`);
    }

    this.context = await chromium.launchPersistentContext(this.profileDir, {
      headless: this.headless,
      viewport: null,
      locale: target.locale || undefined,
      acceptDownloads: true,
      ...emulation,
    });

    await this.context.addInitScript(INIT_SCRIPT);
    await this.context.addInitScript(recorderScript());
    await this.context.exposeBinding(BINDING, (source, payload) => this.onRecord(payload));

    this.collectors = await startAll(createServerCollectors(target.logs));
    this.checksConfig = readChecksConfig(this.targetName);

    this.page = this.context.pages()[0] || (await this.context.newPage());
    this.attach(this.page);
    this.context.on('page', (page) => this.attach(page));

    /**
     * بستنِ پنجره یعنی پایانِ گشت.
     *
     * بدون این، کاربر پنجره را می‌بندد و پروسه تا مهلتِ بی‌فعالیتی زنده
     * می‌ماند، و آنچه ضبط شده تا آن لحظه در حافظه معلق است.
     */
    this.context.on('close', () => {
      if (this.status === 'running') this.stop('پنجرهٔ مرورگر بسته شد').catch(() => {});
    });

    await this.page.goto(target.baseURL, { waitUntil: 'domcontentloaded' }).catch(() => {});

    this.status = 'running';
    this.idleTimer = setInterval(() => this.checkIdle(), 60_000);
    this.emitEvent('started', { runId: this.runId, url: this.page.url(), baseURL: target.baseURL });
    // نخستین صفحه هم از همان مسیرِ ناوبری ثبت می‌شود، نه با یک ثبتِ جداگانه:
    // مقصدِ نهاییِ زنجیرهٔ تغییرمسیر را فقط آن مسیر درست می‌بیند.
    this.scheduleChecks(this.page);
    return this;
  }

  /** رصدگرها روی هر صفحه، از جمله تب‌هایی که کاربر بعداً باز می‌کند. */
  attach(page) {
    attachClientObservers(page, (raw) => this.onObserved(raw));
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
      this.lastActivity = Date.now();
      this.emitEvent('navigated', { url: frame.url() });

      /**
       * خاموشیِ ضبط باید از ناوبری جان سالم به در ببرد.
       *
       * اسکریپتِ اولیه با هر سندِ تازه از نو اجرا می‌شود و پرچم را به
       * پیش‌فرضِ روشن برمی‌گرداند. بدون این خط، کاربر ضبط را خاموش می‌کرد،
       * روی یک پیوند کلیک می‌کرد، و ضبط بی‌صدا دوباره روشن می‌شد.
       */
      if (!this.recording) page.evaluate(() => (window.__ubRecording = false)).catch(() => {});

      this.scheduleChecks(page);
    });
    page.on('download', async (download) => {
      /**
       * دانلودِ حین گشت، یک فکت دربارهٔ اپ است.
       *
       * پرونده باید بداند این اپ چه چیزی به کاربر می‌دهد و کجا — بدون آن،
       * سناریوی بعدی که دانلود را بیازماید باید از صفر پیدایش کند.
       */
      this.emitEvent('download', { filename: download.suggestedFilename(), url: page.url() });
      this.downloads = this.downloads || [];
      this.downloads.push({ what: download.suggestedFilename(), where: safePath(page.url()) });
    });
  }

  /** رخدادِ رصدگر → داور → یافته. همان مسیرِ همیشگی. */
  async onObserved(raw) {
    const event = { ...raw, at: new Date().toISOString(), step: 'گشت', scenario: 'گشت زنده' };
    await this.store.appendEvent(event).catch(() => {});

    const { findings } = judge([event], {
      allowlist: this.target.allowlist,
      step: 'گشت',
      route: safePath(this.page?.url() || ''),
      device: this.deviceName || this.target.device,
    });
    for (const finding of findings) await this.record(finding);
  }

  async record(finding) {
    this.findings.push(finding);
    await this.store.appendFinding(finding).catch(() => {});
    this.emitEvent('finding', { finding });
  }

  /** رخدادِ ضبط‌کننده از داخلِ صفحه. */
  onRecord(payload) {
    this.lastActivity = Date.now();
    if (!this.recording) return;

    const built = toStep(payload);
    if (!built) return;

    const entry = {
      index: this.steps.length,
      at: new Date().toISOString(),
      url: safePath(payload.url || ''),
      label: payload.item ? describe(payload.item) : '',
      ...built,
    };
    this.steps.push(entry);
    this.emitEvent('step', { step: entry });
  }

  /**
   * «این صفحه برای چیست؟»
   *
   * جملهٔ کاربر پراعتمادترین چیزی است که این سیستم می‌گیرد. بدونِ توضیح هم
   * ثبت می‌شود (`auto`) تا نقشهٔ صفحه‌های دیده‌شده کامل بماند، ولی آن‌وقت
   * `by: tour` می‌گیرد نه `by: user`.
   */
  async notePage({ purpose = '', auto = false } = {}) {
    if (!this.page || this.page.isClosed()) return null;

    const snapshot = await snapshotPage(this.page).catch(() => null);
    if (!snapshot) return null;

    const url = this.page.url();
    const record = {
      path: safePath(url),
      title: await this.page.title().catch(() => ''),
      purpose: String(purpose || '').trim(),
      headings: snapshot.headings,
      items: snapshot.items,
      // نامزدهای قرارداد؛ هنوز قاعده نیستند — تقویتشان کارِ بازدیدهای بعدی است
      mustHave: contractFrom(snapshot),
      by: purpose ? 'user' : 'tour',
      at: new Date().toISOString(),
    };

    let shot = null;
    try {
      shot = await this.store.saveShot(this.pages.length + 1, record.path || 'page', await this.page.screenshot());
    } catch {
      // صفحه‌ای که وسط ناوبری است عکس نمی‌دهد؛ نبودِ عکس گشت را نمی‌شکند
    }
    record.shot = shot;

    // همان مسیر، دوباره: توضیحِ تازه بر ثبتِ خودکار می‌چربد
    const existing = this.pages.findIndex((item) => item.path === record.path);
    if (existing >= 0 && (purpose || !this.pages[existing].purpose)) this.pages[existing] = record;
    else if (existing < 0) this.pages.push(record);

    this.emitEvent('page', { page: { path: record.path, purpose: record.purpose, shot, by: record.by } });

    // ثبتِ دستی یعنی کاربر روی این صفحه ایستاده و منتظر جواب است؛ چکِ فوری
    // اینجا معنا دارد. ثبتِ خودکار از دلِ همان تایمری می‌آید که خودش چک را
    // صدا می‌زند، پس دوباره صدا زدنش فقط کارِ تکراری است.
    if (!auto) await this.runChecks();
    return record;
  }

  /**
   * چک‌ها بعد از **نشستنِ** صفحه، نه لحظهٔ ناوبری.
   *
   * ── چرا این لازم شد ──
   *
   * نخستین گشتِ واقعی روی نپی یک یافتهٔ قلابی داد: «صفحهٔ / چیزی برای دیدن
   * یا کلیک کردن ندارد». درست بود — در همان میلی‌ثانیه صفحه واقعاً خالی بود،
   * چون روترِ سمتِ کلاینت داشت به `/login` می‌رفت.
   *
   * این دقیقاً همان چکِ پرسروصداست که کلِ گزارش را بی‌ارزش می‌کند. پس هر
   * ناوبری تایمر را از نو می‌اندازد: در زنجیرهٔ تغییرمسیر، فقط مقصدِ نهایی
   * سنجیده می‌شود.
   */
  scheduleChecks(page) {
    clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(async () => {
      if (this.status !== 'running' || page.isClosed()) return;
      await page.waitForLoadState('domcontentloaded').catch(() => {});

      /**
       * نقشه هم همین‌جا کامل می‌شود، نه با یک ثبتِ یک‌بارهٔ اول.
       *
       * ── چرا ثبتِ ابتدای گشت کافی نبود ──
       *
       * روی نپی، `goto` روی `/` می‌نشست و روتر بعداً به `/login` می‌رفت. هر
       * مهلتِ ثابتی که بگذاریم، برای یک اپ زود است و برای دیگری دیر. ولی
       * `framenavigated` **هر** مقصد را می‌بیند، و همین تایمرِ نشستن هم از
       * قبل اینجاست.
       *
       * پس هر جایی که کاربر واقعاً رویش ماند، خودش ثبت می‌شود — با
       * `by: tour` تا وقتی آدم برایش جمله بنویسد.
       */
      await this.notePage({ auto: true }).catch(() => {});
      await this.runChecks().catch(() => {});
    }, 1200);
    this.checkTimer.unref?.();
  }

  async runChecks() {
    if (!this.page || this.page.isClosed()) return;
    const { findings } = await runUniversalChecks({
      page: this.page,
      target: this.targetName,
      config: this.checksConfig,
      step: 'گشت',
      device: this.deviceName || this.target.device,
    }).catch(() => ({ findings: [] }));

    // یافتهٔ تکراری در گشت زیاد است: کاربر بارها به همان صفحه برمی‌گردد
    const seen = new Set(this.findings.map((item) => item.fingerprint));
    for (const finding of findings) if (!seen.has(finding.fingerprint)) await this.record(finding);
  }

  /** یادداشتِ آزادِ کاربر، بی‌آنکه به صفحه‌ای بند باشد. */
  async note(message) {
    const text = String(message || '').trim();
    if (!text) return null;
    const finding = {
      fingerprint: fingerprint({ source: 'tour', message: text, route: safePath(this.page?.url() || ''), step: 'گشت' }),
      source: 'tour',
      severity: 'error',
      message: text,
      normalized: normalizeMessage(text),
      step: 'گشت',
      route: safePath(this.page?.url() || ''),
      device: this.deviceName || this.target.device,
      at: new Date().toISOString(),
      detail: { note: 'یادداشتِ کاربر حین گشت' },
    };
    await this.record(finding);
    return finding;
  }

  setRecording(on) {
    this.recording = Boolean(on);
    this.lastActivity = Date.now();
    this.page?.evaluate((v) => (window.__ubRecording = v), this.recording).catch(() => {});
    this.emitEvent('recording', { recording: this.recording });
  }

  removeStep(index) {
    const at = this.steps.findIndex((item) => item.index === index);
    if (at < 0) return false;
    this.steps.splice(at, 1);
    this.emitEvent('step-removed', { index });
    return true;
  }

  checkIdle() {
    if (this.status !== 'running') return;
    if (Date.now() - this.lastActivity < IDLE_MS) return;
    this.stop('گشت به‌خاطر بی‌فعالیتی بسته شد').catch(() => {});
  }

  /** وضعیتِ کامل، برای پنل و برای CLI. */
  snapshotState() {
    return {
      runId: this.runId,
      target: this.targetName,
      status: this.status,
      recording: this.recording,
      url: this.page && !this.page.isClosed() ? this.page.url() : '',
      steps: this.steps,
      pages: this.pages.map(({ items, ...rest }) => rest),
      findings: this.findings,
      downloads: this.downloads || [],
    };
  }

  async stop(reason = '') {
    if (this.status === 'stopped') return this.snapshotState();
    this.status = 'stopping';
    clearInterval(this.idleTimer);
    clearTimeout(this.checkTimer);

    // آخرین خطوطِ لاگ سرور، پیش از بستن. کاری که کاربر در ثانیهٔ آخر کرد هم
    // ردِ سروری دارد و بی این، فقط آن یکی گم می‌شد.
    for (const line of await drainAll(this.collectors || []).catch(() => [])) await this.onObserved(line);
    await this.context?.close().catch(() => {});
    await fsp.rm(this.profileDir, { recursive: true, force: true }).catch(() => {});

    this.status = 'stopped';
    const state = this.snapshotState();
    await this.store
      .finish({ status: 'finished', kind: 'tour', steps: this.steps.length, findings: this.findings.length })
      .catch(() => {});
    this.emitEvent('stopped', { reason, ...state });
    return state;
  }
}

/** مسیرِ نسبی، یا رشتهٔ خالی. `routeOf` طرح‌هایی مثل about: را رد می‌کند. */
function safePath(url) {
  return routeOf(url) || '';
}
