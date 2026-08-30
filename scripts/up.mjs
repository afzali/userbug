/**
 * راه‌انداز یک‌دستوری — همه‌چیز بالا، بعد رابط در مرورگر.
 *
 * ── چرا Node و نه فقط .bat ──
 *
 * نسخهٔ اول این کار یک `.bat` با `start cmd /k` بود. دو مشکل داشت: نقل‌قولِ
 * تودرتو برای مسیرِ php.exe شکننده بود، و پنجره‌های تازه از هر محیطی بالا
 * نمی‌آیند — پس نمی‌شد اثبات کرد که واقعاً کار می‌کند.
 *
 * اینجا هر سرویس یک فرزند است با خروجیِ برچسب‌دار در همین پنجره، و پیش از
 * رفتن به مرحلهٔ بعد واقعاً منتظرِ باز شدن پورت می‌مانیم. یعنی اگر چیزی بالا
 * نیامد، همان‌جا می‌فهمیم نه ده دقیقه بعد وسط یک اجرا.
 *
 * ── قاعده‌ای که عوض نشده ──
 *
 * موتور هنوز هیچ اپی را بالا نمی‌آورد؛ هدف فقط آدرس می‌گیرد. این فایل یک
 * راحتیِ توسعه است که بیرون موتور نشسته.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const NEPI = path.resolve(ROOT, '..', 'nepi');
const PHP = 'C:\\xampp\\php\\php.exe';

const flags = new Set(process.argv.slice(2));
const withTarget = !flags.has('--no-nepi');
const usePreview = flags.has('--preview');

const children = [];
let shuttingDown = false;

const paint = (label, text) => `  ${label.padEnd(6)} ${text}`;

function log(label, line) {
  const text = String(line).replace(/\s+$/, '');
  if (text) console.log(paint(`[${label}]`, text));
}

/**
 * فرزند با خروجیِ برچسب‌دار. مرگش کشنده نیست؛ فقط گزارش می‌شود.
 *
 * `useShell` برای `npm` لازم است: از Node 22 اجرای مستقیمِ فایل‌های `.cmd`
 * بدون shell با `EINVAL` رد می‌شود. همهٔ فرمان‌هایی که از این راه می‌روند
 * ثابت و در همین فایل نوشته شده‌اند، پس چیزی برای تزریق نیست.
 */
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

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(700);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/** منتظر پورت بمان. برنگشتنش کشنده نیست — گزارش می‌شود و ادامه می‌دهیم. */
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
 * vite) را زنده رها می‌کند — همان درسی که در لغو اجرا از رابط گرافیکی گرفتیم.
 */
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n  بستن سرویس‌ها...');

  for (const { label, child } of children) {
    if (!child.pid || child.exitCode !== null) continue;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
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

/**
 * فرمان‌های npm همه از راه shell می‌روند.
 *
 * روی ویندوز `npm` یک `npm.cmd` است و Node 22 اجرای مستقیمِ `.cmd` را با
 * `EINVAL` رد می‌کند (سخت‌سازیِ امنیتی). آرگومان‌ها همه ثابت‌اند.
 */
function runOnce(label, command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, stdio: 'inherit', shell: true, windowsHide: true });
    child.once('error', reject);
    child.once('close', (code) => (code === 0 ? resolve() : reject(new Error(`${label} با کد ${code} بسته شد`))));
  });
}

console.log('\n  userbug — بالا آوردن محیط\n  ' + '─'.repeat(40));

if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
  console.log(paint('[نصب]', 'نخستین اجرا: وابستگی‌های userbug...'));
  await runOnce('npm install', 'npm install', ROOT);
}

if (withTarget) {
  if (!fs.existsSync(path.join(NEPI, 'package.json'))) {
    console.error(paint('[خطا]', `پوشهٔ نپی پیدا نشد: ${NEPI}`));
    console.error(paint('', 'این راه‌انداز فرض می‌کند userbug و nepi کنار هم‌اند.'));
    console.error(paint('', 'بدون هدف: node scripts/up.mjs --no-nepi'));
    process.exit(1);
  }

  if (!fs.existsSync(path.join(NEPI, 'node_modules'))) {
    console.log(paint('[نصب]', 'وابستگی‌های نپی...'));
    await runOnce('npm install (nepi)', 'npm install', NEPI);
  }

  if (usePreview) {
    // هدف `nepi-preview`: بیلد تولیدی روی ۴۱۷۳ — تنها راهِ سنجشِ آفلاین.
    // `build:noversion` عمدی است: بیلد معمولی نسخه و changelog را جلو می‌برد.
    console.log(paint('[بیلد]', 'بیلد تولیدی نپی (بدون جلو بردن نسخه)...'));
    await runOnce('build:noversion', 'npm run build:noversion', NEPI);
    start('nepi', 'npm', ['run', 'preview'], NEPI, true);
    await waitForPort(4173, 'nepi');
  } else {
    start('nepi', 'npm', ['run', 'dev'], NEPI, true);
    await waitForPort(5173, 'nepi');
  }

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
    await waitForPort(8081, 'api', 20);
  } else {
    // نبودش اجرا را نمی‌شکند؛ فقط سناریوهای سمت سرور بی‌معنا می‌شوند.
    console.log(paint('[api]', `رد شد: php.exe در ${PHP} نبود. سناریوهای سمت سرور اجرا نمی‌شوند.`));
  }
}

console.log(paint('[ui]', 'ساخت رابط...'));
await runOnce('ui:build', 'npm run ui:build', ROOT);

start('ui', 'npm', ['run', 'ui:start'], ROOT, true);
const ready = await waitForPort(4174, 'ui', 60);

console.log('\n  ' + '─'.repeat(40));
if (withTarget) console.log(paint('', usePreview ? 'هدف:  http://localhost:4173  (nepi-preview)' : 'هدف:  http://localhost:5173  (nepi)'));
console.log(paint('', 'رابط: http://127.0.0.1:4174'));
console.log(paint('', 'بستن: Ctrl+C'));
console.log('  ' + '─'.repeat(40) + '\n');

if (!ready) process.exitCode = 1;
