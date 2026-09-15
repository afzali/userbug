<script>
  import { onMount } from 'svelte';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import ModelPicker from '$lib/components/ModelPicker.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import CommandBar from '$lib/components/CommandBar.svelte';
  import Onboarding from '$lib/components/Onboarding.svelte';
  import HealthTable from '$lib/components/HealthTable.svelte';
  import RunCard from '$lib/components/RunCard.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { formatNumber, sourceLabel } from '$lib/format.js';

  const ACTIVE_JOB_STATUSES = new Set(['starting', 'running', 'cancelling']);

  let { data } = $props();
  // این‌ها snapshot اولیه‌اند چون کاربر در همین صفحه آن‌ها را تغییر می‌دهد.
  // svelte-ignore state_referenced_locally
  let runs = $state(data.runs);
  let scenario = $state('');
  /**
   * سناریوهای تیک‌خورده — «بَنچ».
   *
   * ── چرا کشویی کافی نبود ──
   *
   * کشویی فقط دو حال داشت: یک سناریو، یا همه. ولی کاری که آدم واقعاً می‌کند
   * چیزی وسطِ این دوتاست: «این سه تا که به ورود مربوط‌اند را ببر». با
   * کشویی یا باید سه بار اجرا می‌گرفت — سه گزارشِ جدا که هیچ‌کدام کلِ ماجرا
   * نیست — یا همه را می‌برد و منتظرِ بیست سناریوی بی‌ربط می‌ماند.
   */
  let picked = $state(new Set());
  /** اسمی روی این بار. اختیاری، ولی در تریاژ همان چیزی است که یادت می‌ماند. */
  let bench = $state('');
  let device = $state('');
  let persona = $state('');
  let depth = $state('');
  let model = $state('');
  let repeat = $state(1);
  let headed = $state(false);
  let author = $state(false);
  let submitting = $state(false);
  let error = $state('');
  let showSchedule = $state(false);
  let scheduleBusy = $state(false);
  let scheduleForm = $state({ key: '', time: '02:00', frequency: 'daily', days: 'MON' });
  // svelte-ignore state_referenced_locally
  let job = $state(data.activeJob || null);
  let liveSteps = $state([]);
  let liveFindings = $state([]);
  let liveErrors = $state([]);
  let output = $state([]);
  let lastEventId = $state(0);
  let stream = null;

  // هدف از مسیر می‌آید، پس دیگر یک `$state` نیست که بشود بی‌صدا عوضش کرد.
  let target = $derived(data.target);
  let project = $derived(data.project);

  /**
   * پروژه‌ای که هنوز هیچ چیزی ندارد.
   *
   * ── چرا این حالت لازم شد ──
   *
   * کاربری که تازه پروژه ساخته، با فرمِ «اجرای تازه» روبه‌رو می‌شد که
   * کشویی سناریوهایش خالی بود. یعنی نخستین چیزی که می‌دید، دکمه‌ای بود که
   * هیچ کاری نمی‌کرد — و هیچ‌کس نمی‌گفت از کجا باید شروع کند.
   *
   * چهار قطعه از قبل ساخته شده بودند و ترتیبشان هم روشن بود، ولی این ترتیب
   * فقط در ذهنِ سازنده بود: در رابط، چهار آیتمِ هم‌وزن در منوی کناری بودند.
   *
   * شرط «هیچ اجرایی هم نبوده» عمدی است: پروژه‌ای که سناریوهایش پاک شده ولی
   * تاریخچه دارد، کاربرِ تازه‌کار نیست و نباید راهنمای شروع ببیند.
   */
  let blank = $derived(!project.scenarios?.length && !runs.length && !job);

  /** سناریوهای اجراشدنی، یک بار — هم برای تیک‌ها، هم برای کشویی. */
  let runnableScenarios = $derived((project?.scenarios || []).filter((item) => item.executable));

  function togglePick(name) {
    const next = new Set(picked);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    picked = next;
  }

  /**
   * راهنمای نخستین ورود.
   *
   * ── چرا خودکار باز می‌شود، و چرا نه همیشه ──
   *
   * ترتیبِ پنج قدم هیچ‌جا نوشته نبود و روی یک پروژهٔ واقعی دیدیم چه می‌شود:
   * کاربر حساب و فایل و کلید را درست گذاشت، خزش را زد، و خزنده روی صفحهٔ
   * ورود ماند — چون نمی‌دانست گشت باید اول برود.
   *
   * ولی پروژه‌ای که هر پنج قدمش انجام شده، صاحبش این را از بر است. پس شرط
   * دو تاست: نه رد شده باشد، و نه کار تمام شده باشد.
   *
   * `localStorage` جای درستش است: تصمیمِ همین مرورگرِ همین آدم است، نه
   * دانشی دربارهٔ پروژه که در `knowledge/` بنشیند.
   */
  let showIntro = $state(false);
  const introKey = $derived(`userbug-intro:${target}`);

  onMount(() => {
    try {
      if (localStorage.getItem(introKey) === 'off') return;
    } catch {
      // مرورگرِ بی‌انبار؛ راهنما نشان داده می‌شود که بدتر از پنهان کردنش نیست
    }
    showIntro = steps.some((step) => !step.done);
  });

  function dismissIntro(never) {
    if (!never) return;
    try {
      localStorage.setItem(introKey, 'off');
    } catch {
      // ذخیره نشد؛ دفعهٔ بعد دوباره می‌آید و همان دکمه هست
    }
  }

  let runSearch = $state('');
  let runKind = $state('all');
  let runBench = $state('all');
  let runFindings = $state('all');
  let runSort = $state('new');

  let filtered = $derived(
    Boolean(runSearch.trim()) || runKind !== 'all' || runBench !== 'all' || runFindings !== 'all' || runSort !== 'new'
  );

  function resetRunFilters() {
    runSearch = '';
    runKind = 'all';
    runBench = 'all';
    runFindings = 'all';
    runSort = 'new';
  }

  /**
   * نام‌های بنچی که واقعاً وجود دارند.
   *
   * فهرستِ از پیش تعریف‌شده‌ای در کار نیست و نباید باشد: بنچ همان چیزی است
   * که کاربر لحظهٔ اجرا اسمش را می‌گذارد.
   */
  let benchNames = $derived([...new Set(runs.map((run) => run.bench).filter(Boolean))]);

  /**
   * فیلتر و مرتب‌سازی روی همان داده‌ای که از قبل هست.
   *
   * `kind` برای اجراهای قدیمی نیست؛ نبودش یعنی «اجرای سناریو»، چون تا پیش
   * از آمدنِ گشت و خزش همه همین بودند.
   */
  let visibleRuns = $derived.by(() => {
    const needle = runSearch.trim().toLowerCase();
    const rows = runs.filter((run) => {
      if (runKind !== 'all' && (run.kind || 'run') !== runKind) return false;
      if (runBench === 'none' && run.bench) return false;
      if (runBench !== 'all' && runBench !== 'none' && run.bench !== runBench) return false;
      if (runFindings === 'with' && !run.findings) return false;
      if (runFindings === 'without' && run.findings) return false;
      if (!needle) return true;
      return `${run.runId} ${run.bench || ''} ${(run.scenarios || []).join(' ')}`.toLowerCase().includes(needle);
    });

    const at = (run) => Date.parse(run.startedAt || '') || 0;
    const order = {
      new: (a, b) => at(b) - at(a),
      old: (a, b) => at(a) - at(b),
      findings: (a, b) => (b.findings || 0) - (a.findings || 0) || at(b) - at(a),
      steps: (a, b) => (b.steps || 0) - (a.steps || 0) || at(b) - at(a),
    };
    return rows.toSorted(order[runSort] || order.new);
  });

  /**
   * پنج قدمِ مسیر، با وضعیتِ واقعی‌شان.
   *
   * `done` عمداً سخت‌گیر نیست: «یک بار انجام شده» را می‌گوید، نه «کامل است».
   * ادعای کامل بودن همان چیزی است که این ابزار جای دیگر هم از آن پرهیز
   * می‌کند — عددِ کنارش خودش می‌گوید چقدر مانده.
   */
  let steps = $derived.by(() => {
    const p = data.progress || {};
    const runnable = (project.scenarios || []).filter((item) => item.runnable).length;
    const base = `/projects/${encodeURIComponent(target)}`;
    const percent = p.coverage === null || p.coverage === undefined ? null : Math.round(p.coverage * 100);

    return [
      {
        index: '۱',
        label: 'گشت',
        href: `${base}/tour`,
        done: p.pages > 0,
        state: p.pages ? `${p.pages} صفحه ثبت شد` : 'با هم در اپ بگردیم',
      },
      {
        index: '۲',
        label: 'نقشه',
        href: `${base}/map`,
        done: p.states > 0,
        state: p.states ? `${p.states} حالت · ${p.frontier} کنش در صف` : 'بقیه را خودش بگردد',
      },
      {
        index: '۳',
        label: 'شناخت',
        href: `${base}/knowledge`,
        done: percent !== null && percent > 0,
        state:
          percent === null || percent === 0
            ? 'هنوز چیزی نمی‌دانیم'
            : `${percent}٪${p.questions ? ` · ${p.questions} پرسشِ بی‌جواب` : ''}`,
      },
      {
        index: '۴',
        label: 'سناریو',
        href: runnable ? `${base}/files` : `${base}/proposals`,
        done: runnable > 0,
        state: runnable
          ? `${runnable} سناریو${p.proposals ? ` · ${p.proposals} پیشنهادِ باز` : ''}`
          : p.proposals
            ? `${p.proposals} پیشنهاد آماده است`
            : 'هنوز سناریویی نیست',
      },
      {
        index: '۵',
        label: 'اجرا',
        href: base,
        done: runs.length > 0,
        state: runs.length ? `${runs.length} اجرا` : 'هنوز اجرا نشده',
      },
    ];
  });
  let busy = $derived(ACTIVE_JOB_STATUSES.has(job?.status));
  let canCancel = $derived(['starting', 'running'].includes(job?.status));
  let latestStep = $derived(liveSteps.at(-1));
  let activeRun = $derived(job?.activeRun || job?.runs?.at(-1));

  function resetLive() {
    liveSteps = [];
    liveFindings = [];
    liveErrors = [];
    output = [];
    lastEventId = 0;
  }

  function applyEvent(event) {
    lastEventId = Math.max(lastEventId, Number(event.id || 0));
    if (event.type === 'state' || event.type === 'complete') job = event.job;
    if (event.type === 'run') job = { ...job, activeRun: event.runId, runs: [...new Set([...(job?.runs || []), event.runId])] };
    if (event.type === 'run-state' && job) job = { ...job, activeRun: event.runId };
    if (event.type === 'step') liveSteps = [...liveSteps, { ...event.step, runId: event.runId }];
    if (event.type === 'finding' && !event.finding?.synthetic) liveFindings = [...liveFindings, { ...event.finding, runId: event.runId }];
    if (event.type === 'event' && event.event?.severity === 'error') liveErrors = [...liveErrors, { ...event.event, runId: event.runId }];
    if (event.type === 'output') output = [...output.slice(-79), `[${event.stream}] ${event.line}`];
    if (event.type === 'complete') {
      stream?.close();
      refreshRuns();
    }
  }

  function connect(jobId) {
    stream?.close();
    stream = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events?after=${lastEventId}`);
    stream.onmessage = (message) => applyEvent(JSON.parse(message.data));
    stream.onerror = () => {
      if (!ACTIVE_JOB_STATUSES.has(job?.status)) stream?.close();
    };
  }

  async function refreshRuns() {
    // فقط اجراهای همین پروژه، وگرنه فهرست با اجرای پروژهٔ دیگری پر می‌شد
    const response = await fetch(`/api/runs?limit=60&target=${encodeURIComponent(target)}`);
    if (response.ok) runs = (await response.json()).runs;
  }

  /**
   * شروعِ هر کاری، یک راه.
   *
   * فرمِ کناری و نوارِ فرمان هر دو از اینجا می‌گذرند. دو مسیرِ شروع یعنی
   * روزی یکی‌شان `resetLive` را فراموش کند و جریانِ زندهٔ اجرای قبلی روی
   * اجرای تازه بماند.
   */
  async function startJob(options) {
    error = '';
    submitting = true;
    resetLive();
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target, ...options }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'اجرا شروع نشد');
      job = payload.job;
      connect(job.id);
    } catch (cause) {
      error = cause.message;
    } finally {
      submitting = false;
    }
  }

  async function start(event) {
    event.preventDefault();
    await startJob({
      grep: scenario,
      only: [...picked],
      bench,
      device,
      persona,
      depth,
      model,
      repeat,
      headed,
      author,
    });
  }

  async function cancel() {
    if (!job) return;
    const response = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`, {
      method: 'DELETE',
      headers: { 'x-userbug-request': '1' },
    });
    const payload = await response.json();
    if (response.ok) job = payload.job;
    else error = payload.error || 'لغو انجام نشد';
  }

  /**
   * زمان‌بندی، با همان پرچم‌هایی که در فرم بالا انتخاب شده‌اند.
   *
   * صفحه بعد از هر تغییر بازخوانی می‌شود (`location.reload`) چون وضعیت واقعی
   * در زمان‌بندِ سیستم است، نه در این صفحه — و نشان دادنِ حالتِ خوش‌بینانه
   * دقیقاً همان چیزی است که «فعال بود ولی اجرا نشد» را می‌سازد.
   */
  async function scheduleRequest(url, options) {
    scheduleBusy = true;
    error = '';
    try {
      const response = await fetch(url, {
        ...options,
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'انجام نشد');
      location.reload();
    } catch (cause) {
      error = cause.message;
      scheduleBusy = false;
    }
  }

  function addSchedule() {
    return scheduleRequest('/api/schedules', {
      method: 'POST',
      body: JSON.stringify({
        ...scheduleForm,
        target,
        grep: scenario,
        device,
        persona,
        model,
        depth,
        repeat,
      }),
    });
  }

  function runSchedule(key) {
    return scheduleRequest(`/api/schedules/${encodeURIComponent(key)}`, { method: 'POST' });
  }

  function removeSchedule(key) {
    if (!confirm(`زمان‌بندی «${key}» و تسکش در ویندوز حذف شوند؟`)) return;
    return scheduleRequest(`/api/schedules/${encodeURIComponent(key)}`, { method: 'DELETE' });
  }

  onMount(() => {
    if (data.activeJob) {
      resetLive();
      for (const event of data.activeJob.events || []) applyEvent(event);
      if (ACTIVE_JOB_STATUSES.has(data.activeJob.status)) connect(data.activeJob.id);
    }
    return () => stream?.close();
  });
</script>

<PageHeader eyebrow={`${project.environment} · ${project.baseURL}`} title={project.name} description="بگویید چه می‌خواهید، یا از فرمِ کناری دقیق انتخاب کنید.">
  {#snippet actions()}
    <!-- راهِ برگشت به راهنما: بستنِ همیشگی نباید یعنی گم شدنِ همیشگی -->
    <Button variant="ghost" onclick={() => { showIntro = true; }}>راهنما</Button>
    <Button href={`/projects/${encodeURIComponent(target)}/files`} variant="outline">سناریوها</Button>
  {/snippet}
</PageHeader>

<Onboarding {target} {steps} bind:open={showIntro} onDismiss={dismissIntro} />

<!--
  درِ ورودی، بالای همه‌چیز.

  نوارِ پیشرفتِ زیرش وضعیت را می‌گوید («۲۷٪ · ۱۱ پیشنهاد») و آن تابلوی
  وضعیت است نه قدمِ بعد. این یکی قدمِ بعد را می‌گیرد و می‌زند.
-->
<CommandBar {target} busy={busy || submitting} onRun={startJob} />

<!--
  نوارِ مسیر — همیشه، نه فقط روی پروژهٔ خالی.

  ── چرا ──

  کارتِ «از کجا شروع کنیم» فقط وقتی می‌آمد که پروژه هیچ نداشت، پس دقیقاً
  وقتی ناپدید می‌شد که کار تازه جدی شده بود: کسی که یک اجرا داشت، دیگر
  هیچ‌جا نمی‌دید که نقشه نکشیده و شناختش نصفه مانده.

  این نوار همان پنج قدم است با **عدد**، و عددها از منبعِ خودشان می‌آیند.
  قدمی که هنوز انجام نشده، دعوت است؛ قدمی که انجام شده، وضعیت.
-->
<section class="mb-6 overflow-hidden rounded-xl border">
  <ol class="grid divide-y sm:grid-cols-5 sm:divide-x sm:divide-y-0 sm:divide-x-reverse">
    {#each steps as step (step.href)}
      <li>
        <a
          href={step.href}
          class="flex h-full flex-col gap-1 p-3 transition-colors hover:bg-accent/60 {step.done ? '' : 'bg-muted/30'}"
        >
          <span class="flex items-center gap-2 text-xs font-medium">
            <span class="grid size-5 shrink-0 place-items-center rounded-full border text-[10px] {step.done ? 'border-primary/40 bg-primary/10 text-primary' : 'text-muted-foreground'}">
              {step.done ? '✓' : step.index}
            </span>
            {step.label}
          </span>
          <span class="text-[11px] leading-5 text-muted-foreground">{step.state}</span>
        </a>
      </li>
    {/each}
  </ol>
</section>

{#if blank}
  <!--
    مسیرِ شروع، نه فهرستِ امکانات.

    نوارِ بالا وضعیت را می‌گوید؛ این یکی **چرا** را می‌گوید، و فقط یک بار
    لازم است. پس با نخستین قدمِ واقعی می‌رود.
  -->
  <section class="mb-6 rounded-xl border bg-muted/30 p-6">
    <h2 class="text-base font-semibold">از کجا شروع کنیم</h2>
    <p class="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
      این پروژه هنوز سناریویی ندارد، و نوشتنِ سناریو از صفر کارِ سختی است.
      راهِ کوتاه‌تر این است که یک بار با هم در اپ بگردیم، بعد ابزار خودش بقیهٔ
      اپ را بگردد؛ آن‌وقت می‌داند چه چیزهایی باید آزموده شوند. یا همان بالا
      بنویسید چه می‌خواهید.
    </p>

    <ol class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <li class="rounded-lg border bg-background p-4">
        <p class="text-xs font-semibold text-muted-foreground">قدم ۱</p>
        <p class="mt-1 font-medium">با هم بگردیم</p>
        <p class="mt-1.5 text-xs leading-6 text-muted-foreground">
          مرورگر باز می‌شود و <strong>شما</strong> می‌رانید. روی هر صفحه می‌توانید
          بنویسید کارش چیست، و هر ایرادی که دیدید همان‌جا ثبت کنید.
        </p>
        <Button href={`/projects/${encodeURIComponent(target)}/tour`} class="mt-3 w-full">شروع گشت</Button>
      </li>

      <!--
        نقشه بعد از گشت می‌آید، نه پیش از آن: بی مسیرِ ورودی که گشت نشان
        می‌دهد، خزنده روی صفحهٔ ورود می‌ماند و یک گره پیدا می‌کند.
      -->
      <li class="rounded-lg border bg-background p-4">
        <p class="text-xs font-semibold text-muted-foreground">قدم ۲</p>
        <p class="mt-1 font-medium">بقیه را خودش بگردد</p>
        <p class="mt-1.5 text-xs leading-6 text-muted-foreground">
          مرورگر هر دکمهٔ امنی را می‌زند و می‌نویسد از کجا به کجا می‌رسد —
          صفحه‌ها، و مودال‌ها و منوهایی که آدرس ندارند. بی هوش مصنوعی.
        </p>
        <Button href={`/projects/${encodeURIComponent(target)}/map`} variant="ghost" class="mt-3 w-full text-xs">نقشهٔ اپ</Button>
      </li>

      <li class="rounded-lg border bg-background p-4">
        <p class="text-xs font-semibold text-muted-foreground">قدم ۳</p>
        <p class="mt-1 font-medium">شناخت ساخته می‌شود</p>
        <p class="mt-1.5 text-xs leading-6 text-muted-foreground">
          صفحه‌ها، مسیرها و کارهای خطرناک ثبت می‌شوند. هرچه خودتان گفته باشید
          بالاترین اعتماد را دارد — بالاتر از حدسِ مدل.
        </p>
        <Button href={`/projects/${encodeURIComponent(target)}/knowledge`} variant="ghost" class="mt-3 w-full text-xs">شناخت</Button>
      </li>

      <li class="rounded-lg border bg-background p-4">
        <p class="text-xs font-semibold text-muted-foreground">قدم ۴</p>
        <p class="mt-1 font-medium">سناریوها درمی‌آیند</p>
        <p class="mt-1.5 text-xs leading-6 text-muted-foreground">
          «چه باید آزمود» شکافِ میان آنچه می‌دانیم و آنچه می‌آزماییم را حساب
          می‌کند و متنِ هر سناریو را آماده می‌دهد.
        </p>
        <Button href={`/projects/${encodeURIComponent(target)}/proposals`} variant="ghost" class="mt-3 w-full text-xs">چه باید آزمود</Button>
      </li>
    </ol>

    <!--
      راهِ فرار، ولی کم‌رنگ.
      کسی که می‌داند چه می‌کند نباید مجبور به گشت شود؛ کسی که نمی‌داند هم
      نباید این را راهِ اصلی ببیند.
    -->
    <p class="mt-4 text-xs text-muted-foreground">
      یا اگر خودتان سناریو دارید، مستقیم
      <a href={`/projects/${encodeURIComponent(target)}/files`} class="underline underline-offset-2">بسازیدش</a>.
      فرمِ اجرا پایین همین صفحه است.
    </p>
  </section>
{/if}

<div class="grid gap-6 xl:grid-cols-[23rem_minmax(0,1fr)]">
  <Card.Root class="h-fit gap-5 xl:sticky xl:top-20">
    <Card.Header>
      <Card.Title>اجرای تازه</Card.Title>
      <Card.Description>هر بار فقط یک روایت از GUI اجرا می‌شود تا منابع مرورگر و جریان زنده با هم تداخل نکنند.</Card.Description>
    </Card.Header>
    <Card.Content>
      <form class="space-y-4" onsubmit={start}>
        <!--
          تیک، نه کشویی.

          کشویی فقط «یکی» یا «همه» می‌داد؛ کارِ واقعی وسطِ این دوتاست. تیکِ
          هیچ‌کدام یعنی همه — همان پیش‌فرضِ قبلی، پس کسی که تا دیروز فقط
          «شروع اجرا» می‌زد، هیچ تغییری نمی‌بیند.
        -->
        <div class="space-y-1.5 text-sm font-medium">
          <div class="flex items-baseline justify-between gap-2">
            <span>سناریوها</span>
            <span class="text-[11px] font-normal text-muted-foreground">
              {picked.size ? `${formatNumber(picked.size)} انتخاب‌شده` : 'هیچ تیکی = همه'}
            </span>
          </div>

          {#if runnableScenarios.length}
            <div class="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border p-1.5">
              {#each runnableScenarios as item (item.path || item.name)}
                <label class="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm font-normal hover:bg-accent/50">
                  <input
                    type="checkbox"
                    class="mt-1"
                    checked={picked.has(item.name)}
                    disabled={busy}
                    onchange={() => togglePick(item.name)}
                  />
                  <span class="min-w-0 flex-1 break-words">
                    {item.name}
                    <!-- پیش‌نویس اجرا می‌شود ولی رگرسیون نیست؛ در فهرست هم باید فرق کند -->
                    {#if item.status === 'draft'}
                      <span class="text-[10px] text-muted-foreground">· پیش‌نویس</span>
                    {/if}
                  </span>
                </label>
              {/each}
            </div>
            {#if picked.size}
              <button
                type="button"
                class="text-[11px] text-muted-foreground underline underline-offset-2"
                onclick={() => { picked = new Set(); }}
              >
                برداشتنِ همهٔ تیک‌ها
              </button>
            {/if}
          {:else}
            <p class="rounded-lg border border-dashed p-3 text-center text-xs font-normal text-muted-foreground">
              سناریوی اجراشدنی‌ای نیست.
            </p>
          {/if}
        </div>

        <!--
          اسمِ بار.

          ارزشش در فهرست نیست، در تریاژ است: یافته‌ای که هفتهٔ بعد باز می‌شود
          باید بتواند بگوید «در بنچِ پس از اصلاح هم بود» — چیزی که رشتهٔ
          تاریخِ اجرا هرگز نگفت.
        -->
        <label class="block space-y-1.5 text-sm font-medium">
          <span>اسمِ این بار <span class="font-normal text-muted-foreground">(اختیاری)</span></span>
          <Input bind:value={bench} placeholder="مثلاً: پیش از انتشار ۴.۲" disabled={busy} maxlength="60" />
          <span class="block text-[11px] font-normal leading-5 text-muted-foreground">
            در فهرست اجراها فیلتر می‌شود و در تریاژ کنارِ هر یافته می‌آید.
          </span>
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="block space-y-1.5 text-sm font-medium">
            <span>دستگاه</span>
            <Input bind:value={device} placeholder={project?.device || 'desktop'} disabled={busy} />
          </label>
          <label class="block space-y-1.5 text-sm font-medium">
            <span>تکرار</span>
            <Input type="number" min="1" max="10" bind:value={repeat} disabled={busy} />
          </label>
        </div>
        <label class="block space-y-1.5 text-sm font-medium">
          <span>رفتار کاربر</span>
          <select class="app-select" bind:value={persona} disabled={busy}>
            <option value="">پیش‌فرض سناریو</option><option value="novice">تازه‌کار</option><option value="pro">حرفه‌ای</option>
          </select>
        </label>

        <!--
          انتخاب مدل، ردیفِ خودش.

          ── چرا از کنارِ «رفتار کاربر» درآمد ──

          نصفِ عرضِ یک ستونِ ۲۳rem جا نداشت: خودِ کنترل یک ورودی است به‌علاوهٔ
          دکمهٔ «فهرست»، و بازشدنش پنلی است با جست‌وجو و فهرستِ بلندِ مدل‌ها با
          قیمت — که در نصفِ ستون خوانده نمی‌شد.

          و یک نقصِ واقعی هم همین‌جا بود: `div`ِ آن شبکهٔ دوستونی هرگز بسته
          نشده بود، پس ردیفِ تیک‌های زیرش هم داخلش می‌افتاد.
        -->
        <ModelPicker bind:value={model} disabled={busy} />

        <div class="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <label class="flex items-center gap-2"><input type="checkbox" bind:checked={headed} disabled={busy} /> مرورگر دیده شود</label>
          <label class="flex items-center gap-2"><input type="checkbox" bind:checked={author} disabled={busy} /> ساخت پیش‌نویس کاوش</label>
        </div>
        {#if error}<p class="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>{/if}
        {#if job?.status === 'cancelling'}
          <Button type="button" variant="outline" class="w-full" disabled>در حال لغو…</Button>
        {:else if canCancel}
          <Button type="button" variant="destructive" class="w-full" onclick={cancel}>لغو اجرا</Button>
        {:else}
          <Button type="submit" class="w-full" disabled={submitting || busy || !target}>{submitting ? 'در حال شروع…' : 'شروع اجرا'}</Button>
        {/if}
      </form>
    </Card.Content>

    <!--
      زمان‌بندی همان‌جایی است که پرچم‌ها را انتخاب می‌کنید، چون همان پرچم‌ها را
      ذخیره می‌کند. زمان‌بندِ واقعی سیستم است؛ رابط فقط ورودی‌هایش را می‌سازد.
    -->
    <Card.Content class="space-y-3 border-t pt-5">
      <div class="flex items-center justify-between gap-2">
        <strong class="text-sm">زمان‌بندی</strong>
        <Button variant="ghost" size="sm" onclick={() => { showSchedule = !showSchedule; }}>{showSchedule ? 'بستن' : 'افزودن'}</Button>
      </div>

      {#each data.schedules as item (item.key)}
        <div class="rounded-lg border p-3 text-xs leading-6">
          <div class="flex items-center justify-between gap-2">
            <span class="code-value">{item.key}</span>
            {#if item.installed}
              <span class="text-emerald-700 dark:text-emerald-300">فعال</span>
            {:else}
              <!-- فایلش هست ولی تسک نیست: پنهان کردنش یعنی کاربر فکر کند هر شب اجرا می‌شود. -->
              <span class="text-destructive">در زمان‌بند نیست</span>
            {/if}
          </div>
          <p class="text-muted-foreground">
            {item.frequency === 'weekly' ? `هفتگی ${item.days?.join('،')} · ${item.time}` : `روزانه ${item.time}`}
            {#if item.grep} · {item.grep}{/if}
          </p>
          {#if item.lastLog}<p class="text-muted-foreground">{item.lastLog}</p>{/if}
          <div class="mt-2 flex gap-2">
            <Button variant="outline" size="sm" onclick={() => runSchedule(item.key)} disabled={scheduleBusy}>اجرا کن</Button>
            <Button variant="ghost" size="sm" onclick={() => removeSchedule(item.key)} disabled={scheduleBusy}>حذف</Button>
          </div>
        </div>
      {/each}

      {#if showSchedule}
        <div class="space-y-3 rounded-lg border border-dashed p-3">
          <label class="block space-y-1.5 text-sm font-medium"><span>کلید</span><Input bind:value={scheduleForm.key} dir="ltr" placeholder="nightly" /></label>
          <div class="grid grid-cols-2 gap-2">
            <label class="block space-y-1.5 text-sm font-medium"><span>ساعت</span><Input bind:value={scheduleForm.time} dir="ltr" placeholder="02:00" /></label>
            <label class="block space-y-1.5 text-sm font-medium">
              <span>تکرار</span>
              <select class="app-select" bind:value={scheduleForm.frequency}><option value="daily">روزانه</option><option value="weekly">هفتگی</option></select>
            </label>
          </div>
          {#if scheduleForm.frequency === 'weekly'}
            <label class="block space-y-1.5 text-sm font-medium"><span>روزها</span><Input bind:value={scheduleForm.days} dir="ltr" placeholder="MON,WED,FRI" /></label>
          {/if}
          <p class="text-xs leading-6 text-muted-foreground">فیلتر سناریو، دستگاه، رفتار کاربر، مدل و عمقِ همین فرمِ بالا در زمان‌بندی ذخیره می‌شوند.</p>
          <Button class="w-full" onclick={addSchedule} disabled={scheduleBusy || !scheduleForm.key || !scheduleForm.time}>{scheduleBusy ? 'در حال ساخت…' : 'ساخت زمان‌بندی'}</Button>
        </div>
      {/if}
    </Card.Content>
  </Card.Root>

  <section class="min-w-0 space-y-6">
    {#if job}
      <Card.Root class="overflow-hidden gap-0 py-0">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div class="flex items-center gap-3"><StatusBadge status={job.status === 'finished' ? job.outcome : job.status} /><span class="code-value text-muted-foreground">{job.id}</span></div>
          <div class="flex items-center gap-2">
            <!--
              اجرا که تمام شد، قدمِ بعد تریاژ است.

              پیش‌تر فقط «صفحهٔ اجرا» بود — که روایتِ همین یک اجراست. ولی
              کارِ بعدی خواندنِ روایت نیست، قضاوت دربارهٔ یافته‌هاست؛ و آن
              قضاوت به شناخت برمی‌گردد. دکمه فقط وقتی می‌آید که واقعاً
              یافته‌ای باشد.
            -->
            {#if !busy && liveFindings.length}
              <Button href={`/projects/${encodeURIComponent(target)}/triage`} size="sm">
                تریاژِ {formatNumber(liveFindings.length)} یافته
              </Button>
            {/if}
            {#if activeRun}<Button href={`/runs/${encodeURIComponent(activeRun)}`} variant="outline" size="sm">صفحهٔ اجرا</Button>{/if}
          </div>
        </div>
        <div class="grid gap-0 md:grid-cols-[minmax(0,1fr)_18rem]">
          <div class="min-h-80 p-5">
            {#if latestStep?.shot && activeRun}
              <img src={`/api/runs/${encodeURIComponent(latestStep.runId || activeRun)}/assets/${latestStep.shot.split('/').map(encodeURIComponent).join('/')}`} alt={`عکس قدم ${latestStep.step}`} class="max-h-[32rem] w-full rounded-xl border bg-muted object-contain" />
              <div class="mt-3 flex items-center justify-between gap-3"><strong class="text-sm">{latestStep.step}</strong><span class="text-xs text-muted-foreground">{latestStep.route || ''}</span></div>
            {:else}
              <div class="grid min-h-72 place-items-center rounded-xl border border-dashed bg-muted/30 text-center text-sm text-muted-foreground">
                <div><span class="mx-auto mb-3 block size-8 animate-pulse rounded-full border-4 border-primary/20 border-t-primary"></span>{busy ? 'منتظر نخستین قدم و عکس…' : 'این اجرا عکسی ثبت نکرده است'}</div>
              </div>
            {/if}
          </div>
          <div class="border-t bg-muted/30 p-4 md:border-t-0 md:border-r">
            <div class="mb-4 grid grid-cols-3 gap-2 text-center">
              <div><strong class="block text-lg">{formatNumber(liveSteps.length)}</strong><small class="text-muted-foreground">قدم</small></div>
              <div><strong class="block text-lg text-destructive">{formatNumber(liveFindings.length)}</strong><small class="text-muted-foreground">یافته</small></div>
              <div><strong class="block text-lg">{formatNumber(liveErrors.length)}</strong><small class="text-muted-foreground">خطا</small></div>
            </div>
            <div class="scroll-thin max-h-[28rem] space-y-2 overflow-auto">
              {#each [...liveFindings, ...liveErrors].slice(-30).reverse() as item}
                <div class="rounded-lg border bg-background p-3 text-xs leading-6"><Badge variant={item.source === 'server' ? 'destructive' : 'secondary'}>{sourceLabel(item.source)}</Badge><p class="mt-2 break-words">{item.normalized || item.message}</p></div>
              {:else}<p class="py-8 text-center text-xs text-muted-foreground">هنوز خطایی دیده نشده است.</p>{/each}
            </div>
          </div>
        </div>
        {#if output.length}
          <details class="border-t"><summary class="cursor-pointer px-5 py-3 text-sm font-medium">خروجی اجراگر ({formatNumber(output.length)} خط آخر)</summary><pre class="scroll-thin max-h-64 overflow-auto border-t bg-slate-950 p-4 text-xs leading-6 text-slate-200" dir="auto">{output.join('\n')}</pre></details>
        {/if}
      </Card.Root>
    {:else}
      <Card.Root class="border-dashed bg-card/70">
        <Card.Content class="grid min-h-52 place-items-center text-center"><div><span class="text-4xl">◎</span><h2 class="mt-3 font-bold">آمادهٔ مشاهدهٔ زنده</h2><p class="mt-2 text-sm text-muted-foreground">یک اجرا را از فرم کناری شروع کنید.</p></div></Card.Content>
      </Card.Root>
    {/if}

    <!--
      سلامتِ سفرها، پیش از تاریخچهٔ اجراها.

      ── چرا بالاتر ──

      فهرستِ اجراها تاریخِ **کارِ ابزار** است: کی چه چیزی را بردیم. ولی
      پرسشی که آدم صبح با آن می‌آید این نیست؛ این است که «اپم سالم است؟».
      تا امروز هیچ‌جای این رابط آن را جواب نمی‌داد.
    -->
    <HealthTable rows={data.health || []} base={`/projects/${encodeURIComponent(target)}`} />

    <div>
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold">اجراهای اخیر</h2>
          <p class="mt-1 text-sm text-muted-foreground">تاریخچه مستقیماً از پوشهٔ runs خوانده می‌شود.</p>
        </div>
        <div class="flex items-center gap-2">
          <!--
            «مقایسه» از منوی کناری به اینجا آمد: دو اجرا لازم دارد، پس تا
            وقتی اجرایی نیست فقط یک ردیفِ مرده بود کنارِ شناخت. با کمتر از دو
            اجرا اصلاً نشان داده نمی‌شود.
          -->
          {#if runs.length > 1}
            <Button href={`/projects/${encodeURIComponent(target)}/compare`} variant="outline" size="sm">
              مقایسهٔ دو اجرا
            </Button>
          {/if}
          <Badge variant="outline">
            {visibleRuns.length === runs.length
              ? `${formatNumber(runs.length)} اجرا`
              : `${formatNumber(visibleRuns.length)} از ${formatNumber(runs.length)}`}
          </Badge>
        </div>
      </div>

      <!--
        فیلتر و مرتب‌سازی.

        ── چرا لازم شد ──

        فهرست فقط از نو به کهنه ریخته می‌شد و بس. با چهل اجرا — که بعد از چند
        روز کارِ عادی است — پیدا کردنِ «آن گشتی که دیروز رفتم» یعنی اسکرول
        کردن و خواندنِ شناسه‌ها.

        محورها همان‌هایی‌اند که آدم واقعاً با آن‌ها می‌گردد: **نوع** (اجرا،
        کاوش، گشت، خزش)، **بنچ** (اسمی که خودش روی آن بار گذاشته)، **یافته
        داشت یا نه**، و جست‌وجو روی شناسه و سناریو و بنچ. همه
        سمتِ کلاینت، روی داده‌ای که از قبل بارگذاری شده — پس فیلتر کردن
        درخواستی به سرور نمی‌زند.
      -->
      {#if runs.length > 3}
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <Input bind:value={runSearch} placeholder="جست‌وجو در شناسه، بنچ یا سناریو…" class="h-8 w-52" />
          <select bind:value={runKind} class="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="all">همهٔ انواع</option>
            <option value="run">اجرای سناریو</option>
            <option value="quest">کاوشِ هدف‌دار</option>
            <option value="tour">گشت</option>
            <option value="map">خزشِ نقشه</option>
          </select>
          <!--
            کشویی بنچ فقط وقتی هست که بنچی وجود دارد: گزینه‌ای که همیشه خالی
            است، فقط جا می‌گیرد و به کاربر می‌گوید چیزی را از دست داده.
          -->
          {#if benchNames.length}
            <select bind:value={runBench} class="h-8 rounded-md border bg-background px-2 text-xs">
              <option value="all">همهٔ بنچ‌ها</option>
              <option value="none">بی‌بنچ</option>
              {#each benchNames as name (name)}
                <option value={name}>{name}</option>
              {/each}
            </select>
          {/if}
          <select bind:value={runFindings} class="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="all">با و بی یافته</option>
            <option value="with">فقط یافته‌دارها</option>
            <option value="without">فقط بی‌یافته‌ها</option>
          </select>
          <select bind:value={runSort} class="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="new">تازه‌ترین اول</option>
            <option value="old">قدیمی‌ترین اول</option>
            <option value="findings">پریافته‌ترین اول</option>
            <option value="steps">پرقدم‌ترین اول</option>
          </select>
          {#if filtered}
            <button class="text-xs text-muted-foreground underline underline-offset-2" onclick={resetRunFilters}>
              پاک کردن فیلترها
            </button>
          {/if}
        </div>
      {/if}

      <div class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {#each visibleRuns as run (run.runId)}
          <!-- حذف در همان لحظه از فهرست برداشته می‌شود، نه با بارگذاری دوبارهٔ صفحه -->
          <RunCard {run} onRemoved={(id) => (runs = runs.filter((item) => item.runId !== id))} />
        {:else}
          <p class="rounded-xl border border-dashed p-10 text-center text-muted-foreground md:col-span-2">
            {runs.length ? 'هیچ اجرایی با این فیلترها نیست.' : 'هنوز اجرایی ثبت نشده است.'}
          </p>
        {/each}
      </div>
    </div>
  </section>
</div>
