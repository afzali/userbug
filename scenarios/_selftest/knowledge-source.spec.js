/**
 * خودآزمای هضمِ سورس.
 *
 * دو چیز جدا سنجیده می‌شود:
 *
 *   ۱. **کشفِ روت**، که قاعده‌ای است و باید روی هر فریم‌ورک قطعی باشد. اینجا
 *      فهرستِ فایل ساختگی است، چون خودِ قاعده در آزمون است نه دیسک.
 *   ۲. **ادغام**، که تنها قاعده‌اش این است: تازگی برنده نیست، اعتماد برنده
 *      است. اگر این بشکند، `userbug learn` دومی جملهٔ کاربر را می‌خورد و
 *      کسی نمی‌فهمد.
 */
import { test, expect } from '@playwright/test';
import { detectStack, discoverRoutes } from '../../src/knowledge/routes.js';
import { answerQuestion, mergeIntoDossier } from '../../src/knowledge/merge.js';
import { normalizeDossier } from '../../src/knowledge/schema.js';

const noRead = async () => '';

async function pathsOf(files, read = noRead) {
  const { routes } = await discoverRoutes({ files, read });
  return routes.map((route) => route.path).sort();
}

test('SvelteKit: پوشه مسیر می‌شود، گروه حذف می‌شود، پارامتر می‌ماند', async () => {
  const paths = await pathsOf([
    'src/routes/+page.svelte',
    'src/routes/login/+page.svelte',
    'src/routes/(app)/library/+page.svelte',
    'src/routes/projects/[target]/+page.svelte',
    'src/routes/ai-chat/+page.js',
    // نقطهٔ API صفحه نیست و کاربر رویش کلیک نمی‌کند
    'src/routes/api/files/+server.js',
    'src/lib/components/Button.svelte',
  ]);

  expect(paths).toEqual(['/', '/ai-chat', '/library', '/login', '/projects/[target]']);
});

test('Next: هر دو روتر شناخته می‌شوند و فایل‌های ویژه نه', async () => {
  const paths = await pathsOf([
    'app/page.tsx',
    'app/(marketing)/about/page.tsx',
    'pages/contact.jsx',
    'pages/blog/index.jsx',
    'pages/_app.tsx',
    'pages/api/hello.ts',
  ]);

  expect(paths).toEqual(['/', '/about', '/blog', '/contact']);
});

test('روترِ اعلامی فقط از فایلِ روتر خوانده می‌شود', async () => {
  const files = ['src/router.js', 'src/store/cart.js'];
  const read = async (file) =>
    file === 'src/router.js'
      ? `const routes = [{ path: '/', component: Home }, { path: '/cart', component: Cart }, { path: '*' }];`
      : `export const config = { path: '/این-روت-نیست' };`;

  expect(await pathsOf(files, read)).toEqual(['/', '/cart']);
});

test('بدون نشانهٔ روتر، شیءِ path روتِ قلابی نمی‌سازد', async () => {
  const read = async () => `export default { path: '/tmp/cache', size: 10 };`;
  expect(await pathsOf(['src/routes.js'], read)).toEqual([]);
});

test('PHP و پایتون از محتوای فایل درمی‌آیند', async () => {
  const read = async (file) =>
    file.endsWith('.php')
      ? `Route::get('/dashboard', 'X'); Route::post('/save', 'Y');`
      : `urlpatterns = [path('admin/', admin.site.urls)]`;

  const paths = await pathsOf(['routes/web.php', 'app/urls.py'], read);
  // فقط فعل‌های خواندنی؛ POST صفحه‌ای نیست که کاربر برود
  expect(paths).toEqual(['/admin', '/dashboard']);
});

test('آشکارسازِ شکسته بقیه را نمی‌برد', async () => {
  const read = async () => {
    throw new Error('دیسک خراب');
  };
  // SvelteKit به خواندن نیاز ندارد، پس باید سالم بماند
  expect(await pathsOf(['src/routes/login/+page.svelte', 'src/router.js'], read)).toEqual(['/login']);
});

test('استک حدس نمی‌زند؛ چیزی که اعلام نشده گزارش نمی‌شود', async () => {
  const read = async () =>
    JSON.stringify({ dependencies: { '@sveltejs/kit': '2', 'better-sqlite3': '9' }, devDependencies: { typescript: '5' } });

  const stack = await detectStack({ files: ['package.json', 'api/index.php'], read });
  expect(stack).toEqual({ framework: 'sveltekit', language: 'ts', backend: 'php', db: 'sqlite' });

  const bare = await detectStack({ files: ['readme.md'], read: async () => '' });
  expect(bare).toEqual({ framework: '', language: '', backend: '', db: '' });
});

/* ───────────────────────────── ادغام ───────────────────────────── */

test('حدسِ مدل جملهٔ کاربر را نمی‌خورد؛ تعارض ثبت می‌شود', () => {
  const current = normalizeDossier({
    routes: [{ path: '/library', purpose: 'کتابخانهٔ اسناد کاربر', by: 'user' }],
  });

  const { dossier, conflicts } = mergeIntoDossier(current, {
    routes: [{ path: '/library', purpose: 'صفحهٔ کتابخانه', by: 'model' }],
  });

  const route = dossier.routes[0];
  expect(route.purpose).toBe('کتابخانهٔ اسناد کاربر');
  expect(route.by).toBe('user');
  expect(conflicts).toBe(1);
  expect(route.conflict[0].note).toContain('صفحهٔ کتابخانه');
});

test('ادغامِ دوباره، تعارضِ تکراری اضافه نمی‌کند', () => {
  const current = normalizeDossier({ routes: [{ path: '/a', purpose: 'حرفِ کاربر', by: 'user' }] });
  const patch = { routes: [{ path: '/a', purpose: 'حرفِ مدل', by: 'model' }] };

  const once = mergeIntoDossier(current, patch).dossier;
  const twice = mergeIntoDossier(once, patch).dossier;

  expect(twice.routes[0].conflict).toHaveLength(1);
});

test('اعتمادِ بالاتر جایگزین می‌شود و تعارضی نمی‌ماند', () => {
  const current = normalizeDossier({ routes: [{ path: '/a', purpose: 'حدس', by: 'model' }] });
  const { dossier, replaced } = mergeIntoDossier(current, {
    routes: [{ path: '/a', purpose: 'واقعیت', by: 'user' }],
  });

  expect(dossier.routes[0].purpose).toBe('واقعیت');
  expect(dossier.routes[0].by).toBe('user');
  expect(replaced).toBe(1);
});

test('محتوای یکسان، تعارض نیست حتی وقتی منبع فرق دارد', () => {
  const current = normalizeDossier({ routes: [{ path: '/a', purpose: 'یکی', by: 'user' }] });
  const { dossier, conflicts, kept } = mergeIntoDossier(current, {
    routes: [{ path: '/a', purpose: 'یکی', by: 'source' }],
  });

  expect(conflicts).toBe(0);
  expect(kept).toBe(1);
  expect(dossier.routes[0].by).toBe('user');
});

test('کلیدی که در تکه نیست، دست‌نخورده می‌ماند', () => {
  const current = normalizeDossier({
    summary: 'خلاصهٔ کاربر',
    glossary: [{ term: 'سند', meaning: 'x', by: 'user' }],
    routes: [{ path: '/a', by: 'user' }],
  });

  const { dossier } = mergeIntoDossier(current, { routes: [{ path: '/b', by: 'source' }] });

  expect(dossier.summary).toBe('خلاصهٔ کاربر');
  expect(dossier.glossary).toHaveLength(1);
  expect(dossier.routes.map((r) => r.path).sort()).toEqual(['/a', '/b']);
});

test('پرسشِ جواب‌گرفته دوباره باز نمی‌شود', () => {
  const current = normalizeDossier({
    openQuestions: [{ q: 'حساب تستی کدام است؟', answer: 'test@x.c' }],
  });

  const { dossier } = mergeIntoDossier(current, {
    openQuestions: [{ q: 'حساب تستی کدام است؟' }, { q: 'پرسشِ تازه' }],
  });

  const answered = dossier.openQuestions.find((item) => item.q === 'حساب تستی کدام است؟');
  expect(answered.answer).toBe('test@x.c');
  expect(answered.asked).toBe(2);
  expect(dossier.openQuestions).toHaveLength(2);
});

test('جوابِ کاربر همیشه by: user می‌شود و در فیلدش می‌نشیند', () => {
  const current = normalizeDossier({
    summary: 'حدسِ مدل',
    openQuestions: [{ q: 'این اپ چیست؟', field: 'summary' }],
  });

  const next = answerQuestion(current, 'این اپ چیست؟', 'یک ویرایشگر سند');
  expect(next.summary).toBe('یک ویرایشگر سند');
  expect(next.openQuestions[0].answer).toBe('یک ویرایشگر سند');
  expect(next.openQuestions[0].answeredAt).toBeTruthy();
});

test('جواب به پرسشی که نیست، بلند می‌شکند', () => {
  const current = normalizeDossier({ openQuestions: [] });
  expect(() => answerQuestion(current, 'نیست', 'چیزی')).toThrow(/پرسشی/);
});
