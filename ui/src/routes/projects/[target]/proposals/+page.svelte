<script>
  /**
   * «چه باید آزمود» — شکافِ میان آنچه می‌دانیم و آنچه می‌آزماییم.
   *
   * ── چرا این صفحه لازم شد ──
   *
   * گشت و هضمِ سورس شناخت را می‌ساختند و `coverage` آن را می‌سنجید، ولی
   * هیچ‌کدام نمی‌گفتند با آن چه باید کرد. کاربر باید خودش از روی چیزی که
   * سیستم می‌دانست سناریو می‌نوشت — همان کاری که قرار بود نکند.
   *
   * ── چرا هر ردیف «چرا» دارد ──
   *
   * پیشنهادِ بی‌دلیل، همان یافتهٔ بی‌بازتولید است در لباس دیگر: دو بار بررسی
   * می‌شود، دو بار چیزی درنمی‌آید، و بار سوم کل صفحه بسته می‌شود. پس هر ردیف
   * به یک بندِ واقعیِ پرونده گره خورده و همان را نقل می‌کند.
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';

  let { data } = $props();

  // svelte-ignore state_referenced_locally
  let list = $state(data.proposals.proposals);
  // svelte-ignore state_referenced_locally
  let stats = $state({
    open: data.proposals.open,
    coveredRoutes: data.proposals.coveredRoutes,
    totalRoutes: data.proposals.totalRoutes,
  });
  let showDismissed = $state(false);
  let busy = $state('');
  let feedback = $state('');

  const base = $derived(`/projects/${encodeURIComponent(data.target)}`);

  const KIND = {
    route: { label: 'صفحه', hint: 'صفحه‌ای که هیچ سناریویی سراغش نمی‌رود' },
    risk: { label: 'کارِ بازگشت‌ناپذیر', hint: 'چیزی که اگر غلط کار کند، جبران ندارد' },
    entity: { label: 'ذخیره‌سازی', hint: 'ساخته می‌شود، ولی نشستنش در دیتابیس سنجیده نمی‌شود' },
    auth: { label: 'ورود', hint: 'مسیرِ شکست، نه فقط مسیرِ موفق' },
    stale: { label: 'شناختِ کهنه', hint: 'ساختار این صفحه عوض شده' },
  };

  const visible = $derived(list.filter((item) => (showDismissed ? item.dismissed : !item.dismissed)));
  const dismissedCount = $derived(list.filter((item) => item.dismissed).length);

  async function toggle(item) {
    busy = item.id;
    feedback = '';
    try {
      const response = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({
          target: data.target,
          id: item.id,
          why: item.dismissed ? null : '',
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'ثبت نشد');
      list = payload.proposals;
      stats = { open: payload.open, coveredRoutes: payload.coveredRoutes, totalRoutes: payload.totalRoutes };
    } catch (cause) {
      feedback = cause.message;
    } finally {
      busy = '';
    }
  }

  /**
   * ساخت از همان پنلِ سناریوی تازه، با متنِ آماده.
   *
   * شناسهٔ پیشنهاد هم می‌رود، چون بعضی پیشنهادها مقدمهٔ قطعی دارند (مسیرِ
   * رسیدن، از نقشه). خودِ قدم‌ها در آدرس نمی‌آیند: سرور آن‌ها را از روی همین
   * شناسه برمی‌دارد.
   */
  const composeHref = (item) =>
    `${base}/files?compose=${encodeURIComponent(item.text)}&proposal=${encodeURIComponent(item.id)}`;

  /* ─────────────────────── اثرِ تغییرِ کد ─────────────────────── */

  // svelte-ignore state_referenced_locally
  let impact = $state(data.impact);
  // svelte-ignore state_referenced_locally
  let impactError = $state(data.impactError);
  let ref = $state('HEAD');
  let checking = $state(false);
  let showWeak = $state(false);

  const strong = $derived((impact?.scenarios || []).filter((item) => !item.weak));
  const weak = $derived((impact?.scenarios || []).filter((item) => item.weak));

  /**
   * عوض شدنِ پروژه، بی‌آنکه کامپوننت ساخته شود.
   *
   * مقدارِ اولیهٔ `$state` یک بار خوانده می‌شود و ناوبریِ سمت کلاینت همین
   * کامپوننت را نگه می‌دارد. بدون این، پیشنهادهای پروژهٔ قبلی زیر نامِ پروژهٔ
   * تازه دیده می‌شدند — و «لازم نیست» روی پروژهٔ اشتباه ثبت می‌شد.
   *
   * همان باگی که در ویرایشگرِ فایل‌ها گرفتیم؛ اینجا از پیش بسته می‌شود.
   */
  // svelte-ignore state_referenced_locally
  let loadedTarget = $state(data.target);
  $effect(() => {
    if (data.target === loadedTarget) return;
    loadedTarget = data.target;
    list = data.proposals.proposals;
    stats = {
      open: data.proposals.open,
      coveredRoutes: data.proposals.coveredRoutes,
      totalRoutes: data.proposals.totalRoutes,
    };
    impact = data.impact;
    impactError = data.impactError;
    ref = 'HEAD';
    showDismissed = false;
    showWeak = false;
    feedback = '';
  });

  async function recheck() {
    checking = true;
    impactError = '';
    try {
      const query = new URLSearchParams({ target: data.target, base: ref });
      const response = await fetch(`/api/impact?${query}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'خوانده نشد');
      impact = payload;
    } catch (cause) {
      impactError = cause.message;
      impact = null;
    } finally {
      checking = false;
    }
  }
</script>

<div class="space-y-6 p-6">
  <header class="space-y-2">
    <h1 class="text-xl font-semibold">چه باید آزمود</h1>
    <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
      این فهرست ساخته نمی‌شود، <strong>حساب می‌شود</strong>: هرچه در پروندهٔ شناخت هست، منهای هرچه
      سناریوهای موجود لمسش می‌کنند. هیچ مدلی اینجا صدا زده نمی‌شود — مدل تازه وقتی لازم می‌شود که
      روی «بساز» بزنید.
    </p>
  </header>

  <!--
    اثرِ تغییرِ کد، بالای صفحه.

    این بخش جوابِ سؤالی است که توسعه‌دهنده **همین حالا** دارد؛ فهرستِ شکاف‌ها
    سؤالِ درازمدت است. ترتیب از روی فوریت است، نه از روی اینکه کدام زودتر
    نوشته شد.
  -->
  <section class="space-y-4 rounded-lg border p-5">
    <div class="flex flex-wrap items-center gap-3">
      <h2 class="text-base font-semibold">کد عوض شد — چه باید دوباره آزمود؟</h2>
      <div class="ms-auto flex items-center gap-2">
        <span class="text-xs text-muted-foreground">نسبت به</span>
        <input
          bind:value={ref}
          dir="ltr"
          class="h-8 w-36 rounded-md border bg-background px-2 font-mono text-xs"
          placeholder="HEAD"
          onkeydown={(event) => event.key === 'Enter' && recheck()}
        />
        <Button size="sm" variant="outline" disabled={checking} onclick={recheck}>
          {checking ? '…' : 'بسنج'}
        </Button>
      </div>
    </div>

    {#if impactError}
      <p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{impactError}</p>
    {:else if impact}
      <p class="text-sm text-muted-foreground">
        <strong class="text-foreground">{impact.changed}</strong> فایل عوض شده نسبت به
        <code dir="ltr" class="font-mono text-xs">{impact.base}</code>.
      </p>

      {#if impact.routes.length}
        <div class="flex flex-wrap gap-1.5">
          {#each impact.routes as route (route.path)}
            <!--
              مسیر در ظرفِ جهت‌دارِ خودش.

              بدون آن، `/contents` کنار واژهٔ فارسی به‌شکل `contents/` دیده
              می‌شد: اسلش نویسهٔ خنثی است و جهتش را از همسایه می‌گیرد. متنِ
              DOM درست بود و فقط نمایش غلط — بدترین جنسِ باگ، چون جست‌وجو
              پیدایش نمی‌کند.
            -->
            <Badge variant={route.hub ? 'outline' : 'secondary'} class="text-[10px]">
              <bdi dir="ltr" class="font-mono">{route.path}</bdi>{route.hub ? ' · گذرگاه' : ''}{route.by === 'directory' ? ' · هم‌پوشه' : ''}
            </Badge>
          {/each}
        </div>
      {/if}

      {#if strong.length}
        <div class="space-y-2">
          <p class="text-xs font-semibold text-muted-foreground">این‌ها را دوباره اجرا کنید</p>
          <ul class="space-y-1.5">
            {#each strong as item (item.id)}
              <li class="flex flex-wrap items-baseline gap-2 rounded-md border px-3 py-2 text-sm">
                <span>{item.name}</span>
                <span dir="ltr" class="font-mono text-[11px] text-muted-foreground">{item.because.join(' · ')}</span>
              </li>
            {/each}
          </ul>
        </div>
      {:else if impact.changed}
        <p class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          هیچ سناریویی شاهدِ قوی ندارد.
        </p>
      {/if}

      {#if impact.uncovered.length}
        <!--
          خطرناک‌ترین ردیفِ گزارش: کد عوض شده، سناریویی نیست، و «همه را اجرا
          کن» هم پیدایش نمی‌کند چون چیزی برای اجرا وجود ندارد.
        -->
        <div class="space-y-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p class="text-xs font-semibold">کدشان عوض شده و هیچ سناریویی ندارند</p>
          {#each impact.uncovered as route (route.path)}
            <p dir="ltr" class="font-mono text-xs">{route.path}</p>
          {/each}
        </div>
      {/if}

      <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {#if weak.length}
          <button type="button" class="underline-offset-2 hover:underline" onclick={() => (showWeak = !showWeak)}>
            {weak.length} سناریو فقط از راهِ صفحهٔ گذرگاه رسیده‌اند {showWeak ? '▲' : '▼'}
          </button>
        {/if}
        {#if impact.unmapped.length}
          <!--
            صریح گفته می‌شود، نه در زیرنویس.

            فایلی که به هیچ صفحه‌ای نگاشت نشود عوض شده و اثرش نامعلوم است.
            بی‌صدا رد کردنش یعنی گزارش می‌گوید «چیزی لازم نیست» — دروغِ آرام.
          -->
          <span class="ms-auto">
            {impact.unmapped.length} فایل به هیچ صفحه‌ای نگاشت نشد؛ اثرشان نامعلوم است.
          </span>
        {/if}
      </div>

      {#if showWeak}
        <ul class="space-y-1 text-sm text-muted-foreground">
          {#each weak as item (item.id)}
            <li class="rounded-md border border-dashed px-3 py-1.5">{item.name}</li>
          {/each}
        </ul>
      {/if}
    {/if}
  </section>

  {#if data.error}
    <p class="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{data.error}</p>
  {/if}

  <div class="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm">
    <span><strong>{stats.open}</strong> پیشنهادِ باز</span>
    <span class="h-4 w-px bg-border"></span>
    <span class="text-muted-foreground">
      {stats.coveredRoutes} از {stats.totalRoutes} صفحهٔ شناخته‌شده، سناریو دارد
    </span>
    {#if dismissedCount}
      <Button variant="ghost" size="sm" class="ms-auto text-xs" onclick={() => (showDismissed = !showDismissed)}>
        {showDismissed ? `بازگشت به فهرستِ باز` : `${dismissedCount} ردشده`}
      </Button>
    {/if}
  </div>

  {#if feedback}
    <p class="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">{feedback}</p>
  {/if}

  {#if !visible.length}
    <p class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {#if showDismissed}
        چیزی رد نشده.
      {:else if stats.totalRoutes}
        شکافی نمانده — هرچه شناخت می‌دانست، سناریویی دارد.
      {:else}
        هنوز شناختی از این پروژه نیست. از «گشت زنده» یا «شناخت» شروع کنید.
      {/if}
    </p>
  {/if}

  <ul class="space-y-3">
    {#each visible as item (item.id)}
      <li class="rounded-lg border p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1 space-y-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" class="text-[10px]">{KIND[item.kind]?.label || item.kind}</Badge>
              <span class="text-sm font-medium">{item.title}</span>
            </div>
            <p class="text-sm leading-6 text-muted-foreground">{item.why}</p>
            <p dir="auto" class="font-mono text-[11px] text-muted-foreground/70">{item.evidence}</p>
          </div>

          <div class="flex shrink-0 gap-2">
            {#if !item.dismissed}
              <Button href={composeHref(item)} size="sm">بساز</Button>
            {/if}
            <Button
              variant="ghost"
              size="sm"
              class="text-xs"
              disabled={busy === item.id}
              onclick={() => toggle(item)}
            >{item.dismissed ? 'برگردان' : 'لازم نیست'}</Button>
          </div>
        </div>

        {#if !item.dismissed}
          <!--
            متنی که به مدل می‌رود، پیش از رفتن دیده می‌شود.
            کاربر باید بتواند بگوید «این جمله اشتباه است» قبل از اینکه هزینهٔ
            یک فراخوانی داده شود.
          -->
          <details class="mt-3">
            <summary class="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              متنی که فرستاده می‌شود
            </summary>
            <pre dir="auto" class="mt-2 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs leading-6">{item.text}</pre>
          </details>
        {/if}
      </li>
    {/each}
  </ul>
</div>
