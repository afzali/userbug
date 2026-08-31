/**
 * خودآزمای ناوردا — لایهٔ ۳ از سنجهٔ هوشمند.
 *
 * ── چه چیزی در آزمون است ──
 *
 * ناوردا تنها لایه‌ای است که باگِ **منطقی** می‌گیرد: جایی که صفحه سالم است،
 * خطایی نیست، و دیتابیس دو کاربر با یک ایمیل دارد.
 *
 * ولی همین قدرت، خطرش هم هست: ناوردایی که از جای اشتباه استخراج شود،
 * به‌نامِ «قاعدهٔ خودِ پروژه» یافته می‌سازد و کسی به آن شک نمی‌کند. پس
 * نیمی از این تست‌ها دربارهٔ **استخراج نکردن** است.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { invariantsFromSql, isSchemaFile, mineInvariants } from '../../src/knowledge/schema-mine.js';

const SCHEMA = `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,   -- ایمیل کاربر
  name TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price DECIMAL(10,2),
  UNIQUE(user_id, name)
);
`;

test('UNIQUE ستونی و جدولی هر دو گرفته می‌شوند', () => {
  const found = invariantsFromSql(SCHEMA, { file: 'schema.sql' });
  const ids = found.map((item) => item.id);

  expect(ids).toContain('users-email-unique');
  expect(ids).toContain('tags-user_id-name-unique');

  const compound = found.find((item) => item.id === 'tags-user_id-name-unique');
  expect(compound.columns).toEqual(['user_id', 'name']);
  expect(compound.query).toContain('GROUP BY user_id, name');
  expect(compound.expect).toBe('empty');
});

test('کامنت SQL ستون نمی‌شود', () => {
  /**
   * نخستین استخراج از یک پروژهٔ واقعی `users----not-null` ساخت: بندِ
   * `-- توضیح` به‌عنوان ستون خوانده شده بود. ناوردایی دربارهٔ ستونی که وجود
   * ندارد، در نخستین اجرا با «چنین ستونی نیست» می‌شکند.
   */
  const ids = invariantsFromSql(SCHEMA, { file: 'schema.sql' }).map((item) => item.id);
  expect(ids.some((id) => id.includes('--'))).toBe(false);
});

test('کاما داخل پرانتز، بند را نمی‌شکند', () => {
  // `DECIMAL(10,2)` و `CHECK(a IN (1,2))` هر دو کاما دارند
  const ids = invariantsFromSql(SCHEMA, { file: 's.sql' }).map((item) => item.id);
  expect(ids.some((id) => id.startsWith('tags-2'))).toBe(false);
  expect(ids).toContain('tags-name-not-null');
});

test('NOT NULL پیش‌فرض خاموش است، UNIQUE روشن', () => {
  const found = invariantsFromSql(SCHEMA, { file: 's.sql' });

  /**
   * دیتابیس خودش `NULL` را رد می‌کند، پس این ناوردا معمولاً چیزی پیدا
   * نمی‌کند و فقط پرس‌وجو اضافه می‌کند. `UNIQUE` برعکس است: بسیاری از
   * پروژه‌ها یکتایی را در کد نگه می‌دارند و آن کد شرطِ رقابتی دارد.
   */
  expect(found.find((i) => i.id === 'users-email-unique').mode).toBe('watch');
  expect(found.find((i) => i.id === 'users-created_at-not-null').mode).toBe('off');
});

test('کلیدِ اصلی ناوردای NOT NULL نمی‌سازد', () => {
  const ids = invariantsFromSql(SCHEMA, { file: 's.sql' }).map((item) => item.id);
  // `PRIMARY KEY` خودش NOT NULL است؛ ردیفِ تکراری فقط نویز است
  expect(ids).not.toContain('users-id-not-null');
});

test('شمارهٔ خط پس از حذف کامنت درست می‌ماند', () => {
  const [first] = invariantsFromSql(SCHEMA, { file: 'schema.sql' });
  // ارجاع باید قابل دنبال کردن باشد، وگرنه «از کجا آمده» بی‌معناست
  expect(first.from).toMatch(/^schema\.sql:2$/);
});

test('فایلِ تست schema نیست', () => {
  /**
   * پروژه‌های واقعی در تست‌هایشان `CREATE TABLE` دارند — ولی آن‌ها fixture
   * هستند: schemaی ساده‌شده برای یک تست. استخراج از آن‌ها یعنی ناوردایی
   * دربارهٔ جدولی که در تولید آن شکل را ندارد.
   */
  expect(isSchemaFile('src/lib/ai/ask.test.js')).toBe(false);
  expect(isSchemaFile('src/db/schema.spec.ts')).toBe(false);
  expect(isSchemaFile('__tests__/database.js')).toBe(false);
  expect(isSchemaFile('db/seed.sql')).toBe(false);
  expect(isSchemaFile('fixtures/sample.sql')).toBe(false);
});

test('schema داخل جاوااسکریپت هم خوانده می‌شود', () => {
  /**
   * نخستین آزمون روی یک پروژهٔ واقعی صفر ناوردا داد: نپی هیچ فایل `.sql`
   * ندارد و schema را در جاوااسکریپت نگه می‌دارد. محدود کردن به پسوند یعنی
   * خاموش ماندن روی کلاسی از پروژه‌ها.
   */
  expect(isSchemaFile('src/lib/db/database.js')).toBe(true);
  expect(isSchemaFile('server/src/Database.php')).toBe(true);
  expect(isSchemaFile('migrations/002_add_tags.js')).toBe(true);
  expect(isSchemaFile('schema.sql')).toBe(true);

  // ولی نه هر فایلی — پیمایشِ هفتصد فایل برای یک regex بی‌دلیل است
  expect(isSchemaFile('src/routes/+page.svelte')).toBe(false);
  expect(isSchemaFile('src/lib/ui/button.js')).toBe(false);
});

test('قاعدهٔ تکراری در چند مهاجرت یک بار می‌آید', async () => {
  const files = ['migrations/001_init.sql', 'migrations/002_again.sql'];
  const read = async () => SCHEMA;

  const found = await mineInvariants({ files, read });
  const unique = found.filter((item) => item.id === 'users-email-unique');
  expect(unique).toHaveLength(1);
  // نخستین جایی که دیده شد می‌ماند
  expect(unique[0].from).toContain('001_init.sql');
});

/* ───────────────────── انبار و اجرا ───────────────────── */

async function withRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-inv-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'userbug', type: 'module' }), 'utf8');
  const previous = process.env.USERBUG_ROOT;
  process.env.USERBUG_ROOT = root;
  try {
    await run(await import('../../src/knowledge/invariants.js'));
  } finally {
    if (previous === undefined) delete process.env.USERBUG_ROOT;
    else process.env.USERBUG_ROOT = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('ادغام، تصمیمِ آدم را پاک نمی‌کند', async () => {
  await withRoot(async (store) => {
    const mined = invariantsFromSql(SCHEMA, { file: 's.sql' });
    store.mergeInvariants('demo', mined);

    store.setInvariantMode('demo', 'users-email-unique', 'off', 'روی این محیط داده‌های قدیمی داریم');

    /**
     * `learn` را می‌شود ده بار زد. اگر هر بار حالت‌ها به پیش‌فرض برمی‌گشتند،
     * ناوردایی که کاربر عمداً خاموش کرده بود دوباره روشن می‌شد — و بار دوم
     * دیگر کسی خاموشش نمی‌کند، گزارش را می‌بندد.
     */
    const again = store.mergeInvariants('demo', mined);
    expect(again.added).toBe(0);

    const item = store.listInvariants('demo').find((i) => i.id === 'users-email-unique');
    expect(item.mode).toBe('off');
    expect(item.why).toContain('داده‌های قدیمی');
  });
});

test('خاموش کردنِ ناوردا بدون دلیل ممکن نیست', async () => {
  await withRoot(async (store) => {
    store.mergeInvariants('demo', invariantsFromSql(SCHEMA, { file: 's.sql' }));
    expect(() => store.setInvariantMode('demo', 'users-email-unique', 'off')).toThrow(/دلیل/);
  });
});

test('ناوردای دستی پرس‌وجو می‌خواهد', async () => {
  await withRoot(async (store) => {
    // جمله‌ای بدون پرس‌وجو فقط یک یادداشت است؛ ثبتش یعنی فهرستی که نصفش
    // اجرا نمی‌شود و کسی نمی‌داند کدام نیمه
    expect(() => store.addUserInvariant('demo', { id: 'x', statement: 'سبد منفی نشود' })).toThrow(/پرس‌وجو/);

    const saved = store.addUserInvariant('demo', {
      id: 'cart-non-negative',
      statement: 'مبلغ سبد نباید منفی شود',
      query: 'SELECT COUNT(*) c FROM carts WHERE total < 0',
      expect: 'zero',
    });
    expect(saved.by).toBe('user');
    expect(saved.mode).toBe('watch');
  });
});

test('هدفِ بی state.sql ناوردا اجرا نمی‌کند و صریح می‌گوید', async () => {
  const { runInvariants } = await import('../../src/checks/invariant.js');
  const result = await runInvariants({ page: null, target: { key: 'demo' } });

  /**
   * همان تفکیکِ README برای جعبه‌سیاه: «صفر یافته» اینجا معنایی ندارد، چون
   * لایه اصلاً اجرا نشده. سکوتِ بی‌توضیح، ادعای پوششی است که وجود ندارد.
   */
  expect(result.ran).toBe(0);
  expect(result.skipped).toContain('state.sql');
});
