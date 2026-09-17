<script>
  import { formatNumber } from '$lib/format.js';
  /**
   * «چه باید آزمود» — شکافِ میان آنچه کشف شده و آنچه می‌آزماییم.
   *
   * ── چرا از صفحهٔ خودش به مأموریت‌ها آمد ──
   *
   * این فهرست پلِ میانِ **کشف** و **سفر** است: هر جایی که پیدا شده و هیچ
   * سفری سراغش نمی‌رود، یک پیشنهاد است. صفحهٔ جدا داشتنش یعنی کاربر باید
   * یادش بماند که چنین صفحه‌ای هست — و همان‌جا حلقه پاره می‌شد.
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

  let { data, target } = $props();

  // svelte-ignore state_referenced_locally
  let list = $state(data.proposals.proposals);
  // svelte-ignore state_referenced_locally
  let stats = $state({
    open: data.proposals.open,
    coveredRoutes: data.proposals.coveredRoutes,
    totalRoutes: data.proposals.totalRoutes,
  });
  let showDismissed = $state(false);

  /**
   * عوض شدنِ پروژه، بی‌آنکه کامپوننت ساخته شود.
   *
   * همان باگی که یک بار در ویرایشگرِ فایل‌ها گرفتیم: `$state` مقدار اولیه را
   * یک بار می‌خواند و ناوبریِ سمت کلاینت کامپوننت را نگه می‌دارد، پس
   * پیشنهادهای پروژهٔ قبلی زیر نامِ پروژهٔ تازه دیده می‌شدند — و «لازم نیست»
   * روی پروژهٔ اشتباه ثبت می‌شد.
   */
  let loadedTarget = $state(target);
  $effect(() => {
    if (target === loadedTarget) return;
    loadedTarget = target;
    list = data.proposals.proposals;
    stats = {
      open: data.proposals.open,
      coveredRoutes: data.proposals.coveredRoutes,
      totalRoutes: data.proposals.totalRoutes,
    };
    showDismissed = false;
    feedback = '';
  });
  let busy = $state('');
  let feedback = $state('');

  const base = $derived(`/projects/${encodeURIComponent(target)}`);

  const KIND = {
    route: { label: 'صفحه', hint: 'صفحه‌ای که هیچ سناریویی سراغش نمی‌رود' },
    /**
     * جایی که **کشف** پیدا کرده — خزش، گشت، یا سورس.
     *
     * جدا از `route` ماند چون منبعشان فرق دارد: `route` از پروندهٔ ساختهٔ
     * مدل می‌آید و `purpose` دارد؛ این یکی از نقشهٔ یکپارچه و شاید فقط یک
     * مسیرِ خالی باشد. یک برچسب برای هر دو یعنی کاربر نمی‌فهمد کدام حرفِ
     * مستندتری پشتش است.
     */
    place: { label: 'جای کشف‌شده', hint: 'جایی که کشف پیدا کرده و هیچ سفری سراغش نمی‌رود' },
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
          target: target,
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
</script>

  {#if data.proposalsError}
    <p class="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{data.proposalsError}</p>
  {/if}

  <div class="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm">
    <span><strong>{formatNumber(stats.open)}</strong> پیشنهادِ باز</span>
    <span class="h-4 w-px bg-border"></span>
    <span class="text-muted-foreground">
      {formatNumber(stats.coveredRoutes)} از {formatNumber(stats.totalRoutes)} صفحهٔ شناخته‌شده، سناریو دارد
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
