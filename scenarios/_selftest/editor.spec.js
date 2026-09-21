/**
 * خودآزمای ورودی از راهِ ویرایشگر.
 *
 * ── چرا این راه لازم شد ──
 *
 * کاربر گفت «موقع فارسی تایپ کردن در گشت هم به‌هم می‌ریزد». ادعای قبلیِ
 * من غلط بود: گفته بودم ورودی مشکلی ندارد چون بایت‌ها درست می‌رسند. درست
 * می‌رسند، ولی کاربر **نمی‌بیند چه می‌نویسد** — echo از همان رندررِ خرابِ
 * کنسول رد می‌شود، و `readline` مکان‌نما را چپ‌به‌راست حساب می‌کند پس
 * backspace هم جابه‌جا می‌شود.
 *
 * هیچ‌کدام از داخلِ Node رفع‌شدنی نیست. ویرایشگر bidi دارد.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { viaEditor } from '../../src/ask.js';

/** ویرایشگرِ ساختگی: متنی را به فایل می‌افزاید و برمی‌گردد. */
function fakeEditor(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-ed-'));
  const isWindows = process.platform === 'win32';
  const file = path.join(dir, isWindows ? 'ed.cmd' : 'ed.sh');

  /**
   * متنِ خالی یعنی «ویرایشگر باز شد و کاربر چیزی ننوشت».
   *
   * `echo` با آرگومانِ خالی در cmd.exe رشتهٔ `ECHO is off.` می‌نویسد — پس
   * آن حالت باید اصلاً چیزی ننویسد، وگرنه خودآزما چیزی را می‌سنجد که خودش
   * ساخته.
   */
  const script = text
    ? isWindows
      ? `@echo off\r\n>>%1 echo ${text}\r\n`
      : `#!/bin/sh\necho "${text}" >> "$1"\n`
    : isWindows
      ? '@echo off\r\n'
      : '#!/bin/sh\nexit 0\n';

  fs.writeFileSync(file, script, 'utf8');
  if (!isWindows) fs.chmodSync(file, 0o755);
  return { file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

async function withEditor(text, fn) {
  const { file, cleanup } = fakeEditor(text);
  const before = process.env.VISUAL;
  process.env.VISUAL = file;
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.VISUAL;
    else process.env.VISUAL = before;
    cleanup();
  }
}

test('متنِ فارسی از ویرایشگر سالم برمی‌گردد', async () => {
  const out = await withEditor('کتابخانهٔ من', () => viaEditor());
  expect(out).toBe('کتابخانهٔ من');
});

test('خطوطِ راهنما در خروجی نمی‌آیند', async () => {
  /**
   * بی این، راهنمایی که خودمان نوشتیم به‌عنوان توضیحِ صفحه ثبت می‌شد — و
   * در گزارش دیده می‌شد، به‌نامِ کاربر.
   */
  const out = await withEditor('نام صفحه', () =>
    viaEditor({ hint: 'این را بنویسید\nخطِ دوم راهنما' })
  );
  expect(out).toBe('نام صفحه');
  expect(out).not.toContain('#');
  expect(out).not.toContain('راهنما');
});

test('متنِ اولیه در فایل می‌نشیند', async () => {
  // ویرایشگرِ ساختگی فقط می‌افزاید، پس هر دو باید باشند
  const out = await withEditor('دوم', () => viaEditor({ initial: 'اول' }));
  expect(out).toContain('اول');
  expect(out).toContain('دوم');
});

test('فایلِ خالی، رشتهٔ خالی می‌دهد — نه فاصله', async () => {
  // «چیزی ننوشت» باید از «فاصله نوشت» قابلِ تشخیص باشد
  const out = await withEditor('', () => viaEditor());
  expect(out).toBe('');
});

test('ویرایشگرِ نبوده، خطای روشن می‌دهد', async () => {
  const before = process.env.VISUAL;
  process.env.VISUAL = 'ویرایشگری-که-وجود-ندارد-۹۹۹';
  try {
    // یا می‌شکند یا خالی برمی‌گردد؛ هیچ‌کدام نباید بی‌صدا متنِ غلط بدهد
    const out = await viaEditor().catch((cause) => {
      expect(cause.message).toMatch(/ویرایشگر/);
      return '';
    });
    expect(out).toBe('');
  } finally {
    if (before === undefined) delete process.env.VISUAL;
    else process.env.VISUAL = before;
  }
});
