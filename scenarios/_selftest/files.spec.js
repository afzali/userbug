/**
 * خودآزمای آپلود و دانلود.
 *
 * ── چرا این فایل هست ──
 *
 * فعل `download` تا دیروز همیشه `readFile(..., 'utf8')` می‌زد. برای متن درست
 * بود و برای PDF و ZIP و تصویر یک رشتهٔ مخدوش در متغیر می‌نشست **بی‌آنکه چیزی
 * بشکند**. یعنی سناریویی که PDF دانلود می‌کند سبز می‌شد و هیچ نمی‌گفت.
 *
 * و `upload` اصلاً وجود نداشت، پس هیچ سناریویی نمی‌توانست فایل بفرستد — در
 * ابزاری که قرار است مثل کاربر واقعی رفتار کند.
 *
 * ── چرا صفحهٔ محلی و نه یک اپ واقعی ──
 *
 * این‌ها قاعده‌اند نه رفتارِ یک پروژه. صفحهٔ ساختگی هر دو مسیر آپلود
 * (`input` مستقیم و `filechooser`) و دانلودِ باینری را قطعی و بی‌سرور
 * می‌سازد.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../../src/fixtures.js';
import { runScenario } from '../../src/scenario/run.js';
import { fixturesDir, listFixtures, resolveFixture } from '../../src/knowledge/fixtures.js';

test.use({ probe: true });

/**
 * صفحه‌ای که هر سه قابلیت را دارد.
 *
 * دانلود با `Blob` و `URL.createObjectURL` ساخته می‌شود تا بایتِ واقعی رد و
 * بدل شود، نه یک data-URI متنی.
 */
const PAGE = `<!doctype html><html lang="fa" dir="rtl"><head><title>فایل</title></head><body>
  <input id="direct" type="file" aria-label="انتخاب فایل" />
  <input id="hidden" type="file" style="display:none" />
  <button id="pick" type="button">بارگذاری</button>
  <a id="dl" href="#">دانلود گزارش</a>
  <a id="empty" href="#">دانلود خالی</a>
  <p id="log">—</p>
<script>
  document.getElementById('pick').onclick = () => document.getElementById('hidden').click();
  for (const id of ['direct', 'hidden']) {
    document.getElementById(id).onchange = (e) => {
      document.getElementById('log').textContent = [...e.target.files].map((f) => f.name + ':' + f.size).join(',');
    };
  }
  function grab(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
  }
  document.getElementById('dl').onclick = (e) => { e.preventDefault(); grab(new Uint8Array([0x25,0x50,0x44,0x46,0,1,2,3,255,254]), 'گزارش ماهانه.pdf'); };
  document.getElementById('empty').onclick = (e) => { e.preventDefault(); grab(new Uint8Array([]), 'خالی.bin'); };
</script>
</body></html>`;

const TARGET = process.env.UB_TARGET || 'nepi';

/**
 * یک fixture واقعی روی دیسک.
 *
 * ساخته و پاک می‌شود، چون `fixtures/` جای فایل‌های خودِ کاربر است و خودآزما
 * نباید در آن چیزی جا بگذارد — همان درسی که انبارِ شناخت یک بار به‌سختی داد.
 */
function withFixture(name, contents) {
  const dir = fixturesDir(TARGET);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return { file, cleanup: () => fs.rmSync(file, { force: true }) };
}

async function run(page, ub, steps) {
  return await runScenario({
    page,
    ub,
    identity: { email: 'a@b.c', password: 'x' },
    scenario: { id: 'files-selftest', name: 'files', steps },
  });
}

test('دانلودِ باینری سالم می‌ماند و در پوشهٔ اجرا ذخیره می‌شود', async ({ page, ub }) => {
  await page.setContent(PAGE);

  const ctx = await run(page, ub, [
    { download: { click: { role: 'link', name: 'دانلود گزارش' }, saveAs: 'pdf' } },
  ]);

  const info = ctx.vars.pdf;
  expect(info.size).toBe(10);
  expect(info.empty).toBe(false);
  expect(info.filename).toBe('گزارش ماهانه.pdf');
  expect(info.relative).toMatch(/^downloads\//);

  // بایت‌ها باید دقیقاً همان چیزی باشند که صفحه فرستاد؛ نسخهٔ قبلی اینجا
  // رشتهٔ مخدوش می‌داد و کسی نمی‌فهمید
  const bytes = fs.readFileSync(info.path);
  expect([...bytes]).toEqual([0x25, 0x50, 0x44, 0x46, 0, 1, 2, 3, 255, 254]);
});

test('دانلودِ متنی هنوز رشته می‌دهد تا سناریوهای موجود نشکنند', async ({ page, ub }) => {
  await page.setContent(`<!doctype html><body><a id="t" href="data:text/plain,%D8%AE%D8%B7%20%DB%B1%0A%D8%AE%D8%B7%20%DB%B2" download="code.txt">متن</a></body>`);

  const ctx = await run(page, ub, [
    { download: { click: { role: 'link', name: 'متن' }, saveAs: 'code', as: 'text', line: 1 } },
  ]);

  expect(typeof ctx.vars.code).toBe('string');
  expect(ctx.vars.code).toBe('خط ۲');
  expect(ctx.vars.codeFilename).toBe('code.txt');
  // اطلاعاتِ فایل هنوز در دسترس است، فقط جای دیگری
  expect(ctx.vars.codeFile.size).toBeGreaterThan(0);
});

test('فایلِ صفر بایت، expect را می‌شکند', async ({ page, ub }) => {
  await page.setContent(PAGE);

  const ctx = await run(page, ub, [{ download: { click: { role: 'link', name: 'دانلود خالی' }, saveAs: 'z' } }]);
  expect(ctx.vars.z.empty).toBe(true);

  /**
   * اپی که دکمهٔ دانلود دارد و صفر بایت می‌دهد، از اپی که اصلاً دکمه ندارد
   * بدتر است: کاربر فکر می‌کند کارش انجام شده.
   */
  await expect(
    run(page, ub, [
      { download: { click: { role: 'link', name: 'دانلود خالی' }, saveAs: 'z2' } },
      { expect: { download: { var: 'z2' } } },
    ])
  ).rejects.toThrow();
});

test('expect روی دانلود: اندازه و نامِ فایل', async ({ page, ub }) => {
  await page.setContent(PAGE);

  await run(page, ub, [
    { download: { click: { role: 'link', name: 'دانلود گزارش' }, saveAs: 'pdf' } },
    { expect: { download: { var: 'pdf', minSize: 5, filename: '\\.pdf$' } } },
  ]);

  // اندازهٔ غلط باید بشکند، وگرنه این سنجش فقط تزئین است
  await expect(
    run(page, ub, [
      { download: { click: { role: 'link', name: 'دانلود گزارش' }, saveAs: 'p2' } },
      { expect: { download: { var: 'p2', minSize: 10_000 } } },
    ])
  ).rejects.toThrow();
});

test('آپلود روی input مستقیم', async ({ page, ub }) => {
  const { cleanup } = withFixture('نمونه.txt', 'سلام');
  try {
    await page.setContent(PAGE);
    await run(page, ub, [{ upload: { to: { label: 'انتخاب فایل' }, file: 'fixtures/نمونه.txt' } }]);
    await expect(page.locator('#log')).toHaveText(/نمونه\.txt:8/);
  } finally {
    cleanup();
  }
});

test('آپلود از راه دکمه‌ای که input را پنهان کرده', async ({ page, ub }) => {
  const { cleanup } = withFixture('نمونه.txt', 'سلام');
  try {
    await page.setContent(PAGE);
    // در اپ‌های امروزی این حالت از input آشکار رایج‌تر است
    await run(page, ub, [{ upload: { trigger: { role: 'button', name: 'بارگذاری' }, file: 'نمونه.txt' } }]);
    await expect(page.locator('#log')).toHaveText(/نمونه\.txt/);
  } finally {
    cleanup();
  }
});

test('آپلود بیرون از پوشهٔ fixtures ممکن نیست', async () => {
  const target = TARGET;
  /**
   * این رشته را ممکن است **مدل** نوشته باشد. اگر مسیر آزاد بود،
   * `../../../.env` یک آپلودِ کامل به اپِ تحت تست بود.
   */
  await expect(resolveFixture(target, '../../../.env')).rejects.toThrow();
  await expect(resolveFixture(target, '/etc/passwd')).rejects.toThrow();
  await expect(resolveFixture(target, '')).rejects.toThrow();
});

test('فایلِ رازدار حتی داخل fixtures آپلود نمی‌شود', async () => {
  const target = TARGET;
  const { cleanup } = withFixture('.env', 'SECRET=1');
  try {
    await expect(resolveFixture(target, '.env')).rejects.toThrow(/راز/);
    // و در فهرست هم دیده نمی‌شود، وگرنه رابط پیشنهادش می‌کرد
    expect((await listFixtures(target)).some((item) => item.relative.endsWith('.env'))).toBe(false);
  } finally {
    cleanup();
  }
});

test('فایلِ ناموجود پیامِ روشن می‌دهد، نه خطای سیستمی', async () => {
  await expect(resolveFixture(TARGET, 'نیست.pdf')).rejects.toThrow(/پیدا نشد/);
});

test('upload بدون to و trigger بلند می‌شکند', async ({ page, ub }) => {
  const { cleanup } = withFixture('نمونه.txt', 'سلام');
  try {
    await page.setContent(PAGE);
    await expect(run(page, ub, [{ upload: { file: 'نمونه.txt' } }])).rejects.toThrow(/to|trigger/);
  } finally {
    cleanup();
  }
});

test('دو دانلود با یک نام، هر دو می‌مانند', async ({ page, ub }) => {
  await page.setContent(PAGE);
  const ctx = await run(page, ub, [
    { download: { click: { role: 'link', name: 'دانلود گزارش' }, saveAs: 'a' } },
    { download: { click: { role: 'link', name: 'دانلود گزارش' }, saveAs: 'b' } },
  ]);

  expect(ctx.vars.a.path).not.toBe(ctx.vars.b.path);
  expect(fs.existsSync(ctx.vars.a.path)).toBe(true);
  expect(fs.existsSync(ctx.vars.b.path)).toBe(true);
});

