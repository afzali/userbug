<script>
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import FindingCard from '$lib/components/FindingCard.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { formatDate, formatDuration, formatNumber, sourceLabel } from '$lib/format.js';

  let { data } = $props();
  /**
   * شمارهٔ trace نگه داشته می‌شود، نه خودِ شیء.
   *
   * نسخهٔ اول شیء را در `$state` می‌گذاشت و بعد با `data.traces.indexOf(trace)`
   * شماره‌اش را پیدا می‌کرد. ولی `$state` شیء را در پروکسی می‌پیچد، پس
   * `indexOf` روی آرایهٔ خام `-1` برمی‌گرداند و آدرس `/trace/-1` می‌شد —
   * نمایشگر می‌گفت «Could not load trace».
   *
   * با نگه‌داشتن شماره، هویتِ شیء اصلاً وسط نمی‌آید.
   */
  // svelte-ignore state_referenced_locally
  let selectedIndex = $state(data.traces.length ? 0 : -1);
  const selectedTrace = $derived(selectedIndex >= 0 ? data.traces[selectedIndex] : null);

  function asset(relative) {
    return `/api/runs/${encodeURIComponent(data.run.runId)}/assets/${String(relative).split('/').map(encodeURIComponent).join('/')}`;
  }

  /**
   * آدرسِ trace عمداً پسوند ندارد.
   *
   * وقتی به `.zip` ختم می‌شد، مدیرهای دانلود (اینجا IDM) قاپش می‌زدند و
   * به‌جای نمایشگر، پنجرهٔ دانلود باز می‌شد.
   */
  function traceViewer(index) {
    const source = `/api/runs/${encodeURIComponent(data.run.runId)}/trace/${index}`;
    return `/trace-viewer/index.html?trace=${encodeURIComponent(source)}`;
  }
</script>

<PageHeader eyebrow={`${data.run.target || 'هدف نامشخص'} · ${formatDate(data.run.startedAt)}`} title="روایت کامل اجرا" description={data.run.runId}>
  {#snippet actions()}
    <StatusBadge status={data.run.status} />
    <Button href={asset('report.html')} target="_blank" variant="outline">گزارش HTML</Button>
    <!--
      اجرا زیر مسیر پروژه نرفت چون شناسه‌اش یکتاست، ولی راهِ برگشت به فضای کاری
      باید باشد؛ وگرنه از صفحهٔ اجرا فقط دکمهٔ back مرورگر می‌ماند.
    -->
    {#if data.run.target}
      <Button href={`/projects/${encodeURIComponent(data.run.target)}/compare?a=${encodeURIComponent(data.run.runId)}`} variant="outline">مقایسه</Button>
      <Button href={`/projects/${encodeURIComponent(data.run.target)}`} variant="outline">فضای کاری پروژه</Button>
    {/if}
  {/snippet}
</PageHeader>

<div class="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
  <Card.Root class="gap-1 p-4 py-4"><span class="text-xs text-muted-foreground">قدم</span><strong class="text-2xl">{formatNumber(data.run.steps)}</strong></Card.Root>
  <Card.Root class="gap-1 p-4 py-4"><span class="text-xs text-muted-foreground">یافتهٔ یکتا</span><strong class="text-2xl text-destructive">{formatNumber(data.run.findings)}</strong></Card.Root>
  <Card.Root class="gap-1 p-4 py-4"><span class="text-xs text-muted-foreground">رخداد یافته</span><strong class="text-2xl">{formatNumber(data.run.findingEvents)}</strong></Card.Root>
  <Card.Root class="gap-1 p-4 py-4"><span class="text-xs text-muted-foreground">خط لاگ سرور</span><strong class="text-2xl">{formatNumber(data.run.serverLines)}</strong></Card.Root>
  <Card.Root class="gap-1 p-4 py-4"><span class="text-xs text-muted-foreground">دستگاه</span><strong class="truncate text-lg">{data.run.device || '—'}</strong></Card.Root>
</div>

{#if data.findings.length}
  <section class="mb-8">
    <div class="mb-4 flex items-center justify-between"><h2 class="text-xl font-bold">یافته‌ها</h2><Badge variant="destructive">{formatNumber(data.findings.length)} یکتا</Badge></div>
    <div class="grid gap-4 xl:grid-cols-2">{#each data.findings as finding}<FindingCard {finding} />{/each}</div>
  </section>
{/if}

<section class="mb-8">
  <div class="mb-4"><h2 class="text-xl font-bold">خط زمانی مشترک</h2><p class="mt-1 text-sm text-muted-foreground">رخدادهای مرورگر و سرور در بازهٔ همان قدم، کنار یکدیگر دیده می‌شوند.</p></div>
  <div class="space-y-5">
    {#each data.timeline as step, index}
      {@const clientEvents = step.events.filter((event) => event.source !== 'server')}
      {@const serverEvents = step.events.filter((event) => event.source === 'server')}
      <article class="timeline">
        <span class="timeline-dot"></span>
        <Card.Root class="gap-0 overflow-hidden py-0">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div><span class="text-xs text-muted-foreground">قدم {formatNumber(index + 1)} · {step.scenario || 'سناریو'}</span><h3 class="mt-1 font-bold">{step.step}</h3></div>
            <div class="flex items-center gap-2"><Badge variant={step.errorCount ? 'destructive' : 'outline'}>{formatNumber(step.errorCount || 0)} خطا</Badge><span class="text-xs text-muted-foreground">{formatDuration(step.ms)}</span></div>
          </div>
          <div class="grid lg:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.1fr)]">
            <div class="border-b bg-muted/20 p-4 lg:border-b-0 lg:border-l">
              {#if step.shot}<a href={asset(step.shot)} target="_blank"><img src={asset(step.shot)} alt={`پایان قدم ${step.step}`} loading="lazy" class="max-h-[32rem] w-full rounded-lg border bg-background object-contain" /></a>{:else}<div class="grid min-h-44 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">عکسی ثبت نشده</div>{/if}
              <p class="code-value mt-3 truncate text-muted-foreground" title={step.route}>{step.route || '—'}</p>
            </div>
            <div class="grid min-w-0 md:grid-cols-2">
              <div class="border-b p-4 md:border-b-0 md:border-l">
                <h4 class="mb-3 text-sm font-bold">مرورگر و سناریو <Badge variant="secondary">{formatNumber(clientEvents.length)}</Badge></h4>
                <div class="space-y-2">
                  {#each clientEvents as event}<div class="rounded-lg border bg-background p-3 text-xs leading-6"><Badge variant={event.severity === 'error' ? 'destructive' : 'outline'}>{sourceLabel(event.source || event.kind)}</Badge><p class="mt-2 break-words">{event.message || event.action || event.why || event.kind}</p></div>{:else}<p class="py-6 text-center text-xs text-muted-foreground">رخدادی ثبت نشده است.</p>{/each}
                </div>
              </div>
              <div class="p-4">
                <h4 class="mb-3 text-sm font-bold">سرور <Badge variant="secondary">{formatNumber(serverEvents.length)}</Badge></h4>
                <div class="space-y-2">
                  {#each serverEvents as event}<div class="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs leading-6"><div class="flex gap-2"><Badge variant="destructive">{event.collector || 'server'}</Badge><span class="text-muted-foreground">{event.severity}</span></div><p class="mt-2 break-words">{event.message}</p></div>{:else}<p class="py-6 text-center text-xs text-muted-foreground">در این قدم خطی از سرور نیامد.</p>{/each}
                </div>
              </div>
            </div>
          </div>
        </Card.Root>
      </article>
    {:else}<p class="rounded-xl border border-dashed p-10 text-center text-muted-foreground">این اجرا قدمی ثبت نکرده است.</p>{/each}
  </div>
</section>

{#if data.orphanEvents.length}
  <details class="mb-8 rounded-xl border bg-card"><summary class="cursor-pointer p-4 font-semibold">رخدادهای بیرون از مرز قدم ({formatNumber(data.orphanEvents.length)})</summary><pre class="scroll-thin max-h-96 overflow-auto border-t p-4 text-xs" dir="ltr">{JSON.stringify(data.orphanEvents, null, 2)}</pre></details>
{/if}

{#if data.traces.length}
  <section class="mb-8">
    <div class="mb-4"><h2 class="text-xl font-bold">Playwright Trace Viewer</h2><p class="mt-1 text-sm text-muted-foreground">viewer اصلی همان نسخهٔ نصب‌شدهٔ Playwright، درون رابط محلی embed شده است.</p></div>
    <Card.Root class="gap-0 overflow-hidden py-0">
      <div class="flex flex-wrap gap-2 border-b p-3">
        {#each data.traces as trace, index}<Button size="sm" variant={selectedIndex === index ? 'default' : 'outline'} onclick={() => (selectedIndex = index)}>{trace.scenario || trace.title || 'trace'}</Button>{/each}
      </div>
      {#if selectedTrace}<iframe src={traceViewer(selectedIndex)} title={`Trace ${selectedTrace.scenario || ''}`} class="h-[75vh] min-h-[620px] w-full bg-white"></iframe>{/if}
    </Card.Root>
  </section>
{:else}
  <Card.Root class="mb-8 border-dashed"><Card.Content class="text-sm text-muted-foreground">این اجرای قدیمی trace متصل به پوشهٔ run ندارد. اجراهای تازهٔ رابط، trace را در همان run نگه می‌دارند.</Card.Content></Card.Root>
{/if}
