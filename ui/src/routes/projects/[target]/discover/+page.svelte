<script>
  /**
   * «کشف» — صندوقِ جلسه‌ها.
   *
   * ── چرا صندوق ──
   *
   * کاربر گفت: «باید به این شکل باشه که بشه یه نیو زد که چطور کشف کنم…
   * بعد نتیجه این‌ها لیست بشه، و وقتی در یک گشتی وارد شدیم و در جریانه
   * دکمه‌های اضافه دیده نشه — مثل یک این‌باکس که وقتی نیو رو می‌زنیم داخل
   * اون ایمیل می‌ریم.»
   *
   * و این دقیقاً شکلِ «بررسی» است. دو صفحهٔ هم‌شکل — فهرست، «تازه»، و رفتن
   * داخلِ یکی — یعنی یاد گرفتنِ یکی، یاد گرفتنِ آن یکی.
   *
   * ── چرا انتخابِ روش در مودال است و نه روی صفحه ──
   *
   * رادیوی قبلی **حالت** بود: همیشه روی صفحه می‌ماند، حتی وقتی گشتی در
   * جریان بود، و یک کلیکِ اشتباهی کار را خراب می‌کرد. مودال یک **تصمیم**
   * است: باز می‌شود، انتخاب می‌کنی، بسته می‌شود. بعدش دیگر وجود ندارد که
   * دستت به آن بخورد.
   */
  import { goto } from '$app/navigation';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import NewDiscovery from '$lib/components/NewDiscovery.svelte';
  import { formatDate, formatNumber } from '$lib/format.js';

  let { data } = $props();

  let target = $derived(data.target);
  let base = $derived(`/projects/${encodeURIComponent(target)}`);
  let sessions = $derived(data.sessions || []);
  let live = $derived(data.live?.running ? data.live : null);

  let picking = $state(false);

  const TONE = {
    tour: 'bg-primary/10 text-primary',
    map: 'bg-secondary text-secondary-foreground',
    quest: 'bg-secondary text-secondary-foreground',
    source: 'bg-muted text-muted-foreground',
  };

  /**
   * عددهای هر ردیف به **روش** بستگی دارند.
   *
   * «۷ صفحه» دربارهٔ یک گشت معنا دارد و «۲۸ حالت» دربارهٔ یک خزش. نشان
   * دادنِ هر دو ستون برای هر دو، همان ستون‌های همیشه‌خالی است که فهرست را
   * بی‌معنا می‌کند.
   */
  function facts(one) {
    if (one.kind === 'source') {
      return [
        `${formatNumber(one.facts.files)} فایل`,
        `${formatNumber(one.facts.endpoints)} endpoint`,
        `${formatNumber(one.facts.routes)} روت`,
      ];
    }
    const out = [];
    if (one.steps) out.push(`${formatNumber(one.steps)} قدم`);
    if (one.findings) out.push(`${formatNumber(one.findings)} یافته`);
    if (one.bench) out.push(one.bench);
    return out;
  }
</script>

<svelte:head><title>کشف — {data.project?.name || target}</title></svelte:head>

{#snippet actions()}
  <Button variant="outline" size="sm" href={`${base}/knowledge`}>دانسته‌ها</Button>
  <Button size="sm" onclick={() => { picking = true; }}>＋ کشفِ تازه</Button>
{/snippet}

<PageHeader
  eyebrow={data.project?.name || target}
  title="کشف"
  description="چطور فهمیدیم این اپ چه دارد — و هر بار چه پیدا شد. آنچه پیدا شده، در «اپِ من» به‌شکلِ درخت دیده می‌شود."
  {actions}
/>

{#if picking}
  <NewDiscovery
    {target}
    project={data.project}
    onClose={() => { picking = false; }}
    onStarted={(id) => goto(`${base}/discover/${encodeURIComponent(id)}`)}
  />
{/if}

<!--
  کارِ در جریان، بالای همه.

  ── چرا جدا از فهرست ──

  گشتِ زنده در **همین پروسه** است و تا تمام نشود `run.json` ندارد، پس در
  فهرستِ `runs/` نیست. صندوقی که کارِ در جریان را نشان ندهد، دقیقاً در
  لحظه‌ای بی‌فایده است که کاربر بیشترین شک را دارد که آیا چیزی شروع شد.
-->
{#if live}
  <a
    href={`${base}/discover/live`}
    class="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
  >
    <span class="size-2 shrink-0 animate-pulse rounded-full bg-primary"></span>
    <span class="min-w-0 flex-1">
      <strong class="text-sm">گشتِ زنده در جریان است</strong>
      <span class="block text-xs text-muted-foreground">
        {live.pages ? `${formatNumber(live.pages)} صفحه ثبت شد · ` : ''}پنجرهٔ مرورگر باز است
      </span>
    </span>
    <span class="text-sm font-medium text-primary">برو داخل ←</span>
  </a>
{/if}

{#if !sessions.length && !live}
  <section class="rounded-xl border bg-muted/30 p-6">
    <h2 class="text-base font-semibold">هنوز نگشته‌ایم</h2>
    <p class="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
      ابزار هنوز نمی‌داند این اپ چه دارد. سه راه هست و هر سه یک جواب
      می‌دهند — درختِ بخش‌ها و قابلیت‌ها در «اپِ من». خودتان نشان بدهید،
      بگذارید خودش بگردد، یا سورس را بخوانید.
    </p>
    <Button class="mt-4" size="sm" onclick={() => { picking = true; }}>＋ کشفِ تازه</Button>
  </section>
{:else if sessions.length}
  <div class="space-y-2">
    {#each sessions as one (one.id)}
      {@const rows = facts(one)}
      <a
        href={`${base}/discover/${encodeURIComponent(one.id)}`}
        class="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40"
      >
        <span class={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ${TONE[one.kind] || ''}`}>
          {one.way.label}
        </span>

        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium">{one.way.hint}</span>
          <span class="block text-[11px] text-muted-foreground">
            {formatDate(one.at)}{rows.length ? ` · ${rows.join(' · ')}` : ''}
          </span>
        </span>

        {#if !one.done}
          <Badge variant="outline" class="shrink-0 text-[10px]">ناتمام</Badge>
        {/if}
        {#if one.findings}
          <Badge variant="destructive" class="shrink-0 text-[10px]">{formatNumber(one.findings)}</Badge>
        {/if}
      </a>
    {/each}
  </div>

  <p class="mt-4 text-[11px] leading-6 text-muted-foreground">
    هرچه در این جلسه‌ها پیدا شد، در
    <a class="underline underline-offset-2" href={base}>اپِ من</a>
    جمع می‌شود — و آنچه دربارهٔ خودِ پروژه یاد گرفتیم، در
    <a class="underline underline-offset-2" href={`${base}/knowledge`}>دانسته‌ها</a>.
  </p>
{/if}
