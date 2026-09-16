/**
 * خودآزمای «یک نقشه».
 *
 * ── چرا این لازم شد ──
 *
 * کاربر پرسید: «آیا گشت خودش یک نوع نقشه نیست؟» بود — و ما دو انبار داشتیم
 * که هر دو «جاهای اپ» را ثبت می‌کردند: `pages/` (گشت و اجرا) و `map.json`
 * (خزش). هیچ صفحه‌ای هر دو را با هم نمی‌دید، پس هر کدام نصفِ جواب را
 * می‌دادند — و پوشش از واقعیت خوش‌بین‌تر درمی‌آمد چون مخرجش ناقص بود.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { MAP_VERSION } from '../../src/map/store.js';

/**
 * ریشهٔ موقت، چون این ماژول از دیسک می‌خواند.
 *
 * `USERBUG_ROOT` همان چیزی است که بقیهٔ خودآزماها هم استفاده می‌کنند؛ متغیرِ
 * دیگری ساختن یعنی دو تعریف از «کجا داده‌ها هستند».
 */
function withProject({ map = null, pages = [], dossierRoutes = [], endpointRoutes = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-merge-'));
  process.env.USERBUG_ROOT = root;

  const know = path.join(root, 'knowledge', 'demo');
  fs.mkdirSync(path.join(know, 'pages'), { recursive: true });
  // نسخه لازم است: `readMap` نقشهٔ نسخهٔ دیگر را «نداریم» می‌خواند
  if (map) fs.writeFileSync(path.join(know, 'map.json'), JSON.stringify({ version: MAP_VERSION, ...map }), 'utf8');

  for (const page of pages) {
    const slug = page.path === '/' ? 'root' : page.path.slice(1).replace(/\//g, '__');
    const name = page.view ? `${slug}__${page.view}` : slug;
    fs.writeFileSync(path.join(know, 'pages', `${name}.json`), JSON.stringify({ version: 1, ...page }), 'utf8');
  }

  fs.writeFileSync(
    path.join(know, 'dossier.json'),
    JSON.stringify({ version: 1, routes: dossierRoutes.map((one) => ({ path: one })) }),
    'utf8'
  );
  /**
   * روت‌های اسکنِ بی‌مدل — **رشته**، نه شیء.
   *
   * همین تفاوتِ شکل بود که ستونِ «فقط در سورس» را همیشه صفر نگه داشت.
   */
  if (endpointRoutes) {
    fs.writeFileSync(
      path.join(know, 'endpoints.json'),
      JSON.stringify({ version: 1, endpoints: [], routes: endpointRoutes }),
      'utf8'
    );
  }

  return root;
}

test.afterEach(() => {
  delete process.env.USERBUG_ROOT;
});

test('گره‌ای که هم خزیده شده هم گشت، یک ردیف است نه دو', async () => {
  withProject({
    map: { states: [{ id: 'a', route: '/contents', view: '', title: 'کتاب‌ها', actions: [{ tried: true }, {}] }] },
    pages: [{ path: '/contents', title: 'کتاب‌ها', purpose: 'فهرست کتاب', contract: { must: [{ role: 'button' }] } }],
  });
  const { unifiedStates } = await import(`../../src/map/merge.js?a=${Date.now()}`);

  const states = unifiedStates('demo');
  expect(states).toHaveLength(1);
  expect(states[0]).toMatchObject({
    route: '/contents',
    actions: 2,
    tried: 1,
    purpose: 'فهرست کتاب',
    contract: 1,
  });
  // هر دو منبع نگه داشته می‌شوند: «از کجا می‌دانیم» خودش یک خبر است
  expect(states[0].by.sort()).toEqual(['crawl', 'tour']);
});

test('نما هویت است: مودالِ یک صفحه با خودِ صفحه یکی نمی‌شود', async () => {
  withProject({
    map: {
      states: [
        { id: 'a', route: '/contents', view: '', actions: [] },
        { id: 'b', route: '/contents', view: 'افزودن کتاب', actions: [] },
      ],
    },
  });
  const { unifiedStates } = await import(`../../src/map/merge.js?b=${Date.now()}`);
  expect(unifiedStates('demo')).toHaveLength(2);
});

test('روتی که فقط در سورس است هم یک گره است، نه یک غیبت', async () => {
  /**
   * تا امروز این‌ها یک کارتِ جدا بودند («در سورس هست، نرسیدیم»). ردیف بودنشان
   * یعنی مخرجِ پوشش کامل می‌شود — وگرنه نمره همیشه از واقعیت خوش‌بین‌تر است.
   */
  withProject({
    map: { states: [{ id: 'a', route: '/contents', view: '', actions: [] }] },
    dossierRoutes: ['/contents', '/login'],
  });
  const { unifiedStates, coverage } = await import(`../../src/map/merge.js?c=${Date.now()}`);

  const states = unifiedStates('demo');
  expect(states.map((one) => one.route).sort()).toEqual(['/contents', '/login']);
  expect(states.find((one) => one.route === '/login').by).toEqual(['source']);

  expect(coverage(states)).toMatchObject({ total: 2, crawled: 1, untouched: 1 });
});

test('«خزیده ولی بی‌قرارداد» شمرده می‌شود', async () => {
  /**
   * یعنی رفته‌ایم آنجا ولی نمی‌دانیم «چه چیزی همیشه هست» — و آن دقیقاً
   * جایی است که هیچ انتظاری نمی‌شود نوشت.
   */
  withProject({
    map: {
      states: [
        { id: 'a', route: '/a', view: '', actions: [] },
        { id: 'b', route: '/b', view: '', actions: [] },
      ],
    },
    pages: [{ path: '/a', contract: { must: [{ role: 'button' }, { role: 'heading' }] } }],
  });
  const { unifiedStates, coverage } = await import(`../../src/map/merge.js?d=${Date.now()}`);
  expect(coverage(unifiedStates('demo'))).toMatchObject({ withoutContract: 1, contracts: 2 });
});

test('پروژهٔ خالی خطا نمی‌دهد، فهرستِ خالی می‌دهد', async () => {
  withProject();
  const { unifiedStates } = await import(`../../src/map/merge.js?e=${Date.now()}`);
  expect(unifiedStates('demo')).toEqual([]);
});

/**
 * ── باگی که یک بار واقعاً خورد ──
 *
 * `dossier.routes` آرایه‌ای از شیء است و `endpoints.routes` آرایه‌ای از
 * رشته، ولی هر دو `.map(one => one.path)` می‌خوردند. نیمهٔ دوم `undefined`
 * می‌شد و `filter(Boolean)` بی‌صدا دورش می‌ریخت.
 *
 * پروژه‌ای که ۱۱ روت از سورس داشت، «۰ فقط در سورس» می‌دید — و صفر همیشه
 * شبیهِ «چیزی نیست» است، نه شبیهِ «خراب است». برای همین کسی نفهمید.
 */
test('روتِ اسکنِ بی‌مدل رشته است، و باز هم گره می‌شود', async () => {
  withProject({ endpointRoutes: ['/login', '/contents'] });
  const { coverage, unifiedStates } = await import(`../../src/map/merge.js?c=${Date.now()}`);

  const states = unifiedStates('demo');
  expect(states.map((one) => one.route).sort()).toEqual(['/contents', '/login']);
  expect(states.every((one) => one.by.includes('source'))).toBe(true);
  expect(coverage(states).untouched).toBe(2);
});
