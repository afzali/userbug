/**
 * خودآزمای بسته‌بندیِ پروژه.
 *
 * ── چرا این یکی بی‌صدا خراب می‌شود ──
 *
 * بستهٔ ناقص خطا نمی‌دهد: فایلی ساخته می‌شود، وارد هم می‌شود، و تازه
 * هفته‌ها بعد معلوم می‌شود نقشه یا فایلِ نمونه‌اش نیامده. و بدتر از آن،
 * بسته‌ای که رمز داشته باشد — چون همان فایلی است که آدم برای دیگران
 * می‌فرستد.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';

function withProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-bundle-'));
  process.env.USERBUG_ROOT = root;

  fs.mkdirSync(path.join(root, 'targets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'targets', 'demo.config.js'), 'export default { baseURL: "http://x" };\n');

  const know = path.join(root, 'knowledge', 'demo');
  fs.mkdirSync(path.join(know, 'fixtures'), { recursive: true });
  fs.mkdirSync(path.join(know, 'pages'), { recursive: true });
  fs.writeFileSync(path.join(know, 'map.json'), JSON.stringify({ states: [{ id: 'a' }, { id: 'b' }] }));
  fs.writeFileSync(path.join(know, 'pages', 'login.json'), JSON.stringify({ path: '/login' }));
  fs.writeFileSync(
    path.join(know, 'credentials.json'),
    JSON.stringify({ accounts: [{ id: 'a', email: 'a@a.a', password: 'راز', note: 'تست' }] })
  );
  fs.writeFileSync(path.join(know, 'fixtures', 'seed.json'), 'دادهٔ نمونه');
  fs.writeFileSync(path.join(know, 'brief.md'), 'این اپ یک کتاب‌خوان است.');
  fs.mkdirSync(path.join(know, 'plans'), { recursive: true });
  fs.writeFileSync(
    path.join(know, 'plans', 'کتاب.json'),
    JSON.stringify({ version: 1, slug: 'کتاب', goal: 'ابزارهای متن', scope: ['/content/[id]'] })
  );

  const scen = path.join(root, 'scenarios', 'demo');
  fs.mkdirSync(path.join(scen, '_drafts'), { recursive: true });
  fs.writeFileSync(path.join(scen, 'ورود.yml'), 'name: ورود\nsteps:\n  - go: /\n');
  fs.writeFileSync(path.join(scen, '_drafts', 'x.yml'), 'name: x\nsteps: []\n');

  return root;
}

test.afterEach(() => {
  delete process.env.USERBUG_ROOT;
});

test('بسته همه‌چیز را برمی‌دارد جز رمز', async () => {
  withProject();
  const { exportBundle } = await import(`../../src/knowledge/bundle.js?a=${Date.now()}`);
  const bundle = exportBundle('demo');

  expect(bundle.config).toContain('baseURL');
  expect(bundle.knowledge['map.json'].states).toHaveLength(2);
  expect(bundle.knowledge['pages/login.json'].path).toBe('/login');
  expect(Object.keys(bundle.scenarios).sort()).toEqual(['_drafts/x.yml', 'ورود.yml']);
  expect(bundle.fixtures['seed.json']).toBeTruthy();

  // ── مهم‌ترین ادعا: رمز نباید در فایلی باشد که آدم می‌فرستد
  const text = JSON.stringify(bundle);
  expect(text).not.toContain('راز');
  expect(bundle.knowledge['credentials.json'].accounts[0].email).toBe('a@a.a');
  expect(bundle.omitted.join(' ')).toContain('رمز');
});

test('واردکردن، پروژه را کامل برمی‌گرداند — با نامِ دلخواه', async () => {
  const root = withProject();
  const { exportBundle, importBundle } = await import(`../../src/knowledge/bundle.js?b=${Date.now()}`);
  const bundle = exportBundle('demo');

  const result = importBundle(bundle, { as: 'copy' });
  expect(result.target).toBe('copy');

  expect(fs.existsSync(path.join(root, 'targets', 'copy.config.js'))).toBe(true);
  expect(fs.existsSync(path.join(root, 'scenarios', 'copy', 'ورود.yml'))).toBe(true);
  // فایلِ نمونه باید **بایت به بایت** برگردد، نه base64
  expect(fs.readFileSync(path.join(root, 'knowledge', 'copy', 'fixtures', 'seed.json'), 'utf8')).toBe('دادهٔ نمونه');
  expect(JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'copy', 'map.json'), 'utf8')).states).toHaveLength(2);
});

test('فایلِ موجود بی `force` بازنویسی نمی‌شود', async () => {
  const root = withProject();
  const { exportBundle, importBundle } = await import(`../../src/knowledge/bundle.js?c=${Date.now()}`);
  const bundle = exportBundle('demo');

  // کارِ تازه‌ای که نباید با واردکردن برود
  fs.writeFileSync(path.join(root, 'scenarios', 'demo', 'ورود.yml'), 'name: دست‌نویس\nsteps: []\n');

  const result = importBundle(bundle);
  expect(result.skipped.join(' ')).toContain('ورود.yml');
  expect(fs.readFileSync(path.join(root, 'scenarios', 'demo', 'ورود.yml'), 'utf8')).toContain('دست‌نویس');

  importBundle(bundle, { force: true });
  expect(fs.readFileSync(path.join(root, 'scenarios', 'demo', 'ورود.yml'), 'utf8')).toContain('name: ورود');
});

test('نسخهٔ ناشناخته صریح رد می‌شود', async () => {
  withProject();
  const { importBundle } = await import(`../../src/knowledge/bundle.js?d=${Date.now()}`);
  // بستهٔ نسخهٔ بعدی را نیمه‌کاره وارد کردن، بدتر از وارد نکردن است
  expect(() => importBundle({ version: 99, target: 'x' })).toThrow(/نسخه/);
});

test('نامِ هدفِ خطرناک وارد نمی‌شود', async () => {
  withProject();
  const { importBundle } = await import(`../../src/knowledge/bundle.js?e=${Date.now()}`);
  // نامِ هدف به مسیرِ فایل تبدیل می‌شود؛ `../` یعنی نوشتن بیرون از پروژه
  expect(() => importBundle({ version: 1, target: '../evil' })).toThrow(/نامِ هدف/);
});

test('توضیحِ پروژه و نقشه‌های کار هم در بسته‌اند', async () => {
  /**
   * ── چرا این دو جداگانه سنجیده می‌شوند ──
   *
   * فهرستِ بسته یک whitelist است، نه یک `walk` روی کلِ پوشه. هر چیزِ تازه‌ای
   * که به `knowledge/` اضافه شود، **پیش‌فرض بیرون می‌ماند** — و بیرون ماندنش
   * خطا نمی‌دهد: بسته ساخته می‌شود، وارد هم می‌شود، و هفته‌ها بعد معلوم
   * می‌شود.
   *
   * و هزینهٔ نبودنشان بالاست: توضیحِ پروژه سرِ هر prompt می‌نشیند، و هر
   * مأموریت یک فراخوانی مدل به‌علاوهٔ یک دور اصلاحِ دستی است.
   */
  const root = withProject();
  const { exportBundle, importBundle, describeBundle } = await import(`../../src/knowledge/bundle.js?f=${Date.now()}`);
  const bundle = exportBundle('demo');

  expect(bundle.brief).toContain('کتاب‌خوان');
  expect(bundle.knowledge['plans/کتاب.json'].goal).toBe('ابزارهای متن');
  expect(describeBundle(bundle)).toMatchObject({ brief: true, missions: 1 });

  importBundle(bundle, { as: 'copy' });
  // markdown باید متن برگردد، نه JSONِ نقل‌قول‌دار
  expect(fs.readFileSync(path.join(root, 'knowledge', 'copy', 'brief.md'), 'utf8')).toBe('این اپ یک کتاب‌خوان است.');
  expect(fs.existsSync(path.join(root, 'knowledge', 'copy', 'plans', 'کتاب.json'))).toBe(true);
});
