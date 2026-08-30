<script>
  import { onMount } from 'svelte';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import RunCard from '$lib/components/RunCard.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { formatNumber, sourceLabel } from '$lib/format.js';

  const ACTIVE_JOB_STATUSES = new Set(['starting', 'running', 'cancelling']);

  let { data } = $props();
  // این‌ها snapshot اولیه‌اند چون کاربر در همین صفحه آن‌ها را تغییر می‌دهد.
  // svelte-ignore state_referenced_locally
  let runs = $state(data.runs);
  let scenario = $state('');
  let device = $state('');
  let persona = $state('');
  let depth = $state('');
  let model = $state('');
  let models = $state([]);
  let repeat = $state(1);
  let headed = $state(false);
  let author = $state(false);
  let submitting = $state(false);
  let error = $state('');
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

  async function start(event) {
    event.preventDefault();
    error = '';
    submitting = true;
    resetLive();
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target, grep: scenario, device, persona, depth, model, repeat, headed, author }),
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
   * فهرست مدل‌ها برای پیشنهادِ ورودی.
   *
   * بی‌صدا شکست می‌خورد: نبودنِ فهرست نباید مانع اجرا شود، چون خالی گذاشتنِ
   * این فیلد یعنی «پیش‌فرض کانفیگ» که همیشه کار می‌کند.
   */
  async function loadModels() {
    try {
      const response = await fetch('/api/models?free=1&limit=60');
      if (response.ok) models = (await response.json()).models || [];
    } catch {
      models = [];
    }
  }

  onMount(() => {
    loadModels();
    if (data.activeJob) {
      resetLive();
      for (const event of data.activeJob.events || []) applyEvent(event);
      if (ACTIVE_JOB_STATUSES.has(data.activeJob.status)) connect(data.activeJob.id);
    }
    return () => stream?.close();
  });
</script>

<PageHeader eyebrow={`${project.environment} · ${project.baseURL}`} title={project.name} description="سناریو را انتخاب کنید؛ قدم، عکس، خطای مرورگر و لاگ سرور در همان لحظه اینجا می‌آیند.">
  {#snippet actions()}
    <Button href={`/projects/${encodeURIComponent(target)}/files`} variant="outline">سناریوها</Button>
    <Button href={`/projects/${encodeURIComponent(target)}/compare`} variant="outline">مقایسهٔ اجراها</Button>
  {/snippet}
</PageHeader>

<div class="grid gap-6 xl:grid-cols-[23rem_minmax(0,1fr)]">
  <Card.Root class="h-fit gap-5 xl:sticky xl:top-20">
    <Card.Header>
      <Card.Title>اجرای تازه</Card.Title>
      <Card.Description>هر بار فقط یک روایت از GUI اجرا می‌شود تا منابع مرورگر و جریان زنده با هم تداخل نکنند.</Card.Description>
    </Card.Header>
    <Card.Content>
      <form class="space-y-4" onsubmit={start}>
        <label class="block space-y-1.5 text-sm font-medium">
          <span>سناریو</span>
          <select class="app-select" bind:value={scenario} disabled={busy}>
            <option value="">همهٔ سناریوها</option>
            {#each project?.scenarios || [] as item}
              {#if item.runnable}<option value={item.name}>{item.name}</option>{/if}
            {/each}
          </select>
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
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block space-y-1.5 text-sm font-medium">
            <span>رفتار کاربر</span>
            <select class="app-select" bind:value={persona} disabled={busy}>
              <option value="">پیش‌فرض سناریو</option><option value="novice">تازه‌کار</option><option value="pro">حرفه‌ای</option>
            </select>
          </label>
          <!-- هر قدمِ کاوش یک فراخوانی مدل است، پس این عدد همان هزینه است. -->
          <label class="block space-y-1.5 text-sm font-medium">
            <span>عمق کاوش</span>
            <Input type="number" min="1" max="100" bind:value={depth} placeholder="پیش‌فرض سناریو" disabled={busy} />
          </label>
        </div>
        <!--
          ورودی است نه کشویی، چون فهرست زنده است و ممکن است نیاید (کلید نباشد یا
          شبکه نرسد). این‌طور هم انتخاب از فهرست کار می‌کند، هم تایپِ اسلاگی که
          در فهرست رایگان نیست.
        -->
        <label class="block space-y-1.5 text-sm font-medium">
          <span>مدل هوش مصنوعی</span>
          <Input
            bind:value={model}
            list="model-options"
            spellcheck="false"
            dir="ltr"
            placeholder="پیش‌فرض کانفیگ"
            disabled={busy}
          />
          <datalist id="model-options">
            {#each models as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
          </datalist>
        </label>
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
  </Card.Root>

  <section class="min-w-0 space-y-6">
    {#if job}
      <Card.Root class="overflow-hidden gap-0 py-0">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div class="flex items-center gap-3"><StatusBadge status={job.status === 'finished' ? job.outcome : job.status} /><span class="code-value text-muted-foreground">{job.id}</span></div>
          {#if activeRun}<Button href={`/runs/${encodeURIComponent(activeRun)}`} variant="outline" size="sm">صفحهٔ اجرا</Button>{/if}
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

    <div>
      <div class="mb-4 flex items-end justify-between"><div><h2 class="text-xl font-bold">اجراهای اخیر</h2><p class="mt-1 text-sm text-muted-foreground">تاریخچه مستقیماً از پوشهٔ runs خوانده می‌شود.</p></div><Badge variant="outline">{formatNumber(runs.length)} اجرا</Badge></div>
      <div class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {#each runs as run (run.runId)}<RunCard {run} />{:else}<p class="rounded-xl border border-dashed p-10 text-center text-muted-foreground md:col-span-2">هنوز اجرایی ثبت نشده است.</p>{/each}
      </div>
    </div>
  </section>
</div>
