/**
 * خودآزمای دسترسی به سورس.
 *
 * این تنها جایی است که ابزار بیرون از مخزنِ خودش می‌خواند و محتوا را به یک
 * سرویسِ بیرونی می‌فرستد. پس راه‌های فرار اینجا سنجیده می‌شوند، نه با امید.
 *
 * درختِ آزمایشی روی دیسکِ موقت ساخته می‌شود تا سنجه به سورسِ هیچ پروژهٔ واقعی
 * بند نباشد.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  findRelevantSource,
  isSecretPath,
  keywords,
  listSourceFiles,
  readSourceFile,
  resolveSourceRoot,
} from '../../src/source-access.js';

/** درختِ نمونه، با یک فایل راز و یک پوشهٔ سنگین که باید رد شوند. */
async function makeTree() {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'ub-source-'));
  const root = path.join(base, 'app');

  const write = (relative, content) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  };

  write('src/routes/notes/+page.svelte', [
    '<script>',
    "  let title = '';",
    '</script>',
    '',
    '<button>یادداشت جدید</button>',
    '<input placeholder="عنوان یادداشت" />',
    '<button>ذخیره</button>',
  ].join('\n'));

  write('src/lib/list.svelte', '<h1>فهرست یادداشت‌ها</h1>');
  write('src/lib/unrelated.js', 'export const answer = 42;');
  write('.env', 'OPENROUTER_API_KEY=secret-value-must-not-leak');
  write('keys/server.pem', 'PRIVATE KEY');
  write('node_modules/lib/index.js', 'برچسب یادداشت جعلی');
  write('static/logo.png', 'binary-ish');

  // فایلی بیرون از ریشه، برای سنجشِ فرار
  fs.writeFileSync(path.join(base, 'outside.js'), 'راز بیرونی', 'utf8');

  return { base, root };
}

test('بدون اعلام source.root، خواندن ممکن نیست', async () => {
  await expect(resolveSourceRoot({ key: 'x' })).rejects.toThrow(/source\.root/);
  await expect(resolveSourceRoot({ key: 'x', source: {} })).rejects.toThrow(/source\.root/);
  await expect(
    resolveSourceRoot({ key: 'x', source: { root: path.join(os.tmpdir(), 'ub-does-not-exist-xyz') } })
  ).rejects.toThrow(/پیدا نشد/);
});

test('فهرست فایل‌ها، بدون node_modules و بدون فایل راز و بدون باینری', async () => {
  const { base, root } = await makeTree();
  try {
    const files = await listSourceFiles(root);

    expect(files).toContain('src/routes/notes/+page.svelte');
    expect(files).toContain('src/lib/list.svelte');
    expect(files.some((file) => file.startsWith('node_modules/'))).toBe(false);
    expect(files).not.toContain('.env');
    expect(files).not.toContain('keys/server.pem');
    expect(files).not.toContain('static/logo.png');
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test('فرار از ریشه رد می‌شود', async () => {
  const { base, root } = await makeTree();
  try {
    for (const escape of ['../outside.js', '..\\outside.js', 'src/../../outside.js']) {
      await expect(readSourceFile(root, escape)).rejects.toThrow();
    }
    // مسیر مطلق هم نباید کار کند
    await expect(readSourceFile(root, path.join(base, 'outside.js'))).rejects.toThrow();
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test('فایل راز حتی داخل ریشه خوانده نمی‌شود', async () => {
  const { base, root } = await makeTree();
  try {
    await expect(readSourceFile(root, '.env')).rejects.toThrow(/راز/);
    await expect(readSourceFile(root, 'keys/server.pem')).rejects.toThrow(/راز/);
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test('الگوهای راز، نام‌های رایج را می‌گیرند', () => {
  for (const name of ['.env', '.env.local', 'a/.env', 'certs/site.key', 'id_rsa', 'x/.npmrc', 'config/credentials.json']) {
    expect(isSecretPath(name)).toBe(true);
  }
  for (const name of ['src/env.js', 'src/keyboard.js', 'lib/secretsanta.svelte'].slice(0, 2)) {
    expect(isSecretPath(name)).toBe(false);
  }
});

test('پسوند ناخوانا رد می‌شود', async () => {
  const { base, root } = await makeTree();
  try {
    await expect(readSourceFile(root, 'static/logo.png')).rejects.toThrow(/پسوند/);
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test('واژه‌های معنادار از متن بیرون کشیده می‌شوند', () => {
  const words = keywords('یک یادداشت تازه بساز و ذخیره کن که در فهرست دیده شود');
  expect(words).toContain('یادداشت');
  expect(words).toContain('ذخیره');
  expect(words).toContain('فهرست');
  // واژه‌های پرتکرار و کوتاه کنار می‌روند
  expect(words).not.toContain('که');
  expect(words).not.toContain('در');
});

test('تکه‌های مرتبط، فایل درست را پیدا می‌کنند و شماره خط می‌دهند', async () => {
  const { base, root } = await makeTree();
  try {
    const found = await findRelevantSource({
      root,
      text: 'یک یادداشت تازه بساز، عنوان بگذار، ذخیره کن و در فهرست ببین',
    });

    expect(found.files[0]).toBe('src/routes/notes/+page.svelte');
    expect(found.snippets).toContain('یادداشت جدید');
    expect(found.snippets).toContain('ذخیره');
    // شمارهٔ خط باید بیاید، وگرنه ارجاع دادن به کد ممکن نیست
    expect(found.snippets).toMatch(/\d+: /);
    // فایل بی‌ربط و node_modules نباید بیایند
    expect(found.files).not.toContain('src/lib/unrelated.js');
    expect(found.files.some((file) => file.startsWith('node_modules/'))).toBe(false);
    // و هیچ راز‌ی در خروجی نباشد
    expect(found.snippets).not.toContain('secret-value-must-not-leak');
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test('نیم‌فاصله مانع تطبیق نمی‌شود', async () => {
  const { base, root } = await makeTree();
  try {
    // کاربر «یادداشت‌ها» با نیم‌فاصله نوشته؛ سورس «یادداشت» دارد
    const found = await findRelevantSource({ root, text: 'یادداشت‌ها را ذخیره کن' });
    expect(found.files.length).toBeGreaterThan(0);
    expect(found.snippets).toContain('یادداشت');
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test('قالبِ رابط بر مستند و تست می‌چربد', async () => {
  const { base, root } = await makeTree();
  try {
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'docs', 'notes.md'),
      Array(40).fill('یادداشت عنوان ذخیره فهرست').join('\n'),
      'utf8'
    );

    const found = await findRelevantSource({ root, text: 'یادداشت بساز، عنوان بگذار، ذخیره کن، فهرست را ببین' });
    // مستند واژه‌ها را بیشتر دارد، ولی برچسبِ قابل کلیک در قالب است
    expect(found.files[0]).toBe('src/routes/notes/+page.svelte');
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test('متنِ بی‌واژه، سورسی برنمی‌گرداند', async () => {
  const { base, root } = await makeTree();
  try {
    const found = await findRelevantSource({ root, text: 'a b c' });
    expect(found.files).toEqual([]);
    expect(found.snippets).toBe('');
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});
