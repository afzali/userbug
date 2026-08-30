/**
 * خودآزمای `forEach` — شمارنده و اعتبارسنجی‌اش.
 *
 * `times` برای سنجشِ حجم اضافه شد و مثل هر عددِ ورودی دیگری، خطرش این است که
 * یک تایپی («۱۲۰۰» به‌جای «۱۲») اجرا را ساعت‌ها ببرد. پس سقف دارد و سقفش
 * سنجیده می‌شود.
 *
 * این فایل مرورگر نمی‌خواهد: مفسر را با یک صفحهٔ قلابی صدا می‌زند و فقط
 * می‌بیند حلقه چند بار و با چه مقداری چرخید.
 */
import { test, expect } from '@playwright/test';
import { runScenario } from '../../src/scenario/run.js';

/** حداقلِ چیزی که `runScenario` لازم دارد، بدون مرورگر و بدون مخزن. */
function harness() {
  const seen = [];
  const page = {
    url: () => 'http://127.0.0.1/none',
    goto: async () => {},
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
  };
  const ub = {
    target: { key: 'harness', allowlist: [] },
    // `writeRepros` این دو را می‌خواند. خالی نگه داشتنشان یعنی فایل بازتولیدی
    // ساخته نمی‌شود، که برای این خودآزما درست است.
    findings: [],
    store: { dir: null, appendEvent: async () => {} },
    step: async (title, fn) => {
      await fn();
    },
    note: async (finding) => {
      seen.push({ kind: 'note', ...finding });
    },
  };
  return { page, ub, seen };
}

async function runSteps(steps) {
  const { page, ub, seen } = harness();
  await runScenario({
    page,
    ub,
    identity: { email: 'a@b.test', password: 'x' },
    scenario: { id: 'harness', name: 'harness', steps },
  });
  return seen;
}

test('forEach با times همان تعداد بار می‌چرخد و شمارنده از ۱ شروع می‌شود', async () => {
  const seen = await runSteps([
    { forEach: { var: 'i', times: 3 }, then: [{ note: 'دور {{vars.i}}' }] },
  ]);

  expect(seen.map((s) => s.message)).toEqual(['دور 1', 'دور 2', 'دور 3']);
});

test('forEach با in هنوز کار می‌کند', async () => {
  const seen = await runSteps([
    { forEach: { var: 'x', in: ['الف', 'ب'] }, then: [{ note: 'مقدار {{vars.x}}' }] },
  ]);

  expect(seen.map((s) => s.message)).toEqual(['مقدار الف', 'مقدار ب']);
});

test('times نامعتبر بلند می‌شکند، نه اینکه بی‌صدا رد شود', async () => {
  // سقف عمدی است: یک تایپی نباید اجرا را تا بی‌نهایت ببرد
  for (const times of [0, -1, 2.5, 501, 'زیاد']) {
    await expect(
      runSteps([{ forEach: { var: 'i', times }, then: [{ note: 'x' }] }]),
      `times=${times}`
    ).rejects.toThrow(/times/);
  }
});

test('دادن هم `in` و هم `times` ابهام است و رد می‌شود', async () => {
  await expect(
    runSteps([{ forEach: { var: 'i', times: 2, in: ['الف'] }, then: [{ note: 'x' }] }])
  ).rejects.toThrow(/هر دو/);
});
