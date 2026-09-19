/**
 * خودآزمای اسکلتِ `.spec.js` و پوشهٔ userbug در پروژهٔ هدف.
 *
 * ── چه چیزی واقعاً در آزمون است ──
 *
 * دو ادعا، و هر دو از جنسی‌اند که با خواندنِ کد سبز به نظر می‌رسند:
 *
 *   ۱. متنی که می‌سازیم، جاوااسکریپتِ معتبر است. یک ویرگولِ جاافتاده تا
 *      اولین اجرای واقعی پنهان می‌ماند، و آن‌وقت خطا جایی دیده می‌شود که
 *      هیچ ربطی به علتش ندارد. پس با `node --check` سنجیده می‌شود، نه با
 *      چشم و نه با regex.
 *
 *   ۲. نوشتن از پوشه بیرون نمی‌زند. نامِ قدم‌ها گاهی از مدل می‌آیند و یک
 *      `..` کافی است تا فایلی جایی بنشیند که کسی دنبالش نمی‌گردد.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { emitSpec, stepNames, assertUniqueStepNames, FIXTURES_MODULE } from '../../src/emit/spec.js';
import {
  workspaceRoot,
  contained,
  ensureWorkspace,
  writeInside,
  DEFAULT_WORKSPACE,
  GITIGNORE,
} from '../../src/emit/workspace.js';

const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ub-emit-'));

/** پارسِ واقعی، نه حدس. */
function parses(source) {
  const dir = temporary();
  const file = path.join(dir, 'candidate.spec.mjs');
  fs.writeFileSync(file, source, 'utf8');
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: result.status === 0, stderr: result.stderr };
}

const SAMPLE = {
  title: 'ورود',
  doc: 'ساختهٔ userbug.\n\nدستی ویرایشش کنید؛ این فایل مالِ شماست.',
  steps: [
    { name: 'باز کردن خانه', lines: ["await page.goto('/');", 'await ub.dismissBlockers({ wait: 5000 });'] },
    {
      name: 'پر کردن فرمِ ورود',
      doc: 'هویتِ تازه در هر اجرا.',
      lines: [
        "await page.getByLabel('ایمیل').fill(identity.email);",
        "await page.getByLabel('رمز عبور').fill(identity.password);",
      ],
    },
  ],
  tail: ["await expect(page.getByLabel('ایمیل')).toBeHidden();"],
};

test('فایلِ تولیدشده جاوااسکریپتِ معتبر است', () => {
  const { ok, stderr } = parses(emitSpec(SAMPLE));
  expect(ok, stderr).toBe(true);
});

test('عنوانِ پرنقل‌قول هم فایلِ معتبر می‌سازد', () => {
  /**
   * عنوان از نامِ قابلیت می‌آید و نامِ قابلیت از خودِ اپ. آپاستروف در آن
   * کافی است تا فایل اصلاً پارس نشود.
   */
  const source = emitSpec({ ...SAMPLE, title: `it's «ورود»\\nدوم` });
  const { ok, stderr } = parses(source);
  expect(ok, stderr).toBe(true);
});

test('اسکلت، fixtureها و ماژول را درست می‌آورد', () => {
  const source = emitSpec(SAMPLE);
  expect(source).toContain(`import { test, expect } from '${FIXTURES_MODULE}';`);
  expect(source).toContain('test(\'ورود\', async ({ page, ub, identity }) => {');
  expect(source).toContain("await ub.step('باز کردن خانه', async () => {");
});

test('`expect` وقتی به‌کار نرفته، وارد نمی‌شود', () => {
  /**
   * ایمپورتِ بی‌استفاده هشدارِ لینت می‌دهد، و فایلی که با هشدار می‌آید،
   * کسی هشدارهای بعدی‌اش را جدی نمی‌گیرد.
   */
  const source = emitSpec({ title: 'بی‌ادعا', steps: [{ name: 'فقط کلیک', lines: ['await page.click("body");'] }] });
  expect(source).toContain(`import { test } from '${FIXTURES_MODULE}';`);
  expect(source).not.toContain('expect');
});

test('نامِ قدم‌ها از متن بازخوانده می‌شوند — لنگرها گم نمی‌شوند', () => {
  /**
   * این رفت‌وبرگشت قلبِ درج است: `userbug expect` باید بتواند از یک فایلِ
   * روی دیسک بپرسد «چه قدم‌هایی داری؟» — از جمله فایلی که کاربر دستی
   * ویرایشش کرده.
   */
  const source = emitSpec(SAMPLE);
  expect(stepNames(source)).toEqual(['باز کردن خانه', 'پر کردن فرمِ ورود']);
});

test('نامِ قدمِ تکراری و بی‌نام، بلند می‌شکنند', () => {
  expect(() => assertUniqueStepNames([{ name: 'ورود' }, { name: 'ورود' }])).toThrow(/تکراری/);
  expect(() => emitSpec({ title: 'x', steps: [{ lines: [] }] })).toThrow(/بی‌نام/);
  expect(() => emitSpec({ title: '' })).toThrow(/بی‌عنوان/);
});

test('ریشهٔ workspace از source.root مشتق می‌شود، و نبودش خطاست', () => {
  expect(workspaceRoot({ key: 'nepi', source: { root: 'D:/Projects/nepi' } })).toBe(
    path.resolve('D:/Projects/nepi', DEFAULT_WORKSPACE),
  );

  // `workspace` صریح بر مشتق می‌چربد.
  expect(workspaceRoot({ key: 'nepi', workspace: 'D:/جای/دیگر' })).toBe(path.resolve('D:/جای/دیگر'));

  // نوشتن در جایی که کاربر نگفته، بدترین شکلِ کمک است.
  expect(() => workspaceRoot({ key: 'nepi' })).toThrow(/workspace/);
});

test('نوشتن از پوشه بیرون نمی‌زند', () => {
  const root = temporary();
  try {
    expect(() => contained(root, 'specs/ورود.spec.js')).not.toThrow();
    expect(() => contained(root, '../بیرون.js')).toThrow(/بیرون/);
    expect(() => contained(root, 'a/../../بیرون.js')).toThrow(/بیرون/);

    // `tests/userbug-old` نباید «داخلِ» `tests/userbug` خوانده شود.
    expect(() => contained(root, path.join('..', path.basename(root) + '-old', 'x.js'))).toThrow(/بیرون/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('`.gitignore` همراه می‌رود و دست‌کاریِ کاربر را بازنویسی نمی‌کند', () => {
  const root = path.join(temporary(), 'tests', 'userbug');
  try {
    const first = ensureWorkspace(root);
    expect(first.gitignore).toBe('written');
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe(GITIGNORE);

    // رازِ حساب هرگز نباید کامیت شود — این خط دلیلِ وجودِ کلِ فایل است.
    expect(GITIGNORE).toContain('.local/');

    fs.appendFileSync(path.join(root, '.gitignore'), '\n# خطِ خودم\n');
    expect(ensureWorkspace(root).gitignore).toBe('kept');
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toContain('خطِ خودم');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('writeInside فایل را می‌سازد و پوشه‌های میانی را هم', () => {
  const root = temporary();
  try {
    const written = writeInside(root, path.join('specs', 'ورود.spec.js'), '// سلام\n');
    expect(fs.readFileSync(written, 'utf8')).toBe('// سلام\n');
    expect(() => writeInside(root, '../بیرون.js', 'x')).toThrow(/بیرون/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
