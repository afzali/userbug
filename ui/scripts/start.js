import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

const uiRoot = path.resolve(import.meta.dirname, '..');
process.chdir(uiRoot);
process.env.USERBUG_ROOT = path.resolve(uiRoot, '..');
process.env.HOST = '127.0.0.1';

/**
 * پورت پیش از راه‌اندازی سنجیده می‌شود، نه با شکستِ سرور کشف.
 *
 * بدون این، `adapter-node` با `EACCES` و یک stack trace می‌مرد و پیامش
 * دربارهٔ علتِ واقعی — بازهٔ رزروشدهٔ ویندوز — هیچ نمی‌گفت. توضیحش در
 * `scripts/port.mjs`.
 *
 * اگر `PORT` صریح داده شده باشد دست نمی‌خورد: کسی که پورت را تعیین کرده
 * دلیلی داشته، و عوض کردنِ خاموشش بدتر از شکستن است.
 */
if (!process.env.PORT) {
  const { pickPort } = await import('../../scripts/port.mjs');
  const port = await pickPort(4174);
  if (port !== 4174) {
    console.log(`رابط روی ${port} بالا می‌آید — ۴۱۷۴ روی این ویندوز رزرو شده است.`);
  }
  process.env.PORT = String(port);
}

process.env.ORIGIN ||= `http://127.0.0.1:${process.env.PORT}`;

/**
 * سقفِ بدنهٔ درخواست — برای آپلودِ fixture.
 *
 * پیش‌فرضِ `adapter-node` نیم‌مگابایت است و برای فرم‌های متنی کافی؛ ولی
 * فایلی که سناریو آپلود می‌کند تا ۲۵ مگابایت مجاز است (`fixtures.js`) و
 * بی این خط، هر فایلِ بزرگ‌تر از نیم‌مگ با خطای مبهمِ شبکه رد می‌شد.
 *
 * کمی بالاتر از سقفِ خودِ fixture، تا مرزِ واقعی همان‌جا باشد که پیامِ
 * خوانا دارد.
 */
process.env.BODY_SIZE_LIMIT ||= String(28 * 1024 * 1024);

await import('../build/index.js');
const { shutdownJobs } = await import('../src/lib/server/jobs.js');

let shutdownPromise = null;
function beginShutdown() {
  shutdownPromise ||= Promise.allSettled([
    shutdownJobs(),
    once(process, 'sveltekit:shutdown'),
  ]);
  return shutdownPromise;
}

process.prependListener('SIGINT', beginShutdown);
process.prependListener('SIGTERM', beginShutdown);
process.once('sveltekit:shutdown', () => shutdownJobs());

if (process.env.USERBUG_NO_OPEN !== '1') {
  const url = process.env.ORIGIN;
  const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const opener = spawn(command, [url], { detached: true, stdio: 'ignore', windowsHide: true });
  opener.unref();
}
