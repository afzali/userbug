/**
 * خودآزمای خواندنِ specها از پوشهٔ پروژه.
 *
 * ── چرا استخراجِ مسیر مهم است ──
 *
 * `userbug impact` می‌پرسد «کد عوض شد، کدام تست‌ها باید دوباره فکر شوند؟»
 * و جوابش به همین بستگی دارد: کدام تست کدام صفحه را لمس می‌کند. در YAML
 * فعلِ `go` بود؛ در کد `page.goto(…)`.
 *
 * تستی که جا بیفتد یعنی گزارش می‌گوید «چیزی لازم نیست» در حالی که لازم
 * بوده — همان دروغِ آرامی که `impact.js` برای نگفتنش نوشته شد.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { listSpecs, routesOf } from '../../src/emit/specs.js';

const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ub-specs-'));

test('مسیرها از `page.goto` درمی‌آیند — هر سه شکلِ نقل‌قول', () => {
  expect([...routesOf("await page.goto('/login');")]).toEqual(['/login']);
  expect([...routesOf('await page.goto("/contents");')]).toEqual(['/contents']);
  expect([...routesOf('await page.goto(`/list`);')]).toEqual(['/list']);
});

test('آدرسِ مطلق هم مسیرش درمی‌آید', () => {
  expect([...routesOf("page.goto('http://localhost:5173/books')")]).toEqual(['/books']);
});

test('چند `goto` در یک فایل، همه دیده می‌شوند و تکراری یکی می‌شود', () => {
  const source = `
    await page.goto('/');
    await page.goto('/login');
    await page.goto('/');
  `;
  expect([...routesOf(source)].sort()).toEqual(['/', '/login']);
});

test('`goto`ی متغیر خوانده نمی‌شود — و این پذیرفته است', () => {
  /**
   * نتیجه «شاید لمس کند» می‌شود، نه «لمس نمی‌کند». بدترین حالتش یک تستِ
   * اضافه در فهرستِ پیشنهادی است، نه تستی که جا بماند.
   */
  expect([...routesOf('await page.goto(url);')]).toEqual([]);
  expect([...routesOf('await page.goto(`/book/${id}`);')]).toEqual([]);
});

test('`listSpecs` فقط `.spec.js`های ریشه را می‌خواند', () => {
  const root = temporary();
  try {
    fs.writeFileSync(
      path.join(root, 'ورود.spec.js'),
      "import { test } from 'userbug/test';\n" +
        "test('ورود', async ({ page, ub }) => {\n" +
        "  await ub.step('باز کردن', async () => { await page.goto('/login'); });\n" +
        '});\n',
      'utf8'
    );
    fs.writeFileSync(path.join(root, 'یادداشت.md'), '# نه', 'utf8');
    fs.mkdirSync(path.join(root, '.local'), { recursive: true });
    fs.writeFileSync(path.join(root, '.local', 'پنهان.spec.js'), "page.goto('/secret')", 'utf8');

    const found = listSpecs(root);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('ورود.spec.js');
    expect(found[0].name).toBe('ورود');
    expect([...found[0].routes]).toEqual(['/login']);
    expect(found[0].steps).toEqual(['باز کردن']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('پوشهٔ نبوده، خطا نمی‌دهد', () => {
  // پروژه‌ای که هنوز `init --workspace` نزده، نباید کلِ گزارش را بخواباند
  expect(listSpecs(path.join(os.tmpdir(), 'ub-نبوده-' + Date.now()))).toEqual([]);
  expect(listSpecs('')).toEqual([]);
});
