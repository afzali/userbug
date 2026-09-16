/**
 * خودآزمای درختِ قابلیت‌ها.
 *
 * ── چرا این فایل هست ──
 *
 * چهار ایراد از پنج ایرادِ این ماژول با **یک بار اجرا روی دادهٔ واقعی** پیدا
 * شدند، نه با خواندنِ کد: قفسهٔ تک‌فرزند، عنوانِ قرض‌گرفته از یک کتاب، دو
 * صفحه با نامِ یکسان، و بدترینشان — نمایی که عددِ اجرای صفحهٔ میزبانش را به
 * خودش می‌گرفت و «آزموده‌شده» به نظر می‌رسید در حالی که هرگز باز نشده بود.
 *
 * هر چهارتا اینجا قفل می‌شوند، چون هیچ‌کدام خطا نمی‌دادند: همه خروجیِ
 * خوش‌قیافه‌ای می‌ساختند که غلط بود.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { MAP_VERSION } from '../../src/map/store.js';

function withProject({ states = [], pages = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-cap-'));
  process.env.USERBUG_ROOT = root;

  const know = path.join(root, 'knowledge', 'demo');
  fs.mkdirSync(path.join(know, 'pages'), { recursive: true });
  fs.writeFileSync(
    path.join(know, 'map.json'),
    JSON.stringify({ version: MAP_VERSION, target: 'demo', states, edges: [] }),
    'utf8'
  );
  for (const page of pages) {
    const slug = page.path === '/' ? 'root' : page.path.slice(1).replace(/[/]/g, '__');
    fs.writeFileSync(
      path.join(know, 'pages', `${slug}${page.view ? '__' + page.view : ''}.json`),
      JSON.stringify({ version: 1, ...page }),
      'utf8'
    );
  }
  return root;
}

test.afterEach(() => {
  delete process.env.USERBUG_ROOT;
});

const load = () => import(`../../src/knowledge/capabilities.js?t=${Date.now()}${Math.random()}`);

test('شناسه در مسیر جمع می‌شود، تا هر نمونه یک ردیف نشود', async () => {
  const { normalizeCapabilityRoute: norm } = await load();

  expect(norm('/content/f2e9a6d428')).toBe('/content/:id');
  expect(norm('/users/42/roles')).toBe('/users/:id/roles');
  expect(norm('/book/8f14e45fceea167a5a36dedd4bea2543')).toBe('/book/:id');
  // کلمهٔ آدم شناسه نیست، هرچند کوتاه
  expect(norm('/settings')).toBe('/settings');
  expect(norm('/v2/admin')).toBe('/v2/admin');
  // query می‌افتد: نما فیلدِ خودش را دارد و از خزش می‌آید، نه از حدس
  expect(norm('/contents?tab=all')).toBe('/contents');
});

test('نما فرزندِ صفحهٔ میزبانش می‌شود', async () => {
  withProject({
    states: [
      { id: 'a', route: '/contents', view: '', actions: [] },
      { id: 'b', route: '/contents', view: 'افزودن کتاب', actions: [] },
    ],
  });
  const { rebuild, buildTree } = await load();
  rebuild('demo');

  const { roots } = buildTree('demo');
  const contents = roots.find((one) => one.route === '/contents');
  expect(contents.children.map((one) => one.view)).toEqual(['افزودن کتاب']);
});

test('مسیرِ عمیق زیرِ پیشوندش می‌نشیند، نه در ریشه', async () => {
  withProject({
    states: [
      { id: 'a', route: '/admin', view: '', actions: [] },
      { id: 'b', route: '/admin/users', view: '', actions: [] },
    ],
  });
  const { rebuild, buildTree } = await load();
  rebuild('demo');

  const { roots } = buildTree('demo');
  const admin = roots.find((one) => one.route === '/admin');
  expect(admin.children.map((one) => one.route)).toEqual(['/admin/users']);
});

test('پیشوندِ رشته‌ای کافی نیست؛ مرز باید قطعه باشد', async () => {
  withProject({
    states: [
      { id: 'a', route: '/contents', view: '', actions: [] },
      { id: 'b', route: '/contents-archive', view: '', actions: [] },
    ],
  });
  const { rebuild, buildTree } = await load();
  rebuild('demo');

  const { roots } = buildTree('demo');
  const contents = roots.find((one) => one.route === '/contents');
  // `/contents-archive` قابلیتِ دیگری است، نه زیرمجموعهٔ `/contents`
  expect(contents.children).toEqual([]);
  expect(roots.some((one) => one.route === '/contents-archive')).toBe(true);
});

test('قفسه فقط با دو فرزندِ واقعی ساخته می‌شود', async () => {
  withProject({
    states: [
      { id: 'a', route: '/content/aa11bb22cc', view: '', actions: [] },
      { id: 'b', route: '/content/aa11bb22cc', view: 'منوی مطالعه', actions: [] },
      { id: 'c', route: '/content/aa11bb22cc', view: 'جستجو', actions: [] },
    ],
  });
  const { rebuild, buildTree } = await load();
  rebuild('demo');

  const { flat } = buildTree('demo');
  /**
   * سه گره، ولی **یک** مسیرِ متمایز. قفسه‌ای که سه‌تا را بشمارد، یک
   * تورفتگیِ بی‌فایده می‌سازد — همان باگی که با دادهٔ واقعی پیدا شد.
   */
  expect(flat.some((one) => one.shelf)).toBe(false);
});

test('نما عددِ اجرای صفحهٔ میزبان را به خودش نمی‌گیرد', async () => {
  withProject({
    states: [
      { id: 'a', route: '/contents', view: '', actions: [] },
      { id: 'b', route: '/contents', view: 'افزودن کتاب', actions: [] },
    ],
  });
  const { rebuild, buildTree } = await load();
  rebuild('demo');

  const counts = { '/contents': { scenarios: ['ورود'], runs: 11, findings: 2, openFindings: 1 } };
  const { flat } = buildTree('demo', { counts });

  const page = flat.find((one) => !one.view);
  const view = flat.find((one) => one.view);

  expect(page.counts.runs).toBe(11);
  /**
   * بدترین سبزِ دروغینِ این ماژول: مودالی که هرگز باز نشده، «۱۱ اجرا»
   * نشان می‌داد چون `route`ش با صفحه یکی بود.
   */
  expect(view.counts.runs).toBe(0);
  expect(view.counts.scenarios).toEqual([]);
});

test('دو صفحه با عنوانِ یکسان، عنوانشان به مسیر برمی‌گردد', async () => {
  withProject({
    states: [
      { id: 'a', route: '/login', view: '', title: 'نپی :: مدیریت', actions: [] },
      { id: 'b', route: '/contents', view: '', title: 'نپی :: مدیریت', actions: [] },
    ],
  });
  const { rebuild, buildTree } = await load();
  rebuild('demo');

  const { flat } = buildTree('demo');
  expect(flat.map((one) => one.title).sort()).toEqual(['contents', 'login']);
});

test('روتِ شناسه‌دار عنوانِ یک نمونه را قرض نمی‌گیرد', async () => {
  withProject({
    states: [{ id: 'a', route: '/content/f2e9a6d428', view: '', title: 'گزيده نهج البلاغه', actions: [] }],
  });
  const { rebuild, buildTree } = await load();
  rebuild('demo');

  const { flat } = buildTree('demo');
  // نامِ یک کتاب، نامِ قابلیتِ «خواندنِ هر کتاب» نیست
  expect(flat[0].title).not.toBe('گزيده نهج البلاغه');
  expect(flat[0].route).toBe('/content/:id');
});

test('ویرایشِ کاربر از استخراجِ دوباره جان سالم می‌برد', async () => {
  withProject({
    states: [{ id: 'a', route: '/contents', view: '', title: 'مدیریت فایل‌ها', actions: [] }],
  });
  const { rebuild, buildTree, setEdit, capabilityId } = await load();
  rebuild('demo');

  const id = capabilityId('/contents', '');
  setEdit('demo', id, { title: 'کتاب‌ها', desc: 'قفسهٔ کتاب‌های کاربر' });

  /**
   * هستهٔ همان قاعده‌ای که `merge.js` دارد: تازگی برنده نیست، اعتماد برنده
   * است. استخراج هر بار از نو می‌سازد و **نباید** حرفِ آدم را ببرد.
   */
  rebuild('demo');
  const { flat } = buildTree('demo');
  expect(flat[0].title).toBe('کتاب‌ها');
  expect(flat[0].titleBy).toBe('user');
});

test('قابلیتی که کاربر «حذف شده» زده، از درخت بیرون می‌ماند ولی پاک نمی‌شود', async () => {
  withProject({
    states: [
      { id: 'a', route: '/contents', view: '', actions: [] },
      { id: 'b', route: '/legacy', view: '', actions: [] },
    ],
  });
  const { rebuild, buildTree, setEdit, capabilityId } = await load();
  rebuild('demo');

  setEdit('demo', capabilityId('/legacy', ''), { status: 'gone' });

  expect(buildTree('demo').flat.map((one) => one.route)).toEqual(['/contents']);
  // تاریخچه بی‌صدا کوتاه نمی‌شود: با درخواستِ صریح هنوز آنجاست
  expect(buildTree('demo', { includeGone: true }).flat.length).toBe(2);
});

test('گرهی که این بار پیدا نشد، حذف نمی‌شود — علامت می‌خورد', async () => {
  withProject({
    states: [
      { id: 'a', route: '/contents', view: '', actions: [] },
      { id: 'b', route: '/old', view: '', actions: [] },
    ],
  });
  const { rebuild } = await load();
  rebuild('demo');

  // خزشِ بعدی فقط یکی را دید — مثلاً چون دامنه محدود بود
  const know = path.join(process.env.USERBUG_ROOT, 'knowledge', 'demo');
  fs.writeFileSync(
    path.join(know, 'map.json'),
    JSON.stringify({ version: MAP_VERSION, target: 'demo', states: [{ id: 'a', route: '/contents', view: '', actions: [] }], edges: [] }),
    'utf8'
  );

  const again = rebuild('demo');
  const old = again.nodes.find((one) => one.route === '/old');
  /**
   * نبودن در خزشِ امروز صد دلیل دارد که هیچ‌کدام «حذف شده» نیست. ابزار
   * فقط می‌گوید آخرین بار کِی دیده شد؛ قضاوتش با آدم است.
   */
  expect(old).toBeTruthy();
  expect(old.missing).toBe(true);
});

test('شمارش از مسیرِ جمع‌شده می‌آید، نه از نمونهٔ خام', async () => {
  withProject({
    states: [{ id: 'a', route: '/content/f2e9a6d428', view: '', actions: [] }],
  });
  const { rebuild, buildTree } = await load();
  rebuild('demo');

  /**
   * شاخصِ لمس هم `normalizeCapabilityRoute` می‌زند، پس کلیدش `/content/:id`
   * است. اگر درخت با مسیرِ خام کلید می‌خورد، هر قابلیتِ شناسه‌دار برای
   * همیشه «۰ اجرا» می‌ماند — یعنی همان بخشی که بیشترین کار رویش شده،
   * دست‌نخورده به نظر می‌رسید.
   */
  const counts = { '/content/:id': { scenarios: ['خواندن'], runs: 4, findings: 0, openFindings: 0 } };
  const { flat } = buildTree('demo', { counts });
  expect(flat[0].counts.runs).toBe(4);
});

test('سه لایهٔ نام: مشتق < مدل < کاربر', async () => {
  withProject({
    states: [{ id: 'a', route: '/contents', view: '', title: 'مدیریت فایل‌ها', actions: [] }],
  });
  const { rebuild, buildTree, writeNames, setEdit, capabilityId } = await load();
  rebuild('demo');
  const id = capabilityId('/contents', '');

  // لایهٔ ۱ — مشتق
  expect(buildTree('demo').flat[0].titleBy).toBe('derived');

  // لایهٔ ۲ — مدل بر مشتق می‌چربد: «contents» درست است ولی چیزی نمی‌گوید
  writeNames('demo', { [id]: { title: 'فهرست کتاب‌ها', desc: 'قفسه', by: 'model' } });
  expect(buildTree('demo').flat[0].title).toBe('فهرست کتاب‌ها');
  expect(buildTree('demo').flat[0].titleBy).toBe('model');

  // لایهٔ ۳ — کاربر بر مدل می‌چربد، چون تنها منبعی است که قضاوتِ آدم پشتش است
  setEdit('demo', id, { title: 'کتاب‌های من' });
  expect(buildTree('demo').flat[0].title).toBe('کتاب‌های من');
  expect(buildTree('demo').flat[0].titleBy).toBe('user');
});

test('نامِ مدل از تازه‌سازی جان سالم می‌برد', async () => {
  withProject({
    states: [{ id: 'a', route: '/contents', view: '', actions: [] }],
  });
  const { rebuild, buildTree, writeNames, capabilityId } = await load();
  rebuild('demo');
  writeNames('demo', { [capabilityId('/contents', '')]: { title: 'فهرست کتاب‌ها', by: 'model' } });

  /**
   * `rebuild` کلِ فایلِ مشتق را بازنویسی می‌کند و نام‌ها هم در همان فایل‌اند.
   * بی نگه‌داشتنشان، هر «تازه‌سازی درخت» کارِ مدل را دور می‌ریزد و دفعهٔ
   * بعد دوباره پول می‌گیرد — بی آنکه چیزی خطا بدهد.
   */
  rebuild('demo');
  expect(buildTree('demo').flat[0].title).toBe('فهرست کتاب‌ها');
});

test('نامی که کاربر گذاشته به مدل داده نمی‌شود', async () => {
  withProject({
    states: [
      { id: 'a', route: '/contents', view: '', actions: [] },
      { id: 'b', route: '/login', view: '', actions: [] },
    ],
  });
  const { rebuild, setEdit, capabilityId } = await load();
  rebuild('demo');
  setEdit('demo', capabilityId('/contents', ''), { title: 'کتاب‌های من' });

  const { pendingNames } = await import(`../../src/knowledge/name-caps.js?t=${Date.now()}${Math.random()}`);
  /**
   * نه برای صرفه‌جویی: اگر داده شود، مدل ممکن است «بهترش» کند — و آن
   * دقیقاً همان بازنویسیِ حرفِ آدم است که کلِ `TRUST` برای جلوگیری‌اش
   * نوشته شده.
   */
  expect(pendingNames('demo').map((one) => one.route)).toEqual(['/login']);
});
