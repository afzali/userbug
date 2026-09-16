/**
 * خودآزمای «زاویه‌های آزمون».
 *
 * ── چرا این فایل هست ──
 *
 * زاویه‌ها از **شمارشِ نقش‌ها** درمی‌آیند، و شمارشِ غلط هیچ‌وقت خطا نمی‌دهد:
 * فقط یک فهرستِ خوش‌قیافه می‌سازد که یا زاویهٔ لازم را ندارد یا شاهدش
 * دروغ می‌گوید.
 *
 * هر دو یک بار با دادهٔ واقعیِ نپی اتفاق افتادند:
 *
 *   «۸۸ دکمه در این نما» — چهار حالتِ هم‌مسیر در نقشه، کنش‌هایشان دو بار
 *   شمرده شده بودند. واقعیت ۴۲ بود.
 *
 *   مودالِ «افزودن کتاب جدید» هیچ زاویهٔ «ورودیِ خالی» نگرفت، چون دکمهٔ
 *   ثبتش («بارگذاری») بینِ شش دکمهٔ نوارِ کناریِ پشتِ مودال گم شده بود.
 *   یعنی همان نمایی که هرگز باز نشده بود، بی‌مفیدترین زاویه‌اش ماند.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { MAP_VERSION } from '../../src/map/store.js';

function withProject({ states = [], edges = [], dossier = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-angle-'));
  process.env.USERBUG_ROOT = root;

  const know = path.join(root, 'knowledge', 'demo');
  fs.mkdirSync(path.join(know, 'pages'), { recursive: true });
  fs.writeFileSync(
    path.join(know, 'map.json'),
    JSON.stringify({ version: MAP_VERSION, target: 'demo', states, edges }),
    'utf8'
  );
  if (dossier) {
    fs.writeFileSync(path.join(know, 'dossier.json'), JSON.stringify({ version: 1, ...dossier }), 'utf8');
  }
  return root;
}

test.afterEach(() => {
  delete process.env.USERBUG_ROOT;
});

const load = async () => ({
  ...(await import(`../../src/knowledge/angles.js?t=${Date.now()}${Math.random()}`)),
  caps: await import(`../../src/knowledge/capabilities.js?t=${Date.now()}${Math.random()}`),
});

const act = (key, role, label, extra = {}) => ({ key, role, label, kind: 'unknown', ...extra });

/** گرهِ درخت، ساخته از همان استخراجِ واقعی — تا تست با محصولِ واقعی بخواند. */
async function nodeOf(caps, route, view = '') {
  caps.rebuild('demo');
  return caps.buildTree('demo').flat.find((one) => one.route === route && (one.view || '') === view);
}

test('ورودیِ متنی + دکمهٔ ثبت، زاویهٔ «خالی» و «مرزی» می‌سازد', async () => {
  withProject({
    states: [
      {
        id: 'a',
        route: '/signup',
        view: '',
        actions: [act('1', 'textbox', 'ایمیل'), act('2', 'textbox', 'رمز'), act('3', 'button', 'ثبت‌نام')],
      },
    ],
  });
  const { anglesFor, caps } = await load();

  const angles = anglesFor('demo', await nodeOf(caps, '/signup'));
  expect(angles.map((one) => one.angle).sort()).toEqual(['edge', 'empty', 'happy', 'persist']);
  // شاهد باید عددِ واقعی بدهد، وگرنه شاهد نیست
  expect(angles.find((one) => one.angle === 'empty').evidence).toContain('2 ورودیِ متنی');
});

test('کنشِ تکراری دو بار شمرده نمی‌شود', async () => {
  withProject({
    states: [
      { id: 'a', route: '/contents', view: '', actions: [act('k1', 'button', 'یک'), act('k2', 'button', 'دو')] },
      /** همان مسیر و همان نما، حالتِ دیگری از نقشه — با همان کلیدها. */
      { id: 'b', route: '/contents', view: '', actions: [act('k1', 'button', 'یک'), act('k3', 'button', 'سه')] },
    ],
  });
  const { anglesFor, caps } = await load();

  const happy = anglesFor('demo', await nodeOf(caps, '/contents')).find((one) => one.angle === 'happy');
  /**
   * سه دکمهٔ یکتا، نه چهار. روی نپی همین باگ «۸۸ دکمه» می‌داد در حالی که
   * ۴۲ تا بود — و شاهدی که عددش غلط باشد، بدتر از نبودنش است.
   */
  expect(happy.evidence).toContain('3 دکمه');
});

test('نوارِ کناریِ پشتِ مودال، کنشِ مودال حساب نمی‌شود', async () => {
  withProject({
    states: [
      {
        id: 'page',
        route: '/contents',
        view: '',
        actions: [act('nav1', 'button', 'خانه'), act('nav2', 'button', 'هوش مصنوعی')],
      },
      {
        id: 'modal',
        route: '/contents',
        view: 'افزودن کتاب',
        actions: [
          act('nav1', 'button', 'خانه'),
          act('nav2', 'button', 'هوش مصنوعی'),
          act('t1', 'textbox', 'عنوان'),
          act('up', 'button', 'بارگذاری'),
        ],
      },
    ],
    edges: [{ from: 'page', to: 'modal' }],
  });
  const { anglesFor, caps } = await load();

  const angles = anglesFor('demo', await nodeOf(caps, '/contents', 'افزودن کتاب'));
  const happy = angles.find((one) => one.angle === 'happy');

  /**
   * یک دکمه، نه سه: «خانه» و «هوش مصنوعی» پشتِ مودال‌اند و در DOM مانده‌اند،
   * پس تنها دکمهٔ خودِ مودال «بارگذاری» است.
   *
   * و مهم‌تر از عدد — زاویهٔ «خالی» باید ساخته شود، که پیش از این تفریق
   * نمی‌شد: دکمهٔ واقعیِ ثبت بینِ نوارِ کناری گم بود.
   */
  expect(happy.evidence).toContain('1 دکمه');
  expect(angles.some((one) => one.angle === 'empty')).toBe(true);
});

test('نما زاویهٔ «لغو» می‌گیرد، صفحه نمی‌گیرد', async () => {
  withProject({
    states: [
      { id: 'p', route: '/x', view: '', actions: [act('c0', 'button', 'انصراف')] },
      { id: 'm', route: '/x', view: 'مودال', actions: [act('c1', 'button', 'انصراف')] },
    ],
  });
  const { anglesFor, caps } = await load();

  expect(anglesFor('demo', await nodeOf(caps, '/x', 'مودال')).some((one) => one.angle === 'cancel')).toBe(true);
  // «بستنِ» یک صفحه معنایی ندارد؛ ردیفی که هیچ‌وقت باگ پیدا نمی‌کند، نویز است
  expect(anglesFor('demo', await nodeOf(caps, '/x')).some((one) => one.angle === 'cancel')).toBe(false);
});

test('زاویهٔ «بی ورود» فقط وقتی اپ ورود دارد', async () => {
  withProject({
    states: [{ id: 'a', route: '/contents', view: '', actions: [act('1', 'button', 'برو')] }],
  });
  const { anglesFor, caps } = await load();
  /**
   * روی اپِ بی‌احراز، «بی ورود چه می‌شود» پرسشِ بی‌معنایی است و فهرست را با
   * ردیفی پر می‌کند که هیچ‌وقت چیزی پیدا نمی‌کند.
   */
  expect(anglesFor('demo', await nodeOf(caps, '/contents')).some((one) => one.angle === 'anon')).toBe(false);

  withProject({
    states: [{ id: 'a', route: '/contents', view: '', actions: [act('1', 'button', 'برو')] }],
    dossier: { target: 'demo', auth: { kind: 'form', loginPath: '/login' }, routes: [] },
  });
  const again = await load();
  expect(
    again.anglesFor('demo', await nodeOf(again.caps, '/contents')).some((one) => one.angle === 'anon')
  ).toBe(true);
});

test('صفحهٔ ورود زاویهٔ «بی ورود» نمی‌گیرد', async () => {
  withProject({
    states: [{ id: 'a', route: '/login', view: '', actions: [act('1', 'button', 'ورود')] }],
    dossier: { target: 'demo', auth: { kind: 'form', loginPath: '/login' }, routes: [] },
  });
  const { anglesFor, caps } = await load();
  // «بی ورود به صفحهٔ ورود برو» جمله‌ای است که خودش را نقض می‌کند
  expect(anglesFor('demo', await nodeOf(caps, '/login')).some((one) => one.angle === 'anon')).toBe(false);
});

test('کنشِ مخرب زاویهٔ «تأیید» می‌سازد', async () => {
  withProject({
    states: [
      {
        id: 'a',
        route: '/contents',
        view: '',
        actions: [act('d', 'button', 'حذف', { kind: 'destructive' })],
      },
    ],
  });
  const { anglesFor, caps } = await load();

  const confirm = anglesFor('demo', await nodeOf(caps, '/contents')).find((one) => one.angle === 'confirm');
  expect(confirm).toBeTruthy();
  // خودِ حذف انجام نمی‌شود؛ پرسش این است که آیا **می‌پرسد**
  expect(confirm.text).toContain('تأیید بخواهد');
});

test('هر زاویه شاهد دارد', async () => {
  withProject({
    states: [
      {
        id: 'a',
        route: '/x',
        view: '',
        actions: [act('1', 'textbox', 'نام'), act('2', 'button', 'ذخیره'), act('3', 'switch', 'الف'), act('4', 'radio', 'ب')],
      },
    ],
  });
  const { anglesFor, caps } = await load();

  const angles = anglesFor('demo', await nodeOf(caps, '/x'));
  expect(angles.length).toBeGreaterThan(2);
  /**
   * همان قاعده‌ای که `propose.js` رویش بنا شده: فهرستی که از هوا پر شود،
   * کاربر دو بار بررسی می‌کند، دو بار چیزی پیدا نمی‌کند، و بار سوم
   * می‌بنددش.
   */
  for (const angle of angles) {
    expect(angle.evidence, angle.title).toBeTruthy();
    expect(angle.why, angle.title).toBeTruthy();
    expect(angle.text, angle.title).toBeTruthy();
  }
});

test('نمایی که هیچ کنشِ خودش ندارد، زاویه‌ای نمی‌سازد', async () => {
  withProject({
    states: [
      { id: 'p', route: '/x', view: '', actions: [act('a', 'button', 'یک')] },
      { id: 'v', route: '/x', view: 'کشو', actions: [act('a', 'button', 'یک')] },
    ],
    edges: [{ from: 'p', to: 'v' }],
  });
  const { anglesFor, caps } = await load();
  // جایی که خزش نرفته، حدس هم نمی‌زنیم — سکوت صادقانه‌تر از فهرستِ ساختگی است
  expect(anglesFor('demo', await nodeOf(caps, '/x', 'کشو'))).toEqual([]);
});

test('سناریوی موجود، زاویه را «شاید پوشش دارد» می‌کند', async () => {
  withProject({
    states: [
      { id: 'a', route: '/x', view: '', actions: [act('1', 'textbox', 'نام'), act('2', 'button', 'ذخیره')] },
    ],
  });
  const { anglesFor, caps } = await load();

  const angles = anglesFor('demo', await nodeOf(caps, '/x'), { covered: ['همه‌چیز خالی، بعد ثبت'] });
  expect(angles.find((one) => one.angle === 'empty').covered).toBe(true);
  expect(angles.find((one) => one.angle === 'happy').covered).toBe(false);
});

test('اپی که صریحاً می‌گوید ورود ندارد، زاویهٔ «بی ورود» نمی‌گیرد', async () => {
  withProject({
    states: [{ id: 'a', route: '/contents', view: '', actions: [act('1', 'button', 'برو')] }],
    dossier: { target: 'demo', auth: { kind: 'none' }, routes: [] },
  });
  const { anglesFor, caps } = await load();
  /**
   * `none` قوی‌ترین نشانهٔ «نساز» است، نه ضعیف‌ترین. شرطِ اول فقط
   * `unknown` را می‌گرفت، پس پروژه‌ای که بیشترین اطمینان را دربارهٔ خودش
   * داده بود، ردیفی می‌گرفت که هیچ‌وقت چیزی پیدا نمی‌کند.
   */
  expect(anglesFor('demo', await nodeOf(caps, '/contents')).some((one) => one.angle === 'anon')).toBe(false);
});
