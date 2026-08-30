import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { listProjects } from './projects.js';
import { ROOT, RUNS_DIR, assertSafeSegment, resolveInside } from './paths.js';
import { readJson } from './artifacts.js';

const GUI_RUN_MARKER = '@@USERBUG_GUI_RUN@@';
const JOBS_KEY = Symbol.for('userbug.ui.jobs');
const MAX_RETAINED_COMPLETED_JOBS = 64;
const state = globalThis[JOBS_KEY] || {
  jobs: new Map(),
  activeId: null,
  shuttingDown: false,
  shutdownPromise: null,
};
state.shuttingDown ??= false;
state.shutdownPromise ??= null;
globalThis[JOBS_KEY] = state;

const ACTIVE_STATUSES = new Set(['starting', 'running', 'cancelling']);
const CANCELLABLE_STATUSES = new Set(['starting', 'running']);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runDir(runId) {
  return resolveInside(RUNS_DIR, assertSafeSegment(runId, 'شناسهٔ اجرا'));
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function publicJob(job, includeHistory = false) {
  return {
    id: job.id,
    status: job.status,
    outcome: job.outcome,
    target: job.target,
    options: job.options,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || null,
    runs: [...job.runs],
    activeRun: job.activeRun || null,
    exitCode: job.exitCode ?? null,
    error: job.error || null,
    events: includeHistory ? job.history.slice(-500) : undefined,
  };
}

function pruneCompletedJobs() {
  const completed = [...state.jobs.values()].filter((job) => job.completed);
  let excess = completed.length - MAX_RETAINED_COMPLETED_JOBS;
  if (excess <= 0) return;

  for (const job of completed) {
    if (
      excess <= 0 ||
      state.activeId === job.id ||
      job.finishing ||
      job.emitter.listenerCount('event') > 0
    ) {
      continue;
    }
    state.jobs.delete(job.id);
    excess -= 1;
  }
}

function emit(job, type, data = {}) {
  const event = { id: ++job.sequence, type, at: new Date().toISOString(), ...data };
  job.history.push(event);
  if (job.history.length > 1500) job.history.splice(0, job.history.length - 1500);
  job.emitter.emit('event', event);
  return event;
}

function completeJob(job) {
  if (job.completed) return publicJob(job);
  job.completed = true;
  job.finishing = false;
  const result = publicJob(job);
  try {
    emit(job, 'complete', { job: result });
  } finally {
    job.resolveCompletion(result);
    pruneCompletedJobs();
  }
  return result;
}

async function readNewRows(file, offset) {
  let buffer;
  try {
    buffer = await fsp.readFile(file);
  } catch (cause) {
    if (cause?.code === 'ENOENT') return { offset, rows: [] };
    throw cause;
  }
  if (buffer.length < offset) offset = 0;
  const chunk = buffer.subarray(offset);
  const lastNewline = chunk.lastIndexOf(10);
  if (lastNewline < 0) return { offset, rows: [] };
  const complete = chunk.subarray(0, lastNewline + 1).toString('utf8');
  const rows = [];
  for (const line of complete.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      rows.push({ kind: 'parse-error', message: 'یک خط کامل NDJSON خوانده نشد' });
    }
  }
  return { offset: offset + lastNewline + 1, rows };
}

async function attachRun(job, runId) {
  const dir = runDir(runId);
  if (job.tailers.has(runId)) return;
  job.runs.push(runId);
  job.activeRun = runId;
  job.tailers.set(runId, { events: 0, findings: 0, traces: 0, runState: '', pollPromise: null });
  emit(job, 'run', { runId });
  await pollRun(job, runId, dir);
}

function pollRun(job, runId, dir = runDir(runId)) {
  const tailer = job.tailers.get(runId);
  if (!tailer) return Promise.resolve();
  if (tailer.pollPromise) return tailer.pollPromise;

  tailer.pollPromise = (async () => {
    const sources = [
      ['events', 'events.ndjson'],
      ['findings', 'findings.ndjson'],
      ['traces', 'traces.ndjson'],
    ];
    for (const [key, name] of sources) {
      const result = await readNewRows(path.join(dir, name), tailer[key]);
      tailer[key] = result.offset;
      for (const row of result.rows) {
        if (key === 'events' && row.kind === 'step') emit(job, 'step', { runId, step: row });
        else if (key === 'findings') emit(job, 'finding', { runId, finding: row });
        else if (key === 'traces') emit(job, 'trace', { runId, trace: row });
        else emit(job, 'event', { runId, event: row });
      }
    }

    const run = await readJson(path.join(dir, 'run.json'));
    if (run) {
      const signature = JSON.stringify([run.status, run.steps, run.findings, run.serverLines, run.finishedAt]);
      if (signature !== tailer.runState) {
        tailer.runState = signature;
        emit(job, 'run-state', { runId, run });
      }
    }
  })().finally(() => {
    tailer.pollPromise = null;
  });
  return tailer.pollPromise;
}

function poll(job) {
  if (job.pollPromise) return job.pollPromise;
  job.pollPromise = (async () => {
    for (const runId of job.runs) await pollRun(job, runId);
  })().finally(() => {
    job.pollPromise = null;
  });
  return job.pollPromise;
}

function queueRun(job, payload) {
  job.attachmentPromise = job.attachmentPromise
    .then(() => attachRun(job, payload.runId))
    .catch((cause) => {
      emit(job, 'output', { stream: 'stderr', line: `اتصال اجرای زنده ناموفق بود: ${cause.message}` });
    });
}

function handleOutputLine(job, stream, line) {
  const text = line.replace(/\r$/, '');
  if (stream === 'stdout' && text.startsWith(GUI_RUN_MARKER)) {
    try {
      const payload = JSON.parse(text.slice(GUI_RUN_MARKER.length));
      if (payload.job !== job.markerToken || payload.target !== job.target) {
        throw new Error('marker متعلق به این کار نیست');
      }
      runDir(payload.runId);
      queueRun(job, payload);
    } catch (cause) {
      emit(job, 'output', { stream: 'stderr', line: `marker اجرای زنده نامعتبر بود: ${cause.message}` });
    }
    return;
  }
  if (text) emit(job, 'output', { stream, line: text });
}

function appendOutput(job, stream, chunk) {
  const combined = job.outputBuffers[stream] + job.decoders[stream].write(chunk);
  const lines = combined.split('\n');
  job.outputBuffers[stream] = lines.pop() || '';
  for (const line of lines) handleOutputLine(job, stream, line);
}

function flushOutput(job) {
  if (job.outputFlushed) return;
  job.outputFlushed = true;
  for (const stream of ['stdout', 'stderr']) {
    const remainder = job.outputBuffers[stream] + job.decoders[stream].end();
    job.outputBuffers[stream] = '';
    if (remainder) handleOutputLine(job, stream, remainder);
  }
}

function noteTerminationError(job, message) {
  job.error ||= message;
  emit(job, 'output', { stream: 'stderr', line: message });
}

function terminateWindows(job, pid) {
  return new Promise((resolve) => {
    let settled = false;
    let stderr = '';
    let killer;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    };

    try {
      killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch (cause) {
      noteTerminationError(job, `بستن درخت فرآیند ناموفق بود: ${cause.message}`);
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      killer.kill();
      noteTerminationError(job, 'بستن درخت فرآیند بیش از ۱۰ ثانیه طول کشید');
      done();
    }, 10_000);
    timeout.unref?.();

    killer.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    killer.once('error', (cause) => {
      if (!job.processClosed) noteTerminationError(job, `اجرای taskkill ناموفق بود: ${cause.message}`);
      done();
    });
    killer.once('close', (code) => {
      if (code !== 0 && !job.processClosed) {
        noteTerminationError(job, `taskkill با کد ${code} بسته شد${stderr.trim() ? `: ${stderr.trim()}` : ''}`);
      }
      done();
    });
  });
}

async function terminatePosix(job, pid) {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (cause) {
    if (cause?.code !== 'ESRCH') noteTerminationError(job, `ارسال SIGTERM به گروه فرآیند ناموفق بود: ${cause.message}`);
    return;
  }

  await delay(1200);
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (cause) {
    if (cause?.code !== 'ESRCH') noteTerminationError(job, `ارسال SIGKILL به گروه فرآیند ناموفق بود: ${cause.message}`);
  }
}

function requestTermination(job) {
  if (job.terminationPromise) return job.terminationPromise;
  if (job.processClosed || job.completed) return null;
  const pid = job.child?.pid;
  if (!Number.isInteger(pid) || pid <= 0) return null;
  job.terminationPromise = process.platform === 'win32' ? terminateWindows(job, pid) : terminatePosix(job, pid);
  return job.terminationPromise;
}

function requestJobCancellation(job) {
  if (
    !CANCELLABLE_STATUSES.has(job.status) ||
    job.cancelRequested ||
    job.processClosed ||
    job.finishing ||
    job.completed
  ) {
    return false;
  }

  job.cancelRequested = true;
  job.status = 'cancelling';
  emit(job, 'state', { job: publicJob(job) });
  requestTermination(job);
  return true;
}

async function markCancelledRuns(job) {
  for (const runId of job.runs) {
    const file = path.join(runDir(runId), 'run.json');
    const run = await readJson(file);
    if (!run || run.status !== 'running') continue;
    const temporary = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      await fsp.writeFile(
        temporary,
        JSON.stringify({ ...run, status: 'cancelled', finishedAt: new Date().toISOString() }, null, 2) + '\n',
        'utf8'
      );
      await fsp.rename(temporary, file);
    } finally {
      await fsp.rm(temporary, { force: true }).catch(() => {});
    }
  }
}

async function safePoll(job) {
  try {
    await poll(job);
  } catch (cause) {
    emit(job, 'output', { stream: 'stderr', line: `رصد artifact ناموفق بود: ${cause.message}` });
  }
}

function finish(job, code, signal, startupError = null) {
  if (job.finishPromise) return job.finishPromise;
  job.finishing = true;
  job.finishPromise = (async () => {
    clearInterval(job.timer);
    if (startupError) job.error ||= startupError.message;

    await job.attachmentPromise;
    if (job.cancelRequested) await requestTermination(job);
    await safePoll(job);

    if (job.cancelRequested) {
      try {
        await markCancelledRuns(job);
      } catch (cause) {
        noteTerminationError(job, `ثبت وضعیت لغو ناموفق بود: ${cause.message}`);
      }
    }

    if (job.runs.length) {
      await delay(80);
      await safePoll(job);
    }

    job.exitCode = Number.isInteger(code) ? code : null;
    job.finishedAt = new Date().toISOString();
    if (job.cancelRequested) {
      job.status = 'cancelled';
      job.outcome = 'cancelled';
    } else if (startupError || job.spawnError) {
      job.status = 'error';
      job.outcome = 'error';
    } else if (code === 0) {
      job.status = 'finished';
      job.outcome = 'passed';
    } else if (code === 1 && job.runs.length) {
      job.status = 'finished';
      job.outcome = 'findings';
    } else {
      job.status = 'error';
      job.outcome = 'error';
      job.error ||=
        code === 1
          ? 'اجراگر بدون artifact معتبر با کد ۱ بسته شد'
          : signal
            ? `فرآیند با سیگنال ${signal} بسته شد`
            : `اجراگر با کد ${code} بسته شد`;
    }

    if (state.activeId === job.id) state.activeId = null;
    return completeJob(job);
  })().catch((cause) => {
    job.error ||= cause.message;
    job.status = 'error';
    job.outcome = 'error';
    job.finishedAt ||= new Date().toISOString();
    if (state.activeId === job.id) state.activeId = null;
    return completeJob(job);
  });
  return job.finishPromise;
}

export async function startJob(rawOptions = {}) {
  if (state.shuttingDown) throw codedError('JOB_SHUTTING_DOWN', 'رابط کاربری در حال خاموش‌شدن است');

  const target = assertSafeSegment(rawOptions?.target || 'nepi', 'هدف');
  const repeat = Number(rawOptions?.repeat || 1);
  const options = {
    grep: rawOptions?.grep ? String(rawOptions.grep).slice(0, 500) : '',
    device: rawOptions?.device ? String(rawOptions.device).slice(0, 100) : '',
    persona: rawOptions?.persona ? String(rawOptions.persona).slice(0, 40) : '',
    repeat: Number.isFinite(repeat) ? Math.max(1, Math.min(10, repeat)) : 1,
    headed: Boolean(rawOptions?.headed),
    author: Boolean(rawOptions?.author),
  };

  if (state.activeId) {
    const active = state.jobs.get(state.activeId);
    if (active && ACTIVE_STATUSES.has(active.status)) {
      throw codedError('JOB_ACTIVE', 'یک اجرا هم‌اکنون در جریان است');
    }
    state.activeId = null;
  }

  // رزرو slot باید پیش از نخستین await انجام شود؛ این بخش عمداً synchronous است.
  const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  let resolveCompletion;
  const completionPromise = new Promise((resolve) => {
    resolveCompletion = resolve;
  });
  const job = {
    id,
    target,
    options,
    status: 'starting',
    outcome: null,
    startedAt: new Date().toISOString(),
    runs: [],
    activeRun: null,
    sequence: 0,
    history: [],
    emitter: new EventEmitter(),
    tailers: new Map(),
    pollPromise: null,
    attachmentPromise: Promise.resolve(),
    completionPromise,
    resolveCompletion,
    markerToken: randomBytes(18).toString('hex'),
    decoders: { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') },
    outputBuffers: { stdout: '', stderr: '' },
    outputFlushed: false,
    cancelRequested: false,
    processClosed: false,
    finishing: false,
    completed: false,
  };
  state.jobs.set(id, job);
  state.activeId = id;
  emit(job, 'state', { job: publicJob(job) });

  try {
    const projects = await listProjects();
    const project = projects.find((item) => item.key === target);
    if (!project) throw new Error(`هدف «${target}» وجود ندارد`);
    if (options.grep && !project.scenarios.some((scenario) => scenario.runnable && scenario.name === options.grep)) {
      throw new Error('سناریوی انتخاب‌شده در این هدف نیست');
    }
  } catch (cause) {
    if (job.cancelRequested) {
      await finish(job, null, null);
      return publicJob(job);
    }
    await finish(job, 2, null, cause);
    throw cause;
  }

  if (job.cancelRequested) {
    await finish(job, null, null);
    return publicJob(job);
  }

  const args = [path.join(ROOT, 'bin', 'userbug.js'), 'run', target];
  if (options.grep) args.push('--grep', options.grep);
  if (options.device) args.push('--device', options.device);
  if (options.persona) args.push('--persona', options.persona);
  if (options.repeat > 1) args.push('--repeat', String(options.repeat));
  if (options.headed) args.push('--headed');
  if (options.author) args.push('--author');

  let child;
  try {
    child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env, UB_GUI_JOB: job.markerToken },
      detached: process.platform !== 'win32',
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    const error = codedError('JOB_START_FAILED', `اجراگر شروع نشد: ${cause.message}`);
    await finish(job, 2, null, error);
    throw error;
  }

  job.child = child;
  child.stdout.on('data', (chunk) => appendOutput(job, 'stdout', chunk));
  child.stderr.on('data', (chunk) => appendOutput(job, 'stderr', chunk));
  child.once('spawn', () => {
    if (job.cancelRequested) {
      requestTermination(job);
      return;
    }
    job.status = 'running';
    emit(job, 'state', { job: publicJob(job) });
  });
  child.once('error', (cause) => {
    job.spawnError = cause;
    job.error ||= cause.message;
    emit(job, 'output', { stream: 'stderr', line: `اجرای فرآیند ناموفق بود: ${cause.message}` });
  });
  child.once('close', (code, signal) => {
    job.processClosed = true;
    flushOutput(job);
    finish(job, code, signal);
  });

  job.timer = setInterval(() => safePoll(job), 250);
  job.timer.unref?.();
  return publicJob(job);
}

export function getJob(id, includeHistory = false) {
  const job = state.jobs.get(String(id));
  return job ? publicJob(job, includeHistory) : null;
}

export function getActiveJob(includeHistory = false) {
  if (!state.activeId) return null;
  return getJob(state.activeId, includeHistory);
}

export function subscribeJob(id, after, listener) {
  const job = state.jobs.get(String(id));
  if (!job) return null;
  for (const event of job.history) if (event.id > after) listener(event);
  job.emitter.on('event', listener);
  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    job.emitter.off('event', listener);
    pruneCompletedJobs();
  };
}

export async function cancelJob(id) {
  const job = state.jobs.get(String(id));
  if (!job) throw codedError('JOB_NOT_FOUND', 'کار پیدا نشد');
  if (job.completed) return publicJob(job);
  if (job.processClosed || job.finishing) return job.completionPromise;

  requestJobCancellation(job);
  return publicJob(job);
}

export function shutdownJobs() {
  state.shuttingDown = true;
  if (state.shutdownPromise) return state.shutdownPromise;

  const pending = [...state.jobs.values()].filter(
    (job) => !job.completed && (ACTIVE_STATUSES.has(job.status) || job.finishing)
  );
  for (const job of pending) {
    if (!job.processClosed && !job.finishing) requestJobCancellation(job);
  }

  state.shutdownPromise = Promise.allSettled(pending.map((job) => job.completionPromise)).then(() => undefined);
  return state.shutdownPromise;
}
