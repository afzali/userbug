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

    const sink = (e) => {
      const event = { ...e, at: new Date().toISOString(), step: currentStep, scenario: testInfo.title };
      events.push(event);
      store.appendEvent(event).catch(() => {});
    };

    await page.addInitScript(INIT_SCRIPT);
    attachClientObservers(page, sink);

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

          const slice = events.slice(from);
          const { findings: found } = judge(slice, {
            allowlist: target.allowlist,
            step: name,
            route: new URL(page.url()).pathname,
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
            errorCount: found.length,
          });
        }
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
