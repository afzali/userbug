<script>
  /**
   * «مأموریت‌ها» — یک ردیف برای هر سفرِ کاربر، با وضعیتش.
   *
   * ── چرا این صفحه خانهٔ کار است ──
   *
   * کاربر گفت دقیقاً چه می‌خواهد بداند: «ثبت‌نام، ورود، فراموشی رمز، افزودن
   * کتاب، خواندن کتاب، هایلایت و بازیابی آن — همه بررسی شده‌اند؟»
   *
   * تا امروز هیچ صفحه‌ای این را جواب نمی‌داد. فهرستِ فایل‌ها بر اساسِ فایل
   * مرتب بود، فهرستِ اجراها بر اساسِ کارِ ابزار.
   *
   * ── و یک ستونِ تازه که هیچ‌جا نبود: «انتظار» ──
   *
   * سناریوی بی‌انتظار اجرا می‌شود، سبز تمام می‌شود، و هیچ‌چیز را نسنجیده:
   * فقط می‌گوید «چیزی نشکست». سبزِ آن با سبزِ سناریویی که واقعاً چیزی را
   * تضمین می‌کند یکی نیست، و تا وقتی این عدد دیده نشود، کسی نمی‌فهمد.
   */
  import { startJob } from '$lib/run-store.svelte.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import ImpactPanel from '$lib/components/ImpactPanel.svelte';
  import ProposalsPanel from '$lib/components/ProposalsPanel.svelte';
  import { formatNumber } from '$lib/format.js';
  import { daysSinceGreen, summarize } from '../../../../../../src/runs/health.js';
  import { describeFailure, isTranslated } from '../../../../../../src/report/failure.js';

  let { data } = $props();

  let target = $derived(data.target);
  let base = $derived(`/projects/${encodeURIComponent(target)}`);
  let missions = $derived(data.missions || []);
  let sum = $derived(summarize(missions));

  /** بی‌انتظارها — تنها چیزی که این صفحه می‌داند و هیچ‌جای دیگر نمی‌گوید. */
  let blind = $derived(missions.filter((one) => one.path && !one.expects).length);

  /** عددِ روی عنوانِ بسته — بی آن، «باز کن تا ببینی خالی است» می‌شود. */
  let proposalCount = $derived((data.proposals?.proposals || []).filter((one) => !one.dismissed).length);

  let busy = $state('');
  let error = $state('');

  const LOOK = {
    failed: { mark: '✗', label: 'شکست', tone: 'text-destructive' },
    findings: { mark: '!', label: 'ایراد داشت', tone: 'text-amber-600 dark:text-amber-400' },
    never: { mark: '—', label: 'هرگز اجرا نشد', tone: 'text-muted-foreground' },
    unknown: { mark: '?', label: 'نامعلوم', tone: 'text-muted-foreground' },
    skipped: { mark: '·', label: 'اجرا نشد', tone: 'text-muted-foreground' },
    passed: { mark: '✓', label: 'سالم', tone: 'text-emerald-600 dark:text-emerald-400' },
  };

  function when(at) {
    return at ? at.slice(0, 16).replace('T', ' ') : '—';
  }

  function fileHref(row, extra = '') {
    return `${base}/files?kind=scenario&relative=${encodeURIComponent(row.path)}${extra}`;
  }

  /**
   * اجرا — همان درِ همیشگی.
   *
   * `only` فهرستِ نامِ آدم است و سرور خودش با `benchGrep` به `--grep`
   * تبدیلش می‌کند. ساختنِ الگو در مرورگر یعنی نامِ پرانتزدار روزی بی‌صدا
   * هیچ تستی را نگیرد.
   */
  async function run(names, label) {
    busy = label;
    error = '';
    try {
      /**
        * از حالتِ مشترک می‌گذرد، نه مستقیم.
        *
        * ── چرا دیگر `goto(base)` نمی‌کند ──
        *
        * پیش‌تر بعد از شروع، کاربر را به صفحهٔ خانه می‌برد — چون نمای زنده
        * فقط آنجا بود. حالا پلیر همین‌جا می‌آید، پس بردنِ آدم از فهرستی که
        * دارد رویش کار می‌کند، فقط گم کردنِ جای اوست.
        */
      const job = await startJob(target, { kind: 'run', only: names });
      if (!job) throw new Error('اجرا شروع نشد');
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  let runnable = $derived(missions.filter((one) => one.executable).map((one) => one.name));
</script>

{#snippet headerActions()}
  {#if runnable.length}
    <Button onclick={() => run(runnable, 'all')} disabled={!!busy}>
      {busy === 'all' ? 'در حال شروع…' : `همه را بگیر (${formatNumber(runnable.length)})`}
    </Button>
  {/if}
{/snippet}

<PageHeader
  title="مأموریت‌ها"
  description="سفرهایی که کاربر واقعاً می‌رود — و اینکه هر کدام سالم‌اند یا نه"
  actions={headerActions}
/>

{#if error}<p class="mb-4 text-sm text-destructive">{error}</p>{/if}

<!--
  «کد عوض شد — چه باید دوباره آزمود؟» بالای فهرست می‌نشیند، چون همان فهرستی
  است که جوابش از آن اجرا می‌شود. بسته می‌ماند تا ردیف‌ها را عقب نراند.
-->
<details class="mb-6 rounded-xl border p-4">
  <summary class="cursor-pointer text-sm font-medium">کد عوض شد — چه باید دوباره آزمود؟</summary>
  <div class="mt-4"><ImpactPanel {data} {target} /></div>
</details>

{#if !missions.length}
  <!--
    حالتِ خالی، با راهِ بیرون.

    صفحه‌ای که تا داده نداری فقط می‌گوید «چیزی نیست»، راهِ ساختنِ آن داده را
    هم می‌بندد.
  -->
  <section class="rounded-xl border bg-muted/30 p-6">
    <h2 class="text-base font-semibold">هنوز سفری نیست</h2>
    <p class="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
      سفر همان سناریوست: چند قدم که کاربر واقعاً برمی‌دارد، و انتظارهایی که
      می‌گویند بعدش چه باید دیده شود.
      {#if proposalCount}
        و {formatNumber(proposalCount)} تای آماده همین پایین منتظرند — از کشفی که
        قبلاً کرده‌اید درآمده‌اند.
      {:else}
        هنوز هیچ راهی برایشان باز نشده:
      {/if}
    </p>
    <div class="mt-4 flex flex-wrap gap-2">
      <Button href={`${base}/discover`} size="sm">کشف — گشت یا خزش</Button>
      <Button href={`${base}/files`} variant="outline" size="sm">خودم می‌نویسم</Button>
    </div>
  </section>
{:else}
  <!--
    سه عدد، نه یک نمودار.

    «چند تا سالم» پرسشِ اول است؛ «چند تا اصلاً چیزی نمی‌سنجند» پرسشی است که
    کاربر هنوز نمی‌داند باید بپرسد.
  -->
  <div class="mb-6 flex flex-wrap gap-3 text-sm">
    <div class="rounded-xl border px-4 py-2">
      <span class="block text-[11px] text-muted-foreground">سالم</span>
      <span class="text-lg font-bold text-emerald-600 dark:text-emerald-400">
        {formatNumber(sum.passed)}<span class="text-sm font-normal text-muted-foreground"> از {formatNumber(sum.total)}</span>
      </span>
    </div>
    {#if sum.failed || sum.findings}
      <div class="rounded-xl border border-destructive/40 px-4 py-2">
        <span class="block text-[11px] text-muted-foreground">قرمز</span>
        <span class="text-lg font-bold text-destructive">{formatNumber(sum.failed + sum.findings)}</span>
      </div>
    {/if}
    {#if sum.never}
      <div class="rounded-xl border px-4 py-2">
        <span class="block text-[11px] text-muted-foreground">هرگز اجرا نشده</span>
        <span class="text-lg font-bold">{formatNumber(sum.never)}</span>
      </div>
    {/if}
    {#if blind}
      <div class="rounded-xl border border-amber-500/40 px-4 py-2">
        <span class="block text-[11px] text-muted-foreground">بی‌انتظار</span>
        <span class="text-lg font-bold text-amber-600 dark:text-amber-400">{formatNumber(blind)}</span>
      </div>
    {/if}
  </div>

  {#if blind}
    <!--
      این جمله مهم‌ترین چیزی است که این صفحه می‌گوید.

      سبزِ یک سناریوی بی‌انتظار، سبزِ دروغین نیست — ولی خیلی کمتر از آن چیزی
      است که به نظر می‌رسد.
    -->
    <p class="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm leading-7">
      <strong>{formatNumber(blind)} سفر هیچ انتظاری ندارد.</strong>
      اجرا می‌شوند و سبز تمام می‌شوند، ولی چیزی را نمی‌سنجند: فقط می‌گویند
      «چیزی نشکست». با دکمهٔ «انتظار» روی هر ردیف، از عنصرهای واقعیِ گشت و
      نقشه انتظار اضافه کنید.
    </p>
  {/if}

  <div class="space-y-2">
    {#each missions as row (row.name)}
      {@const look = LOOK[row.verdict] || LOOK.unknown}
      {@const stale = row.verdict === 'passed' ? daysSinceGreen(row) : null}
      <Card.Root>
        <Card.Content class="p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-base font-semibold">
                  <span class={look.tone}>{look.mark}</span>
                  {row.name}
                </span>
                {#if row.status === 'draft'}
                  <Badge variant="outline" class="text-[10px]">پیش‌نویس</Badge>
                {/if}
                {#if row.orphan}
                  <!-- فایلش نیست ولی در اجراها دیده شده: پاک شده یا `.spec.js` است -->
                  <Badge variant="outline" class="text-[10px]">فایلش اینجا نیست</Badge>
                {/if}
              </div>

              <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span class={look.tone}>{look.label}</span>
                <span>{when(row.at)}</span>
                {#if row.steps}<span>{formatNumber(row.steps)} قدم</span>{/if}

                <!--
                  انتظار — ستونی که تا امروز نبود.
                  «۰ انتظار» یک هشدار است، نه یک عدد.
                -->
                {#if row.path}
                  {#if row.expects}
                    <span>{formatNumber(row.expects)} انتظار</span>
                  {:else}
                    <span class="text-amber-600 dark:text-amber-400">بی‌انتظار — فقط می‌گوید چیزی نشکست</span>
                  {/if}
                {/if}

                {#if row.verdict !== 'passed' && row.lastGreen}
                  <span>آخرین بارِ سالم: {when(row.lastGreen.at)}</span>
                {/if}
                {#if stale !== null && stale >= 7}
                  <span class="text-amber-600 dark:text-amber-400">
                    {formatNumber(stale)} روز است دوباره اجرا نشده
                  </span>
                {/if}
              </div>

              <!--
                جمله جلو، خطای خام پشتش.

                ── چرا ──

                ردیفِ قرمز این بود: `TimeoutError: locator.check: Timeout
                15000ms exceeded.` — حرفِ واقعی‌اش «تیکی که باید زده می‌شد،
                زده نشد» بود. کسی که Playwright نمی‌شناسد از آن خط چیزی
                برنمی‌دارد جز «یک چیزی خراب است».

                ولی خام هم می‌ماند، چون جمله **تفسیر** است و خام **شاهد**:
                روزی که تفسیر غلط باشد، باید راهی برای دیدنش بماند.
              -->
              {#if row.error}
                <p class="mt-1.5 text-start text-[11px] leading-5 text-muted-foreground">
                  {describeFailure(row.error)}
                </p>
                {#if isTranslated(row.error)}
                  <details class="mt-0.5">
                    <summary class="cursor-pointer text-[11px] text-muted-foreground/70">خطای خام</summary>
                    <p dir="ltr" class="mt-1 text-start font-mono text-[11px] break-all text-muted-foreground">
                      {row.error}
                    </p>
                  </details>
                {/if}
              {/if}
            </div>

            <div class="flex shrink-0 flex-wrap items-center gap-1.5">
              {#if row.executable}
                <Button size="sm" variant="secondary" disabled={!!busy} onclick={() => run([row.name], row.name)}>
                  {busy === row.name ? '…' : 'اجرا'}
                </Button>
              {/if}
              {#if row.path}
                {#if !row.expects}
                  <Button size="sm" href={fileHref(row, '&expect=1')}>انتظار</Button>
                {/if}
                <Button size="sm" variant="outline" href={fileHref(row)}>باز کن</Button>
              {:else if row.runId}
                <Button size="sm" variant="outline" href={`/runs/${encodeURIComponent(row.runId)}`}>آخرین اجرا</Button>
              {/if}
            </div>
          </div>
        </Card.Content>
      </Card.Root>
    {/each}
  </div>

{/if}

<!--
  از کجا سفرِ تازه بیاورم — ته صفحه، نه بالای آن.

  کسی که ده سفر دارد، هر روز دنبالِ ساختنِ یازدهمی نیست؛ دنبالِ وضعیتِ همان
  ده تاست. ولی **پیوند** به فهرستِ پیشنهادها کافی نبود: صفحه‌ای که باید
  یادت بماند وجود دارد، عملاً وجود ندارد. پس خودِ فهرست اینجاست، بسته.

  ── چرا بیرونِ شرطِ «سفری هست یا نه» ──

  اول داخلش بود، و آن دقیقاً حلقه را پاره می‌کرد: صفحهٔ «کشف» می‌گفت «۱۲
  سفرِ پیشنهادی از همین کشف»، کاربر می‌زد، و به صفحه‌ای می‌رسید که می‌گفت
  «هنوز سفری نیست» — در حالی که همان ۱۲ تا چند پیکسل پایین‌تر، پنهان، بودند.
  روی پروژهٔ خالی باز هم می‌شود، چون آنجا تنها کارِ ممکن همین است.
-->
<section class="mt-8 space-y-3">
  <h2 class="text-sm font-semibold">سفرِ تازه از کجا بیاورم؟</h2>

  <details class="rounded-xl border bg-muted/30 p-4" open={!missions.length}>
    <summary class="cursor-pointer text-sm font-medium">
      چه باید آزمود؟{proposalCount ? ` — ${formatNumber(proposalCount)} پیشنهاد از کشف` : ' — فعلاً پیشنهادی نیست'}
    </summary>
    <div class="mt-4">
      <ProposalsPanel {data} {target} />
    </div>
  </details>

  <div class="flex flex-wrap gap-2">
    <Button href={`${base}/discover`} variant="outline" size="sm">کشف</Button>
    <Button href={`${base}/files`} variant="outline" size="sm">
      فایل‌های پروژه{data.others ? ` (${formatNumber(data.others)} پیش‌نویس و اسکریپت)` : ''}
    </Button>
  </div>
</section>
