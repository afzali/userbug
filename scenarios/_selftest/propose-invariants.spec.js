/**
 * خودآزمای «ناوردا → پیشنهاد».
 *
 * ── چرا این یکی روی رتبه‌بندی حساس است ──
 *
 * پیشنهادِ بد خطا نمی‌دهد؛ فقط صفحه را پر می‌کند و پیشنهادهای خوب را دفن
 * می‌کند. دو بار همین اتفاق در ساختش افتاد:
 *
 *   ۱. با فهرستِ منفی («هرچه ماشینی نیست، کاربری است»)،
 *      `UNIQUE(user_id, generation, chunk_index)` — ماشینِ همگام‌سازی —
 *      رتبهٔ اول شد و `UNIQUE(email_hash)` ته فهرست افتاد.
 *   ۲. با فیلترِ `mode !== 'off'`، صفر پیشنهادِ «فرمِ خالی» درآمد: هر ۱۴۹
 *      ناوردای `not-null` پیش‌فرض خاموش‌اند، چون به‌عنوان پرس‌وجوی SQL
 *      بی‌معنا هستند — ولی به‌عنوان ایدهٔ آزمون بهترین‌اند.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';

/** پروژهٔ موقت با ناوردای دلخواه، تا آزمون به دادهٔ یک پروژهٔ واقعی بند نباشد. */
function withProject(invariants) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-prop-'));
  process.env.USERBUG_ROOT = root;
  const dir = path.join(root, 'knowledge', 'demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'invariants.json'),
    JSON.stringify({ version: 1, target: 'demo', invariants }, null, 2),
    'utf8'
  );
  return root;
}

test.afterEach(() => {
  delete process.env.USERBUG_ROOT;
});

test('یکتاییِ کاربری بالاتر از کلیدِ ترکیبیِ داخلی می‌نشیند', async () => {
  withProject([
    {
      id: 'sync-gen-unique',
      kind: 'unique',
      table: 'backups',
      columns: ['user_id', 'generation', 'chunk_index'],
      statement: 'x',
      mode: 'watch',
    },
    { id: 'users-email-unique', kind: 'unique', table: 'users', columns: ['email_hash'], statement: 'y', mode: 'watch' },
  ]);

  const { proposalsFor } = await import(`../../src/knowledge/propose.js?rank=${Date.now()}`);
  const rows = proposalsFor('demo').proposals.filter((one) => one.kind === 'invariant');

  expect(rows[0].title).toContain('email_hash');
  expect(rows[1].title).toContain('generation');
});

test('ناوردای خاموش هم پیشنهاد می‌شود — مگر آدم دلیلی نوشته باشد', async () => {
  withProject([
    { id: 'books-title', kind: 'not-null', table: 'books', columns: ['title'], statement: 'x', mode: 'off' },
    {
      id: 'tags-name',
      kind: 'not-null',
      table: 'tags',
      columns: ['name'],
      statement: 'y',
      mode: 'off',
      why: 'این جدول را خودمان پر می‌کنیم',
    },
  ]);

  const { proposalsFor } = await import(`../../src/knowledge/propose.js?off=${Date.now()}`);
  const titles = proposalsFor('demo')
    .proposals.filter((one) => one.kind === 'invariant')
    .map((one) => one.title);

  expect(titles.join(' ')).toContain('books');
  // «این چک را اجرا نکن» با «این فکت بی‌ارزش است» یکی نیست — ولی دلیلِ آدم هست
  expect(titles.join(' ')).not.toContain('tags');
});

test('ستونِ ماشینی فرمِ خالی نمی‌سازد', async () => {
  // `created_at` و `user_id` را هیچ فرمی از آدم نمی‌پرسد
  withProject([
    { id: 'a', kind: 'not-null', table: 'changes', columns: ['created_at'], statement: 'x', mode: 'off' },
    { id: 'b', kind: 'not-null', table: 'changes', columns: ['user_id'], statement: 'y', mode: 'off' },
  ]);

  const { proposalsFor } = await import(`../../src/knowledge/propose.js?machine=${Date.now()}`);
  expect(proposalsFor('demo').proposals.filter((one) => one.kind === 'invariant')).toEqual([]);
});

test('متنِ پیشنهاد می‌گوید چه کار کن، نه اینکه قاعده چیست', async () => {
  withProject([
    { id: 'u', kind: 'unique', table: 'users', columns: ['email'], statement: 'دو ردیف…', mode: 'watch' },
  ]);

  const { proposalsFor } = await import(`../../src/knowledge/propose.js?text=${Date.now()}`);
  const row = proposalsFor('demo').proposals.find((one) => one.kind === 'invariant');

  expect(row.text).toContain('دو بار');
  expect(row.text).toContain('رد شود');
  // جملهٔ خودِ ناوردا در «چرا» می‌ماند، نه در «چه کار کن»
  expect(row.why).toBe('دو ردیف…');
});
