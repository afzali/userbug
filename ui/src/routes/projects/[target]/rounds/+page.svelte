<script>
  /**
   * «دورها» — دکمهٔ مادر، و حافظهٔ اینکه هر بار چه دیدیم.
   *
   * ── چرا این صفحه ساخته شد ──
   *
   * کاربر گفت: «یک دکمهٔ مادر داشته باشد که اگر بزنیم انگار یک لایهٔ جدید
   * از تست‌ها یا لیبل‌مانند اضافه کنم که همهٔ سایت را بروم دوباره بررسی
   * کنم یا بخش‌های خاصی را.»
   *
   * `bench` همین بود و سه چیز کم داشت: یک رشتهٔ اختیاری در فرمِ اجرا بود نه
   * یک چیز؛ فقط به اجرای سناریو می‌چسبید نه به خزش و کاوش؛ و دامنه نداشت،
   * پس «همهٔ اپ» و «فقط بخشِ کتاب» یک شکل ثبت می‌شدند.
   *
   * ── چرا تفاوتِ دور‌به‌دور روی خودِ ردیف است ──
   *
   * «۲ تازه، ۱ رفع‌شده» تنها چیزی است که این صفحه را از یک فهرستِ دیگرِ
   * اجراها جدا می‌کند. پشتِ دکمه گذاشتنش یعنی کسی نبیندش.
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { formatDate, formatNumber } from '$lib/format.js';

  let { data } = $props();

  let target = $derived(data.target);
  let base = $derived(`/projects/${encodeURIComponent(target)}`);
  let rounds = $derived(data.rounds || []);

  /** دورِ باز شده — یافته‌هایش همان‌جا زیرِ ردیف می‌آیند. */
  let open = $state('');

  const KIND = { run: 'اجرای سناریو', map: 'خزش', quest: 'کاوش', tour: 'گشت' };

  function findingsOf(name) {
    return data.findings.filter((one) => (one.benches || []).includes(name));
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
    const before = new Set(
      data.findings.filter((one) => (one.benches || []).includes(round.diff.against)).map((one) => one.fingerprint)
    );
    return findingsOf(round.name).filter((one) => !before.has(one.fingerprint));
  }
</script>

<svelte:head><title>دورها — {data.project?.name || target}</title></svelte:head>

{#snippet actions()}
  <Button variant="outline" size="sm" href={base}>اپِ من</Button>
  <Button size="sm" href={`${base}/run`}>اجرای تازه</Button>
{/snippet}

<PageHeader
  title="دورها"
  description="هر بارِ بررسی زیر یک اسم — با اینکه کجا را دیده، چه روش‌هایی داشته، و نسبت به دورِ قبل چه تازه است."
  {actions}
/>

<!--
  ── چرا «دورِ تازه» اینجا دکمه ندارد ──

  دور از **انتخابِ دامنه** شروع می‌شود، و دامنه در درخت انتخاب می‌شود.
  دکمه‌ای اینجا یعنی فرمی که از کاربر بخواهد مسیرها را دستی بنویسد — همان
  کاری که کلِ درخت برای حذفش ساخته شد.
-->
<p class="mb-6 rounded-xl border bg-muted/30 p-3 text-sm leading-7">
  دورِ تازه از <a class="underline underline-offset-2" href={base}>اپِ من</a> شروع می‌شود:
  بخش‌هایی را که می‌خواهید بررسی شوند تیک بزنید، بعد «دورِ تازه» را بزنید.
  دوری بی‌دامنه هم ممکن است — یعنی کلِ اپ.
</p>

{#if !rounds.length}
  <section class="rounded-xl border bg-muted/30 p-6">
    <h2 class="text-base font-semibold">هنوز هیچ اجرایی نبوده</h2>
    <p class="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
      دور، چند اجرا زیرِ یک اسم است. با نخستین اجرا اینجا پر می‌شود — حتی
      اگر اسمی رویش نگذارید.
    </p>
    <Button href={`${base}/run`} size="sm" class="mt-4">اجرای تازه</Button>
  </section>
{:else}
  <div class="space-y-3">
    {#each rounds as round (round.name || '__none')}
      {@const fresh = freshOf(round)}
      <article class="rounded-xl border bg-card p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-semibold">
                {#if round.name}
                  {round.name}
                {:else}
                  <!--
                    اجرای بی‌نام پنهان نمی‌شود.

                    کاربری که ده بار سریع اجرا گرفته و اسم نگذاشته، نباید
                    صفحه‌ای ببیند که می‌گوید هیچ کاری نشده. ولی «دور» هم
                    خطابش نمی‌کنیم، چون نیست.
                  -->
                  <span class="text-muted-foreground">اجراهای بی‌نام</span>
                {/if}
              </h2>
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

              این تنها بخشی از دور است که هیچ ماشینی نمی‌داند و باید همان
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

                «تازه» اول می‌آید چون تنها عددی است که کار می‌سازد. «رفع
                شده» دوم، چون خبرِ خوب است و باید دیده شود. «مانده» آخر.
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

            <div class="mt-1 flex gap-1.5">
              {#if round.findings}
                <Button
                  size="sm"
                  variant="outline"
                  onclick={() => { open = open === round.name ? '' : round.name || '__none'; }}
                >
                  {open === (round.name || '__none') ? 'بستن' : 'یافته‌ها'}
                </Button>
              {/if}
              {#if round.runs.length === 1}
                <Button size="sm" variant="ghost" href={`/runs/${encodeURIComponent(round.runs[0])}`}>اجرا</Button>
              {/if}
            </div>
          </div>
        </div>

        {#if open === (round.name || '__none')}
          <div class="mt-3 space-y-1.5 border-t pt-3">
            {#if fresh.length}
              <p class="text-xs font-semibold text-destructive">
                {formatNumber(fresh.length)} یافته که در دورِ قبل نبود
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
            {/if}

            <p class="pt-1 text-xs font-semibold">همهٔ یافته‌های این دور</p>
            {#each findingsOf(round.name) as item (item.fingerprint)}
              <p class="text-xs leading-6 text-muted-foreground">
                {item.message}
                {#each item.routes as route (route)}
                  <code dir="ltr" class="ms-1 font-mono text-[10px]">{route}</code>
                {/each}
              </p>
            {/each}

            <Button size="sm" variant="ghost" class="mt-1" href={`${base}/triage`}>رفتن به تریاژ</Button>
          </div>
        {/if}
      </article>
    {/each}
  </div>
{/if}
