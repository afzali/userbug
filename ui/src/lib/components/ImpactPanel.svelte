<script>
  /**
   * «کد عوض شد — چه باید دوباره آزمود؟»
   *
   * ── چرا کنارِ فهرستِ سفرهاست ──
   *
   * این جوابِ سؤالی است که توسعه‌دهنده **همین حالا** دارد: تازه چیزی را
   * تغییر داده و می‌خواهد بداند کدام سفر را دوباره بگیرد. جایش دقیقاً
   * بالای همان فهرستی است که از آن اجرا می‌گیرد.
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';

  let { data, target } = $props();

  // svelte-ignore state_referenced_locally
  let impact = $state(data.impact);
  // svelte-ignore state_referenced_locally
  let impactError = $state(data.impactError);
  let ref = $state('HEAD');
  let checking = $state(false);
  let showWeak = $state(false);

  const strong = $derived((impact?.scenarios || []).filter((item) => !item.weak));
  const weak = $derived((impact?.scenarios || []).filter((item) => item.weak));

  // svelte-ignore state_referenced_locally
  /**
   * عوض شدنِ پروژه، بی‌آنکه کامپوننت ساخته شود.
   *
   * مقدارِ اولیهٔ `$state` یک بار خوانده می‌شود و ناوبریِ سمت کلاینت همین
   * کامپوننت را نگه می‌دارد. بدون این، اثرِ تغییرِ پروژهٔ قبلی زیر نامِ
   * پروژهٔ تازه دیده می‌شد.
   */
  let loadedTarget = $state(target);
  $effect(() => {
    if (target === loadedTarget) return;
    loadedTarget = target;
    impact = data.impact;
    impactError = data.impactError;
    ref = 'HEAD';
    showWeak = false;
  });

  async function recheck() {
    checking = true;
    impactError = '';
    try {
      const query = new URLSearchParams({ target: target, base: ref });
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
