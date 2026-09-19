/**
 * خودآزمای گشتِ زنده.
 *
 * ── چه چیزی واقعاً در آزمون است ──
 *
 * ادعای گشت این است: «کاری که آدم یک بار کرد، تبدیل به سناریویی می‌شود که
 * ماشین بارها تکرار می‌کند». آن ادعا سه حلقه دارد و هر سه باید بسته باشند:
 *
 *   ۱. ضبط        کلیکِ کاربر → توصیفِ معناییِ پایدار (نه سلکتور)
 *   ۲. تولید      توصیف‌ها → YAML قابل اجرا
 *   ۳. بازپخش     همان YAML روی همان صفحه دوباره کار کند
 *
 * سنجیدنِ فقط ۱ کافی نیست: ضبط‌کننده‌ای که چیزی تولید کند که اجرا نمی‌شود،
 * بدتر از نبودنش است — چون سناریوی مرده در مخزن می‌ماند و کسی به آن اعتماد
 * می‌کند.
 *
 * ── چرا مرورگر headless است ──
 *
 * گشتِ واقعی headed است چون آدم باید ببیند. اینجا آدمی نیست: کلیک‌ها را
 * خودِ تست می‌زند، پس پنجرهٔ واقعی فقط CI را کند و ناپایدار می‌کند. آنچه
 * سنجیده می‌شود — شنوندهٔ فازِ capture و ساختِ توصیف — در هر دو حالت یکی است.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';

import { TourSession } from '../../src/tour/session.js';
import { emitTour, seedCache, stepsToYaml } from '../../src/tour/emit.js';
import { toStep, describe as describeItem } from '../../src/tour/recorder.js';

/** اپِ ساختگی: فرمِ ورود، و صفحه‌ای که بعدش می‌آید. */
const APP = `<!doctype html><html lang="fa" dir="rtl"><head><title>ورود</title></head><body>
  <h1>ورود</h1>
  <form id="f">
    <label for="e">ایمیل</label><input id="e" name="email" />
    <label for="p">رمز عبور</label><input id="p" type="password" />
    <label for="k">مرا به خاطر بسپار</label><input id="k" type="checkbox" />
    <button type="submit">ورود</button>
  </form>
  <div id="after" hidden><h1>کتابخانه</h1><button>سند جدید</button></div>
<script>
  document.getElementById('f').onsubmit = (e) => {
    e.preventDefault();
    document.getElementById('f').hidden = true;
    document.getElementById('after').hidden = false;
    document.title = 'کتابخانه';
  };
</script>
</body></html>`;

/**
 * یک هدفِ موقت با ریشهٔ خودش.
 *
 * گشت در `knowledge/` و `scenarios/` می‌نویسد. بدون ریشهٔ جدا، خودآزما
 * پروژه‌های واقعیِ مخزن را آلوده می‌کرد — همان درسی که انبارِ شناخت یک بار
 * به‌سختی داد.
 */
async function withTemporaryTarget(html, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-tour-'));
  /**
   * `type: module` اجباری است، نه تزئینی.
   *
   * بدون آن، بارگذارِ پلی‌رایت `demo.config.js` را CommonJS می‌خواند و
   * `mod.default` یک شیءِ خالی می‌شود — یعنی `loadTarget` می‌گوید «baseURL
   * ندارد» در حالی که فایل روی دیسک درست است. نودِ خالی همان فایل را ESM
   * می‌خواند و مسئله فقط زیرِ پلی‌رایت پیدا می‌شود.
   */
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'userbug', type: 'module' }),
    'utf8'
  );
  fs.mkdirSync(path.join(root, 'targets'), { recursive: true });

  const pageFile = path.join(root, 'app.html');
  fs.writeFileSync(pageFile, html, 'utf8');
  const url = 'file:///' + pageFile.replace(/\\/g, '/');

  fs.writeFileSync(
    path.join(root, 'targets', 'demo.config.js'),
    `export default { name: 'demo', baseURL: ${JSON.stringify(url)}, environment: 'local', device: 'desktop' };\n`,
    'utf8'
  );

  const previous = process.env.USERBUG_ROOT;
  process.env.USERBUG_ROOT = root;
  try {
    await run({ root, url });
  } finally {
    if (previous === undefined) delete process.env.USERBUG_ROOT;
    else process.env.USERBUG_ROOT = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** یک گشتِ کامل: باز کن، کارها را بکن، ببند. */
async function tour(url, act) {
  const session = new TourSession({ target: 'demo', headless: true });
  await session.start();
  try {
    await session.page.goto(url, { waitUntil: 'domcontentloaded' });
    await act(session);
    // شنوندهٔ capture همزمان است، ولی binding از مرز پروسه رد می‌شود
    await session.page.waitForTimeout(300);
    return session;
  } finally {
    // پایان در خودِ تست‌ها با `stop()` است تا وضعیت خوانده شود
  }
}

test('کلیک و پر کردن ضبط می‌شوند، با توصیفِ معنایی نه سلکتور', async () => {
  await withTemporaryTarget(APP, async ({ url }) => {
    const session = await tour(url, async (s) => {
      await s.page.getByLabel('ایمیل').fill('a@b.c');
      await s.page.getByLabel('رمز عبور').fill('راز۱۲۳');
      await s.page.getByLabel('مرا به خاطر بسپار').check();
      await s.page.getByRole('button', { name: 'ورود' }).click();
    });

    const state = await session.stop();
    const actions = state.steps.map((item) => item.action);
    expect(actions).toContain('fill');
    expect(actions).toContain('check');
    expect(actions).toContain('click');

    const click = state.steps.find((item) => item.action === 'click');
    // توصیف باید نقش و نام باشد، نه مسیرِ DOM — وگرنه فردا می‌شکند
    expect(click.target).toMatchObject({ role: 'button', name: 'ورود' });
    expect(JSON.stringify(click.target)).not.toMatch(/nth-child|>|\.css/);
  });
});

test('رمز از صفحه بیرون نمی‌آید', async () => {
  await withTemporaryTarget(APP, async ({ url }) => {
    const session = await tour(url, async (s) => {
      await s.page.getByLabel('رمز عبور').fill('راز-واقعی-۱۲۳');
      // کاربر واقعی بعد از تایپ جای دیگری می‌رود؛ همان لحظه است که مقدار
      // نهایی می‌شود
      await s.page.getByRole('button', { name: 'ورود' }).click();
    });

    const state = await session.stop();
    const blob = JSON.stringify(state);

    /**
     * قاعده در خودِ اسکریپتِ داخلِ صفحه است، نه در نود: چیزی که فرستاده
     * نشود، لو هم نمی‌رود. حتی اگر روزی لاگِ خامِ گشت جایی کپی شود.
     */
    expect(blob).not.toContain('راز-واقعی');

    const fill = state.steps.find((item) => item.secret);
    expect(fill).toBeTruthy();
    // جایش متغیرِ هویت می‌نشیند تا سناریو با هر حسابی اجرا شود
    expect(fill.step.value).toBe('{{identity.password}}');
  });
});

test('توضیحِ کاربر by: user می‌گیرد و بی‌توضیح by: tour', async () => {
  await withTemporaryTarget(APP, async ({ url }) => {
    const session = await tour(url, async () => {});
    await session.notePage({ purpose: 'اینجا کاربر وارد می‌شود' });
    const state = await session.stop();

    const page = state.pages.find((item) => item.purpose);
    expect(page.by).toBe('user');
    expect(state.pages.every((item) => item.purpose || item.by === 'tour')).toBe(true);
  });
});

test('یافتهٔ حین گشت، یافتهٔ واقعی است', async () => {
  const broken = APP.replace('<h1>ورود</h1>', '<h1>ورود</h1><p>[object Object]</p>');
  await withTemporaryTarget(broken, async ({ url }) => {
    const session = await tour(url, async () => {});
    await session.notePage({});
    const state = await session.stop();

    // نخستین دقایقی که آدم با اپ کار می‌کند پربارترین دقایقِ کشف است؛
    // حیف است که فقط «آموزش» شمرده شود
    expect(state.findings.map((item) => item.checkId)).toContain('object-literal');
  });
});

test('یادداشتِ کاربر به یافته تبدیل می‌شود', async () => {
  await withTemporaryTarget(APP, async ({ url }) => {
    const session = await tour(url, async () => {});
    await session.note('این دکمه دو بار ایمیل می‌فرستد');
    const state = await session.stop();

    const note = state.findings.find((item) => item.source === 'tour');
    expect(note.message).toBe('این دکمه دو بار ایمیل می‌فرستد');
  });
});

test('ضبطِ خاموش، قدمی ثبت نمی‌کند', async () => {
  await withTemporaryTarget(APP, async ({ url }) => {
    const session = await tour(url, async (s) => {
      s.setRecording(false);
      await s.page.waitForTimeout(100);
      await s.page.getByRole('button', { name: 'ورود' }).click();
    });
    const state = await session.stop();
    expect(state.steps).toEqual([]);
  });
});

/**
 * ── چرا این آزمون جدا از آزمونِ بالاست ──
 *
 * آزمونِ بالا «ضبطِ خاموش» را می‌سنجید و سبز بود، در حالی که دکمهٔ «توقف
 * ضبط» در عمل کار نمی‌کرد. چون ناوبری نمی‌کرد.
 *
 * اسکریپتِ ضبط یک init script است: با **هر ناوبری** در محیطی تازه از نو
 * اجرا می‌شود. نسخهٔ قبلی همان‌جا مقدار را روی روشن می‌گذاشت، پس تصمیمِ
 * کاربر با نخستین تعویضِ صفحه باطل می‌شد و قدم‌ها دوباره ثبت می‌شدند.
 *
 * کاربر این را در گشتِ واقعی دید، نه ما. آزمونی که مرزِ ناوبری را رد نکند،
 * دربارهٔ init script چیزی ثابت نمی‌کند.
 */
test('توقف ضبط از تعویضِ صفحه جان سالم می‌برد', async () => {
  await withTemporaryTarget(APP, async ({ url }) => {
    const session = await tour(url, async (s) => {
      s.setRecording(false);
      await s.page.waitForTimeout(100);

      // همان مرزی که می‌شکست: بارگذاریِ تازه، محیطِ جاوااسکریپتِ تازه.
      await s.page.goto(url, { waitUntil: 'domcontentloaded' });
      await s.page.waitForTimeout(100);

      expect(await s.page.evaluate(() => window.__ubRecording)).toBe(false);
      await s.page.getByRole('button', { name: 'ورود' }).click();
    });

    const state = await session.stop();
    expect(state.steps).toEqual([]);
  });
});

test('روشن کردنِ دوباره هم از ناوبری رد می‌شود', async () => {
  await withTemporaryTarget(APP, async ({ url }) => {
    const session = await tour(url, async (s) => {
      s.setRecording(false);
      await s.page.waitForTimeout(100);
      s.setRecording(true);
      await s.page.waitForTimeout(100);

      await s.page.goto(url, { waitUntil: 'domcontentloaded' });
      await s.page.waitForTimeout(100);

      expect(await s.page.evaluate(() => window.__ubRecording)).toBe(true);
      await s.page.getByRole('button', { name: 'ورود' }).click();
      await s.page.waitForTimeout(300);
    });

    const state = await session.stop();
    expect(state.steps.length).toBeGreaterThan(0);
  });
});

/**
 * ── چرا «نما» لازم شد ──
 *
 * فرضِ اولیه این بود که هر چیزِ قابلِ توضیح یک آدرس دارد. کاربر روی اپ
 * واقعی نشان داد غلط است: کارهای اصلی در مودال‌اند و همه روی یک مسیر.
 *
 * و بدتر از نداشتنِ جا، بازنویسی بود — هر مودالی که توضیح داده می‌شد،
 * توضیحِ قبلی را پاک می‌کرد. یعنی هرچه کاربر بیشتر کار می‌کرد، کمتر می‌ماند.
 */
const APP_WITH_MODAL = `<!doctype html><html lang="fa" dir="rtl"><head><title>فهرست</title></head><body>
  <h1>فهرست</h1>
  <button id="a">وارد کردن</button>
  <button id="b">اشتراک</button>
  <div id="m1" role="dialog" aria-label="وارد کردن اطلاعات" hidden><button>تأیید</button></div>
  <div id="m2" role="dialog" hidden><h2>اشتراک‌گذاری</h2><button>ارسال</button></div>
  <div id="m3" hidden><button>لایهٔ بی‌نقش</button></div>
<script>
  a.onclick = () => { m1.hidden = false; };
  b.onclick = () => { m1.hidden = true; m2.hidden = false; };
</script>
</body></html>`;

test('مودالِ باز با نامش شناخته می‌شود، و دو مودال روی هم نمی‌نویسند', async () => {
  await withTemporaryTarget(APP_WITH_MODAL, async ({ url }) => {
    const session = await tour(url, async (s) => {
      // بی‌مودال: نما خالی است
      await s.notePage({ purpose: 'فهرستِ اصلی' });

      await s.page.getByRole('button', { name: 'وارد کردن' }).click();
      await s.page.waitForTimeout(100);
      await s.notePage({ purpose: 'فایل را از اینجا می‌گیرد' });

      await s.page.getByRole('button', { name: 'اشتراک' }).click();
      await s.page.waitForTimeout(100);
      await s.notePage({ purpose: 'لینک اشتراک می‌سازد' });
    });

    const state = await session.stop();
    const noted = state.pages.filter((page) => page.purpose);

    // سه رکوردِ جدا، نه یکی که دو بار بازنویسی شده
    expect(noted).toHaveLength(3);

    const byView = Object.fromEntries(noted.map((page) => [page.view || '(صفحه)', page.purpose]));
    expect(byView['(صفحه)']).toBe('فهرستِ اصلی');
    // از aria-label
    expect(byView['وارد کردن اطلاعات']).toBe('فایل را از اینجا می‌گیرد');
    // از عنوانِ داخلِ مودال، وقتی aria-label نیست
    expect(byView['اشتراک‌گذاری']).toBe('لینک اشتراک می‌سازد');
  });
});

test('لایه‌ای که تشخیص داده نمی‌شود، با نامِ دستی ثبت می‌شود', async () => {
  await withTemporaryTarget(APP_WITH_MODAL, async ({ url }) => {
    const session = await tour(url, async (s) => {
      // `m3` نه role دارد نه عنوان — تشخیصِ خودکار نمی‌بیندش
      await s.page.evaluate(() => (document.getElementById('m3').hidden = false));
      await s.page.waitForTimeout(50);

      expect(await s.detectView()).toBe('');

      await s.notePage({ purpose: 'پنلِ دستی', view: 'کشوی تنظیمات' });
    });

    const state = await session.stop();
    const noted = state.pages.find((page) => page.purpose === 'پنلِ دستی');
    expect(noted.view).toBe('کشوی تنظیمات');
    expect(noted.viewBy).toBe('user');
  });
});

test('نامِ دستی بر تشخیصِ خودکار می‌چربد', async () => {
  await withTemporaryTarget(APP_WITH_MODAL, async ({ url }) => {
    const session = await tour(url, async (s) => {
      await s.page.getByRole('button', { name: 'وارد کردن' }).click();
      await s.page.waitForTimeout(100);
      await s.notePage({ purpose: 'x', view: 'نامِ خودم' });
    });

    const state = await session.stop();
    expect(state.pages.find((page) => page.purpose === 'x').view).toBe('نامِ خودم');
  });
});

/**
 * ── چرا این بند موقتاً خاموش است ──
 *
 * حلقه‌ای که می‌سنجید سه قدم داشت: ضبط ← YAML ← بازپخش. قدمِ سوم با
 * برداشتنِ `src/scenario/run.js` رفت، و دو قدمِ اول را بندهای بالا
 * جداگانه می‌سنجند.
 *
 * ادعایی که اینجا قفل می‌شد ارزشش را از دست نداده — «پیش‌نویسی که یک بار
 * اجرا نشده سناریو نیست». همان ادعا با `userbug author` برمی‌گردد، این بار
 * روی `.spec.js`: ضبط ← spec ← `playwright test`. تا آن روز، خاموش ماندنش
 * صادقانه‌تر از حذف است — این فایل یادداشتِ کاری است که نیمه‌تمام ماند.
 */
test.skip('گشت → YAML → بازپخش: حلقه بسته می‌شود', async () => {
  await withTemporaryTarget(APP, async ({ root, url }) => {
    const session = await tour(url, async (s) => {
      await s.page.getByLabel('ایمیل').fill('a@b.c');
      await s.page.getByRole('button', { name: 'ورود' }).click();
    });
    await session.notePage({ purpose: 'صفحهٔ ورود' });
    const state = await session.stop();

    const written = await emitTour({ target: 'demo', state, landing: true });
    expect(written.scenario).toBeTruthy();
    expect(written.pages).toBeGreaterThan(0);
    // کش با وقتِ آدم پر می‌شود، نه با پولِ مدل
    expect(written.cached).toBeGreaterThan(0);

    const file = path.join(root, 'scenarios', 'demo', written.scenario);
    const yaml = fs.readFileSync(file, 'utf8');
    expect(yaml).toContain('status: draft');
    expect(yaml).toContain('ورود');

    /**
     * بازپخش — همان چیزی که «پیش‌نویسی که یک بار اجرا نشده سناریو نیست»
     * را از شعار به سنجه تبدیل می‌کند.
     */
    const YAML = (await import('yaml')).default;
    const parsed = YAML.parse(yaml);
    const { runScenario } = await import('../../src/scenario/run.js');
    const { chromium } = await import('@playwright/test');

    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      const ub = {
        target: { key: 'demo', baseURL: url, allowlist: [] },
        store: { appendEvent: async () => {}, appendFinding: async () => {} },
        step: async (_title, fn) => await fn(),
        note: async () => {},
      };
      // `go: /` روی file:// معنا ندارد، پس مستقیم باز می‌شود و قدمِ ناوبری
      // از سناریو کنار گذاشته می‌شود؛ بقیهٔ قدم‌ها همان‌اند
      await page.goto(url);
      await runScenario({
        page,
        ub,
        identity: { email: 'a@b.c', password: 'x' },
        scenario: { id: 'replay', name: 'replay', steps: parsed.steps.filter((s) => !s.go && !s.clearState) },
      });
      // اگر توصیف‌ها درست باشند، فرم submit شده و صفحهٔ بعدی آمده است
      await expect(page.getByRole('heading', { name: 'کتابخانه' })).toBeVisible();
    } finally {
      await browser.close();
    }
  });
});

/* ───────────────────── واحدهای بی‌مرورگر ───────────────────── */

test('عنصرِ بی‌توصیفِ پایدار، قدم نمی‌سازد', () => {
  // ثبتش فقط سناریویی می‌ساخت که اجرا نمی‌شود
  expect(toStep({ action: 'click', item: { ref: 0 }, items: [] })).toBeNull();
  expect(toStep({ action: 'click' })).toBeNull();
  expect(toStep({ action: 'چیزِ ناشناخته', item: { name: 'x' }, items: [{ ref: 0, name: 'x' }] })).toBeNull();
});

test('عنصرِ تکراری `nth` می‌گیرد', () => {
  const items = [
    { ref: 0, role: 'button', name: 'حذف' },
    { ref: 1, role: 'button', name: 'حذف' },
  ];
  const built = toStep({ action: 'click', item: items[1], items });
  // توصیفی که به دو عنصر بخورد، در کش هم بی‌فایده است
  expect(built.target.nth).toBe(1);
});

test('نامِ خوانا از نقش می‌آید', () => {
  expect(describeItem({ role: 'button', name: 'ذخیره' })).toBe('دکمهٔ «ذخیره»');
  expect(describeItem({ role: 'textbox', label: 'ایمیل' })).toBe('فیلدِ «ایمیل»');
  expect(describeItem({})).toBe('«عنصر»');
});

test('YAML با clearState و go شروع می‌شود', () => {
  const yaml = stepsToYaml({
    steps: [{ step: { click: { role: 'button', name: 'x' } }, url: '/a', action: 'click' }],
    pages: [{ path: '/a', purpose: 'صفحهٔ الف' }],
    name: 'نمونه',
    startPath: '/a',
  });

  // پیش‌نویسی که با کلیک شروع شود، روی صفحهٔ خالی اجرا می‌شود و می‌شکند
  expect(yaml).toMatch(/clearState/);
  expect(yaml).toMatch(/go: \/a/);
  expect(yaml).toContain('صفحهٔ الف');
});

test('آپلودِ ضبط‌شده، فایلِ لازم را در سرصفحه اعلام می‌کند', () => {
  const yaml = stepsToYaml({
    steps: [{ step: { upload: { to: {}, file: 'fixtures/x.pdf' } }, url: '/a', needsFixture: 'x.pdf' }],
    pages: [],
    name: 'ن',
  });
  // بدون این، سناریو روی ماشین دیگری با «فایل پیدا نشد» می‌شکند
  expect(yaml).toContain('x.pdf');
  expect(yaml).toContain('fixtures');
});

test('کش مدخلِ موجود را بازنویسی نمی‌کند', async () => {
  await withTemporaryTarget(APP, async () => {
    const steps = [
      { intent: 'دکمهٔ «ورود» را بزن', action: 'click', target: { role: 'button', name: 'ورود' } },
    ];
    expect(seedCache({ target: 'demo', scenarioId: 's', steps })).toBe(1);
    // کش با پول پر شده و بازنویسی‌اش رایگان نیست
    expect(seedCache({ target: 'demo', scenarioId: 's', steps })).toBe(0);
  });
});
