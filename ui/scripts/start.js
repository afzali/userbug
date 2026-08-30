import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

const uiRoot = path.resolve(import.meta.dirname, '..');
process.chdir(uiRoot);
process.env.USERBUG_ROOT = path.resolve(uiRoot, '..');
process.env.HOST = '127.0.0.1';
process.env.PORT ||= '4174';
process.env.ORIGIN ||= `http://127.0.0.1:${process.env.PORT}`;

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
