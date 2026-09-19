<script>
  /**
   * «این کشف چه چیزی برای اجرا ساخت؟» — حکمِ پایانِ یک جلسه.
   *
   * ── چرا این بالای صفحه است و نه پایینش ──
   *
   * کاربر گفت ملاکِ درست انجام شدنِ کشف این است که حداقل یک سناریو بدهد.
   * ملاکی که باید دنبالش بگردی، ملاک نیست — پس نخستین چیزی است که در
   * جلسهٔ تمام‌شده دیده می‌شود، پیش از قدم‌ها و یافته‌ها.
   *
   * ── چرا حالتِ ناتمام سرزنش نیست ──
   *
   * «هیچ سناریویی نساخت» به‌تنهایی فقط یک نمرهٔ بد است. آنچه لازم است،
   * همان یک کلیکِ بعدی است: اینجا فهرستِ صفحه‌هایی می‌آید که این کشف
   * دیدشان و هنوز هیچ آزمونی ندارند — با لینک به همان‌جایی که زاویه‌ها و
   * دکمهٔ «بساز» هستند.
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { formatDate, formatNumber } from '$lib/format.js';

  let { harvest, target, running = false } = $props();

  let base = $derived(`/projects/${encodeURIComponent(target)}`);
  /** بیش از این، فهرست می‌شود دیوار. بقیه در «اپِ من» با فیلترِ بی‌سناریو. */
  let blind = $derived((harvest?.blind || []).slice(0, 8));
  let more = $derived(Math.max(0, (harvest?.blind || []).length - blind.length));
</script>

{#if harvest && !running}
  {#if harvest.complete}
    <section class="mb-5 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
      <h2 class="flex items-center gap-2 text-sm font-bold">
        <span class="text-emerald-600 dark:text-emerald-400">✓</span>
        این کشف
        {formatNumber(harvest.made.length)}
        سناریو ساخت
      </h2>
      <ul class="mt-2 space-y-1">
        {#each harvest.made as one (one.id)}
          <li class="flex items-baseline gap-2 text-xs">
            <!--
              `relative`، نه `open`.

              `?open=` پارامتری بود که ویرایشگر نمی‌شناخت، پس کلیک روی نامِ
              سناریو `<target>.config.js` را باز می‌کرد — بی هیچ خطایی.
            -->
            <a
              class="truncate font-medium underline underline-offset-2"
              href={`${base}/files?kind=scenario&relative=${encodeURIComponent(one.path || one.id)}`}
            >
              {one.name}
            </a>
            {#if one.status === 'draft'}
              <!--
                پیش‌نویس هنوز اجرا نمی‌شود، و این را باید همین‌جا گفت.

                وگرنه کاربر «✓» را می‌بیند، می‌رود، و هفتهٔ بعد می‌فهمد
                هیچ‌کدامشان در هیچ بررسی‌ای اجرا نشده‌اند.
              -->
              <Badge variant="outline" class="shrink-0 text-[10px]">پیش‌نویس</Badge>
            {/if}
            {#if one.at}
              <span class="ms-auto shrink-0 text-[10px] text-muted-foreground">{formatDate(one.at)}</span>
            {/if}
          </li>
        {/each}
      </ul>

      {#if harvest.made.some((one) => one.status === 'draft')}
        <p class="mt-2 text-[11px] leading-6 text-muted-foreground">
          پیش‌نویس تا رسمی نشود در هیچ بررسی‌ای اجرا نمی‌شود. بازش کنید، ادعایش
          را بنویسید، و <code class="font-mono">status</code> را
          <code class="font-mono">approved</code> کنید.
        </p>
      {/if}
    </section>
  {:else}
    <section class="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <h2 class="flex items-center gap-2 text-sm font-bold">
        <span class="text-amber-600 dark:text-amber-400">◔</span>
        این کشف هنوز سناریویی نساخته
      </h2>
      <p class="mt-1 text-xs leading-6 text-muted-foreground">
        نقشه دانش است، سناریو کار. کشفی که فقط دانش بدهد، نیمهٔ راه است:
        فردا هیچ‌چیزی نیست که بشود اجرا کرد و دید چه شکسته.
      </p>

      {#if blind.length}
        <p class="mt-3 text-xs font-medium">
          {formatNumber(harvest.blind.length)} جایی که اینجا دیدیم و هیچ آزمونی ندارند:
        </p>
        <ul class="mt-1.5 flex flex-wrap gap-1.5">
          {#each blind as route (route)}
            <li>
              <!--
                هر مسیر، یک لینک به همان گره در درخت.

                آنجا زاویه‌ها و دکمهٔ «بساز» هستند — یعنی این بند فهرستِ
                کار است، نه فهرستِ گله.
              -->
              <a
                class="block rounded-lg border bg-card px-2 py-1 font-mono text-[11px] hover:border-primary"
                dir="ltr"
                href={`${base}?q=${encodeURIComponent(route)}`}
              >
                {route}
              </a>
            </li>
          {/each}
          {#if more}
            <li class="self-center text-[11px] text-muted-foreground">و {formatNumber(more)} تای دیگر</li>
          {/if}
        </ul>
      {/if}

      <div class="mt-3 flex flex-wrap gap-2">
        <Button size="sm" href={`${base}?filter=blind`}>برو سناریو بساز</Button>
        {#if harvest.older.length}
          <!--
            سناریوی قدیمی روی همین مسیرها — خبر است، نه اعتبار.

            اگر اینجا شمرده می‌شد، کشفِ دومِ هر صفحه‌ای همیشه سبز بود.
            ولی نگفتنش هم کاربر را وامی‌دارد دنبالِ چیزی بگردد که هست.
          -->
          <p class="self-center text-[11px] leading-5 text-muted-foreground">
            {formatNumber(harvest.older.length)} سناریوی قدیمی روی همین مسیرها هست —
            ولی جوابِ این کشف نیست.
          </p>
        {/if}
      </div>
    </section>
  {/if}
{/if}
