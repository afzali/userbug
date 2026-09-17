/**
 * خودآزمای «این کشف چه داد؟».
 *
 * ── چرا این فایل هست ──
 *
 * ملاکِ «کشف باید سناریو بدهد» یک عدد نیست، یک **حکم** است — و حکمِ غلط
 * بدتر از نبودنِ حکم است: کشفی که «✓» بگیرد و چیزی نساخته باشد، همان
 * سبزِ دروغینی است که این پروژه چند بار خورده.
 *
 * دو تله‌اش را همین‌جا قفل می‌کنیم:
 *
 *   سناریوی قدیمی روی همان مسیر، جوابِ این کشف نیست
 *   پیش‌نویسِ گشت، هست — و نخستین بار رد شد چون `_drafts/` خوانده نمی‌شد
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';

function withProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-yield-'));
  process.env.USERBUG_ROOT = root;
  fs.mkdirSync(path.join(root, 'knowledge', 'demo'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scenarios', 'demo', '_drafts'), { recursive: true });
  return root;
}

/** یک اجرا با رخدادهای واقعی — همان شکلی که خزنده می‌نویسد. */
function withRun(root, id, routes) {
  const dir = path.join(root, 'runs', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'events.ndjson'),
    routes.map((route) => JSON.stringify({ kind: 'step', route, scenario: 'نقشهٔ اپ' })).join('\n') + '\n',
    'utf8'
  );
  return dir;
}

function writeScenario(root, name, routes, { draft = false, at = '' } = {}) {
  const dir = path.join(root, 'scenarios', 'demo', draft ? '_drafts' : '');
  const file = path.join(dir, `${name}.yml`);
  fs.writeFileSync(
    file,
    `name: ${name}\nsteps:\n${routes.map((one) => `  - go: ${one}`).join('\n')}\n`,
    'utf8'
  );
  if (at) fs.utimesSync(file, new Date(at), new Date(at));
  return file;
}

test.afterEach(() => {
  delete process.env.USERBUG_ROOT;
});

const load = () => import(`../../src/knowledge/yield.js?t=${Date.now()}${Math.random()}`);

test('سناریویی که بعد از شروعِ کشف ساخته شده، حاصلِ آن است', async () => {
  const root = withProject();
  const dir = withRun(root, 'r1', ['/settings']);
  writeScenario(root, 'تغییر رمز', ['/settings'], { at: '2026-03-02T10:00:00Z' });

  const { yieldOf } = await load();
  const out = yieldOf({
    session: { kind: 'map', at: '2026-03-01T00:00:00Z' },
    runDir: dir,
    target: 'demo',
  });

  expect(out.complete).toBe(true);
  expect(out.made.map((one) => one.name)).toEqual(['تغییر رمز']);
  expect(out.older).toEqual([]);
});

test('سناریوی قدیمی روی همان مسیر، جوابِ این کشف نیست', async () => {
  /**
   * ── چرا این مهم‌ترین آزمونِ این فایل است ──
   *
   * سادهٔ کار این بود که بپرسیم «آیا مسیرهای این کشف سناریو دارند؟».
   * آن‌وقت کشفِ دومِ هر صفحه‌ای همیشه «✓» می‌گرفت، و ملاکی که قرار بود
   * کارِ نکرده را نشان دهد، هیچ‌وقت چیزی نمی‌گفت.
   */
  const root = withProject();
  const dir = withRun(root, 'r1', ['/settings']);
  writeScenario(root, 'تغییر رمز', ['/settings'], { at: '2026-01-05T10:00:00Z' });

  const { yieldOf } = await load();
  const out = yieldOf({
    session: { kind: 'map', at: '2026-03-01T00:00:00Z' },
    runDir: dir,
    target: 'demo',
  });

  expect(out.complete).toBe(false);
  expect(out.made).toEqual([]);
  expect(out.older.map((one) => one.name)).toEqual(['تغییر رمز']);
});

test('پیش‌نویسِ گشت هم سناریو حساب می‌شود', async () => {
  /**
   * گشت در پایان یک **پیش‌نویس** می‌نویسد، نه سناریوی رسمی. نخستین
   * پیاده‌سازی `_drafts/` را نمی‌خواند و درست‌ترین کشفِ ممکن را «سناریو
   * نداد» می‌گرفت.
   */
  const root = withProject();
  const dir = withRun(root, 'r1', ['/contents']);
  writeScenario(root, 'آشنایی', ['/contents'], { draft: true, at: '2026-03-02T10:00:00Z' });

  const { yieldOf } = await load();
  const out = yieldOf({
    session: { kind: 'tour', at: '2026-03-01T00:00:00Z' },
    runDir: dir,
    target: 'demo',
  });

  expect(out.complete).toBe(true);
  expect(out.made[0].name).toBe('آشنایی');
});

test('سناریویی که جای دیگری را می‌زند، حاصلِ این کشف نیست', async () => {
  const root = withProject();
  const dir = withRun(root, 'r1', ['/settings']);
  writeScenario(root, 'خواندن کتاب', ['/content/42'], { at: '2026-03-02T10:00:00Z' });

  const { yieldOf } = await load();
  const out = yieldOf({ session: { kind: 'map', at: '2026-03-01T00:00:00Z' }, runDir: dir, target: 'demo' });

  expect(out.complete).toBe(false);
  expect(out.made).toEqual([]);
  expect(out.older).toEqual([]);
});

test('شناسه از دو طرف جمع می‌شود', async () => {
  /**
   * کشف `/content/42` را می‌بیند و سناریو `/content/7` می‌نویسد. بی جمع
   * شدنِ `:id`، هیچ صفحهٔ پارامترداری هرگز «✓» نمی‌گرفت.
   */
  const root = withProject();
  const dir = withRun(root, 'r1', ['/content/42']);
  writeScenario(root, 'خواندن کتاب', ['/content/7'], { at: '2026-03-02T10:00:00Z' });

  const { yieldOf } = await load();
  const out = yieldOf({ session: { kind: 'tour', at: '2026-03-01T00:00:00Z' }, runDir: dir, target: 'demo' });

  expect(out.complete).toBe(true);
});

test('«چه کاری مانده» از مسیرهای همین کشف می‌آید', async () => {
  const root = withProject();
  const dir = withRun(root, 'r1', ['/settings', '/contents', '/login']);

  const { yieldOf } = await load();
  const out = yieldOf({
    session: { kind: 'map', at: '2026-03-01T00:00:00Z' },
    runDir: dir,
    target: 'demo',
    counts: { '/contents': { scenarios: ['یک'], planned: [] } },
  });

  /** جایی که سناریو دارد از فهرستِ کار بیرون می‌ماند. */
  expect(out.blind).toEqual(['/login', '/settings']);
  expect(out.routes).toEqual(['/contents', '/login', '/settings']);
});

test('کشفی که هیچ‌جا نرفت، هیچ ادعایی نمی‌کند', async () => {
  const root = withProject();
  const dir = withRun(root, 'r1', []);
  writeScenario(root, 'هرچیزی', ['/settings'], { at: '2026-03-02T10:00:00Z' });

  const { yieldOf } = await load();
  const out = yieldOf({ session: { kind: 'map', at: '2026-03-01T00:00:00Z' }, runDir: dir, target: 'demo' });

  expect(out.routes).toEqual([]);
  expect(out.complete).toBe(false);
});

test('کشِ قدم سناریو نیست', async () => {
  const root = withProject();
  const dir = withRun(root, 'r1', ['/settings']);
  const learned = path.join(root, 'scenarios', 'demo', '_learned');
  fs.mkdirSync(learned, { recursive: true });
  fs.writeFileSync(path.join(learned, 'x.json'), '{}', 'utf8');

  const { allScenarios } = await load();
  expect(allScenarios('demo')).toEqual([]);
  expect(dir).toBeTruthy();
});

test('شمارشِ ناتمام‌ها فقط جلسه‌های تمام‌شده را می‌بیند', async () => {
  const { incompleteCount } = await load();

  expect(
    incompleteCount([
      { done: true, yield: { complete: false } },
      { done: true, yield: { complete: true } },
      /** هنوز در جریان است: هنوز وقتش نرسیده که ازش حساب بخواهیم. */
      { done: false, yield: { complete: false } },
      /** حکمی ندارد (خواندنش نشد)؛ حدس نمی‌زنیم. */
      { done: true, yield: null },
    ])
  ).toBe(1);
});
