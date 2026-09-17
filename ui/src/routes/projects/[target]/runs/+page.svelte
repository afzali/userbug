<script>
  /**
   * «بررسی» — یک جا برای پرسشِ اصلیِ کلِ ابزار.
   *
   * ── چرا این صفحه سه صفحه را بلعید ──
   *
   * `/run` فرم داشت و تاریخچه، `/rounds` دورها را نشان می‌داد و می‌گفت
   * «دورِ تازه از اپِ من شروع می‌شود»، و خودِ درخت هم دکمهٔ دور داشت. هر سه
   * یک پرسش را جواب می‌دادند — «چطور این پروژه را بررسی کنم؟» — و هیچ‌کدام
   * کامل.
   *
   * سه در برای یک کار همان «فهرستِ امکانات»ی است که منو دو بار از آن فرار
   * کرده. حالا یک در است: بالا شروع می‌کنی، پایین می‌بینی بارهای قبل چه
   * دادند.
   *
   * ── چرا دکمهٔ درخت ماند ──
   *
   * چون آنجا **دامنه** دارد: تیک می‌زنی کجا، بعد بررسی می‌کنی. اینجا
   * دامنه‌ای در کار نیست و همان کارِ سادهٔ همیشگی است. یکی میان‌بر است، نه
   * درِ دوم — و متنِ هر دو همین را می‌گوید.
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import RunCard from '$lib/components/RunCard.svelte';
  import { formatDate, formatNumber } from '$lib/format.js';

  let { data } = $props();

  let target = $derived(data.target);
  let base = $derived(`/projects/${encodeURIComponent(target)}`);
  let rounds = $derived(data.rounds || []);
  let discoveries = $derived(data.discoveries || []);

  const WAY_TONE = {
    tour: 'bg-primary/10 text-primary',
    map: 'bg-secondary text-secondary-foreground',
    quest: 'bg-secondary text-secondary-foreground',
    source: 'bg-muted text-muted-foreground',
  };
  let total = $derived(rounds.reduce((sum, one) => sum + one.runs.length, 0));

  /** کدام دور باز است — اجراها و یافته‌هایش همان‌جا زیرِ ردیف می‌آیند. */
  let open = $state('');

  const KIND = { run: 'سناریو', map: 'خزش', quest: 'کاوش', tour: 'گشت' };

  const keyOf = (round) => round.name || '__none';

  function findingsOf(name) {
    return name ? data.findings.filter((one) => (one.benches || []).includes(name)) : [];
  }

  /**
   * یافته‌هایی که فقط در **این** دور بودند.
   *
   * ── چرا این تفکیک لازم است ──
   *
   * فهرستِ کاملِ یافته‌های یک دور معمولاً همان فهرستِ همیشگی است و چیزی
   * نمی‌گوید. آنچه دربارهٔ یک دور خبر است، تفاوتش است.
   */
  function freshOf(round) {
    if (!round.diff) return [];
    const before = new Set(findingsOf(round.diff.against).map((one) => one.fingerprint));
    return findingsOf(round.name).filter((one) => !before.has(one.fingerprint));
  }
</script>

<svelte:head><title>اجراها — {data.project?.name || target}</title></svelte:head>

{#snippet actions()}
  <Button size="sm" href={base}>اپِ من — شروعِ کارِ تازه</Button>
{/snippet}

<!--
  ── چرا عنوان «بررسی» است و نه «اجرا» یا «دورها» ──

  «اجرا» کارِ ابزار را می‌گوید و «دور» اصطلاحِ خودمان است. آنچه آدم انجام
  می‌دهد این است که اپش را **بررسی** می‌کند — و عنوانِ صفحه باید همان کاری
  باشد که آدم می‌کند، نه چیزی که ماشین می‌سازد.
-->
<PageHeader
  eyebrow={`${data.project?.name || target} · ${data.project?.environment || ''}`}
  title="اجراها"
  description="هر بار که چیزی اجرا شد — کشف یا بررسی. کشف می‌فهمد اپ چه دارد، بررسی می‌آزمایدش."
  {actions}
/>

<!--
  دو دسته، یک صفحه.

  ── چرا فرمِ شروع از اینجا رفت ──

  «بررسی» دیگر یک صفحه نیست؛ دکمه‌ای است روی «اپِ من» که دامنه‌اش را از
  همان درخت می‌گیرد. فرمی که اینجا بماند، دری دوم می‌شود بی دامنه — و
  کاربر باید حدس بزند کدام را بزند.

  اینجا فقط **تاریخچه** است: چه کارهایی اجرا شد و هرکدام چه داد.
-->
<div class="space-y-6">
  <!--
    کشف‌ها اول، بررسی‌ها بعد — به ترتیبی که کار انجام می‌شود.

    اول می‌فهمی اپ چه دارد، بعد می‌آزمایی‌اش. ترتیبِ صفحه خودش یک جملهٔ
    آموزشی است.
  -->
  {#if discoveries.length}
    <section>
      <h2 class="mb-1 text-xl font-bold">کشف‌ها</h2>
      <p class="mb-3 text-sm text-muted-foreground">
        هر بار که رفتیم ببینیم اپ چه دارد. نتیجه‌شان در
        <a class="underline underline-offset-2" href={base}>اپِ من</a> جمع می‌شود.
      </p>
      <div class="space-y-2">
        {#each discoveries as one (one.id)}
          <a
            href={`${base}/discover/${encodeURIComponent(one.id)}`}
            class="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-accent/40"
          >
            <span class={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ${WAY_TONE[one.kind] || ''}`}>
              {one.way.label}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm">{one.way.hint}</span>
              <span class="block text-[11px] text-muted-foreground">
                {formatDate(one.at)}{one.steps ? ` · ${formatNumber(one.steps)} قدم` : ''}
              </span>
            </span>
            {#if !one.done}<Badge variant="outline" class="shrink-0 text-[10px]">ناتمام</Badge>{/if}
            {#if one.findings}
              <Badge variant="destructive" class="shrink-0 text-[10px]">{formatNumber(one.findings)}</Badge>
            {/if}
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <section class="min-w-0">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold">بررسی‌ها</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          هر بار زیرِ اسمِ خودش، با اینکه کجا را دید و نسبت به بارِ قبل چه فرق کرد.
        </p>
      </div>
      {#if total}
        <Badge variant="outline">{formatNumber(total)} اجرا در {formatNumber(rounds.length)} دسته</Badge>
      {/if}
    </div>

    {#if !rounds.length}
      <section class="rounded-xl border bg-muted/30 p-6">
        <h3 class="text-base font-semibold">هنوز هیچ بررسی‌ای نبوده</h3>
        <p class="mt-2 text-sm leading-7 text-muted-foreground">
          با نخستین اجرا اینجا پر می‌شود — حتی اگر اسمی رویش نگذارید. فرمِ
          کنار همین صفحه شروعش می‌کند.
        </p>
      </section>
    {:else}
      <div class="space-y-3">
        {#each rounds as round (keyOf(round))}
          {@const fresh = freshOf(round)}
          {@const isOpen = open === keyOf(round)}
          <article class="rounded-xl border bg-card p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-base font-semibold">
                    {#if round.name}
                      {round.name}
                    {:else}
                      <!--
                        اجرای بی‌نام پنهان نمی‌شود.

                        کاربری که ده بار سریع اجرا گرفته و اسم نگذاشته، نباید
                        صفحه‌ای ببیند که می‌گوید هیچ کاری نشده. ولی «دور» هم
                        خطابش نمی‌کنیم، چون نیست.
                      -->
                      <span class="text-muted-foreground">بی‌نام</span>
                    {/if}
                  </h3>
                  {#if round.empty}
                    <Badge variant="outline" class="text-[10px]">هنوز اجرایی نداشته</Badge>
                  {/if}
                  {#each Object.entries(round.kinds) as [kind, count] (kind)}
                    <Badge variant="secondary" class="text-[10px]">
                      {KIND[kind] || kind}{count > 1 ? ` ×${formatNumber(count)}` : ''}
                    </Badge>
                  {/each}
                </div>

                {#if round.note}
                  <p class="mt-1 text-xs leading-6 text-muted-foreground">{round.note}</p>
                {/if}

                <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{formatDate(round.finishedAt)}</span>
                  <span>{formatNumber(round.runs.length)} اجرا</span>
                  {#if round.steps}<span>{formatNumber(round.steps)} قدم</span>{/if}
                  {#if round.green || round.red}
                    <span>
                      <span class="text-emerald-600 dark:text-emerald-400">{formatNumber(round.green)} سبز</span>
                      {#if round.red}
                        · <span class="text-destructive">{formatNumber(round.red)} قرمز</span>
                      {/if}
                    </span>
                  {/if}
                  {#if round.findings}<span>{formatNumber(round.findings)} یافته</span>{/if}
                </div>

                <!--
                  دامنه — «کجا را قرار بود ببیند».

                  تنها بخشی از یک بررسی که هیچ ماشینی نمی‌داند و باید همان
                  لحظه ثبت شده باشد.
                -->
                {#if round.scopeLabels?.length}
                  <p class="mt-1.5 text-[11px] text-muted-foreground">
                    دامنه: {round.scopeLabels.slice(0, 6).join(' · ')}{round.scopeLabels.length > 6
                      ? ` و ${formatNumber(round.scopeLabels.length - 6)} تای دیگر`
                      : ''}
                  </p>
                {:else if round.name}
                  <p class="mt-1.5 text-[11px] text-muted-foreground">دامنه: کلِ اپ</p>
                {/if}
              </div>

              <div class="flex shrink-0 flex-col items-end gap-1.5">
                {#if round.diff}
                  <!--
                    سه عدد، و ترتیبشان عمدی است.

                    «تازه» اول می‌آید چون تنها عددی است که کار می‌سازد. «دیگر
                    نیست» دوم، چون خبرِ خوب است و باید دیده شود. «مانده» آخر.
                  -->
                  <div class="flex flex-wrap items-center justify-end gap-1.5 text-[11px]">
                    {#if round.diff.added}
                      <Badge variant="destructive" class="text-[10px]">{formatNumber(round.diff.added)} تازه</Badge>
                    {/if}
                    {#if round.diff.gone}
                      <Badge class="bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">
                        {formatNumber(round.diff.gone)} دیگر نیست
                      </Badge>
                    {/if}
                    {#if round.diff.kept}
                      <Badge variant="outline" class="text-[10px]">{formatNumber(round.diff.kept)} مانده</Badge>
                    {/if}
                  </div>
                  <span class="text-[10px] text-muted-foreground">نسبت به «{round.diff.against}»</span>
                {/if}

                <Button
                  size="sm"
                  variant="outline"
                  class="mt-1"
                  onclick={() => { open = isOpen ? '' : keyOf(round); }}
                >
                  {isOpen ? 'بستن' : 'باز کن'}
                </Button>
              </div>
            </div>

            {#if isOpen}
              <div class="mt-3 space-y-3 border-t pt-3">
                {#if fresh.length}
                  <div class="space-y-1">
                    <p class="text-xs font-semibold text-destructive">
                      {formatNumber(fresh.length)} یافته که در بررسیِ قبل نبود
                    </p>
                    {#each fresh as item (item.fingerprint)}
                      <p class="text-xs leading-6">
                        <span class="text-destructive">●</span>
                        {item.message}
                        {#each item.routes as route (route)}
                          <code dir="ltr" class="ms-1 font-mono text-[10px] text-muted-foreground">{route}</code>
                        {/each}
                      </p>
                    {/each}
                    <Button size="sm" variant="ghost" href={`${base}/triage`}>رفتن به تریاژ</Button>
                  </div>
                {/if}

                <!--
                  اجراهای تکی — همان‌جایی که فهرستِ تخت بود.

                  ── چرا آن فهرست حذف شد ──

                  پنج فیلتر داشت (نوع، بنچ، یافته‌دار، مرتب‌سازی، جست‌وجو) و
                  همه‌شان دور زدنِ یک کمبود بودند: گروه‌بندی نداشتیم. فهرستی
                  که با پنج فیلتر قابلِ تحمل شود، مشکلش فیلتر نبوده.
                -->
                {#if round.items?.length}
                  <div class="grid gap-3 md:grid-cols-2">
                    {#each round.items as item (item.runId)}
                      <RunCard run={item} />
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </article>
        {/each}
      </div>

      {#if total > 1}
        <div class="mt-4">
          <Button href={`${base}/compare`} variant="outline" size="sm">مقایسهٔ دو اجرا</Button>
        </div>
      {/if}
    {/if}
  </section>
</div>
