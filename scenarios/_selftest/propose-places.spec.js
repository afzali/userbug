/**
 * خودآزمای «جای کشف‌شده → سفر».
 *
 * ── چرا این لازم شد ──
 *
 * یک بار از اول مثل کاربرِ تازه رفتیم: پروژه ساخته شد، سورس خوانده شد، و ۱۲
 * پیشنهاد درآمد که **هر ۱۲ تا** از جنسِ قاعدهٔ دیتابیس بودند. هیچ‌کدام
 * ثبت‌نام و ورود و هایلایت نبود — یعنی دقیقاً همان سفرهایی که کاربر گفته
 * بود می‌خواهد بداند سالم‌اند.
 *
 * علتش این بود که بندِ «صفحه‌ای که آزموده نمی‌شود» فقط `dossier.routes` را
 * می‌خواند و آن را `learn` پر می‌کند که مدل لازم دارد. راهِ رایگانِ «سورس را
 * بخوان» ۱۱ روت پیدا می‌کرد و هیچ‌کدام به پیشنهاد نمی‌رسید.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { MAP_VERSION } from '../../src/map/store.js';

function withProject({ map = null, pages = [], endpointRoutes = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-place-'));
  process.env.USERBUG_ROOT = root;

  const know = path.join(root, 'knowledge', 'demo');
  fs.mkdirSync(path.join(know, 'pages'), { recursive: true });
  if (map) fs.writeFileSync(path.join(know, 'map.json'), JSON.stringify({ version: MAP_VERSION, ...map }), 'utf8');
  for (const page of pages) {
    const slug = page.path === '/' ? 'root' : page.path.slice(1).replace(/[/]/g, '__');
    fs.writeFileSync(path.join(know, 'pages', `${slug}.json`), JSON.stringify({ version: 1, ...page }), 'utf8');
  }
  fs.writeFileSync(
    path.join(know, 'endpoints.json'),
    JSON.stringify({ version: 1, endpoints: [], routes: endpointRoutes }),
    'utf8'
  );
  return root;
}

test.afterEach(() => {
  delete process.env.USERBUG_ROOT;
});

const load = () => import(`../../src/knowledge/propose.js?t=${Date.now()}${Math.random()}`);

test('روتی که فقط سورس دیده، سفرِ پیشنهادی می‌شود', async () => {
  withProject({ endpointRoutes: ['/login', '/contents'] });
  const { proposalsFor } = await load();

  const places = proposalsFor('demo').proposals.filter((one) => one.kind === 'place');
  expect(places.map((one) => one.routes[0]).sort()).toEqual(['/contents', '/login']);
  // متن باید همان کاری را بخواهد که آدم می‌کند، نه یک پرس‌وجوی فنی
  expect(places[0].text).toContain('به عنوان کاربر وارد');
});

/**
 * ── باگی که در نخستین نسخه بود ──
 *
 * متن از «چه کسی دیده» ساخته می‌شد نه از «چه می‌دانیم»، پس صفحه‌ای که گشت
 * رفته بود ولی `purpose` نداشت، متنِ «هنوز هیچ‌کس اینجا نرفته» می‌گرفت —
 * پیشنهادی که دربارهٔ واقعیت دروغ می‌گفت.
 */
test('صفحه‌ای که خزش دیده، «هیچ‌کس نرفته» خطاب نمی‌شود', async () => {
  withProject({
    map: { states: [{ id: 'a', route: '/contents', view: '', title: 'کتاب‌ها', actions: [{ tried: true }, {}] }] },
  });
  const { proposalsFor } = await load();

  const place = proposalsFor('demo').proposals.find((one) => one.kind === 'place');
  expect(place.title).toContain('کتاب‌ها');
  expect(place.why).not.toContain('هیچ‌کس نرفته');
  expect(place.why).toContain('خزش');
  expect(place.evidence).toBe('از خزش');
});

test('هدفی که آدم نوشته، بر هر حدسی مقدم است', async () => {
  withProject({
    map: { states: [{ id: 'a', route: '/contents', view: '', title: 'کتاب‌ها', actions: [] }] },
    pages: [{ path: '/contents', title: 'کتاب‌ها', purpose: 'فهرست کتاب‌های کاربر' }],
  });
  const { proposalsFor } = await load();

  const place = proposalsFor('demo').proposals.find((one) => one.kind === 'place');
  expect(place.why).toBe('فهرست کتاب‌های کاربر');
  expect(place.text).toContain('فهرست کتاب‌های کاربر');
});
