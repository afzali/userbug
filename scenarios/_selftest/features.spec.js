/**
 * خودآزمای لایهٔ فیچر.
 *
 * ── چرا این فایل هست ──
 *
 * فیچر تنها لایهٔ درخت است که نیمی از دادهٔ آن **حرفِ خودِ آدم** است و
 * نیمِ دیگرش حدسِ مدل. هر جای این مخزن که این دو کنارِ هم نشسته‌اند
 * (`merge.js`، نام‌های قابلیت) یک بار خطر بازنویسیِ حرفِ آدم پیش آمده.
 *
 * و لایهٔ نما یک بار نشان داد که شمارشِ قرضی چه می‌کند: مودالی که هرگز
 * باز نشده بود «۳ سناریو · ۱۱ اجرا» می‌گفت. فیچر دقیقاً همان‌جا نشسته،
 * پس همان تله را دارد.
 *
 * هر دو اینجا قفل می‌شوند.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { MAP_VERSION } from '../../src/map/store.js';

function withProject(states = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-feat-'));
  process.env.USERBUG_ROOT = root;

  const know = path.join(root, 'knowledge', 'demo');
  fs.mkdirSync(path.join(know, 'pages'), { recursive: true });
  fs.writeFileSync(
    path.join(know, 'map.json'),
    JSON.stringify({ version: MAP_VERSION, target: 'demo', states, edges: [] }),
    'utf8'
  );
  return root;
}

test.afterEach(() => {
  delete process.env.USERBUG_ROOT;
});

const stamp = () => `?t=${Date.now()}${Math.random()}`;
const loadFeats = () => import(`../../src/knowledge/features.js${stamp()}`);
const loadCaps = () => import(`../../src/knowledge/capabilities.js${stamp()}`);

test('شناسهٔ فیچر از جا و نام می‌آید، نه از زمان', async () => {
  withProject();
  const { featureId } = await loadFeats();

  const one = featureId({ route: '/content/42', view: '', hash: '' }, 'هایلایت');
  const two = featureId({ route: '/content/7', view: '', hash: '' }, 'هایلایت');
  /** `:id` جمع می‌شود، پس دو نمونهٔ یک صفحه یک فیچر دارند نه دو تا. */
  expect(one).toBe(two);

  /** ولی هش جای دیگری است. */
  expect(featureId({ route: '/content/42', hash: 'notes' }, 'هایلایت')).not.toBe(one);
});

test('هش از خودِ آدرس برداشته می‌شود', async () => {
  withProject();
  const { placeOf } = await loadFeats();

  expect(placeOf({ url: '/content/42#notes' })).toEqual({
    route: '/content/:id',
    view: '',
    hash: 'notes',
  });
});

test('حدسِ مدل روی حرفِ آدم نمی‌نشیند', async () => {
  withProject();
  const { addFeature, readFeatures } = await loadFeats();

  const mine = addFeature('demo', {
    where: { route: '/content/1' },
    title: 'هایلایت',
    expected: 'باید بعد از رفرش بماند',
    by: 'user',
  });

  addFeature('demo', {
    where: { route: '/content/1' },
    title: 'هایلایت',
    desc: 'حدسِ مدل',
    by: 'model',
  });

  const after = readFeatures('demo').features[mine.id];
  expect(after.by).toBe('user');
  expect(after.expected).toBe('باید بعد از رفرش بماند');
  expect(after.desc).toBe('');
});

test('دستِ آدم که به فیچرِ حدسی بخورد، دیگر حدسی نیست', async () => {
  withProject();
  const { addFeature, setFeature } = await loadFeats();

  const guess = addFeature('demo', {
    where: { route: '/content/1' },
    title: 'جستجو در متن',
    by: 'model',
  });
  expect(guess.by).toBe('model');

  const fixed = setFeature('demo', guess.id, { expected: 'باید شمارهٔ صفحه بدهد' });
  expect(fixed.by).toBe('user');
});

test('فیچر فرزندِ گرهِ میزبانش می‌شود', async () => {
  withProject([{ id: 'a', route: '/content/1', view: '', actions: [] }]);
  const { addFeature } = await loadFeats();
  const { rebuild, buildTree } = await loadCaps();

  rebuild('demo');
  addFeature('demo', { where: { route: '/content/1' }, title: 'هایلایت', by: 'user' });

  const { roots } = buildTree('demo');
  const page = roots.find((one) => one.route === '/content/:id');
  const feat = page.children.find((one) => one.feature);
  expect(feat.title).toBe('هایلایت');
  expect(feat.confidence).toBe('confirmed');
});

test('فیچرِ مدل مشکوک می‌ماند تا تأیید شود', async () => {
  withProject([{ id: 'a', route: '/settings', view: '', actions: [] }]);
  const { addFeature } = await loadFeats();
  const { rebuild, buildTree } = await loadCaps();

  rebuild('demo');
  addFeature('demo', { where: { route: '/settings' }, title: 'تغییرِ رمز', by: 'model' });

  const { flat } = buildTree('demo');
  expect(flat.find((one) => one.feature).confidence).toBe('suspected');
});

test('فیچر عددِ صفحهٔ میزبانش را قرض نمی‌گیرد', async () => {
  withProject([{ id: 'a', route: '/settings', view: '', actions: [] }]);
  const { addFeature } = await loadFeats();
  const { rebuild, buildTree } = await loadCaps();

  rebuild('demo');
  addFeature('demo', { where: { route: '/settings' }, title: 'تغییرِ رمز', by: 'user' });

  const counts = { '/settings': { scenarios: ['a', 'b'], runs: 11, findings: 3, openFindings: 1 } };
  const { flat } = buildTree('demo', { counts });

  const page = flat.find((one) => one.route === '/settings' && !one.feature);
  expect(page.counts.runs).toBe(11);

  /** همان تلهٔ نماها: عددِ صفحه نباید زیرِ نامِ فیچر بنشیند. */
  const feat = flat.find((one) => one.feature);
  expect(feat.counts.runs).toBe(0);
  expect(feat.counts.scenarios).toEqual([]);
});

test('فیچرِ بی‌میزبان در درخت آویزان نمی‌ماند', async () => {
  withProject([{ id: 'a', route: '/settings', view: '', actions: [] }]);
  const { addFeature } = await loadFeats();
  const { rebuild, buildTree } = await loadCaps();

  rebuild('demo');
  addFeature('demo', { where: { route: '/nowhere' }, title: 'کارِ گمشده', by: 'user' });

  const { roots, flat } = buildTree('demo');
  expect(flat.some((one) => one.feature)).toBe(false);
  expect(roots.some((one) => one.title === 'کارِ گمشده')).toBe(false);
});

test('حذفِ فیچر یعنی نبودن، نه ردیفِ مرده', async () => {
  withProject();
  const { addFeature, setFeature, readFeatures } = await loadFeats();

  const one = addFeature('demo', { where: { route: '/x' }, title: 'کار', by: 'user' });
  setFeature('demo', one.id, null);
  expect(readFeatures('demo').features[one.id]).toBeUndefined();
});

test('فیچرِ بی‌نام یا بی‌جا ثبت نمی‌شود', async () => {
  withProject();
  const { addFeature } = await loadFeats();

  expect(() => addFeature('demo', { where: { route: '/x' }, title: '   ' })).toThrow();
  expect(() => addFeature('demo', { where: {}, title: 'کار' })).toThrow();
});

test('شمارشِ فیچر منبعش را از هم جدا می‌کند', async () => {
  withProject();
  const { addFeature, summarizeFeatures } = await loadFeats();

  addFeature('demo', { where: { route: '/a' }, title: 'یک', by: 'user', expected: 'باید بشود' });
  addFeature('demo', { where: { route: '/a' }, title: 'دو', by: 'model' });
  addFeature('demo', { where: { route: '/b' }, title: 'سه', by: 'model' });

  expect(summarizeFeatures('demo')).toEqual({ total: 3, byUser: 1, byModel: 2, withExpected: 1 });
});
