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
  import { onFinished, run, startJob } from '$lib/run-store.svelte.js';

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

  /**
   * چند بخش هنوز نامِ خوانا ندارد.
   *
   * فقط صفحه‌ها، نه نماها: نمای خزش نامش را از خودِ اپ دارد («افزودن کتاب
   * جدید») که بهتر از هرچیزی است که مدل بسازد — و رایگان.
   */
  let unnamed = $derived(
    tree.flat.filter((one) => !one.view && !one.shelf && one.titleBy === 'derived').length
  );
  let nameNote = $state('');

  /**
   * نام‌گذاری — و چرا نتیجه‌اش با عدد گزارش می‌شود.
   *
   * این تنها دکمهٔ این صفحه است که پول خرج می‌کند. کاربری که بزندش باید
   * ببیند چه خرید: چند نام ساخته شد، چند تا را مدل نتوانست، و با کدام
   * مدل. «انجام شد» برای کارِ پولی جوابِ کافی نیست.
   */
  async function nameThem(force) {
    busy = 'name';
    error = '';
    nameNote = '';
    try {
      const payload = await send({ action: 'name', force });
      const stats = payload.stats || {};
      nameNote = stats.pending
        ? `${formatNumber(stats.named)} نام ساخته شد از ${formatNumber(stats.pending)} بخش` +
          (stats.skipped ? ` · ${formatNumber(stats.skipped)} را مدل نتوانست` : '') +
          ` · ${formatNumber(stats.calls)} فراخوانی · ${payload.model || ''}`
        : 'همه از قبل نام داشتند — هیچ فراخوانی‌ای نشد.';
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
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
   * ── چرا از درخت و نه از فهرستِ فایل‌ها ──
   *
   * تا امروز انتخابِ سناریو بر اساسِ **فایل** بود: تیکِ چند نام از یک
   * فهرستِ الفبایی. ولی چیزی که آدم در ذهن دارد بخشی از اپ است، نه
   * فایل — «کتاب‌ها را بررسی کن». این خط همان ترجمه است.
   */
  let pickedScenarios = $derived([
    ...new Set(
      picked.size
        ? tree.flat.filter((one) => picked.has(one.id)).flatMap((one) => one.counts.scenarios || [])
        : /** دامنهٔ خالی یعنی کلِ اپ — پس همهٔ سناریوهای شناخته‌شده. */
          tree.flat.flatMap((one) => one.counts.scenarios || [])
    ),
  ]);

  /* ─────────────────── دورِ بررسی — دکمهٔ مادر ─────────────────── */

  let roundOpen = $state(false);
  let roundName = $state('');
  let roundNote = $state('');
  let roundScenarios = $state(true);
  let roundCrawl = $state(false);

  /**
   * یک دور: نامش ثبت می‌شود، بعد کارهایش پشتِ سرِ هم می‌روند.
   *
   * ── چرا اول ثبت و بعد اجرا ──
   *
   * دامنه و توضیح در `run.json` نیستند و هیچ‌جای دیگری هم نمی‌روند. اگر
   * بعد از اجرا ثبت شوند، اجرایی که وسطِ راه بشکند دوری بی‌دامنه به‌جا
   * می‌گذارد — و همان دور است که بعداً باید بگوید «قرار بود کجا را ببینم».
   *
   * ── چرا پشتِ سرِ هم و نه با هم ──
   *
   * لایهٔ کار عمداً فقط یک اجرای هم‌زمان می‌پذیرد: هر دو مرورگر باز
   * می‌کنند. پس دومی به پایانِ اولی گره می‌خورد، نه به یک `Promise.all` که
   * بی‌صدا `JOB_ACTIVE` می‌گیرد.
   */
  async function startRound() {
    const name = roundName.trim();
    busy = 'round';
    error = '';

    try {
      const response = await fetch('/api/rounds', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target, name, note: roundNote, scope: [...picked] }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'دور ثبت نشد');

      /** ترتیب عمدی: سناریوها سریع‌ترند، پس نتیجه‌شان زودتر دیده می‌شود. */
      const queue = [];
      if (roundScenarios && pickedScenarios.length) {
        queue.push({ kind: 'run', only: pickedScenarios, bench: name });
      }
      if (roundCrawl) {
        queue.push({
          kind: 'map',
          bench: name,
          /**
           * دامنهٔ خزش از خودِ انتخاب می‌آید.
           *
           * `--scope` مسیر می‌خواهد نه شناسه، و مسیرهای تکراری (ده نما روی
           * یک صفحه) باید یکی شوند — وگرنه یک رشتهٔ بلندِ تکراری ساخته
           * می‌شود که خودِ خزنده باید دوباره تمیزش کند.
           */
          scope: picked.size
            ? [...new Set(tree.flat.filter((one) => picked.has(one.id)).map((one) => one.route))].join(',')
            : '',
        });
      }

      if (!queue.length) throw new Error('هیچ کاری برای این دور انتخاب نشده');

      const first = await startJob(target, queue[0]);
      if (!first) throw new Error(run.error || 'شروع نشد');

      /**
       * کارِ دوم منتظرِ پایانِ اولی می‌ماند.
       *
       * `onFinished` همان‌جایی است که پلیر هم از آن می‌خواند، پس اگر کاربر
       * وسطِ کار لغو کند، این هم صدا زده می‌شود — و لغو یعنی لغو، پس دومی
       * شروع نمی‌شود.
       */
      if (queue[1]) {
        const stop = onFinished((job) => {
          stop();
          if (job?.status === 'cancelled') return;
          startJob(target, queue[1]);
        });
      }

      roundOpen = false;
      roundName = '';
      roundNote = '';
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }
</script>

<svelte:head><title>اپِ من — {data.project?.name || target}</title></svelte:head>

{#snippet actions()}
  <Button variant="outline" size="sm" href={`${base}/discover`}>کشف</Button>
  <Button variant="outline" size="sm" disabled={!!busy} onclick={refresh}>
    {busy === 'rebuild' ? 'در حال ساختن…' : 'تازه‌سازی'}
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
      {#if picked.size || roundOpen}
        <div class="sticky bottom-4 mt-3 rounded-xl border bg-card p-3 shadow-lg">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium">
              {picked.size ? `${formatNumber(picked.size)} قابلیت انتخاب شده` : 'کلِ اپ'}
            </span>
            <span class="text-[11px] text-muted-foreground">
              {pickedScenarios.length
                ? `${formatNumber(pickedScenarios.length)} سناریو رویشان`
                : picked.size
                  ? 'هیچ سناریویی رویشان نیست'
                  : ''}
            </span>
            <div class="ms-auto flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={roundOpen ? 'secondary' : 'default'}
                disabled={!!busy}
                onclick={() => { roundOpen = !roundOpen; }}
              >
                دورِ تازه
              </Button>
              {#if pickedScenarios.length}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onclick={() => runScenarios(pickedScenarios)}
                >
                  {busy === 'run' ? 'شروع…' : 'فقط سناریوها را بگیر'}
                </Button>
              {/if}
              {#if picked.size}
                <Button size="sm" variant="ghost" onclick={() => { picked = new Set(); }}>برداشتنِ تیک‌ها</Button>
              {/if}
            </div>
          </div>

          <!--
            دکمهٔ مادر.

            ── چرا اسم و روش می‌پرسد، و نه فقط «بزن» ──

            دوری که اسم نداشته باشد، همان `bench`ِ خالیِ دیروز است: یک اجرای
            دیگر در فهرست که هفتهٔ بعد از بقیه جدا نمی‌شود. و انتخابِ روش،
            چون کاری که آدم می‌خواهد معمولاً ترکیبی است — «سناریوها را بگیر
            **و** دوباره بگرد ببین چیزی تازه هست».
          -->
          {#if roundOpen}
            <div class="mt-3 space-y-2 border-t pt-3">
              <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Input bind:value={roundName} class="h-9" maxlength="60" placeholder="اسمِ این دور — مثلاً: پیش از انتشار ۴.۲" />
                <Input bind:value={roundNote} class="h-9" maxlength="300" placeholder="چرا این دور؟ (اختیاری)" />
              </div>

              <div class="flex flex-wrap gap-3 text-xs">
                <label class="flex items-center gap-1.5">
                  <input type="checkbox" bind:checked={roundScenarios} disabled={!pickedScenarios.length && picked.size > 0} />
                  سناریوها را بگیر
                  {#if picked.size}({formatNumber(pickedScenarios.length)}){/if}
                </label>
                <label class="flex items-center gap-1.5">
                  <input type="checkbox" bind:checked={roundCrawl} />
                  دوباره بگرد، ببین چیزی تازه هست
                </label>
              </div>

              <!--
                ── چرا این جمله اینجاست ──

                کارها **پشتِ سر هم** اجرا می‌شوند، نه با هم: هر دو مرورگر باز
                می‌کنند و لایهٔ کار عمداً فقط یک اجرای هم‌زمان می‌پذیرد. کاربری
                که هر دو را تیک بزند و ببیند فقط یکی شروع شد، فکر می‌کند خراب
                است.
              -->
              <p class="text-[11px] leading-5 text-muted-foreground">
                {#if roundScenarios && roundCrawl}
                  اول سناریوها، بعد خزش — پشتِ سرِ هم، چون هر دو مرورگر باز می‌کنند.
                  دومی وقتی اولی تمام شد خودش شروع می‌شود.
                {:else}
                  هر دو زیرِ همین اسم ثبت می‌شوند و در «دورها» و در تریاژ کنارِ هر یافته دیده می‌شوند.
                {/if}
              </p>

              <div class="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={!!busy || !roundName.trim() || (!roundScenarios && !roundCrawl)}
                  onclick={startRound}
                >
                  {busy === 'round' ? 'در حال شروع…' : 'شروعِ دور'}
                </Button>
                <Button size="sm" variant="ghost" href={`${base}/rounds`}>دورهای قبلی</Button>
              </div>
            </div>
          {/if}
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

  <!--
    نام‌های خوانا — تنها جای این صفحه که پول خرج می‌کند.

    ── چرا این نوار پایین است و نه بالا ──

    درخت بی آن کار می‌کند: ساختار، شمارش، و زاویه‌های آزمون همه رایگان‌اند.
    گذاشتنش بالای صفحه یعنی اولین چیزی که کاربر می‌بیند یک دکمهٔ پولی
    باشد — در حالی که شاید اصلاً لازمش نداشته باشد.

    ── و چرا وقتی همه نام دارند ناپدید نمی‌شود ──

    `--force` راهِ اصلاحِ نام‌های بدِ مدل است. دکمه‌ای که بعد از نخستین
    استفاده ناپدید شود، آن راه را هم می‌بندد.
  -->
  <div class="mt-6 rounded-xl border bg-muted/20 p-3">
    <div class="flex flex-wrap items-center gap-2">
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium">
          نام‌ها خام‌اند؟
          {#if unnamed}
            <span class="text-muted-foreground">
              ({formatNumber(unnamed)} بخش هنوز نامِ خوانا ندارد)
            </span>
          {/if}
        </p>
        <p class="text-[11px] leading-5 text-muted-foreground">
          کلِ درخت — ساختار، شمارش، و زاویه‌های آزمون — بی هیچ فراخوانی مدل
          ساخته شده. فقط <strong>نام</strong> است که رایگان درنمی‌آید:
          <code class="font-mono">contents</code> درست است ولی چیزی نمی‌گوید.
          این دکمه <strong>یک</strong> فراخوانی می‌زند و نتیجه کش می‌شود.
        </p>
      </div>
      <!--
        ── چرا وقتی همه نام دارند `force` می‌رود ──

        دکمه در آن حالت «دوباره نام‌گذاری کن» می‌گوید، و بی `force` هیچ
        گرهی نامزد نیست: صفر فراخوانی، و پیامِ «همه از قبل نام داشتند».
        یعنی دکمه‌ای که دقیقاً وقتی خوانده می‌شود که کاربر از نام‌ها راضی
        نیست، هیچ کاری نمی‌کند — و او فکر می‌کند خراب است.
      -->
      <Button size="sm" variant="outline" disabled={!!busy} onclick={() => nameThem(!unnamed)}>
        {busy === 'name' ? 'در حال نام‌گذاری…' : unnamed ? 'نام‌های خوانا بساز' : 'دوباره نام‌گذاری کن'}
      </Button>
    </div>

    {#if nameNote}<p class="mt-2 text-[11px] text-muted-foreground">{nameNote}</p>{/if}

    <p class="mt-2 border-t pt-2 text-[11px] leading-5 text-muted-foreground">
      نامی که مدل می‌سازد <Badge variant="outline" class="text-[10px]">by: model</Badge>
      است و با نام‌گذاریِ دوباره عوض می‌شود. نامی که <strong>خودتان</strong> بگذارید
      <Badge variant="secondary" class="text-[10px]">by: user</Badge>
      است و هیچ‌چیز — نه تازه‌سازی، نه مدل — عوضش نمی‌کند.
    </p>
  </div>
{/if}
