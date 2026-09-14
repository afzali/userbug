/**
 * راه‌انداز — فقط userbug.
 *
 * ── چرا این فایل جای `up.mjs` را می‌گیرد ──
 *
 * `up.mjs` نپی و سرور PHP‌اش را هم بالا می‌آورد. آن یک راحتیِ توسعه بود که
 * از روزِ اول با قاعدهٔ خودِ پروژه می‌جنگید:
 *
 *   «ساختارِ بالا آوردن سیستم ربطی به برنامهٔ ما ندارد.»
 *
 * و بهایش را هم می‌داد: مسیرِ `../nepi` را حدس می‌زد، `C:\xampp\php\php.exe`
 * را می‌دانست، `build:noversion` را می‌شناخت. یعنی ابزارِ عمومیِ آزمون، سه
 * چیز دربارهٔ یک اپِ خاص می‌دانست. هر پروژهٔ دومی همان‌جا گیر می‌کرد.
 *
 * ── چرا بالا نیاوردنِ اپ، محدودیت نیست ──
 *
 * توسعه‌دهنده اپش را با دستورِ خودش بالا می‌آورد — با watch، با پورتِ
 * دلخواه، با متغیرهای محیطیِ خودش، گاهی در داکر. ابزاری که بخواهد جایش
 * تصمیم بگیرد، یا اشتباه می‌کند یا فهرستِ بی‌پایانی از حالت‌های خاص می‌شود.
 *
 * پس فقط می‌پرسد آدرس چیست، و اگر کسی آنجا نبود صریح می‌گوید.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { pickPort } from './port.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const flags = new Set(process.argv.slice(2));

/**
 * حالتِ توسعه — بیلد نگیر، خودِ سورس را سرو کن.
 *
 * ── چرا لازم شد ──
 *
 * راه‌انداز همیشه `ui:build` می‌گرفت و نسخهٔ ساخته‌شده را بالا می‌آورد. یعنی
 * هر تغییرِ کوچک در رابط، یک بستن و باز کردنِ کامل می‌خواست — و بدتر:
 * مرورگری که باز مانده بود، بی‌صدا نسخهٔ **قدیمی** را نشان می‌داد و آدم فکر
 * می‌کرد تغییرش کار نکرده.
 *
 * با `--dev`، `vite dev` بالا می‌آید و هر ذخیره همان لحظه در مرورگر می‌نشیند.
 */
const dev = flags.has('--dev');

const children = [];
let shuttingDown = false;

const paint = (label, text) => `  ${label.padEnd(6)} ${text}`;

function log(label, line) {
  const text = String(line).replace(/\s+$/, '');
  if (text) console.log(paint(`[${label}]`, text));
}

function start(label, command, args, cwd, env = null) {
  const child = spawn([command, ...args].join(' '), {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    shell: true,
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
 * `child.kill()` روی ویندوز فقط والد را می‌بندد و `npm` فرزندِ واقعی را زنده
 * رها می‌کند — همان درسی که در لغو اجرا از رابط گرافیکی گرفتیم.
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

console.log('\n  userbug\n  ' + '─'.repeat(46));

if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
  console.log(paint('[نصب]', 'نخستین اجرا: وابستگی‌ها...'));
  await runOnce('npm install', 'npm install', ROOT);
}

if (dev) {
  console.log(paint('[حالت]', 'توسعه — بی بیلد، با بازتابِ زندهٔ تغییرها.'));
} else {
  console.log(paint('[بیلد]', 'ساخت رابط...'));
  await runOnce('ui:build', 'npm run ui:build', ROOT);
}

const port = await pickPort(4174);
if (port !== 4174) log('رابط', `۴۱۷۴ روی این ویندوز رزرو شده؛ رابط روی ${port} بالا می‌آید.`);

/**
 * پورت دو راهِ متفاوت دارد و هر دو لازم‌اند.
 *
 * نسخهٔ ساخته‌شده `PORT` را از محیط می‌خواند. ولی `vite dev` در این پروژه با
 * `--port 4174 --strictPort` ثابت شده، پس باید پرچمِ صریح بگیرد وگرنه روی
 * پورتِ انتخاب‌شده بالا نمی‌آید و `waitForPort` بی‌دلیل شصت ثانیه صبر می‌کند.
 *
 * ── و چرا مستقیم در پوشهٔ `ui` ──
 *
 * نسخهٔ اول `npm run ui:dev -- --port N` را از ریشه صدا زد و نشد: دو لایه
 * `npm run` تو در تو، و `--` در لایهٔ بیرونی گم می‌شود. نتیجه‌اش
 * `vite dev … --strictPort 4174` بود و vite با خطای نامفهومِ
 * «paths[0] must be a string» مرد. یک لایه `npm`، یک مسئله کمتر.
 */
if (dev) {
  start('رابط', 'npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], path.join(ROOT, 'ui'));
} else {
  start('رابط', 'npm', ['run', 'ui:start'], ROOT, {
    PORT: String(port),
    ORIGIN: `http://127.0.0.1:${port}`,
    USERBUG_NO_OPEN: flags.has('--no-open') ? '1' : process.env.USERBUG_NO_OPEN || '',
  });
}

const ready = await waitForPort(port, 'رابط', 60);

/**
 * باز کردنِ مرورگر در حالتِ توسعه، اینجا.
 *
 * در نسخهٔ ساخته‌شده این کار را `ui/scripts/start.js` می‌کند، ولی `vite dev`
 * آن فایل را اصلاً اجرا نمی‌کند. بی این خط، `--dev` بی‌صدا مرورگر باز
 * نمی‌کرد و فرقش با حالتِ عادی شبیهِ خرابی به نظر می‌رسید.
 */
if (dev && ready && !flags.has('--no-open') && process.env.USERBUG_NO_OPEN !== '1') {
  const command =
    process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(command, [`http://127.0.0.1:${port}`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

console.log('\n  ' + '─'.repeat(46));
console.log(paint('', `رابط: http://127.0.0.1:${port}${dev ? '  (توسعه)' : ''}`));
console.log(paint('', dev ? 'تغییرِ رابط را ذخیره کنید؛ همین‌جا بازتاب می‌شود.' : 'برای بازتابِ تغییرها: start.bat --dev'));
console.log(paint('', 'بستن: Ctrl+C'));
console.log('  ' + '─'.repeat(46));

/**
 * یادآوریِ اینکه اپِ هدف کارِ خودِ شماست.
 *
 * صریح نوشته می‌شود چون سکوت در اینجا به‌معنای «همه‌چیز آماده است» خوانده
 * می‌شود، و بعد نخستین اجرا با «صفحه بالا نیامد» شکست می‌خورد — یافته‌ای که
 * دربارهٔ اپ هیچ نمی‌گوید.
 */
console.log('\n  اپِ خودتان را جدا بالا بیاورید؛ userbug فقط سراغش می‌رود.');
console.log('  مثال: npm run dev در پوشهٔ پروژه‌تان — بعد همان آدرس را');
console.log('  در «پروژهٔ تازه» وارد کنید.\n');

if (!ready) process.exitCode = 1;
