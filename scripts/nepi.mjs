/**
 * بالا آوردنِ نپی — سرور توسعه و API لوکال.
 *
 * ── چرا این فایل جدا از راه‌اندازِ ابزار است ──
 *
 * `serve.mjs` هیچ اپی را بالا نمی‌آورد و نباید بیاورد؛ ابزارِ عمومیِ آزمون
 * نباید بداند نپی با چه دستوری بالا می‌آید یا php.exe کجاست.
 *
 * ولی نداشتنِ **هیچ** میان‌بری هم یعنی هر بار دو پنجره و چهار دستور. پس
 * راحتی می‌ماند و فقط از موتور بیرون می‌آید: این فایل چیزی جز یک اسکریپتِ
 * شخصی نیست و نامش هم صریح می‌گوید دربارهٔ کدام اپ است.
 *
 * قاعده‌ای که با همین نام‌گذاری حفظ می‌شود: هیچ چیزِ عمومی‌نامی دربارهٔ نپی
 * چیزی نمی‌داند. اگر فردا پروژهٔ دومی بیاید، `scripts/<نامش>.mjs` خودش را
 * می‌گیرد و هیچ‌کدام به دیگری دست نمی‌زند.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const NEPI = process.env.NEPI_ROOT || path.resolve(ROOT, '..', 'nepi');
const PHP = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';

const flags = new Set(process.argv.slice(2));
const usePreview = flags.has('--preview');
const withApi = !flags.has('--no-api');

const children = [];
let shuttingDown = false;

const paint = (label, text) => `  ${label.padEnd(7)} ${text}`;

function log(label, line) {
  const text = String(line).replace(/\s+$/, '');
  if (text) console.log(paint(`[${label}]`, text));
}

function start(label, command, args, cwd, useShell = false) {
  const child = spawn(useShell ? [command, ...args].join(' ') : command, useShell ? undefined : args, {
    cwd,
    shell: useShell,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  children.push({ label, child });

  const pipe = (stream) => {
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) log(label, line);
    });
  };

  pipe(child.stdout);
  pipe(child.stderr);

  child.once('error', (cause) => log(label, `اجرا نشد: ${cause.message}`));
  child.once('close', (code) => {
    if (!shuttingDown) log(label, `بسته شد (کد ${code})`);
  });

  return child;
}

function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(700, () => done(false));
  });
}

async function waitForPort(port, label, seconds = 60) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (await portOpen(port)) {
      log(label, `آماده روی ${port}`);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  log(label, `تا ${seconds} ثانیه روی ${port} بالا نیامد`);
  return false;
}

/**
 * بستنِ کلِ درخت فرآیند.
 *
 * `child.kill()` روی ویندوز فقط والد را می‌بندد و `npm` فرزندِ واقعی (node یا
 * vite) را زنده رها می‌کند.
 */
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const { label, child } of children) {
    if (!child.pid || child.exitCode !== null) continue;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
          shell: false,
        });
      } else {
        child.kill('SIGTERM');
      }
    } catch (cause) {
      log(label, `بستن ناموفق: ${cause.message}`);
    }
  }
}

process.on('SIGINT', () => {
  shutdown();
  setTimeout(() => process.exit(0), 1500);
});
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);

function runOnce(label, command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, stdio: 'inherit', shell: true, windowsHide: true });
    child.once('error', reject);
    child.once('close', (code) => (code === 0 ? resolve() : reject(new Error(`${label} با کد ${code} بسته شد`))));
  });
}

/* ─────────────────────────────────────────────────────────── */

console.log('\n  نپی — بالا آوردن اپ\n  ' + '─'.repeat(46));

if (!fs.existsSync(path.join(NEPI, 'package.json'))) {
  console.error(paint('[خطا]', `پوشهٔ نپی پیدا نشد: ${NEPI}`));
  console.error(paint('', 'اگر جای دیگری است: set NEPI_ROOT=D:\\path\\to\\nepi'));
  process.exit(1);
}

if (!fs.existsSync(path.join(NEPI, 'node_modules'))) {
  console.log(paint('[نصب]', 'وابستگی‌های نپی...'));
  await runOnce('npm install (nepi)', 'npm install', NEPI);
}

let appPort;
if (usePreview) {
  /**
   * بیلد تولیدی روی ۴۱۷۳ — تنها راهِ سنجشِ آفلاین.
   *
   * `build:noversion` عمدی است: بیلد معمولی نسخه و changelog را جلو می‌برد،
   * و بالا آوردنِ اپ برای آزمون نباید تاریخچهٔ نسخه را دست بزند.
   */
  console.log(paint('[بیلد]', 'بیلد تولیدی نپی (بدون جلو بردن نسخه)...'));
  await runOnce('build:noversion', 'npm run build:noversion', NEPI);
  start('nepi', 'npm', ['run', 'preview'], NEPI, true);
  appPort = 4173;
} else {
  start('nepi', 'npm', ['run', 'dev'], NEPI, true);
  appPort = 5173;
}
const appReady = await waitForPort(appPort, 'nepi');

let apiReady = false;
if (withApi) {
  if (fs.existsSync(PHP)) {
    start(
      'api',
      PHP,
      [
        '-d',
        'log_errors=1',
        '-d',
        `error_log=${path.join(NEPI, 'nepi-data', 'php-error.log')}`,
        '-S',
        '127.0.0.1:8081',
        '-t',
        path.join(NEPI, 'server', 'public'),
      ],
      NEPI
    );
    apiReady = await waitForPort(8081, 'api', 20);
  } else {
    // نبودش اجرا را نمی‌شکند؛ فقط سناریوهای سمت سرور بی‌معنا می‌شوند.
    console.log(paint('[api]', `رد شد: php.exe در ${PHP} نبود. سناریوهای سمت سرور اجرا نمی‌شوند.`));
  }
}

console.log('\n  ' + '─'.repeat(46));
console.log(paint('', `فرانت: http://localhost:${appPort}`));
if (apiReady) console.log(paint('', 'API:   http://127.0.0.1:8081'));
console.log(paint('', 'لاگ:   ' + path.join(NEPI, 'nepi-data', 'php-error.log')));
console.log(paint('', 'سورس:  ' + NEPI));
console.log(paint('', 'بستن:  Ctrl+C'));
console.log('  ' + '─'.repeat(46));

/**
 * چهار خطِ بالا دقیقاً همان چیزی است که فرم «پروژهٔ تازه» می‌خواهد.
 *
 * چاپشان تصادفی نیست: کاربر باید بتواند کپی کند، نه اینکه در پوشه‌ها دنبال
 * مسیر لاگ بگردد.
 */
console.log('\n  این چهار مقدار را در userbug → «پروژهٔ تازه» بگذارید.\n');

if (!appReady) process.exitCode = 1;
