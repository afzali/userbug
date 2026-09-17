<script>
  /**
   * گزارشِ نقشه — چه گرفت، و چه جا ماند.
   *
   * ── چرا از «دانسته‌ها» بیرون آمد ──
   *
   * تهِ صفحهٔ کشف بود، زیرِ سیزده بخشِ دیگر. ولی این عددها دربارهٔ **یک
   * خزش** اند، نه دربارهٔ چیزی که برای همیشه می‌دانیم: «۲۸ حالت، ۳۵۵ کنش،
   * ۹۱ در صف» جوابِ «آن بار چه شد» است، نه «این اپ چه دارد».
   *
   * جای درستش داخلِ همان جلسهٔ خزش است — همان‌جا که آدم می‌پرسد «خب، این
   * بار چه گرفت؟»
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { formatNumber } from '$lib/format.js';

  let { data, target } = $props();

  let base = $derived(`/projects/${encodeURIComponent(target)}`);
  let map = $derived(data.crawl?.map);
  let states = $derived(map?.states || []);
  let hasMap = $derived(states.length > 0);

  /** جمعِ کنش‌ها روی همهٔ حالت‌ها — یک بار، نه در هر ردیف. */
  let totals = $derived.by(() => {
    const out = { actions: 0, tried: 0, inert: 0, destructive: 0 };
    for (const state of states) {
      for (const action of state.actions || []) {
        out.actions++;
        if (action.tried) out.tried++;
        if (action.inert) out.inert++;
        if (action.kind === 'destructive') out.destructive++;
      }
    }
    return out;
  });

  /** خانوادهٔ روت → حالت‌ها. همان دسته‌بندیِ نقشه، بی تاکسونومیِ تازه. */
  let families = $derived.by(() => {
    const groups = new Map();
    for (const state of states) {
      const list = groups.get(state.route) || [];
      list.push(state);
      groups.set(state.route, list);
    }
    return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  });

  /** برچسبِ فارسیِ هر جنسِ کنش. */
  const KIND = {
    nav: 'ناوبری',
    mutate: 'تغییردهنده',
    unknown: 'نامعلوم',
    input: 'ورودی',
    noise: 'نمایشی',
    destructive: 'برگشت‌ناپذیر',
    avoided: 'ممنوع',
  };

  function kindsOf(state) {
    const counts = {};
    for (const action of state.actions || []) counts[action.kind] = (counts[action.kind] || 0) + 1;
    return Object.entries(counts).sort(([, a], [, b]) => b - a);
  }

  /**
   * جاهایی که فقط گشت می‌شناسدشان — خزش هنوز نرفته.
   *
   * تعریفش با استفاده‌اش در یک فایل می‌ماند: وقتی یک بار این ستون از صفحهٔ
   * نقشه جابه‌جا شد، همین متغیر جا ماند و صفحه با `ReferenceError` افتاد —
   * بی اینکه `svelte-check` چیزی بگوید.
   */
  let tourOnly = $derived(
    (data.found?.places || []).filter((one) => one.by.includes('tour') && !one.by.includes('crawl'))
  );
</script>

<div class="space-y-4">
  {#if !hasMap}
    <p class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      هنوز نقشه‌ای نیست.
    </p>
  {:else}
    <!--
      گزارشِ نقشه — یک کارت، نه پنج تا.

      «عددها»، «در سورس هست نرسیدیم»، «دیدیم در سورس نبود» و «پیش‌بینی
      نخواند» همه یک پرسش را جواب می‌دهند: این نقشه چه می‌گوید. پنج کارتِ
      هم‌وزن در ستونِ کنترل، هم آن ستون را یک کیلومتر می‌کرد هم هیچ‌کدام را
      مهم نشان نمی‌داد. حالا عددها همیشه پیدایند و تفصیل‌ها تا خواسته
      نشوند بسته‌اند.
    -->
    <Card.Root>
      <Card.Header class="pb-3">
        <Card.Title class="text-sm">این نقشه چه می‌گوید</Card.Title>
        {#if map.entry?.scenario}
          <Card.Description class="text-[11px]">مسیرِ ورود: {map.entry.scenario}</Card.Description>
        {/if}
      </Card.Header>
      <Card.Content class="space-y-3">
        <!--
          ── چرا عددِ پوششِ کلی اینجا نیست ──

          بود، و جایش غلط بود: «۵۲ جای شناخته‌شده» دربارهٔ **کلِ پروژه** است
          و از گشت و سورس هم می‌آید، نه دربارهٔ این یک خزش. اینجا فقط آنچه
          همین جلسه کرد گفته می‌شود؛ عددِ کلی در «دانسته‌ها» و در درختِ
          «اپِ من» است.
        -->

        <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
          {#each [['حالتِ خزش', states.length], ['کنش', totals.actions], ['امتحان‌شده', totals.tried], ['در صف', map.frontier?.length || 0]] as [label, value] (label)}
            <div>
              <span class="block text-[11px] text-muted-foreground">{label}</span>
              <span class="font-medium">{formatNumber(value)}</span>
            </div>
          {/each}
        </div>

        <details class="text-xs">
          <summary class="cursor-pointer text-muted-foreground">عددهای ریزتر</summary>
          <div class="mt-2 space-y-1.5">
            <div class="flex justify-between"><span class="text-muted-foreground">یال</span><span>{map.edges?.length || 0}</span></div>
            <div class="flex justify-between"><span class="text-muted-foreground">بی‌اثر</span><span>{totals.inert}</span></div>
            <div class="flex justify-between"><span class="text-muted-foreground">برگشت‌ناپذیر (نزده)</span><span>{totals.destructive}</span></div>
            {#if map.stats?.stoppedBecause}
              <div class="flex justify-between"><span class="text-muted-foreground">توقف</span><span>{map.stats.stoppedBecause}</span></div>
            {/if}
          </div>
        </details>

        <!--
          پیش‌بینیِ سورس در برابرِ آنچه واقعاً شد — اول، چون «جایی رفتیم که
          نباید» احتمالِ باگ بودنش از «کجا نرفتیم» بیشتر است.
        -->
        {#if data.crawl.mispredicted?.length}
          <details class="text-xs">
            <summary class="cursor-pointer">
              پیش‌بینی نخواند ({formatNumber(data.crawl.mispredicted.length)})
              <span class="text-[11px] text-muted-foreground">— سورس یک چیز گفت، کلیک چیز دیگری</span>
            </summary>
            <div class="mt-2 space-y-1.5">
              {#each data.crawl.mispredicted.slice(0, 8) as row (row.label + row.predicted)}
                <div class="rounded-lg border p-2">
                  <span class="block font-medium">{row.label}</span>
                  <span dir="ltr" class="mt-1 block font-mono text-[11px] text-muted-foreground">
                    {row.predicted} → {row.actual}
                  </span>
                </div>
              {/each}
            </div>
          </details>
        {/if}

        {#if data.crawl.unreached.length}
          <details class="text-xs">
            <summary class="cursor-pointer">در سورس هست، نرسیدیم ({formatNumber(data.crawl.unreached.length)})</summary>
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each data.crawl.unreached as route (route)}
                <Badge variant="outline" class="font-mono text-[11px]">{route}</Badge>
              {/each}
            </div>
          </details>
        {/if}

        <!--
          جاهایی که فقط گشت می‌شناسدشان.

          تا امروز صفحهٔ نقشه این‌ها را اصلاً نشان نمی‌داد، چون فقط
          `map.json` را می‌خواند — و کاربر حق داشت بپرسد «مگر گشت خودش یک
          نوع نقشه نیست؟».
        -->
        {#if tourOnly.length}
          <details class="text-xs">
            <summary class="cursor-pointer">
              فقط در گشت دیده شده ({formatNumber(tourOnly.length)})
              <span class="text-[11px] text-muted-foreground">— خزش هنوز نرفته</span>
            </summary>
            <div class="mt-2 space-y-1">
              {#each tourOnly as one (one.key)}
                <div class="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border p-2">
                  <span class="font-mono text-[11px]">{one.route}{one.view ? ` ▸ ${one.view}` : ''}</span>
                  <span class="text-[11px] text-muted-foreground">
                    {one.contract ? `${formatNumber(one.contract)} بندِ قرارداد` : 'بی قرارداد'}
                    {#if one.purpose}· {one.purpose.slice(0, 60)}{/if}
                  </span>
                </div>
              {/each}
            </div>
          </details>
        {/if}

        {#if data.crawl.extra.length && data.crawl.knownRoutes.length}
          <details class="text-xs">
            <summary class="cursor-pointer">دیدیم، در سورس نبود ({formatNumber(data.crawl.extra.length)})</summary>
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each data.crawl.extra as route (route)}
                <Badge variant="outline" class="font-mono text-[11px]">{route}</Badge>
              {/each}
            </div>
          </details>
        {/if}

        <!--
          پیوند به «بقیهٔ سورس» حذف شد: بک‌اند و قاعده‌ها حالا در همین صفحه
          و چند بخش پایین‌ترند. پیوندی که به خودِ صفحه برگردد، فقط سردرگمی
          اضافه می‌کند.
        -->
      </Card.Content>
    </Card.Root>

    {#each families as [route, group] (route)}
      <Card.Root>
        <Card.Header class="pb-3">
          <Card.Title class="font-mono text-sm">{route}</Card.Title>
          <Card.Description>{group.length} حالت</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-2">
          {#each group as state (state.id)}
            {@const tried = (state.actions || []).filter((action) => action.tried).length}
            <div class="rounded-lg border p-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-medium">
                  {state.view ? `▸ ${state.view}` : state.title || 'نمای اصلی'}
                </span>
                {#if state.pathBroken}
                  <Badge variant="destructive" class="text-[10px]">مسیر شکسته</Badge>
                {/if}
                <span class="text-[11px] text-muted-foreground">{tried} از {(state.actions || []).length} کنش امتحان شد</span>
              </div>

              <div class="mt-2 flex flex-wrap gap-1.5">
                {#each kindsOf(state) as [kind, count] (kind)}
                  <Badge variant="secondary" class="text-[10px]">{count} {KIND[kind] || kind}</Badge>
                {/each}
              </div>

              <p class="mt-2 font-mono text-[11px] text-muted-foreground">
                {state.sample || route}
                {#if state.path?.length}· {state.path.length} قدم تا اینجا{/if}
              </p>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    {/each}
  {/if}
</div>