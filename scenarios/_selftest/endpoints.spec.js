/**
 * خودآزمای پوششِ بک‌اند.
 *
 * ── چرا این یکی خطای «خوش‌بینانه» را می‌گیرد ──
 *
 * گزارشِ پوششِ غلط، قرمز نمی‌شود: عددی نشان می‌دهد و آدم باور می‌کند. دو
 * شکلِ خطا هر دو روی نپی واقعاً افتادند:
 *
 *   ۱. آشکارساز کور باشد → «۰ endpoint» و کسی نمی‌فهمد کلِ بک‌اند بیرونِ
 *      حساب مانده. نخستین اجرا دقیقاً همین بود.
 *   ۲. آشکارساز پرحرف باشد → نُه endpoint از فایل‌های **تست** درآمد
 *      (`/p1`, `/books/b1`)، و گزارشی ساخت دربارهٔ چیزی که سرو نمی‌شود.
 */
import { test, expect } from '@playwright/test';
import { discoverEndpoints, endpointCoverage, normalizePath } from '../../src/knowledge/endpoints.js';

const reader = (map) => async (file) => map[file] || '';

test('شناسه در مسیر، جای‌نگهدار می‌شود', () => {
  // وگرنه `/books/12` و `/books/13` دو endpointِ جدا شمرده می‌شوند
  expect(normalizePath('http://x/api/books/42?q=1')).toBe('/api/books/:id');
  expect(normalizePath('/content/[id_book]')).toBe('/content/:id');
  expect(normalizePath('/users/3f2a1b9c8d7e6f50')).toBe('/users/:id');
  expect(normalizePath('/a/')).toBe('/a');
  expect(normalizePath('')).toBe('');
});

test('switch روی «فعل و مسیر» دیده می‌شود', async () => {
  // شکلِ APIِ بی‌فریم‌ورک، و همان چیزی که کلِ بک‌اندِ نپی را نامرئی کرده بود
  const files = ['server/public/index.php'];
  const map = {
    'server/public/index.php': `
      switch ("$method $path") {
        case 'GET /health': return ok();
        case 'POST /auth/login': return login();
        case "DELETE /keys/mine": return drop();
      }`,
  };
  const { endpoints, byDetector } = await discoverEndpoints({ files, read: reader(map) });

  expect(byDetector['switch-case']).toBe(3);
  expect(endpoints.map((one) => `${one.methods.join(',')} ${one.path}`)).toEqual([
    'GET /health',
    'POST /auth/login',
    'DELETE /keys/mine',
  ]);
});

test('فایلِ آزمون endpoint نیست', async () => {
  // نخستین اجرا نُه endpoint داد و هر نُه از تست‌های خودِ پروژه بود
  const files = ['server/tests/api.test.js', 'src/routes/x/+server.js'];
  const map = {
    'server/tests/api.test.js': `router.get('/p1'); router.get('/books/b1');`,
    'src/routes/x/+server.js': 'export async function GET() {}',
  };
  const { endpoints } = await discoverEndpoints({ files, read: reader(map) });

  expect(endpoints.map((one) => one.path)).toEqual(['/x']);
});

test('فعل‌های یک هندلر از خودِ فایل درمی‌آیند', async () => {
  const files = ['src/routes/api/books/+server.js'];
  const map = {
    'src/routes/api/books/+server.js':
      'export async function GET() {}\nexport const POST = () => {}\nexport async function DELETE() {}',
  };
  const { endpoints } = await discoverEndpoints({ files, read: reader(map) });

  expect(endpoints[0].path).toBe('/api/books');
  expect(endpoints[0].methods.sort()).toEqual(['DELETE', 'GET', 'POST']);
});

test('پوشش یعنی تفریق، و فعلِ نیازموده هم شمرده می‌شود', () => {
  /**
   * `GET /keys` را هزار بار زده‌ایم و `DELETE` همان مسیر را هرگز — و دومی
   * دقیقاً همان‌جاست که باگ می‌نشیند. با شمردنِ مسیر، این تفاوت گم می‌شد.
   */
  const endpoints = [
    { path: '/auth/login', methods: ['POST'] },
    { path: '/keys', methods: ['GET', 'DELETE'] },
  ];
  const coverage = endpointCoverage(endpoints, [
    { method: 'GET', path: 'http://127.0.0.1:8081/keys' },
    { method: 'GET', path: '/some/other' },
  ]);

  expect(coverage.untouched.map((one) => one.path)).toEqual(['/auth/login']);
  expect(coverage.partial.map((one) => `${one.path}:${one.untried}`)).toEqual(['/keys:DELETE']);
  // مسیری که صدا خورد و در سورس نبود، خودش خبر است: یا آشکارساز کور است یا بیرونی
  expect(coverage.unknown).toEqual(['/some/other']);
});

test('بی تماس، همه‌چیز نیازموده است — نه «پوشش کامل»', () => {
  // سکوت در اینجا یعنی پوششِ خوش‌بینانه، بدترین نوعِ گزارش
  const coverage = endpointCoverage([{ path: '/a', methods: ['GET'] }], []);
  expect(coverage.untouched).toHaveLength(1);
  expect(coverage.partial).toHaveLength(0);
});

test('آدرسِ مطلقِ بک‌اند با مسیرِ سورس یکی می‌شود', () => {
  // API روی پورتِ دیگری است؛ بی این، هیچ تماسی هرگز تطبیق نمی‌خورد
  const coverage = endpointCoverage(
    [{ path: '/auth/login', methods: ['POST'] }],
    [{ method: 'POST', path: 'http://127.0.0.1:8081/auth/login' }]
  );
  expect(coverage.untouched).toEqual([]);
});
