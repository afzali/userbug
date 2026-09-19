/**
 * خودآزمای «متن → کد».
 *
 * ── دو چیزی که اینجا بی‌صدا غلط می‌شوند ──
 *
 * ۱. **متغیرها.** `{{identity.email}}` در YAML رشته‌ای بود که مفسر
 *    جای‌گذاری‌اش می‌کرد. در کد باید ارجاع به fixture شود. اگر رشته بماند،
 *    تست با متنِ تحت‌اللفظیِ «{{identity.email}}» وارد می‌شود و شکستش
 *    دربارهٔ اپ هیچ نمی‌گوید.
 *
 * ۲. **افعالی که fixture ندارند.** `{{account.*}}` و `{{vars.*}}` متنِ
 *    اجرای YAML بودند و رفتند. تولیدِ کدی که به متغیرِ تعریف‌نشده اشاره کند
 *    یعنی فایلی که در نگاهِ اول درست است و در اجرا می‌شکند.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { emitAction, emitValue, verbOf } from '../../src/emit/action.js';
import { scenarioToSpec } from '../../src/emit/author.js';
import { stepNames, testTitle } from '../../src/emit/spec.js';

function parses(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-author-'));
  const file = path.join(dir, 'candidate.spec.mjs');
  fs.writeFileSync(file, source, 'utf8');
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: result.status === 0, stderr: result.stderr };
}

const line = (step) => emitAction(step).join('\n');

/* ── متغیرها ── */

test('رشتهٔ بی‌متغیر، رشته می‌ماند', () => {
  expect(emitValue('سلام')).toBe("'سلام'");
  expect(emitValue("it's")).toBe('"it\'s"');
});

test('رشته‌ای که تماماً یک متغیر است، عبارت می‌شود', () => {
  expect(emitValue('{{identity.email}}')).toBe('identity.email');
  expect(emitValue('{{ identity.password }}')).toBe('identity.password');
});

test('فیلترها به متدِ جاوااسکریپت تبدیل می‌شوند', () => {
  expect(emitValue('{{identity.email | upper}}')).toBe('identity.email.toUpperCase()');
  expect(emitValue('{{identity.email | localPart}}')).toBe("identity.email.split('@')[0]");
  expect(() => emitValue('{{identity.email | nope}}')).toThrow(/فیلترِ ناشناس/);
});

test('`{{` که خوانده نشد، تایپی است نه متن', () => {
  /**
   * فیلترِ فارسی با الگو نمی‌خورد و کلِ جای‌نگهدار رد می‌شود. بی محافظ،
   * همان متنِ خام در فرم تایپ می‌شد و شکستش دربارهٔ اپ هیچ نمی‌گفت.
   */
  expect(() => emitValue('{{identity.email | فیلترِ نبوده}}')).toThrow(/خوانده نشد/);
  expect(() => emitValue('{{ناتمام')).toThrow(/خوانده نشد/);

  // ولی متنی که واقعاً آکولاد دارد و جای‌نگهدار نیست، باید رد شود
  expect(emitValue('{ a: 1 }')).toBe("'{ a: 1 }'");
});

test('آمیخته، template می‌شود — و متنِ اصلی فرار داده می‌شود', () => {
  expect(emitValue('کاربر {{identity.email}} است')).toBe('`کاربر ${identity.email} است`');

  // بک‌تیک و `${` در متنِ کاربر نباید کد شوند
  const risky = emitValue('`x` ${y} {{identity.email}}');
  expect(risky).toContain('\\`x\\`');
  expect(risky).toContain('\\${y}');
  expect(new Function('identity', `return ${risky};`)({ email: 'a@b.c' })).toBe('`x` ${y} a@b.c');
});

test('فضای‌نامی که fixture ندارد، بلند می‌شکند', () => {
  /**
   * سکوت اینجا یعنی فایلی که پارس می‌شود، اجرا می‌شود، و با
   * «account is not defined» می‌شکند — خطایی که دربارهٔ اپ هیچ نمی‌گوید.
   */
  expect(() => emitValue('{{account.admin.email}}')).toThrow(/fixture/);
  expect(() => emitValue('{{vars.recoveryCode}}')).toThrow(/fixture/);
  expect(() => emitValue('{{nasty.zwnj}}')).toThrow(/fixture/);
});

/* ── افعال ── */

test('افعالِ کنشی، آینهٔ بازپخش‌اند', () => {
  expect(line({ go: '/login' })).toBe("await page.goto('/login');");
  expect(line({ click: { role: 'button', name: 'ذخیره' } })).toBe(
    "await page.getByRole('button', { name: 'ذخیره', exact: true }).click();"
  );
  expect(line({ hover: { testid: 'menu' } })).toBe("await page.getByTestId('menu').hover();");
  expect(line({ check: { label: 'قبول' } })).toBe("await page.getByLabel('قبول', { exact: true }).check();");
  expect(line({ press: 'Escape' })).toBe("await page.keyboard.press('Escape');");
  expect(line({ press: undefined })).toBe("await page.keyboard.press('Enter');");
});

test('`fill` هر دو شکل را می‌فهمد', () => {
  // شکلِ بلند: هدف + value
  expect(line({ fill: { label: 'ایمیل' }, value: 'a@b.c' })).toBe(
    "await page.getByLabel('ایمیل', { exact: true }).fill('a@b.c');"
  );

  // شکلِ کوتاه: نگاشتِ برچسب → متن، همان که ضبط‌کننده و مدل می‌سازند
  expect(line({ fill: { 'ایمیل': 'a@b.c', 'رمز': 'x' } })).toBe(
    "await page.getByLabel('ایمیل', { exact: true }).fill('a@b.c');\n" +
      "await page.getByLabel('رمز', { exact: true }).fill('x');"
  );
});

test('`type` کلیک می‌کند و با تأخیر تایپ — مثلِ بازپخش', () => {
  expect(line({ type: { label: 'جستجو' }, value: 'کتاب' })).toBe(
    "await page.getByLabel('جستجو', { exact: true }).click();\n" +
      "await page.keyboard.type('کتاب', { delay: 20 });"
  );
});

test('`wait` عددی و شرطی', () => {
  expect(line({ wait: 500 })).toBe('await page.waitForTimeout(500);');
  expect(line({ wait: 99_999 })).toBe('await page.waitForTimeout(10000);'); // سقفِ بازپخش
  expect(line({ wait: { visible: { testid: 'x' }, timeout: 3000 } })).toBe(
    "await page.getByTestId('x').waitFor({ state: 'visible', timeout: 3000 });"
  );
  expect(line({ wait: { hidden: { testid: 'x' } } })).toBe(
    "await page.getByTestId('x').waitFor({ state: 'hidden' });"
  );
});

test('فعلِ ناشناس بلند می‌شکند', () => {
  // سکوت یعنی قدمی که فکر می‌کنیم اجرا شده و نشده
  expect(() => emitAction({ request: { path: '/x' } })).toThrow(/تولیدکنندهٔ کد ندارد/);
  expect(emitAction({})).toEqual([]);
  expect(verbOf({ click: 'x', value: 'y' })).toBe('click');
});

/* ── فایلِ کامل ── */

const SCENARIO = {
  name: 'ورود',
  steps: [
    { clearState: true },
    { go: '/' },
    {
      when: { visible: { label: 'ایمیل' }, timeout: 6000 },
      then: [
        { fill: { label: 'ایمیل' }, value: '{{identity.email}}' },
        { click: { role: 'button', name: 'ورود' } },
      ],
    },
    { click: { role: 'link', name: 'کتاب‌ها' } },
    { click: { role: 'link', name: 'کتاب‌ها' } },
  ],
};

test('فایلِ تولیدشده پارس می‌شود', () => {
  const { ok, stderr } = parses(scenarioToSpec(SCENARIO));
  expect(ok, stderr).toBe(true);
});

test('`when` به شرطِ `ub.appears` تبدیل می‌شود', () => {
  const source = scenarioToSpec(SCENARIO);
  expect(source).toContain('if (await ub.appears(');
  expect(source).toContain('identity.email');
  expect(source).not.toContain('{{');
});

test('نامِ تکراری شماره می‌گیرد — چون لنگر باید یکتا باشد', () => {
  const names = stepNames(scenarioToSpec(SCENARIO));
  expect(new Set(names).size).toBe(names.length);
  expect(names.at(-1)).toMatch(/\(2\)$/);
});

test('عنوان و قدم‌ها از فایل بازخوانده می‌شوند', () => {
  const source = scenarioToSpec(SCENARIO);
  expect(testTitle(source)).toBe('ورود');
  expect(stepNames(source)).toHaveLength(SCENARIO.steps.length);
});

test('تستِ تازه ادعایی ندارد — و این عمدی است', () => {
  /**
   * کاوشگر نمی‌داند چه چیزی *باید* می‌شد؛ ادعای حدسی یعنی باگِ امروز
   * به‌عنوان «انتظارِ درست» رسمی شود. افزودنش کارِ `userbug expect` است.
   */
  const source = scenarioToSpec(SCENARIO);

  // خودِ واژه در کامنتِ بالای فایل هست («برای افزودنِ ادعا: userbug expect»)،
  // پس ادعای اجراشدنی سنجیده می‌شود نه رشته.
  expect(source).not.toMatch(/await expect[.(]/);
  expect(source).toContain("import { test } from 'userbug/test';");
});

test('سناریوی بی‌قدم فایل نمی‌سازد', () => {
  expect(() => scenarioToSpec({ name: 'x', steps: [] })).toThrow(/قدمی ندارد/);
});
