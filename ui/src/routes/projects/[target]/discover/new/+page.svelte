<script>
  /**
   * فرمِ کاملِ خزش.
   *
   * ── چرا صفحهٔ خودش را دارد ──
   *
   * تا امروز روی `discover/live` می‌نشست، یعنی روی صفحه‌ای که بعد از
   * «شروع» به آن می‌رسیدی — پس وسطِ کارِ در جریان یک فرمِ شروع دیده
   * می‌شد. اینجا کسی که وارد می‌شود، **خواسته** که وارد شود.
   *
   * خودِ `CrawlPanel` و `MapReport` دست‌نخورده‌اند: محتوایشان درست بود،
   * جایشان غلط.
   */
  import { Button } from '$lib/components/ui/button/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import CrawlPanel from '$lib/components/CrawlPanel.svelte';
  import MapReport from '$lib/components/MapReport.svelte';
  import { ACTIVE, run } from '$lib/run-store.svelte.js';

  let { data } = $props();

  let target = $derived(data.target);
  let base = $derived(`/projects/${encodeURIComponent(target)}`);

  /**
   * اگر کاری در جریان است، فرم پنهان می‌شود.
   *
   * سرور خودش دومی را رد می‌کند (`JOB_ACTIVE`)، ولی خطای بعد از کلیک
   * جوابِ درستی نیست: فرمی که نمی‌تواند کار کند نباید دعوت کند.
   */
  let busy = $derived(ACTIVE.has(run.job?.status));
</script>

<svelte:head><title>خزشِ دقیق — {data.project?.name || target}</title></svelte:head>

{#snippet actions()}
  <Button variant="ghost" size="sm" href={`${base}/runs`}>← همهٔ کشف‌ها</Button>
  <Button variant="outline" size="sm" href={base}>اپِ من</Button>
{/snippet}

<PageHeader
  title="خزشِ دقیق"
  description="همان خزشِ مودالِ «کشف»، با تنظیم‌هایی که آنجا نیست: دانه، دامنه، واژه‌های اولویت، انتخابِ حساب، و نقشهٔ کار."
  {actions}
/>

{#if busy}
  <section class="rounded-xl border border-amber-500/40 bg-amber-500/5 p-6">
    <h2 class="text-base font-semibold">همین حالا کاری در جریان است</h2>
    <p class="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
      هر بار فقط یک مرورگر باز می‌شود، پس تا تمام نشده نمی‌شود خزشِ تازه‌ای
      شروع کرد. پیشرفتش در نوارِ پایینِ صفحه است.
    </p>
    <div class="mt-4 flex flex-wrap gap-2">
      <Button size="sm" variant="outline" href={`${base}/discover/live`}>دیدنِ کارِ در جریان</Button>
    </div>
  </section>
{:else}
  <CrawlPanel {data} {target} />
  <div class="mt-6"><MapReport {data} {target} /></div>
{/if}
