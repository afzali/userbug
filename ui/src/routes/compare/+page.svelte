<script>
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import FindingCard from '$lib/components/FindingCard.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { formatDate, formatNumber } from '$lib/format.js';

  let { data } = $props();
</script>

<PageHeader eyebrow="اثر انگشت، نه متن خام" title="مقایسهٔ دو اجرا" description="یافته‌های تازه، رفته و مانده با همان تابع dedupe موتور محاسبه می‌شوند.">
  {#snippet actions()}<Button href="/" variant="outline">اجرای تازه</Button>{/snippet}
</PageHeader>

<Card.Root class="mb-6 gap-4">
  <Card.Content>
    <form method="GET" class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] lg:items-end">
      <label class="space-y-1.5 text-sm font-medium"><span>اجرای اول (مبدأ)</span><select name="a" class="app-select" value={data.a}>{#each data.runs as run}<option value={run.runId}>{run.runId} · {run.target} · {formatNumber(run.findings)} یافته</option>{/each}</select></label>
      <span class="hidden pb-2 text-xl text-muted-foreground lg:block">←</span>
      <label class="space-y-1.5 text-sm font-medium"><span>اجرای دوم (مقصد)</span><select name="b" class="app-select" value={data.b}>{#each data.runs as run}<option value={run.runId}>{run.runId} · {run.target} · {formatNumber(run.findings)} یافته</option>{/each}</select></label>
      <Button type="submit">مقایسه کن</Button>
    </form>
  </Card.Content>
</Card.Root>

{#if data.compareError}<p class="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">{data.compareError}</p>{/if}

{#if data.comparison}
  {#if data.comparison.warnings.length}
    <div class="mb-6 space-y-2">
      {#each data.comparison.warnings as warning}
        <div class="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-7 text-amber-900 dark:text-amber-200">
          {#if warning.type === 'coverage'}<strong>پوشش سناریو یکسان نیست.</strong> «رفته» الزاماً رفع‌شده نیست. {#if warning.onlyA.length}<span>فقط اولی: {warning.onlyA.join('، ')}</span>{/if} {#if warning.onlyB.length}<span>فقط دومی: {warning.onlyB.join('، ')}</span>{/if}
          {:else if warning.type === 'device'}دستگاه‌ها متفاوت‌اند: {warning.a || '—'} و {warning.b || '—'}.
          {:else if warning.type === 'environment'}محیط‌ها متفاوت‌اند: {warning.a || '—'} و {warning.b || '—'}.
          {:else}هدف‌ها متفاوت‌اند: {warning.a || '—'} و {warning.b || '—'}.{/if}
        </div>
      {/each}
    </div>
  {/if}

  <div class="mb-6 grid gap-4 md:grid-cols-2">
    <Card.Root class="gap-2 p-5 py-5"><span class="code-value text-sm">{data.comparison.first.runId}</span><span class="text-xs text-muted-foreground">{formatDate(data.comparison.first.startedAt)} · {data.comparison.first.device}</span></Card.Root>
    <Card.Root class="gap-2 p-5 py-5"><span class="code-value text-sm">{data.comparison.second.runId}</span><span class="text-xs text-muted-foreground">{formatDate(data.comparison.second.startedAt)} · {data.comparison.second.device}</span></Card.Root>
  </div>

  <div class="mb-8 grid gap-3 sm:grid-cols-3">
    <div class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5"><span class="text-sm text-muted-foreground">تازه</span><strong class="mt-1 block text-3xl text-rose-700 dark:text-rose-300">{formatNumber(data.comparison.added.length)}</strong></div>
    <div class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5"><span class="text-sm text-muted-foreground">رفته</span><strong class="mt-1 block text-3xl text-emerald-700 dark:text-emerald-300">{formatNumber(data.comparison.gone.length)}</strong></div>
    <div class="rounded-xl border bg-card p-5"><span class="text-sm text-muted-foreground">مانده</span><strong class="mt-1 block text-3xl">{formatNumber(data.comparison.kept.length)}</strong></div>
  </div>

  <div class="grid gap-8 xl:grid-cols-2">
    <section><h2 class="mb-4 flex items-center gap-2 text-lg font-bold">یافته‌های تازه <Badge variant="destructive">{formatNumber(data.comparison.added.length)}</Badge></h2><div class="space-y-3">{#each data.comparison.added as finding}<FindingCard {finding} tone="added" />{:else}<p class="rounded-xl border border-dashed p-8 text-center text-muted-foreground">یافتهٔ تازه‌ای نیست.</p>{/each}</div></section>
    <section><h2 class="mb-4 flex items-center gap-2 text-lg font-bold">یافته‌های رفته <Badge variant="outline">{formatNumber(data.comparison.gone.length)}</Badge></h2><div class="space-y-3">{#each data.comparison.gone as finding}<FindingCard {finding} tone="gone" />{:else}<p class="rounded-xl border border-dashed p-8 text-center text-muted-foreground">یافته‌ای نرفته است.</p>{/each}</div></section>
  </div>

  {#if data.comparison.kept.length}<details class="mt-8 rounded-xl border bg-card"><summary class="cursor-pointer p-4 font-semibold">یافته‌های مانده ({formatNumber(data.comparison.kept.length)})</summary><div class="grid gap-3 border-t p-4 xl:grid-cols-2">{#each data.comparison.kept as finding}<FindingCard {finding} />{/each}</div></details>{/if}
{/if}
