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
   * آن فرم به «بررسی» رفت و نوارِ فرمان به هدر؛ اینجا حالا خودِ اپ است.
   *
   * ── چرا این صفحه نازک است ──
   *
   * درس گرفته از `FoundPanel` که ۱۰۳۹ خط شد: درخت یک کامپوننت است، پنل
   * یکی دیگر، و این فایل فقط حالت و اتصال.
   */
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import CapabilityTree from '$lib/components/CapabilityTree.svelte';
  import CapabilityPanel from '$lib/components/CapabilityPanel.svelte';
  import NewDiscovery from '$lib/components/NewDiscovery.svelte';
  import ReviewDialog from '$lib/components/ReviewDialog.svelte';
  import { goto } from '$app/navigation';
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
    /** فیچرِ حدسی سوالِ خودش را دارد: «واقعاً هست؟» — نه «چرا سناریو ندارد». */
    { key: 'guessed', label: 'فیچرِ حدسی', count: () => guessed },
    { key: 'red', label: 'ایرادِ باز', count: () => data.open },
    { key: 'edited', label: 'ویرایش‌شده' },
  ];

  /**
   * فیلتر و جستجو از آدرس هم می‌آیند.
   *
   * ── چرا لازم شد ──
   *
   * حکمِ پایانِ یک کشف می‌گوید «۶ جا دیدیم و هیچ آزمونی ندارند» و به
   * همین‌جا لینک می‌دهد. لینکی که صفحه را باز کند و کاربر دوباره باید
   * خودش فیلتر را بزند، همان کنترلِ بی‌اثری است که هیچ خطایی نمی‌دهد.
   *
   * و یک بار: بعدش دستِ کاربر است. `$effect`ی که هر بار از آدرس
   * بازنویسی کند، فیلترِ عوض‌شده را پس می‌گیرد.
   */
  let fromUrl = $state(false);
  $effect(() => {
    if (fromUrl) return;
    fromUrl = true;
    const wanted = page.url.searchParams.get('filter') || '';
    if (FILTERS.some((one) => one.key === wanted)) filter = wanted;
    search = page.url.searchParams.get('q') || '';
  });

  function matches(node) {
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      const hay = `${node.title} ${node.route} ${node.view} ${node.desc}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (filter === 'blind')
      return (
        !node.view &&
        !node.shelf &&
        /** فیچر سطلِ خودش را دارد؛ اینجا شمردنش عددِ «کارِ عقب‌افتاده» را باد می‌کند. */
        !node.feature &&
        !node.counts.scenarios.length &&
        !node.counts.planned?.length
      );
    if (filter === 'guessed') return Boolean(node.feature && node.confidence === 'suspected');
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

  let featNote = $state('');

  /**
   * عددِ فیچرِ حدسی از درخت می‌آید، نه از لودر.
   *
   * ── چرا این یکی فرق دارد ──
   *
   * بقیهٔ عددهای بالای صفحه با هر تأیید تکان نمی‌خورند، ولی این یکی
   * دقیقاً کاری است که کاربر همین حالا دارد می‌کند: شش فیچرِ حدسی را
   * یکی‌یکی تأیید یا حذف می‌کند. اگر عدد سرِ جایش بماند، کاربر بعد از
   * تأییدِ آخری هم «۶ تأیید می‌کنید؟» می‌بیند — همان بی‌بازخوردی که با
   * پیش‌نویس‌ها یک بار دیدیم.
   *
   * و `send` درختِ تازه را برمی‌گرداند، پس این عدد همیشه درست است.
   */
  let guessed = $derived(
    tree.flat.filter((one) => one.feature && one.confidence === 'suspected').length
  );

  /**
   * «این صفحه چه کارهایی دارد؟» — دومین و آخرین دکمهٔ پول‌خرج‌کنِ این صفحه.
   *
   * ── چرا برای هر صفحه جدا، و نه یک دکمه برای کلِ اپ ──
   *
   * نام‌گذاری یک فراخوانی برای کلِ درخت است چون هم‌خوانی می‌خواهد. اینجا
   * برعکس: ورودی فهرستِ کاملِ کنش‌های یک صفحه است و کلِ اپ یک‌جا یعنی
   * prompt‌ای که یا بریده می‌شود یا مدل در آن گم می‌شود.
   *
   * و هزینه‌اش این‌طور هم منصفانه‌تر است: کاربر روی صفحه‌ای می‌زند که
   * می‌داند فیچرِ پنهان دارد، نه روی صد صفحه‌ای که ندارد.
   */
  async function findFeats(one, force = false) {
    busy = 'feats';
    error = '';
    featNote = '';
    try {
      const payload = await send({ action: 'feats', id: one.id, force });
      const stats = payload.stats || {};
      featNote = stats.cached
        ? `این صفحه از قبل ${formatNumber(stats.kept)} فیچر داشت — هیچ فراخوانی‌ای نشد.`
        : stats.actions
          ? `${formatNumber(stats.kept)} فیچر از ${formatNumber(stats.actions)} کنش` +
            (stats.skipped ? ` · ${formatNumber(stats.skipped)} دور ریخته شد` : '') +
            ` · ${formatNumber(stats.calls)} فراخوانی · ${payload.model || ''}`
          : 'این صفحه هیچ کنشی در نقشه ندارد — اول یک کشف رویش لازم است.';
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

  /**
   * دو دیالوگ، با دامنه به‌عنوان ورودی.
   *
   * `null` یعنی بسته. هر جایی که دامنه دارد — دکمهٔ بالا، تیک‌های درخت،
   * آیکونِ یک ردیف — فقط همین را پر می‌کند و دیالوگ خودش بقیه را می‌فهمد.
   */
  let reviewing = $state(null);
  let discovering = $state(null);

</script>

<svelte:head><title>اپِ من — {data.project?.name || target}</title></svelte:head>

<!--
  دو فعل، دو دکمه — و هیچ‌کدام دیگر یک صفحه نیستند.

  ── چرا ──

  «کشف» و «بررسی» تا امروز ردیفِ منو بودند، پس کاربر باید اول به یک صفحه
  می‌رفت و بعد تازه کار را شروع می‌کرد. ولی هیچ‌کدام مقصد نیستند: کارند، و
  کار جایش کنارِ چیزی است که رویش انجام می‌شود.

  ترتیبشان هم عمدی است: اول باید بدانی اپ چه دارد، بعد بیازمایی‌اش.
-->
{#snippet actions()}
  <!--
    ⚙ — هرچه مرجع است، پشتِ یک دکمه.

    ── چرا سه ردیفِ منو اینجا جمع شدند ──

    «دانسته‌ها»، «دادهٔ آزمون» و «پیکربندی» هیچ‌کدام کارِ روزانه نیستند:
    سراغشان می‌روی با یک سؤالِ مشخص، شاید ماهی یک بار. ردیفِ منو بودنشان
    منو را به همان فهرستِ امکانات برمی‌گرداند که سه بار از آن فرار کردیم.
  -->
  <details class="relative">
    <summary class="flex h-8 cursor-pointer items-center rounded-md border px-2.5 text-sm hover:bg-accent">⚙</summary>
    <div class="absolute end-0 z-40 mt-1 w-56 rounded-lg border bg-card p-1 shadow-lg">
      {#each [['دانسته‌ها', `${base}/knowledge`, 'چه می‌دانیم و از کجا'], ['دادهٔ آزمون', `${base}/config`, 'حساب و فایلِ نمونه'], ['فایل‌ها و پیکربندی', `${base}/files`, 'سناریوها و کانفیگِ اپ']] as [label, href, hint] (href)}
        <a {href} class="block rounded-md px-2.5 py-1.5 text-sm hover:bg-accent">
          {label}
          <span class="block text-[11px] text-muted-foreground">{hint}</span>
        </a>
      {/each}
    </div>
  </details>
  <Button variant="ghost" size="sm" disabled={!!busy} onclick={refresh} title="درخت را از شناختِ روی دیسک دوباره بساز">
    {busy === 'rebuild' ? 'در حال ساختن…' : '↻'}
  </Button>
  <Button variant="outline" size="sm" onclick={() => { discovering = { kind: 'all' }; }}>＋ کشف</Button>
  <Button size="sm" onclick={() => { reviewing = { kind: 'all', nodes: tree.flat }; }}>▶ بررسی</Button>
{/snippet}

<PageHeader
  eyebrow={`${data.project?.environment || ''} · ${data.project?.baseURL || ''}`}
  title="اپِ من"
  description="هر بخش و قابلیتی که از این اپ می‌شناسیم — و اینکه هر کدام چند سناریو دارد، چند بار آزموده شده، و چه ایرادی داشته."
  {actions}
/>

{#if discovering}
  <NewDiscovery
    {target}
    project={data.project}
    scope={discovering}
    scenarios={data.scenarios.map((one) => one.name)}
    onClose={() => { discovering = null; }}
    onStarted={(id) => goto(`${base}/discover/${encodeURIComponent(id)}`)}
  />
{/if}

{#if reviewing}
  <!--
    یک دیالوگ، سه در.

    دکمهٔ بالای صفحه، تیک‌های درخت، و آیکونِ هر ردیف — هر سه همین را باز
    می‌کنند و فقط `scope` را عوض می‌کنند. کاربر یک شکل یاد می‌گیرد.
  -->
  <ReviewDialog
    {target}
    scope={reviewing}
    onClose={() => { reviewing = null; }}
    onStarted={() => { reviewing = null; }}
    onDiscover={(scope) => { reviewing = null; discovering = scope; }}
  />
{/if}

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
      <Button size="sm" onclick={() => { discovering = { kind: 'all' }; }}>＋ کشف — گشت، خزش، یا سورس</Button>
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
    <!--
      فیچرِ حدسی — سوالش «واقعاً هست؟» است، نه «چرا سناریو ندارد».

      پس رنگش هشدار نیست: کارِ عقب‌افتاده نشان نمی‌دهد، یک تصمیمِ کوچکِ
      آدمی می‌خواهد که چند ثانیه بیشتر طول نمی‌کشد.
    -->
    {#if guessed}
      <div class="rounded-xl border border-dashed px-4 py-2">
        <span class="block text-[11px] text-muted-foreground">فیچرِ حدسی</span>
        <span class="text-lg font-bold">{formatNumber(guessed)}<span class="text-sm font-normal text-muted-foreground"> · تأیید می‌کنید؟</span></span>
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
      <strong>{formatNumber(data.blind)} بخش هیچ سناریویی ندارد</strong> — نه
      نوشته‌شده، نه اجراشده. روی هر کدام بزنید تا ببینید چیست و همان‌جا سناریو
      بسازید یا بگویید ابزار برود همان‌جا را بگردد.
      {#if data.planned}
        <span class="block text-sky-600 dark:text-sky-400">
          و {formatNumber(data.planned)} بخش سناریو دارد ولی هنوز یک بار هم
          اجرا نشده.
        </span>
      {/if}
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
            onReview={(one) => { reviewing = { kind: 'one', nodes: [one] }; }}
          />
        {/if}
      </div>

      <!--
        نوارِ انتخاب — فقط دامنه، نه فرم.

        ── چرا فرمِ داخلی رفت ──

        اینجا یک فرمِ چهارتکه بود: اسم، توضیح، دو تیکِ روش. یعنی سومین
        جایی که «بررسی» شروع می‌شد، با شکلی متفاوت از دو تای دیگر.

        حالا همان دیالوگی باز می‌شود که دکمهٔ بالای صفحه و آیکونِ هر ردیف
        باز می‌کنند. یک شکل، سه در — نه سه شکل.
      -->
      {#if picked.size}
        <div class="sticky bottom-4 mt-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-lg">
          <span class="text-sm font-medium">{formatNumber(picked.size)} بخش انتخاب شده</span>
          <span class="text-[11px] text-muted-foreground">
            {pickedScenarios.length
              ? `${formatNumber(pickedScenarios.length)} سناریو رویشان`
              : 'هیچ سناریویی رویشان نیست'}
          </span>
          <div class="ms-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onclick={() => { discovering = { kind: 'some', nodes: tree.flat.filter((one) => picked.has(one.id)) }; }}
            >
              ＋ کشفِ این‌ها
            </Button>
            <Button
              size="sm"
              disabled={!!busy}
              onclick={() => { reviewing = { kind: 'some', nodes: tree.flat.filter((one) => picked.has(one.id)) }; }}
            >
              ▶ بررسیِ این‌ها
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
          onEdit={(patch) => send({ action: node.feature ? 'feature-edit' : 'edit', ...patch })}
          onReset={(id) =>
            node.feature ? send({ action: 'feature-edit', id, remove: true }) : send({ action: 'reset', id })}
          onFeats={findFeats}
          featNote={featNote}
          hasFeats={tree.flat.some((one) => one.feature && one.parent === node.id)}
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
