<script>
  /**
   * «اپِ من» — خانهٔ تازهٔ پروژه.
   *
   * ── چه چیزی عوض شد و چرا ──
   *
   * خانهٔ قبلی «اجرا» بود: نوارِ فرمان، یک فرمِ بیست‌کنترلی، و فهرستِ
   * اجراها. هر سه لازم‌اند و هیچ‌کدام جوابِ پرسشی نبودند که آدم صبح با آن
   * می‌آید — «سایتم چه دارد، کدامش را فراموش کرده‌ام، کجا شکست؟»
   *
   * آن فرم به `/run` رفت و نوارِ فرمان به هدر؛ اینجا حالا خودِ اپ است.
   *
   * ── چرا این صفحه نازک است ──
   *
   * درس گرفته از `FoundPanel` که ۱۰۳۹ خط شد: درخت یک کامپوننت است، پنل
   * یکی دیگر، و این فایل فقط حالت و اتصال.
   */
  import { invalidateAll } from '$app/navigation';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import CapabilityTree from '$lib/components/CapabilityTree.svelte';
  import CapabilityPanel from '$lib/components/CapabilityPanel.svelte';
  import { formatNumber } from '$lib/format.js';
  import { run, startJob } from '$lib/run-store.svelte.js';

  let { data } = $props();

  let target = $derived(data.target);
  let base = $derived(`/projects/${encodeURIComponent(target)}`);

  /**
   * درخت در حالتِ محلی زندگی می‌کند، چون ویرایش بلافاصله برش می‌گرداند.
   *
   * `invalidateAll` هم می‌شد، ولی آن کلِ صفحه را دوباره می‌خواند —
   * یعنی هر بار که یک عنوان عوض شود، `aggregateTriage` روی همهٔ اجراها
   * دوباره اجرا می‌شود.
   */
  // svelte-ignore state_referenced_locally
  let tree = $state(data.tree);
  $effect(() => {
    tree = data.tree;
  });

  let selected = $state('');
  let picked = $state(new Set());
  /**
   * کدام شاخه‌ها بازند.
   *
   * ── چرا پیش‌فرض «سطحِ اول باز» است و نه «همه» ──
   *
   * درختی که همه‌اش باز باشد، همان فهرستِ تختی است که از آن فرار کردیم.
   * و درختی که همه‌اش بسته باشد، از کاربر می‌خواهد قبل از دیدن، حدس بزند.
   * ریشه‌ها باز، بقیه بسته.
   */
  let open = $state(new Set());
  let seeded = false;
  $effect(() => {
    if (seeded || !tree.roots.length) return;
    seeded = true;
    open = new Set(tree.roots.flatMap((one) => [one.id, ...one.children.map((two) => two.id)]));
  });

  let busy = $state('');
  let error = $state('');

  /** فیلترها — همه روی یک محور: «چه چیزی نیاز به کار دارد». */
  let filter = $state('all');
  let search = $state('');

  const FILTERS = [
    { key: 'all', label: 'همه' },
    { key: 'blind', label: 'بی‌سناریو', count: () => data.blind },
    { key: 'untried', label: 'هرگز باز نشده', count: () => data.untried },
    { key: 'red', label: 'ایرادِ باز', count: () => data.open },
    { key: 'edited', label: 'ویرایش‌شده' },
  ];

  function matches(node) {
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      const hay = `${node.title} ${node.route} ${node.view} ${node.desc}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (filter === 'blind') return !node.view && !node.shelf && !node.counts.scenarios.length;
    if (filter === 'untried') return Boolean(node.view && node.actions && !node.tried);
    if (filter === 'red') return node.counts.openFindings > 0;
    if (filter === 'edited') return Boolean(node.edited);
    return true;
  }

  /**
   * فیلتر، بی شکستنِ درخت.
   *
   * ── چرا گرهِ ناهم‌خوان با فرزندِ هم‌خوان می‌ماند ──
   *
   * اگر فقط ردیف‌های هم‌خوان بمانند، «افزودن کتاب جدید» بی پدرش در ریشه
   * می‌نشیند و معلوم نیست کجای اپ است — یعنی همان تختیِ بی‌بافتار که این
   * صفحه برای رفعش ساخته شد. پس والد می‌ماند، کم‌رنگ.
   */
  function prune(nodes) {
    const out = [];
    for (const node of nodes) {
      const children = prune(node.children);
      const self = matches(node);
      if (!self && !children.length) continue;
      out.push({ ...node, children, dim: !self });
    }
    return out;
  }

  let filtering = $derived(filter !== 'all' || Boolean(search.trim()));
  let roots = $derived(filtering ? prune(tree.roots) : tree.roots);

  /** وقتی فیلتر هست، همه‌چیز باز است — وگرنه نتیجه زیرِ شاخهٔ بسته پنهان می‌ماند. */
  let openIds = $derived(
    filtering ? new Set(tree.flat.map((one) => one.id)) : open
  );

  let node = $derived(tree.flat.find((one) => one.id === selected) || null);

  /** گرهِ انتخاب‌شده و همهٔ فرزندانش — «کتاب‌ها» یعنی هرچه زیرش هست. */
  function withChildren(one, out = []) {
    out.push(one.id);
    for (const child of one.children || []) withChildren(child, out);
    return out;
  }

  function togglePick(one) {
    const ids = withChildren(one);
    const next = new Set(picked);
    if (ids.every((id) => next.has(id))) for (const id of ids) next.delete(id);
    else for (const id of ids) next.add(id);
    picked = next;
  }

  function toggleOpen(id) {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    open = next;
  }

  async function send(body) {
    const response = await fetch('/api/capabilities', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
      body: JSON.stringify({ target, ...body }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'انجام نشد');
    tree = { roots: payload.roots, flat: payload.flat };
    return payload;
  }

  async function refresh() {
    busy = 'rebuild';
    error = '';
    try {
      await send({ action: 'rebuild' });
      /** عددهای بالای صفحه از لودر می‌آیند، پس آن هم باید تازه شود. */
      await invalidateAll();
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  /**
   * «بگرد اینجا» — کاوشِ هدف‌دار با دامنهٔ از پیش پر.
   *
   * ── چرا این دکمه روی گره ارزش دارد ──
   *
   * همین کار امروز هم ممکن است: صفحهٔ کشف، حالتِ محدود، و نوشتنِ دستیِ
   * مسیر. ولی کسی که در درخت روی «افزودن کتاب جدید» ایستاده، همین حالا
   * می‌داند کجا را می‌خواهد — و دوباره تایپ کردنش فقط جایی است که اشتباه
   * تایپی وارد می‌شود.
   */
  async function quest(one) {
    busy = 'quest';
    error = '';
    try {
      const goal = one.view
        ? `در ${one.route} نمای «${one.view}» را باز کن و همه‌اش را بررسی کن`
        : `${one.route} را بررسی کن`;
      const job = await startJob(target, { kind: 'quest', goal, from: '' });
      if (!job) throw new Error(run.error || 'شروع نشد');
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  async function runScenarios(names) {
    busy = 'run';
    error = '';
    try {
      const job = await startJob(target, { kind: 'run', only: names });
      if (!job) throw new Error(run.error || 'اجرا شروع نشد');
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  /**
   * سناریوهای همهٔ گره‌های انتخاب‌شده، بی تکرار.
   *
   * این جنینِ «دورِ بررسی» است: امروز فقط سناریوهای موجود را می‌گیرد،
   * و در گامِ بعد یک موجودیتِ نام‌دار می‌شود که خزش و کاوش را هم زیرِ
   * یک اسم می‌برد.
   */
  let pickedScenarios = $derived([
    ...new Set(
      tree.flat
        .filter((one) => picked.has(one.id))
        .flatMap((one) => one.counts.scenarios || [])
    ),
  ]);
</script>

<svelte:head><title>اپِ من — {data.project?.name || target}</title></svelte:head>

{#snippet actions()}
  <Button variant="outline" size="sm" href={`${base}/discover`}>کشف</Button>
  <Button variant="outline" size="sm" disabled={!!busy} onclick={refresh}>
    {busy === 'rebuild' ? 'در حال ساختن…' : 'تازه‌سازی درخت'}
  </Button>
  <Button size="sm" href={`${base}/run`}>اجرای تازه</Button>
{/snippet}

<PageHeader
  eyebrow={`${data.project?.environment || ''} · ${data.project?.baseURL || ''}`}
  title="اپِ من"
  description="هر بخش و قابلیتی که از این اپ می‌شناسیم — و اینکه هر کدام چند سناریو دارد، چند بار آزموده شده، و چه ایرادی داشته."
  {actions}
/>

{#if error}<p class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>{/if}

{#if !tree.flat.length}
  <!--
    حالتِ خالی، با راهِ بیرون.

    صفحه‌ای که تا داده نداری فقط بگوید «چیزی نیست»، راهِ ساختنِ آن داده را
    هم می‌بندد — همان ایرادی که صفحهٔ مأموریت‌ها یک بار گرفت.
  -->
  <section class="rounded-xl border bg-muted/30 p-6">
    <h2 class="text-base font-semibold">هنوز نمی‌دانیم این اپ چه دارد</h2>
    <p class="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
      این درخت از سه جا پر می‌شود و هر سه همین حالا در دسترس‌اند: گشتی که
      خودتان می‌روید، خزشی که ابزار می‌کند، و سورس که بی مرورگر خوانده
      می‌شود. هر کدام را که بروید، بخش‌ها و قابلیت‌ها همین‌جا ظاهر می‌شوند.
    </p>
    <div class="mt-4 flex flex-wrap gap-2">
      <Button href={`${base}/discover`} size="sm">کشف — گشت، خزش، یا سورس</Button>
      <Button href={`${base}/run`} variant="outline" size="sm">فرمِ اجرا</Button>
    </div>
  </section>
{:else}
  <!--
    عددها بالای درخت.

    «چند بی‌سناریو» مهم‌ترینشان است و چیزی است که کاربر هنوز نمی‌داند باید
    بپرسد — همان نقشی که «بی‌انتظار» در صفحهٔ مأموریت‌ها داشت.
  -->
  <div class="mb-5 flex flex-wrap gap-3 text-sm">
    <div class="rounded-xl border px-4 py-2">
      <span class="block text-[11px] text-muted-foreground">قابلیت</span>
      <span class="text-lg font-bold">
        {formatNumber(data.total)}<span class="text-sm font-normal text-muted-foreground"> · {formatNumber(data.pages)} صفحه</span>
      </span>
    </div>
    {#if data.blind}
      <div class="rounded-xl border border-amber-500/40 px-4 py-2">
        <span class="block text-[11px] text-muted-foreground">بی‌سناریو</span>
        <span class="text-lg font-bold text-amber-600 dark:text-amber-400">{formatNumber(data.blind)}</span>
      </div>
    {/if}
    {#if data.untried}
      <div class="rounded-xl border border-amber-500/40 px-4 py-2">
        <span class="block text-[11px] text-muted-foreground">هرگز باز نشده</span>
        <span class="text-lg font-bold text-amber-600 dark:text-amber-400">{formatNumber(data.untried)}</span>
      </div>
    {/if}
    {#if data.open}
      <div class="rounded-xl border border-destructive/40 px-4 py-2">
        <span class="block text-[11px] text-muted-foreground">ایرادِ باز</span>
        <span class="text-lg font-bold text-destructive">{formatNumber(data.open)}</span>
      </div>
    {/if}
  </div>

  {#if data.blind}
    <p class="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm leading-7">
      <strong>{formatNumber(data.blind)} بخش هیچ سناریویی ندارد.</strong>
      یعنی هیچ اجرایی تا امروز آن‌ها را نیازموده. روی هر کدام بزنید تا ببینید
      چیست و همان‌جا سناریو بسازید یا بگویید ابزار برود همان‌جا را بگردد.
    </p>
  {/if}

  <div class="mb-4 flex flex-wrap items-center gap-2">
    {#each FILTERS as item (item.key)}
      {@const count = item.count?.()}
      <button
        type="button"
        class={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
          filter === item.key ? 'border-primary bg-accent' : 'hover:bg-accent/50'
        }`}
        onclick={() => { filter = item.key; }}
      >
        {item.label}{count ? ` (${formatNumber(count)})` : ''}
      </button>
    {/each}
    <Input bind:value={search} class="h-8 w-56" placeholder="جست‌وجوی نام یا مسیر…" />
  </div>

  <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <section class="min-w-0">
      <div class="rounded-xl border bg-card">
        {#if !roots.length}
          <p class="p-6 text-center text-sm text-muted-foreground">
            هیچ قابلیتی با این فیلتر نیست.
          </p>
        {:else}
          <CapabilityTree
            {roots}
            {selected}
            {picked}
            open={openIds}
            onPick={togglePick}
            onOpen={(one) => { selected = one.id; }}
            onToggle={toggleOpen}
          />
        {/if}
      </div>

      <!--
        نوارِ انتخاب — جنینِ «دکمهٔ مادر».

        ── چرا همین حالا و نه در گامِ «دور» ──

        انتخابِ چند شاخه و اجرای همان‌ها، همین امروز کارِ واقعی‌ای است که
        هیچ صفحه‌ای نمی‌کرد: فهرستِ اجرا بر اساسِ **فایلِ سناریو** بود، نه
        بر اساسِ بخشی از اپ که می‌خواهی بررسی کنی.
      -->
      {#if picked.size}
        <div class="sticky bottom-4 mt-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-lg">
          <span class="text-sm font-medium">{formatNumber(picked.size)} قابلیت انتخاب شده</span>
          <span class="text-[11px] text-muted-foreground">
            {pickedScenarios.length
              ? `${formatNumber(pickedScenarios.length)} سناریو رویشان`
              : 'هیچ سناریویی رویشان نیست'}
          </span>
          <div class="ms-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!!busy || !pickedScenarios.length}
              onclick={() => runScenarios(pickedScenarios)}
            >
              {busy === 'run' ? 'شروع…' : 'همین‌ها را بگیر'}
            </Button>
            <Button size="sm" variant="ghost" onclick={() => { picked = new Set(); }}>برداشتنِ تیک‌ها</Button>
          </div>
        </div>
      {/if}
    </section>

    <div class="min-w-0">
      {#if node}
        <CapabilityPanel
          {node}
          {target}
          busy={Boolean(busy) || run.submitting}
          onEdit={(patch) => send({ action: 'edit', ...patch })}
          onReset={(id) => send({ action: 'reset', id })}
          onClose={() => { selected = ''; }}
          onRun={runScenarios}
          onQuest={quest}
        />
      {:else}
        <aside class="sticky top-20 rounded-xl border border-dashed p-6 text-center text-xs leading-6 text-muted-foreground">
          روی هر ردیف بزنید تا ببینید چیست، چند سناریو دارد، چند بار آزموده
          شده، و چه ایرادی داشته — و همان‌جا نامش را عوض کنید یا بگویید
          ابزار برود بگرددش.
        </aside>
      {/if}
    </div>
  </div>

  <p class="mt-6 text-[11px] leading-6 text-muted-foreground">
    این درخت از گشت و خزش و سورس ساخته می‌شود، بی یک فراخوانی مدل — پس
    نام‌ها گاهی خامند. هر نامی که خودتان بگذارید <Badge variant="secondary" class="text-[10px]">by: user</Badge>
    می‌شود و هیچ تازه‌سازی‌ای عوضش نمی‌کند.
  </p>
{/if}
