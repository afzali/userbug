/**
 * خودآزمای قالبِ پروژهٔ تازه.
 *
 * دو چیز اینجا سنجیده می‌شود و هر دو مهم‌اند:
 *
 *   ۱. خروجی باید جاوااسکریپتِ معتبر و **قابل import** باشد. فرمی که فایل
 *      شکسته بتواند بسازد، بدتر از نبودنش است.
 *   ۲. `environment: 'local'` روی میزبان عمومی باید رد شود. این محیط قلاب
 *      shell و درخواست POST و SQL نویسنده را باز می‌کند؛ در فایلِ دستی
 *      کامنت‌هایش را می‌خوانی، در یک کشویی فقط یک کلیک است.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';
import { renderTargetConfig, assertProjectFields, assertProjectKey } from '../../src/target-template.js';

const BASE = { key: 'sample', baseURL: 'http://localhost:3000', environment: 'local' };

/** سورس را روی دیسک بنویس و واقعاً import کن. */
async function importRendered(fields) {
  const file = path.join(os.tmpdir(), `ub-template-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  fs.writeFileSync(file, renderTargetConfig(fields), 'utf8');
  try {
    return (await import(pathToFileURL(file).href)).default;
  } finally {
    fs.rmSync(file, { force: true });
  }
}

test('خروجی import می‌شود و شکلِ موردانتظار را دارد', async () => {
  const config = await importRendered({
    ...BASE,
    name: 'نمونه',
    apiURL: 'http://127.0.0.1:8080',
    logs: [{ name: 'back', path: 'D:\\logs\\err.log' }],
    sourceRoot: 'D:\\Projects\\sample',
  });

  expect(config.name).toBe('نمونه');
  expect(config.baseURL).toBe('http://localhost:3000');
  expect(config.apiURL).toBe('http://127.0.0.1:8080');
  expect(config.environment).toBe('local');
  // بک‌اسلشِ ویندوز باید به اسلش تبدیل شده باشد، وگرنه در سورس فرار می‌خواست
  expect(config.logs).toEqual([{ type: 'file', name: 'back', path: 'D:/logs/err.log' }]);
  expect(config.source).toEqual({ root: 'D:/Projects/sample' });
  expect(Array.isArray(config.allowlist)).toBe(true);
});

test('بدون لاگ و بدون سورس هم فایل معتبر است', async () => {
  const config = await importRendered(BASE);
  expect(config.logs).toEqual([]);
  expect(config.source).toBeUndefined();
  expect(config.apiURL).toBeUndefined();
});

test('محیط local روی میزبان عمومی رد می‌شود', () => {
  expect(() => renderTargetConfig({ ...BASE, baseURL: 'https://example.org' })).toThrow(/local/);
  // آدرس API هم همان قاعده را دارد؛ فرانت لوکال کافی نیست
  expect(() =>
    renderTargetConfig({ ...BASE, apiURL: 'https://api.example.org' })
  ).toThrow(/local/);
});

test('میزبان‌های واقعاً محلی پذیرفته می‌شوند', () => {
  for (const host of ['localhost', '127.0.0.1', '192.168.1.10', '10.0.0.5', 'myapp.test']) {
    expect(() => renderTargetConfig({ ...BASE, baseURL: `http://${host}:8080` })).not.toThrow();
  }
});

test('میزبان عمومی با staging یا production مجاز است', () => {
  for (const environment of ['staging', 'production']) {
    expect(() => renderTargetConfig({ ...BASE, baseURL: 'https://example.org', environment })).not.toThrow();
  }
});

test('ورودی نامعتبر بلند می‌شکند', () => {
  expect(() => assertProjectKey('../escape')).toThrow();
  expect(() => assertProjectKey('my.config')).toThrow(/پسوند/);
  expect(() => assertProjectFields({ ...BASE, baseURL: '' })).toThrow(/لازم/);
  expect(() => assertProjectFields({ ...BASE, baseURL: 'ftp://x/y' })).toThrow(/http/);
  expect(() => assertProjectFields({ ...BASE, environment: 'dev' })).toThrow(/محیط/);
  expect(() => assertProjectFields({ ...BASE, logs: [{ name: 'a b', path: 'x' }] })).toThrow(/نام لاگ/);
});

test('اسلشِ انتهای آدرس برداشته می‌شود', () => {
  expect(assertProjectFields({ ...BASE, baseURL: 'http://localhost:3000/' }).baseURL).toBe('http://localhost:3000');
});

test('لاگِ بی‌مسیر حذف می‌شود، نه اینکه ردیف خالی بسازد', () => {
  const fields = assertProjectFields({
    ...BASE,
    logs: [{ name: 'front', path: '' }, { name: 'back', path: 'D:/x.log' }],
  });
  expect(fields.logs).toEqual([{ type: 'file', name: 'back', path: 'D:/x.log' }]);
});

test('لاگِ فرمانی هم پذیرفته می‌شود — سرورهایی که فایل ندارند', () => {
  /**
   * ── چرا این لازم شد ──
   *
   * تا امروز فقط `type: 'file'` بود، یعنی سرور باید روی دیسک می‌نوشت. ولی
   * `npm run dev` روی stdout می‌نویسد و داکر در `docker logs` نگه می‌دارد.
   * نتیجه‌اش روی پروژهٔ واقعی این بود: یک خط لاگ در کلِ اجرا.
   */
  const fields = assertProjectFields({
    ...BASE,
    logs: [{ name: 'docker', command: 'docker', args: ['logs', '-f', 'app'] }],
  });
  expect(fields.logs).toEqual([
    { type: 'command', name: 'docker', command: 'docker', args: ['logs', '-f', 'app'], cwd: '' },
  ]);
});

test('آرگومان‌ها آرایه می‌مانند؛ رشتهٔ فرمان پذیرفته نمی‌شود', () => {
  /**
   * همان درسی که `schedule.js` نوشت و این مخزن یک بار با `shell: true` خورد:
   * رشتهٔ فرمان یعنی مقدارِ کانفیگ می‌تواند فرمانِ دیگری اجرا کند.
   */
  const fields = assertProjectFields({
    ...BASE,
    logs: [{ name: 'x', command: 'sh', args: 'rm -rf /' }],
  });
  expect(fields.logs[0].args).toEqual([]);
});

test('فرمان در کانفیگِ ساخته‌شده هم درست رندر می‌شود', () => {
  const text = renderTargetConfig(
    assertProjectFields({ ...BASE, logs: [{ name: 'docker', command: 'docker', args: ['logs', '-f', 'app'] }] })
  );
  expect(text).toContain("{ type: 'command', name: 'docker', command: 'docker', args: ['logs', '-f', 'app'] }");
});
