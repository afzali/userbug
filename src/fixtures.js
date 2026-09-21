/**
 * چسبِ فاز ۰.
 *
 * یک fixture خودکار که روی **همهٔ** تست‌ها سوار می‌شود: رصدگرها را وصل می‌کند،
 * لاگ سرور را از ابتدای هر قدم می‌خواند، و در پایان هر رخداد خطایی که در
 * allowlist نباشد را به‌عنوان یافته ثبت می‌کند.
 *
 * `auto: true` عمدی است — تستی که یادش برود چیزی را assert کند، باز هم زیر
 * نظر است. این همان چیزی است که «تست بدون سناریو» را ممکن می‌کند.
 */
import { test as base, expect } from '@playwright/test';
import { loadTargetOrPlaceholder } from './target.js';
import { attachClientObservers, INIT_SCRIPT } from './observe/client.js';
import {
  collectorWarning,
  createServerCollectors,
  describeCollectors,
  drainAll,
  startAll,
  stopAll,
} from './observe/server.js';
import { judge, fingerprint, normalizeMessage } from './observe/oracle.js';
import { routeOf } from './observe/route.js';
import { dismissBlockers } from './observe/blockers.js';
import { callRecorder } from './knowledge/endpoints.js';
import { RunStore, getCurrentRun } from './store/run-store.js';
import { freshIdentity } from './data/persian.js';
import { countHits, readChecksConfig } from './checks/config.js';
import { hardFailureMessage, runContractCheck, runUniversalChecks } from './checks/run.js';
import { listPages, writePage } from './knowledge/store.js';

/**
 * پیامِ خطای Playwright، به شکلی که آدم بخواند.
 *
 * کدهای رنگِ ترمینال در متنِ خام هستند و اگر پاک نشوند، در تریاژ و در
 * اثرانگشتِ یافته می‌نشینند — یعنی دو اجرای یک شکست، دو ردیفِ متفاوت.
 */
const ANSI = /\u001b\[[0-9;]*m/g;

function plainMessage(raw) {
  return String(raw || 'سناریو بی‌پیام شکست').replace(ANSI, '');
}

function firstLine(text) {
  return String(text).split('\n')[0];
}

export const test = base.extend({
  target: [
    async ({}, use) => {
      await use(await loadTargetOrPlaceholder(process.env.UB_TARGET || 'nepi'));
    },
    { scope: 'worker' },
  ],

  probe: [false, { option: true }],

  identity: async ({}, use) => {
    await use(freshIdentity(getCurrentRun()));
  },

  /**
   * ابزارِ داخل سناریو.
   *
   * `ub.step()` جای `test.step()` را می‌گیرد چون علاوه بر گروه‌بندی، مرزِ
   * زمانی هر قدم را هم مشخص می‌کند — و بدون آن مرز، نمی‌شود فهمید کدام خط
   * لاگ سرور مالِ کدام کنشِ کاربر است.
   *
   * `probe`: خودآزماییِ ابزار که خطاهای عمدی تزریق می‌کند. این یافته‌ها
   * `synthetic: true` می‌خورند تا گزارش واقعیِ پروژه را آلوده نکنند.
   */
  ub: async ({ page, target, probe }, use, testInfo) => {
    const store = new RunStore(getCurrentRun());
    const events = [];
    const findings = [];
    let stepIndex = 0;
    let currentStep = 'setup';

    // همان مقداری که `globalSetup` در `run.json` می‌نویسد. روی یافته می‌نشیند
    // تا `findings.ndjson` خودش را توضیح بدهد و تریاژ برای فهمیدنِ «فقط
    // موبایل» مجبور نباشد به `run.json` برگردد.
    const device = process.env.UB_DEVICE || target.device;

    /**
     * تنظیمِ چک‌ها یک بار خوانده می‌شود، نه هر قدم.
     *
     * پایانِ هر قدم پرترافیک‌ترین نقطهٔ اجراست (عکس، لاگ سرور، داور). یک
     * `readFileSync` دیگر در همان نقطه، روی سناریوی چهل‌قدمی چهل بار است
     * برای فایلی که وسط اجرا عوض نمی‌شود.
     *
     * نبودِ `knowledge/` یعنی همهٔ چک‌ها در حالت پیش‌فرض — پروژه‌ای که هنوز
     * شناختی ندارد هم باید چک بگیرد.
     */
    let checksConfig = { version: 1, checks: {} };
    try {
      checksConfig = readChecksConfig(target.key || process.env.UB_TARGET || '');
    } catch {
      // کلیدِ نامعتبر یا پوشهٔ نبوده — پیش‌فرض کار می‌کند
    }
    /**
     * قراردادهای صفحه، یک بار خوانده و در حافظه نگه داشته می‌شوند.
     *
     * خواندنِ پوشهٔ `pages/` در پایانِ هر قدم، روی سناریوی چهل‌قدمی چهل بار
     * پیمایشِ دیسک است برای فایل‌هایی که وسط اجرا عوض نمی‌شوند — مگر خودمان
     * عوضشان کنیم، که آن‌وقت همین نقشه را هم به‌روز می‌کنیم.
     */
    const contracts = new Map();
    /**
     * مسیرِ پایانِ قدمِ قبلی، و مسیرهایی که در همین تست تقویت شده‌اند.
     *
     * ── چرا هر دو لازم‌اند ──
     *
     * نخستین اجرای واقعی هر دو مسئله را با هم نشان داد: قراردادِ `/login`
     * از ده بند به دو بند رسید و `seenIn` در یک سناریوی سه‌قدمی از ۱ به ۴
     * پرید.
     *
     * **`seenIn` بازدید می‌شمرد، نه قدم.** سناریوی چهل‌قدمی روی یک صفحه،
     * چهل «بازدید» می‌شد و پنجرهٔ یادگیری بی‌معنا.
     *
     * **و تقویت وسطِ گذار، چیدمانِ درست را حذف می‌کرد.** پایانِ قدمی که
     * کاربر تازه «ورود» را زده، دقیقاً همان لحظه‌ای است که فرمِ ورود دارد
     * می‌رود. فیلدهای ایمیل و رمز — که واقعاً بخشِ ثابتِ آن صفحه‌اند — در
     * همان لحظه غایب دیده شدند و از قرارداد افتادند.
     *
     * پس تقویت فقط **نخستین بار** که در این تست به یک مسیر می‌رسیم — یعنی
     * تازه رسیده‌ایم و هنوز کاری نکرده‌ایم. مرزِ بعدیِ همان مسیر معمولاً پس
     * از کنشی است که صفحه را دارد عوض می‌کند.
     */
    const reinforced = new Set();
    try {
      for (const record of listPages(target.key || process.env.UB_TARGET || '')) {
        contracts.set(record.path, record);
      }
    } catch {
      // پروژه‌ای که هنوز گشت نشده قراردادی ندارد
    }

    /** شناسهٔ چک‌هایی که در این تست یافته ساختند، برای شمارندهٔ سروصدا. */
    const checkHits = new Set();
    /** چک‌های `expect` که شکستند — بر خلاف بقیه، تست را سخت می‌شکنند. */
    const hardChecks = [];

    const sink = (e) => {
      const event = { ...e, at: new Date().toISOString(), step: currentStep, scenario: testInfo.title };
      events.push(event);
      store.appendEvent(event).catch(() => {});
    };

    // جواب‌های یک‌بارمصرف برای dialogهای بعدی. صف است نه یک مقدار، چون یک قدم
    // ممکن است چند پنجره پشت سر هم بیاورد.
    const dialogAnswers = [];

    await page.addInitScript(INIT_SCRIPT);
    attachClientObservers(page, sink, {
      // پوششِ endpoint از همین‌جا ساخته می‌شود: چه چیزی واقعاً صدا زده شد
      onCall: callRecorder(store),
      onDialog: async (d) => {
        const answer = dialogAnswers.shift();
        if (!answer) return false;
        await answer(d);
        return true;
      },
    });

    const collectors = await startAll(createServerCollectors(target.logs));

    /**
     * «۰ خط لاگ سرور» دو معنی دارد؛ گزارش باید بگوید کدام.
     *
     * ── چه شد ──
     *
     * یا سرور ساکت بود (خبرِ خوب)، یا اصلاً گوش نمی‌دادیم (خبرِ بد). روی
     * پروژهٔ واقعی دومی بود و هیچ‌جا گفته نمی‌شد: جمع‌کننده‌ای که فایلش نبود
     * بی‌صدا ساکت می‌ماند.
     *
     * پس وضعیتشان یک رخدادِ ثبت‌شده است — هم در گزارش دیده می‌شود، هم
     * `run.json` از همین می‌سازدش.
     */
    sink({
      kind: 'collectors',
      source: 'server',
      severity: 'info',
      message: collectorWarning(collectors) || 'لاگ سرور وصل است',
      collectors: describeCollectors(collectors),
    });

    const ub = {
      target,
      store,
      events,
      findings,

      /** یک قدم: نام، کار، عکس، و هرچه سرور در همان بازه گفت. */
      async step(name, fn) {
        currentStep = name;
        const from = events.length;
        const started = Date.now();

        try {
          return await base.step(name, fn);
        } finally {
          for (const line of await drainAll(collectors)) sink(line);

          let shot = null;
          try {
            shot = await store.saveShot(++stepIndex, name, await page.screenshot({ fullPage: false }));
          } catch {
            // صفحه‌ای که بسته شده عکس نمی‌دهد؛ نبودِ عکس دلیل شکست تست نیست
          }

          // مسیرِ پایانِ قدم. هم داور لازمش دارد و هم خطِ زمانی: بدون آن
          // «کاربر کجا بود» فقط از عکس درمی‌آمد، و یک بار همین باعث شد سه قدم
          // را با هم اشتباه بگیریم.
          // `about:blank` مسیر ندارد؛ `routeOf` این را می‌داند
          const route = routeOf(page.url());

          const slice = events.slice(from);
          const { findings: found } = judge(slice, {
            allowlist: target.allowlist,
            step: name,
            route,
            device,
          });
          for (const f of found) {
            const tagged = probe ? { ...f, synthetic: true } : f;
            findings.push(tagged);
            await store.appendFinding(tagged).catch(() => {});
          }

          /**
           * چکِ همگانی، در همان مرزی که داور کار می‌کند.
           *
           * ── چرا اینجا و نه در مفسرِ سناریو ──
           *
           * `ub.step` تنها جایی است که **همهٔ** مسیرها از آن رد می‌شوند:
           * سناریوی YAML، کاوش، خودآزما، و بعداً گشت. گذاشتنش در `run.js`
           * یعنی کاوشِ آزاد — که بیشترین صفحهٔ ندیده را می‌بیند — بی‌چک
           * بماند.
           *
           * ── چرا شکست اینجا پرتاب نمی‌شود ──
           *
           * این بلوک در `finally` است. پرتاب از داخلِ `finally` خطای اصلیِ
           * قدم را می‌بلعد و گزارش می‌گوید «چک شکست» در حالی که واقعاً
           * کلیک شکسته بود. پس چکِ `expect` هم فقط ثبت می‌شود و شکستنش کارِ
           * دروازهٔ پایانِ تست است.
           */
          try {
            const { findings: checked } = await runUniversalChecks({
              page,
              target: target.key || process.env.UB_TARGET || '',
              config: checksConfig,
              step: name,
              device,
              synthetic: probe,
            });
            for (const f of checked) {
              findings.push(f);
              checkHits.add(f.checkId);
              if (f.detail?.mode === 'expect') hardChecks.push(f);
              await store.appendFinding(f).catch(() => {});
            }
          } catch {
            // نبودِ چک، شکستِ قدم نیست
          }

          // لایهٔ ۲: «چیزی که بود، هنوز هست»
          try {
            const record = route && !reinforced.has(route) ? contracts.get(route) : null;
            if (record) {
              reinforced.add(route);
              const result = await runContractCheck({
                page,
                target: target.key || process.env.UB_TARGET || '',
                record,
                step: name,
                device,
                synthetic: probe,
              });
              for (const finding of result.findings) {
                findings.push(finding);
                await store.appendFinding(finding).catch(() => {});
              }
              if (result.page) {
                contracts.set(result.page.path, result.page);
                if (!probe) await writePage(target.key, result.page, { why: 'تقویتِ قرارداد در اجرا' }).catch(() => {});
              }
            }
          } catch {
            // قرارداد نباید قدم را بشکند
          }

          await store.appendEvent({
            kind: 'step',
            step: name,
            scenario: testInfo.title,
            ms: Date.now() - started,
            shot,
            route,
            errorCount: found.length,
          });
        }
      },

      /**
       * جواب برای پنجرهٔ بعدی — پیش از کنشی که آن را باز می‌کند صدا بزنید.
       *
       *   ub.answerDialog('رمز');   // prompt
       *   ub.answerDialog(true);    // confirm → تأیید
       */
      answerDialog(value) {
        dialogAnswers.push(async (d) => {
          if (value === false) return d.dismiss();
          return d.accept(typeof value === 'string' ? value : undefined);
        });
      },

      /** کنترل کامل روی پنجرهٔ بعدی، وقتی `answerDialog` کافی نیست. */
      onNextDialog(handler) {
        dialogAnswers.push(handler);
      },

      /** یافته‌ای که خودِ سناریو تشخیص می‌دهد، نه داورِ خطاها. */
      async note({ source = 'scenario', severity = 'error', message, detail = null, synthetic = false }) {
        const f = {
          fingerprint: fingerprint({ source, message, route: routeOf(page.url()), step: currentStep }),
          source,
          severity,
          message,
          normalized: normalizeMessage(message),
          step: currentStep,
          route: routeOf(page.url()),
          device,
          at: new Date().toISOString(),
          detail,
          synthetic: probe || synthetic,
        };
        findings.push(f);
        await store.appendFinding(f).catch(() => {});
        return f;
      },

      /**
       * پنجره‌هایی که روی مسیر کاربر نشسته‌اند.
       *
       * خودِ منطق در `src/observe/blockers.js` است، چون خزشِ نقشه هم همان را
       * لازم دارد. آنچه اینجا می‌ماند تصمیمِ این مصرف‌کننده است: کِی یافته
       * بساز و کِی نه.
       *
       * ── چرا «همیشه یافته» غلط بود ──
       *
       * پیش‌تر هر پنجره‌ای که بسته می‌شد یافته می‌شد، با این استدلال که
       * «پنجره‌ای که کلیک را گرفته نقص است حتی وقتی بسته شد». برای وسطِ
       * سناریو درست است — کاربر کاری می‌خواست بکند و نتوانست.
       *
       * ولی وقتی این نخستین حرکتِ سناریوست، **هنوز هیچ‌کس هیچ کاری
       * نکرده**. پنجرهٔ خوش‌آمد یا کوکی که در بازدیدِ اول می‌آید، قدمِ
       * کاربر را نشکسته؛ باز کردنِ در است، نه ایراد.
       *
       * `map/session.js` دقیقاً همین تشخیص را از قبل داشت و صریح نوشته
       * بود: «مزاحمی که پیش از شروعِ کار بسته شود قدمِ کاربر را نشکسته».
       * دو ماژول، یک وضعیت، دو حکمِ متضاد — و آنکه شکایت می‌کرد همان
       * مسیری بود که هر سناریوی ساختهٔ مدل از آن رد می‌شود. یعنی هر
       * سناریوی تازه با یک یافتهٔ دائمی به دنیا می‌آمد.
       *
       * حالا یک قاعده: پیش از نخستین قدمِ واقعی، سکوت؛ بعدش، یافته.
       */
      async dismissBlockers({ expected = [], only, wait } = {}) {
        const acted = stepIndex > 1;
        return await dismissBlockers(page, {
          expected,
          only,
          wait,
          onBlocker: (title) =>
            acted
              ? ub.note({
                  source: 'blocker',
                  message: `پنجرهٔ «${title}» روی مسیر کاربر باز بود و کلیک را می‌گرفت`,
                  detail: `قدم: ${currentStep}`,
                })
              : null,
        });
      },

      /**
       * مسیرِ یک فایلِ نمونه — از دروازهٔ امن.
       *
       * ── چرا نه مسیرِ مستقیم در خودِ تست ──
       *
       * `setInputFiles('D:/…')` کار می‌کند، ولی دو چیز را از دست می‌دهد:
       * تست به یک ماشین گره می‌خورد، و هیچ مرزی نمی‌ماند که بگوید کدام
       * فایل‌ها را می‌شود فرستاد. `resolveFixture` از روزِ اول همین دروازه
       * بود — فقط از `knowledge/<هدف>/fixtures/` می‌خوانَد.
       *
       * افزودنِ فایل: `userbug fixtures <هدف> --add <مسیر>`
       */
      async fixture(name) {
        const { resolveFixture } = await import('./knowledge/fixtures.js');
        const { file } = await resolveFixture(target.key, name);
        return file;
      },

      /**
       * «هست یا نیست؟» — بی آنکه نبودنش تست را بشکند.
       *
       * ── چرا لازم است ──
       *
       * سناریوی ورود روی هر اپی دو حالت دارد: بارِ اول فرمِ ورود هست،
       * بارِ دوم کاربر از قبل وارد است و فرم اصلاً وجود ندارد. یک `fill`ِ
       * بی‌شرط همان‌جا می‌شکند — و آن شکست دربارهٔ اپ هیچ نمی‌گوید.
       *
       * ── چرا در `ub` و نه در هر فایلِ تولیدشده ──
       *
       * تولیدکننده می‌توانست همین چند خط را بالای هر spec بنویسد. ولی
       * آن‌وقت هر فایل نسخهٔ خودش را داشت، و اصلاحِ یکی‌شان بقیه را
       * اصلاح نمی‌کرد. یک پیاده‌سازی، همه‌جا.
       *
       * `waitFor` استفاده می‌شود نه `isVisible`، چون دومی همین الان را
       * می‌بیند و منتظرِ رندر نمی‌ماند.
       */
      async appears(locator, timeout = 5000) {
        return await locator.waitFor({ state: 'visible', timeout }).then(
          () => true,
          () => false
        );
      },

      /**
       * پاکسازی مرورگری.
       *
       * context تازهٔ Playwright به‌تنهایی کافی نیست: نپی service worker و
       * OPFS دارد و هر دو از اجرای قبل جا می‌مانند.
       */
      async clearBrowserState() {
        await page.goto(target.baseURL);
        await page.evaluate(async () => {
          try { localStorage.clear(); sessionStorage.clear(); } catch {}
          try {
            const regs = await navigator.serviceWorker?.getRegistrations?.();
            for (const r of regs || []) await r.unregister();
          } catch {}
          try {
            const keys = await caches.keys();
            for (const k of keys) await caches.delete(k);
          } catch {}
          try {
            const dbs = (await indexedDB.databases?.()) || [];
            for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name);
          } catch {}
          // OPFS — جایی که wa-sqlite دیتابیس را نگه می‌دارد. نه context تازهٔ
          // Playwright پاکش می‌کند و نه indexedDB.databases() می‌بیندش. بدون
          // این خط، هر اجرا روی دیتابیسِ اجرای قبل سوار می‌شد.
          try {
            const root = await navigator.storage.getDirectory();
            for await (const name of root.keys()) {
              await root.removeEntry(name, { recursive: true }).catch(() => {});
            }
          } catch {}
        });

        /**
         * دانه‌های وضعیت پس از پاکسازی.
         *
         * برای خاموش کردنِ مزاحم‌هایی است که یافته‌شان **قبلاً ثبت شده**. بدون
         * این، یک مودالِ ناخوانده که دیرهنگام می‌آید، هر سناریوی دیگری را هم
         * ناپایدار می‌کند و یافته‌های تازه زیر نویزِ یافتهٔ قدیمی گم می‌شوند.
         *
         * این «پنهان کردن باگ» نیست: یافته در `findings/` نوشته شده و کلیدِ
         * خاموش‌کردنش اینجا با ارجاع به همان یافته می‌آید.
         */
        const seed = target.isolation?.seed?.localStorage;
        if (seed) {
          await page.evaluate((entries) => {
            for (const [k, v] of Object.entries(entries)) {
              try { localStorage.setItem(k, v); } catch {}
            }
          }, seed);
        }

        await page.context().clearCookies();
      },
    };

    await use(ub);

    /**
     * جمع‌کنندهٔ فرمانی یک **فرآیند** است و باید کشته شود.
     *
     * بی این، هر اجرا یک `docker logs -f` جا می‌گذارد که تا بسته شدنِ
     * ترمینال زنده می‌ماند.
     */
    await stopAll(collectors);

    // شمارندهٔ سروصدا. حلقهٔ یادگیری بدون این نمی‌تواند چکِ پرسروصدا را پیدا
    // کند، و شمارنده‌ای که بعداً اضافه شود از صفر شروع می‌کند.
    if (!probe && checkHits.size) countHits(target.key || process.env.UB_TARGET || '', [...checkHits]);

    /**
     * سناریویی که شکست، خودش یک یافته است.
     *
     * ── باگی که با رفتنِ کلِ حلقه روی یک پروژهٔ تازه پیدا شد ──
     *
     * از زاویه سناریو ساخته شد، بررسی اجرا شد، سناریو **قرمز** شد
     * (`locator.click: Timeout`). و بعد:
     *
     *   تریاژ  «یافته‌ای با این فیلتر نیست»
     *   درخت   ✓ «آخرین بررسی سالم بود»
     *
     * یعنی بدترین حالتِ ممکن — سبزِ دروغین، روی همان صفحه‌ای که کلِ این
     * ابزار برای جلوگیری از آن ساخته شده.
     *
     * علتش این بود که تریاژ و درخت فقط `findings.ndjson` را می‌خوانند، و
     * شکستِ یک قدم (کلیکی که نخورد، `expect`ی که نگرفت) هرگز یافته
     * نمی‌شد: قرمزیِ تست فقط در `run.json` می‌ماند.
     *
     * ── چرا اینجا و نه در گزارش‌گیر ──
     *
     * اینجا `page` هنوز زنده است، پس مسیرِ واقعی و قدمِ جاری در دست است.
     * یافته‌ای که نداند کجا افتاده، در تریاژ قابلِ گروه‌بندی نیست و در
     * درخت به هیچ گره‌ای نمی‌چسبد.
     *
     * ── و چرا فقط وقتی یافتهٔ دیگری نیست ──
     *
     * اگر رصدگر از قبل خطای کنسول یا سرور دیده، همان دقیق‌تر است و
     * تستْ به‌خاطرِ همان قرمز شده. افزودنِ یک ردیفِ کلی کنارش فقط تریاژ
     * را دوبرابر می‌کند.
     */
    const realFindings = findings.filter((f) => !f.synthetic);

    const broke = !probe && ['failed', 'timedOut'].includes(testInfo.status) && !realFindings.length;
    if (broke) {
      /**
       * پیامِ Playwright چند خطی و پر از کدِ رنگ است. خطِ اول همان چیزی
       * است که آدم می‌خواند؛ بقیه در `detail` می‌ماند تا بازتولید ممکن
       * بماند.
       */
      const raw = plainMessage(testInfo.error?.message);
      await ub.note({
        source: 'scenario',
        severity: 'error',
        message: `قدم انجام نشد: ${firstLine(raw).slice(0, 200)}`,
        detail: raw.slice(0, 4000),
      });
      realFindings.push(...findings.filter((f) => !f.synthetic && !realFindings.includes(f)));
    }
    expect
      .soft(realFindings.map((f) => `[${f.source}] ${f.step} — ${f.message}`), 'خطاهای رصدشده حین اجرا')
      .toEqual([]);

    /**
     * چکِ `expect` سخت می‌شکند، نه نرم.
     *
     * ── چرا این تفاوت لازم است، وقتی یافته از قبل تست را قرمز می‌کند ──
     *
     * `watch` می‌گوید «این را دیدم، خودت قضاوت کن». `expect` را **آدم** ترفیع
     * داده و یعنی «این قاعده است». اگر هر دو نرم می‌شکستند، ترفیع دادن هیچ
     * معنایی نداشت و کسی زحمتش را نمی‌کشید.
     */
    if (!probe && hardChecks.length) throw new Error(hardFailureMessage(hardChecks));
  },
});

export { expect };
