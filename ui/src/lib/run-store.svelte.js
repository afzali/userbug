/**
 * اجرای زنده — یک حالت، برای کلِ رابط.
 *
 * ── چرا از صفحهٔ خانه بیرون آمد ──
 *
 * کاربر گفت: «اجرا در همهٔ اینهاست و در هر گامی ممکن است باشد؛ بهتر است
 * شبیه پلیری باشد که هر جا لازم شد دیده شود.»
 *
 * و درست است: خزش از صفحهٔ نقشه شروع می‌شود، اجرای یک سفر از مأموریت‌ها،
 * گشت از صفحهٔ گشت. ولی **نمای زنده** فقط در صفحهٔ خانه بود. یعنی به‌محضِ
 * اینکه کاری را شروع می‌کردی و جای دیگری می‌رفتی، دیگر نمی‌دیدی چه می‌شود
 * — و همان لحظه‌ای که خزش وسطِ کار می‌شکند، تو در صفحهٔ دیگری هستی.
 *
 * ── چرا یک ماژولِ حالت و نه یک کامپوننت ──
 *
 * `EventSource` باید از ناوبری **جان سالم ببرد**. کامپوننتی که در صفحه
 * نشسته، با هر رفتن و آمدن unmount می‌شود و جریان قطع می‌گردد. این حالت در
 * ماژول است، پس تا وقتی تبِ مرورگر باز است زنده می‌ماند.
 *
 * ── و چرا `attach` هم پاک می‌کند هم وصل ──
 *
 * هدف که عوض شود، اجرای پروژهٔ قبلی نباید در پلیرِ پروژهٔ تازه بماند. ولی
 * اگر همان اجرای قبلی است، نباید دست بخورد — وگرنه هر ناوبری جریان را قطع
 * و وصل می‌کند و رخدادهای همان لحظه گم می‌شوند. هر دو تصمیم یک‌جاست، چون
 * جدا کردنشان یعنی روزی یکی بی آن یکی صدا زده شود.
 */

/** وضعیت‌هایی که یعنی «هنوز در جریان است». */
export const ACTIVE = new Set(['starting', 'running', 'cancelling']);

/**
 * حالتِ مشترک.
 *
 * `$state` در یک ماژولِ `.svelte.js` یعنی همهٔ کامپوننت‌ها یک نسخه را
 * می‌بینند — همان چیزی که برای پلیر لازم است.
 */
export const run = $state({
  target: '',
  job: null,
  steps: [],
  findings: [],
  errors: [],
  output: [],
  lastEventId: 0,
  error: '',
  submitting: false,
  /** باز یا بسته بودنِ پلیر — تصمیمِ آدم، نه وضعیتِ اجرا. */
  open: false,
});

let stream = null;

export function resetLive() {
  run.steps = [];
  run.findings = [];
  run.errors = [];
  run.output = [];
  run.lastEventId = 0;
}

function applyEvent(event) {
  run.lastEventId = Math.max(run.lastEventId, Number(event.id || 0));

  if (event.type === 'state' || event.type === 'complete') run.job = event.job;
  if (event.type === 'run') {
    run.job = {
      ...run.job,
      activeRun: event.runId,
      runs: [...new Set([...(run.job?.runs || []), event.runId])],
    };
  }
  if (event.type === 'run-state' && run.job) run.job = { ...run.job, activeRun: event.runId };
  if (event.type === 'step') run.steps = [...run.steps, { ...event.step, runId: event.runId }];
  if (event.type === 'finding' && !event.finding?.synthetic) {
    run.findings = [...run.findings, { ...event.finding, runId: event.runId }];
  }
  if (event.type === 'event' && event.event?.severity === 'error') {
    run.errors = [...run.errors, { ...event.event, runId: event.runId }];
  }
  // خروجی سقف دارد: اجرای طولانی نباید حافظهٔ تب را بخورد
  if (event.type === 'output') run.output = [...run.output.slice(-79), `[${event.stream}] ${event.line}`];

  if (event.type === 'complete') {
    close();
    for (const listener of finished) listener(run.job);
  }
}

/**
 * کسانی که می‌خواهند بعد از پایانِ اجرا کاری بکنند.
 *
 * صفحهٔ خانه فهرستِ اجراها را تازه می‌کند، صفحهٔ مأموریت‌ها می‌تواند سلامت
 * را. ماژول خودش نمی‌داند چه کسی به چه چیزی نیاز دارد.
 */
const finished = new Set();
export function onFinished(listener) {
  finished.add(listener);
  return () => finished.delete(listener);
}

export function connect(jobId) {
  close();
  let checking = false;
  stream = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events?after=${run.lastEventId}`);
  stream.onmessage = (message) => applyEvent(JSON.parse(message.data));

  /**
   * جریانی که قطع شود، نباید پلیر را تا ابد «در جریان» نگه دارد.
   *
   * ── چه شد ──
   *
   * وسطِ یک اجرا سرورِ رابط ری‌استارت شد (کارها در حافظهٔ همان پروسه‌اند).
   * جریان مرد، ولی آخرین وضعیتی که کلاینت دیده بود `running` بود — پس نوار
   * تا رفرش می‌گفت «در جریان»، در حالی که `/api/jobs` می‌گفت هیچ اجرایی
   * نیست. یعنی رابط چیزی می‌گفت که غلط بود.
   *
   * `EventSource` خودش تلاشِ دوباره می‌کند و `onerror` پشتِ سر هم می‌آید،
   * پس یک بار می‌پرسیم و نه در هر خطا.
   */
  stream.onerror = async () => {
    if (!ACTIVE.has(run.job?.status)) {
      close();
      return;
    }
    if (checking) return;
    checking = true;
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
      if (response.status === 404) {
        close();
        run.job = { ...run.job, status: 'lost' };
      }
    } catch {
      // شبکهٔ محلی قطع است؛ تلاشِ بعدیِ خودِ EventSource جواب می‌دهد
    } finally {
      checking = false;
    }
  };
}

export function close() {
  stream?.close();
  stream = null;
}

/**
 * وصل شدن به اجرایی که سرور می‌گوید در جریان است.
 *
 * هر بار که یک صفحهٔ پروژه بار می‌شود صدا زده می‌شود. اگر همان اجرا از قبل
 * وصل است، دست نمی‌خورد — وگرنه هر ناوبری جریان را قطع و وصل می‌کرد و
 * رخدادهای همان لحظه گم می‌شدند.
 */
export function attach(target, activeJob) {
  if (run.target !== target) {
    close();
    run.target = target;
    run.job = null;
    resetLive();
  }

  if (!activeJob) return;
  if (run.job?.id === activeJob.id && stream) return;

  resetLive();
  run.job = activeJob;
  for (const event of activeJob.events || []) applyEvent(event);
  if (ACTIVE.has(activeJob.status)) connect(activeJob.id);
}

/**
 * شروعِ هر کاری، یک راه.
 *
 * فرمِ اجرا، نوارِ فرمان، صفحهٔ نقشه و فهرستِ مأموریت‌ها همه از اینجا
 * می‌گذرند. دو مسیرِ شروع یعنی روزی یکی‌شان `resetLive` را فراموش کند و
 * جریانِ زندهٔ اجرای قبلی روی اجرای تازه بماند.
 */
export async function startJob(target, options) {
  run.error = '';
  run.submitting = true;
  run.target = target;
  resetLive();
  try {
    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
      body: JSON.stringify({ target, ...options }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'اجرا شروع نشد');
    run.job = payload.job;
    run.open = true;
    connect(run.job.id);
    return payload.job;
  } catch (cause) {
    run.error = cause.message;
    return null;
  } finally {
    run.submitting = false;
  }
}

export async function cancelJob() {
  if (!run.job) return;
  const response = await fetch(`/api/jobs/${encodeURIComponent(run.job.id)}`, {
    method: 'DELETE',
    headers: { 'x-userbug-request': '1' },
  });
  const payload = await response.json();
  if (response.ok) run.job = payload.job;
  else run.error = payload.error || 'لغو انجام نشد';
}
