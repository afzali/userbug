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
import { loadTarget } from './target.js';
import { attachClientObservers, INIT_SCRIPT } from './observe/client.js';
import { createServerCollectors, startAll, drainAll } from './observe/server.js';
import { judge, fingerprint, normalizeMessage } from './observe/oracle.js';
import { RunStore, getCurrentRun } from './store/run-store.js';
import { freshIdentity } from './data/persian.js';

export const test = base.extend({
  target: [
    async ({}, use) => {
      await use(await loadTarget(process.env.UB_TARGET || 'nepi'));
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
      onDialog: async (d) => {
        const answer = dialogAnswers.shift();
        if (!answer) return false;
        await answer(d);
        return true;
      },
    });

    const collectors = await startAll(createServerCollectors(target.logs));

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
          let route = null;
          try {
            route = new URL(page.url()).pathname;
          } catch {
            // صفحه‌ای که هنوز جایی نرفته یا بسته شده، آدرس قابل تجزیه ندارد
          }

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
          fingerprint: fingerprint({ source, message, route: new URL(page.url()).pathname, step: currentStep }),
          source,
          severity,
          message,
          normalized: normalizeMessage(message),
          step: currentStep,
          route: new URL(page.url()).pathname,
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
       * کاربر واقعی می‌بنددشان و کارش را ادامه می‌دهد — پس ما هم. ولی هر کدام
       * ثبت می‌شود، چون «کاربر توانست ببندد» با «نباید آنجا می‌بود» یکی نیست.
       * بدون ثبت، این پنجره‌ها بی‌صدا در همهٔ اجراهای بعدی هم عبور می‌کردند.
       */
      async dismissBlockers({ expected = [] } = {}) {
        const found = [];
        const noted = new Set();

        for (let guard = 0; guard < 8; guard++) {
          // ترتیب مهم است: alertdialog لایهٔ بالاتری دارد و تا بسته نشود،
          // کلیک روی dialogِ زیرش را می‌گیرد. اولین باری که این را رعایت
          // نکردیم، حلقه پنج بار همان پنجره را «دید» و هیچ‌کدام بسته نشد.
          let top = page.locator('[role="alertdialog"]').first();
          let visible = (await top.count()) > 0 && (await top.isVisible().catch(() => false));
          if (!visible) {
            top = page.locator('[role="dialog"]').first();
            visible = (await top.count()) > 0 && (await top.isVisible().catch(() => false));
          }
          if (!visible) break;

          const title =
            ((await top.getByRole('heading').first().innerText().catch(() => '')) || '(بی‌عنوان)').trim();
          found.push(title);

          if (!noted.has(title) && !expected.some((rx) => rx.test(title))) {
            noted.add(title);
            await ub.note({
              source: 'blocker',
              message: `پنجرهٔ «${title}» روی مسیر کاربر باز بود و کلیک را می‌گرفت`,
              detail: `قدم: ${currentStep}`,
            });
          }

          const closer = top.getByRole('button', {
            name: /^(بستن|بعداً|نشان نده|انصراف|باشه|متوجه شدم|Close)$/,
          });
          if (await closer.count()) {
            await closer.first().click({ timeout: 4000 }).catch(() => {});
          } else {
            await page.keyboard.press('Escape').catch(() => {});
          }
          // اگر بسته نشد، حلقهٔ بعدی همان را دوباره می‌بیند — پس منتظر رفتنش می‌مانیم
          await top.waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
        }

        return found;
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

    // داورِ پایانی: هر یافتهٔ واقعی تست را نرم می‌شکند. خودآزمایی‌ها را فقط
    // گزارش می‌کنیم، نمی‌شکنیم — چون هدفشان اثباتِ کارکرد رصدگر بود.
    const realFindings = findings.filter((f) => !f.synthetic);
    expect
      .soft(realFindings.map((f) => `[${f.source}] ${f.step} — ${f.message}`), 'خطاهای رصدشده حین اجرا')
      .toEqual([]);
  },
});

export { expect };
