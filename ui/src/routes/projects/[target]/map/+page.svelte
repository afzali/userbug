<script>
  import { goto } from '$app/navigation';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';

  let { data } = $props();

  let target = $derived(data.target);
  let base = $derived(`/projects/${encodeURIComponent(target)}`);
  let map = $derived(data.map);
  let states = $derived(map?.states || []);
  let hasMap = $derived(states.length > 0);

  let from = $state('');
  let states_cap = $state(60);
  let minutes = $state(20);
  let fresh = $state(false);
  let headed = $state(false);
  let busy = $state(false);
  let error = $state('');

  /**
   * برچسبِ دسته‌ها به فارسی، یک جا.
   *
   * همان فهرستِ `src/map/render.js`. تکرارش عمدی است و کوچک: آن یکی برای
   * ترمینال است و این یکی برای رابط؛ یکی کردنشان یعنی یک ماژولِ مشترک برای
   * پنج رشته.
   */
  const KIND = {
    nav: 'ناوبری',
    mutate: 'جهش',
    inert: 'بی‌اثر',
    unknown: 'نامعلوم',
    input: 'ورودی',
    noise: 'نمایشی',
    destructive: 'برگشت‌ناپذیر',
    avoided: 'ممنوع',
  };

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

  function kindsOf(state) {
    const counts = {};
    for (const action of state.actions || []) counts[action.kind] = (counts[action.kind] || 0) + 1;
    return Object.entries(counts).sort(([, a], [, b]) => b - a);
  }

  async function start(event) {
    event.preventDefault();
    error = '';
    busy = true;
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({
          target,
          kind: 'map',
          from,
          states: states_cap,
          minutes,
          fresh,
          headed,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'خزش شروع نشد');
      // اجرای زنده در فضای کاری دیده می‌شود؛ خزش هم یک اجراست
      await goto(`/projects/${encodeURIComponent(target)}`);
    } catch (cause) {
      error = cause.message;
      busy = false;
    }
  }
</script>

<PageHeader title="نقشهٔ اپ" subtitle="هر حالتی که می‌شود به آن رسید — بی یک فراخوانی مدل" />

{#if !hasMap}
  <!--
    حالتِ خالی، با توضیحِ اینکه این کجای مسیر است.
    همان درسِ «از کجا شروع کنیم»: کاربر نباید با فرمی روبه‌رو شود که
    نمی‌داند چرا باید پرش کند.
  -->
  <section class="mb-6 rounded-xl border bg-muted/30 p-6">
    <h2 class="text-base font-semibold">این صفحه چیست</h2>
    <p class="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
      گشت آن‌جایی را می‌شناسد که <strong>شما</strong> بردید. نقشه بقیه را پیدا
      می‌کند: مرورگر خودش هر دکمه‌ای را که امن است می‌زند و می‌نویسد از کجا به
      کجا می‌رسد — صفحه‌ها، و مودال‌ها و منوهایی که اصلاً آدرس ندارند.
      نتیجه‌اش فهرستی است که بعد از آن معلوم می‌شود چه چیزهایی باید آزموده شوند.
    </p>
    <p class="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
      خزش هوش مصنوعی مصرف نمی‌کند و چند دقیقه طول می‌کشد. هر کلیک از همان
      داور و چک‌های همیشگی رد می‌شود، پس یافته‌هایش یافتهٔ واقعی‌اند.
    </p>
  </section>
{/if}

<div class="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
  <div class="space-y-4">
    <Card.Root>
      <Card.Header>
        <Card.Title class="text-sm">{hasMap ? 'خزشِ دوباره' : 'شروع خزش'}</Card.Title>
      </Card.Header>
      <Card.Content>
        <form class="space-y-3" onsubmit={start}>
          <label class="block space-y-1">
            <span class="text-xs text-muted-foreground">مسیرِ ورود (سناریو)</span>
            <select bind:value={from} class="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">— بدون ورود؛ از صفحهٔ اول —</option>
              {#each data.scenarios as scenario (scenario.path)}
                <option value={`scenarios/${target}/${scenario.path}`}>{scenario.name}</option>
              {/each}
            </select>
            <span class="block text-[11px] leading-5 text-muted-foreground">
              اپی که ورود دارد، برای ناشناس یک صفحه است. یک سناریوی کوچکِ ورود
              بدهید تا نقشه از داخل شروع شود.
            </span>
          </label>

          <div class="grid grid-cols-2 gap-2">
            <label class="block space-y-1">
              <span class="text-xs text-muted-foreground">سقف حالت</span>
              <Input type="number" min="1" max="1000" bind:value={states_cap} />
            </label>
            <label class="block space-y-1">
              <span class="text-xs text-muted-foreground">سقف دقیقه</span>
              <Input type="number" min="1" max="1000" bind:value={minutes} />
            </label>
          </div>

          <label class="flex items-center gap-2 text-xs">
            <input type="checkbox" bind:checked={fresh} />
            از صفر، نه ادامهٔ نقشهٔ موجود
          </label>
          <label class="flex items-center gap-2 text-xs">
            <input type="checkbox" bind:checked={headed} />
            مرورگر دیده شود
          </label>

          {#if error}<p class="text-xs text-destructive">{error}</p>{/if}

          <Button type="submit" class="w-full" disabled={busy}>
            {busy ? 'در حال شروع…' : 'شروع خزش'}
          </Button>
          <p class="text-[11px] leading-5 text-muted-foreground">
            خزش مثل هر اجرای دیگری زنده دیده می‌شود؛ بعد از شروع به فضای کاری
            می‌رویم.
          </p>
        </form>
      </Card.Content>
    </Card.Root>

    {#if hasMap}
      <!--
        قدمِ بعد.

        نقشه تا امروز هیچ پایانی نداشت: عدد نشان می‌داد و رها می‌کرد. ولی
        ارزشش در چیزی است که بعدش ممکن می‌شود — هر مودالی که پیدا شده، یک
        پیشنهادِ سناریو با مسیرِ رسیدنش.
      -->
      <Card.Root>
        <Card.Header class="pb-3">
          <Card.Title class="text-sm">قدم بعد</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-2">
          <Button href={`${base}/proposals`} class="w-full" size="sm">ببین چه باید آزمود</Button>
          <p class="text-[11px] leading-5 text-muted-foreground">
            هر نمایی که نقشه پیدا کرده و هیچ سناریویی سراغش نمی‌رود، یک
            پیشنهاد می‌شود — با مسیرِ واقعیِ رسیدن به آن، نه حدسِ مدل.
          </p>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header><Card.Title class="text-sm">عددها</Card.Title></Card.Header>
        <Card.Content class="space-y-2 text-sm">
          <div class="flex justify-between"><span class="text-muted-foreground">حالت</span><span>{states.length}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">یال</span><span>{map.edges?.length || 0}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">کنش</span><span>{totals.actions}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">امتحان‌شده</span><span>{totals.tried}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">بی‌اثر</span><span>{totals.inert}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">برگشت‌ناپذیر (نزده)</span><span>{totals.destructive}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">در صف</span><span>{map.frontier?.length || 0}</span></div>
          {#if map.stats?.stoppedBecause}
            <div class="flex justify-between"><span class="text-muted-foreground">توقف</span><span>{map.stats.stoppedBecause}</span></div>
          {/if}
          {#if map.entry?.scenario}
            <div class="pt-1 text-xs text-muted-foreground">مسیرِ ورود: {map.entry.scenario}</div>
          {/if}
        </Card.Content>
      </Card.Root>

      <!--
        تفاضلِ سورس و خزش — گران‌ترین حرفِ این صفحه و ارزان‌ترین محاسبه‌اش.
        صفحه‌ای که در کد هست و از رابط به آن نمی‌رسند، یا یتیم است یا
        نیازمندِ حالتی که نساختیم؛ هر دو یک پرسشِ واقعی‌اند.
      -->
      <!--
        پیش‌بینیِ سورس در برابرِ آنچه واقعاً شد.

        این کارت عمداً بالای تفاضلِ روت‌هاست: آن یکی «کجا نرفتیم» را می‌گوید
        و این یکی «جایی رفتیم که نباید» — و دومی احتمالِ باگ بودنش بیشتر است.
      -->
      {#if data.mispredicted?.length}
        <Card.Root>
          <Card.Header>
            <Card.Title class="text-sm">پیش‌بینی نخواند ({data.mispredicted.length})</Card.Title>
            <Card.Description>سورس یک چیز گفت، کلیک چیز دیگری نشان داد.</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-2">
            {#each data.mispredicted.slice(0, 8) as row (row.label + row.predicted)}
              <div class="rounded-lg border p-2 text-xs">
                <span class="block font-medium">{row.label}</span>
                <span dir="ltr" class="mt-1 block font-mono text-[11px] text-muted-foreground">
                  {row.predicted} → {row.actual}
                </span>
              </div>
            {/each}
          </Card.Content>
        </Card.Root>
      {/if}

      {#if data.unreached.length}
        <Card.Root>
          <Card.Header><Card.Title class="text-sm">در سورس هست، نرسیدیم ({data.unreached.length})</Card.Title></Card.Header>
          <Card.Content class="flex flex-wrap gap-1.5">
            {#each data.unreached as route (route)}
              <Badge variant="outline" class="font-mono text-[11px]">{route}</Badge>
            {/each}
          </Card.Content>
        </Card.Root>
      {/if}

      {#if data.extra.length && data.knownRoutes.length}
        <Card.Root>
          <Card.Header><Card.Title class="text-sm">دیدیم، در سورس نبود ({data.extra.length})</Card.Title></Card.Header>
          <Card.Content class="flex flex-wrap gap-1.5">
            {#each data.extra as route (route)}
              <Badge variant="outline" class="font-mono text-[11px]">{route}</Badge>
            {/each}
          </Card.Content>
        </Card.Root>
      {/if}
    {/if}
  </div>

  <div class="space-y-4">
    {#if !hasMap}
      <p class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        هنوز نقشه‌ای نیست.
      </p>
    {:else}
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
</div>
