/**
 * خودآزمای انبارِ شناخت.
 *
 * چهار چیزی که اگر بشکنند، کلِ ساختارِ شناخت بی‌اعتبار است:
 *
 *   ۱. **`by` گم نمی‌شود.** بندی که منبعش ناشناخته باشد باید `model` بخورد،
 *      نه اینکه بی‌برچسب بماند — وگرنه حدسِ مدل و جملهٔ کاربر هم‌وزن می‌شوند.
 *   ۲. **پراعتمادتر برنده است.** وقتی گشت و سورس یک روت را می‌دهند، ترتیبِ
 *      ادغام نباید تعیین‌کننده باشد.
 *   ۳. **پروندهٔ خراب، شناخت را نمی‌کشد.** فایلِ نیمه‌نوشته یعنی «نداریم»،
 *      نه یعنی «بشکن».
 *   ۴. **تاریخچه واقعاً نوشته می‌شود.** بدونش «چرا این بند اینجاست» جواب
 *      ندارد.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';

import { normalizeDossier, normalizePage, normalizeRoutePath, pageSlug, TRUST } from '../../src/knowledge/schema.js';
import { diffDossier } from '../../src/knowledge/history.js';

/**
 * انبار در یک ریشهٔ موقت.
 *
 * هر تستِ نوشتنی باید در ریشهٔ خودش اجرا شود، وگرنه `knowledge/`ِ واقعیِ
 * مخزن را آلوده می‌کند — و این دقیقاً همان بار اول اتفاق افتاد: `ROOT` در
 * `src/target.js` لحظهٔ import ثابت می‌شود، پس `USERBUG_ROOT`ی که اینجا
 * تنظیم شود دیر رسیده بود. تست سبز شد و انبار در مخزن نوشت.
 *
 * برای همین `store.js` حالا `knowledgeRoot()` را هر بار حساب می‌کند. این
 * تست آن قاعده را هم می‌سنجد: اگر کسی دوباره ریشه را ثابت کند، تستِ تاریخچه
 * قرمز می‌شود.
 */
async function withTemporaryRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-knowledge-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'userbug' }), 'utf8');

  const previous = process.env.USERBUG_ROOT;
  process.env.USERBUG_ROOT = root;
  try {
    const store = await import('../../src/knowledge/store.js');
    await run(store, root);
  } finally {
    if (previous === undefined) delete process.env.USERBUG_ROOT;
    else process.env.USERBUG_ROOT = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('منبعِ ناشناخته، کم‌اعتمادترین می‌شود نه بی‌برچسب', () => {
  const dossier = normalizeDossier({
    routes: [
      { path: '/a', by: 'user' },
      { path: '/b', by: 'چیزِ ناشناخته' },
      { path: '/c' },
    ],
  });

  expect(dossier.routes.find((r) => r.path === '/a').by).toBe('user');
  expect(dossier.routes.find((r) => r.path === '/b').by).toBe('model');
  expect(dossier.routes.find((r) => r.path === '/c').by).toBe('model');
  expect(TRUST.user).toBeGreaterThan(TRUST.model);
});

test('روتِ تکراری: پراعتمادتر می‌ماند، بی‌توجه به ترتیب', () => {
  const forward = normalizeDossier({
    routes: [
      { path: '/library', purpose: 'حدسِ مدل', by: 'model' },
      { path: '/library', purpose: 'جملهٔ کاربر', by: 'user' },
    ],
  });
  const backward = normalizeDossier({
    routes: [
      { path: '/library', purpose: 'جملهٔ کاربر', by: 'user' },
      { path: '/library', purpose: 'حدسِ مدل', by: 'model' },
    ],
  });

  expect(forward.routes).toHaveLength(1);
  expect(forward.routes[0].purpose).toBe('جملهٔ کاربر');
  expect(backward.routes[0].purpose).toBe('جملهٔ کاربر');
});

test('مسیر نرمال می‌شود تا یک صفحه دو بار ثبت نشود', () => {
  expect(normalizeRoutePath('http://localhost:5173/library/')).toBe('/library');
  expect(normalizeRoutePath('library')).toBe('/library');
  expect(normalizeRoutePath('/library//items')).toBe('/library/items');
  expect(normalizeRoutePath('/library#top')).toBe('/library');
  expect(normalizeRoutePath('/')).toBe('/');
});

test('slug صفحه، مسیرهای متفاوت را قاطی نمی‌کند', () => {
  expect(pageSlug('/a/b')).not.toBe(pageSlug('/a-b'));
  expect(pageSlug('/')).toBe('root');
});

test('قراردادِ صفحه پیش‌فرض watch است، نه expect', () => {
  const page = normalizePage({ path: '/library', contract: { must: [{ role: 'heading' }] } });
  expect(page.contract.mode).toBe('watch');
  expect(page.contract.approvedBy).toBeNull();
});

test('پروندهٔ نامعتبر نرمال می‌شود، نه اینکه بشکند', () => {
  const dossier = normalizeDossier({
    summary: 12345,
    routes: [{ path: '' }, null, { path: '/ok' }],
    glossary: 'رشته، نه آرایه',
    risks: [{ why: 'بی‌برچسب' }],
  });

  expect(dossier.routes).toHaveLength(1);
  expect(dossier.glossary).toEqual([]);
  // خطرِ بی‌برچسب حذف می‌شود، چون برچسب همان چیزی است که به explore.avoid می‌رود
  expect(dossier.risks).toEqual([]);
});

test('نبودِ پرونده یعنی پروندهٔ خالی، نه خطا', async () => {
  await withTemporaryRoot(async (store) => {
    const dossier = store.readDossier('ghost');
    expect(dossier.routes).toEqual([]);
    expect(store.hasDossier('ghost')).toBe(false);
  });
});

test('پروندهٔ خراب، شناخت را نمی‌کشد', async () => {
  await withTemporaryRoot(async (store, root) => {
    const dir = path.join(root, 'knowledge', 'broken');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'dossier.json'), '{ نیمه‌نوشته', 'utf8');

    expect(() => store.readDossier('broken')).not.toThrow();
    expect(store.readDossier('broken').routes).toEqual([]);
  });
});

test('نوشتن، تاریخچه می‌سازد و ترفیع را جدا ثبت می‌کند', async () => {
  await withTemporaryRoot(async (store, root) => {
    await store.writeDossier('demo', { routes: [{ path: '/a', purpose: 'حدس', by: 'model' }] });
    await store.writeDossier('demo', { routes: [{ path: '/a', purpose: 'واقعیت', by: 'user' }] });

    const { readHistory } = await import('../../src/knowledge/history.js');
    const rows = readHistory(path.join(root, 'knowledge', 'demo'));

    expect(rows.map((row) => row.op)).toContain('add');
    expect(rows.map((row) => row.op)).toContain('promote');
    expect(store.readDossier('demo').routes[0].purpose).toBe('واقعیت');
  });
});

test('پاسخ به پرسش در تاریخچه by: user ثبت می‌شود، نه by: model', () => {
  /**
   * پرسش کلیدِ `by` ندارد و نباید داشته باشد: خودش را مدل ساخته، جوابش را
   * آدم داده. با قاعدهٔ عمومی، ثبتِ پاسخ `by: model` می‌خورد — همان اشتباهِ
   * منبعی که کلِ این دفتر برای جلوگیری از آن نوشته شده.
   */
  const before = normalizeDossier({ openQuestions: [{ q: 'این چیست؟' }] });
  const after = normalizeDossier({ openQuestions: [{ q: 'این چیست؟', answer: 'یک ویرایشگر' }] });

  const [change] = diffDossier(before, after);
  expect(change.by).toBe('user');
  expect(change.op).toBe('promote');
});

test('تفاوت، تغییرِ اعتماد را با تغییرِ محتوا قاطی نمی‌کند', () => {
  const before = normalizeDossier({ routes: [{ path: '/a', purpose: 'x', by: 'model' }] });
  const same = normalizeDossier({ routes: [{ path: '/a', purpose: 'x', by: 'model' }] });
  expect(diffDossier(before, same)).toEqual([]);

  const removed = normalizeDossier({ routes: [] });
  expect(diffDossier(before, removed)[0].op).toBe('remove');
});

test('صفحه ذخیره و بازخوانده می‌شود، و کهنگی حذفش نمی‌کند', async () => {
  await withTemporaryRoot(async (store) => {
    await store.writePage('demo', {
      path: '/library',
      purpose: 'اینجا فهرست اسناد است',
      domSignature: 'aaaa',
      by: 'user',
    });

    await store.markStale('demo', '/library', { signature: 'bbbb' });

    const page = store.readPage('demo', '/library');
    expect(page.stale).toBe(true);
    // جملهٔ کاربر باید سالم مانده باشد؛ کهنگی دربارهٔ DOM است نه دربارهٔ معنا
    expect(page.purpose).toBe('اینجا فهرست اسناد است');
    expect(store.listPages('demo')).toHaveLength(1);
  });
});

test('امضای یکسان، صفحه را کهنه نمی‌کند', async () => {
  await withTemporaryRoot(async (store) => {
    await store.writePage('demo', { path: '/x', domSignature: 'aaaa', by: 'tour' });
    expect(await store.markStale('demo', '/x', { signature: 'aaaa' })).toBeNull();
    expect(store.readPage('demo', '/x').stale).toBe(false);
  });
});

test('سنجه، صفحهٔ بیرون از فهرستِ روت‌ها را به حساب نمی‌آورد', async () => {
  await withTemporaryRoot(async (store) => {
    await store.writeDossier('demo', { routes: [{ path: '/a', by: 'source' }, { path: '/b', by: 'source' }] });
    await store.writePage('demo', { path: '/c', purpose: 'صفحه‌ای بیرون از فهرست', by: 'tour' });

    const { coverageOf } = await import('../../src/knowledge/coverage.js');
    const coverage = coverageOf('demo');

    // بدون تقاطع، این گشت هم صورت را بالا می‌برد و هم مخرج را نه
    expect(coverage.routes.toured).toBe(0);
    expect(coverage.pages.total).toBe(1);
    expect(coverage.score).toBe(0);
  });
});

test('پروژهٔ بی‌شناخت، «شروع‌نشده» است نه «صفر درصد»', async () => {
  await withTemporaryRoot(async (store) => {
    const { coverageOf } = await import('../../src/knowledge/coverage.js');
    expect(coverageOf('ghost').started).toBe(false);
    expect(store.hasDossier('ghost')).toBe(false);
  });
});

test('کلیدِ پروژه از پوشه بیرون نمی‌زند', async () => {
  await withTemporaryRoot(async (store) => {
    expect(() => store.knowledgeDir('../escape')).toThrow();
    expect(() => store.knowledgeDir('a/b')).toThrow();
    expect(() => store.knowledgeDir('..')).toThrow();
  });
});
