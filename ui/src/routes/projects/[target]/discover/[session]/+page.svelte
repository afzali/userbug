<script>
  /**
   * داخلِ یک جلسهٔ کشف.
   *
   * ── چرا اینجا هیچ سوئیچی نیست ──
   *
   * کاربر گفت: «وقتی در یک گشتی وارد شدیم و در جریانه، دکمه‌های اضافه دیده
   * نشه». رادیوی «چطور کشفش کنم؟» که کنارِ کارِ در جریان بماند، یک کلیکِ
   * اشتباهی تا خراب شدن فاصله دارد.
   *
   * پس انتخابِ روش در مودالِ «کشفِ تازه» تمام شد و اینجا فقط **همین** جلسه
   * است: کارِ در جریانش، قدم‌هایش، یافته‌هایش.
   *
   * ── چرا جلسهٔ تمام‌شده هم همین صفحه را دارد ──
   *
   * چون همان چیز است در زمانِ دیگر. دو صفحهٔ متفاوت برای «در جریان» و
   * «تمام‌شده» یعنی کاربر باید دو جا را یاد بگیرد و هر بار حدس بزند کدام
   * را می‌بیند.
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import TourPanel from '$lib/components/TourPanel.svelte';
  import LivePanel from '$lib/components/LivePanel.svelte';
  import Harvest from '$lib/components/Harvest.svelte';
  import { formatDate, formatNumber } from '$lib/format.js';

  let { data } = $props();

  let target = $derived(data.target);
  let base = $derived(`/projects/${encodeURIComponent(target)}`);
  let session = $derived(data.session);
</script>

<svelte:head><title>{session.way.label} — {data.project?.name || target}</title></svelte:head>

{#snippet actions()}
  <Button variant="ghost" size="sm" href={`${base}/runs`}>← همهٔ کشف‌ها</Button>
  <Button variant="outline" size="sm" href={base}>اپِ من</Button>
{/snippet}

<PageHeader
  eyebrow={session.live ? (session.running ? 'در جریان' : 'چیزی در جریان نیست') : session.at ? formatDate(session.at) : ''}
  title={session.way.label}
  description={session.way.hint}
  {actions}
/>

{#if session.live}
  <!--
    کارِ در جریان — و **فقط** کارِ در جریان.

    ── چه بود و چرا عوض شد ──

    اینجا `CrawlPanel` رندر می‌شد، که یک فرمِ شروعِ خزش است. و چون
    کاوشِ هدف‌دار پنلِ خودش را نداشت، به همین شاخه می‌افتاد: کاربر
    «شروع» می‌زد، کاوش راه می‌افتاد، و صفحهٔ بعدی یک فرم نشانش می‌داد با
    همان سه گزینه‌ای که تازه انتخاب کرده بود — و یک دکمهٔ «شروع» دیگر.
    پرسشِ درستش این بود: «اگر شروع شده، پس این چیه؟»

    فرم رفت به `discover/new`، و اینجا هر سه روش پنلِ خودشان را دارند.
  -->
  {#if session.kind === 'tour'}
    <TourPanel {data} {target} />
  {:else if session.running}
    <LivePanel {session} {target} />
  {:else}
    <!--
      هیچ کاری در جریان نیست — و صفحه همین را می‌گوید.

      پیش‌تر سرصفحه بی‌قید «در جریان» می‌گفت و زیرش فرمِ خزش می‌آمد، پس
      این حالت اصلاً دیده نمی‌شد. آدرسِ `live` نشانک‌شدنی است و بعد از
      پایانِ کار هم باز می‌شود؛ آن لحظه باید بگوید تمام شد، نه اینکه
      وانمود کند چیزی در جریان است.
    -->
    <section class="rounded-xl border bg-muted/30 p-6">
      <h2 class="text-base font-semibold">الان چیزی در جریان نیست</h2>
      <p class="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
        این آدرس کارِ همین لحظه را نشان می‌دهد. اگر کشفی داشتید و تمام شده،
        نتیجه‌اش در «اپِ من» نشسته و خودِ جلسه در فهرستِ اجراها ردیفِ خودش
        را گرفته.
      </p>
      <div class="mt-4 flex flex-wrap gap-2">
        <Button size="sm" href={base}>اپِ من — و شروعِ کشفِ تازه</Button>
        <Button size="sm" variant="outline" href={`${base}/runs`}>همهٔ کشف‌ها</Button>
        <Button size="sm" variant="ghost" href={`${base}/discover/new`}>خزشِ دقیق</Button>
      </div>
    </section>
  {/if}
{:else if session.kind === 'source'}
  <div class="space-y-4">
    <!--
      همان حکم، برای سورس هم.

      خواندنِ سورس ارزان‌ترین کشف است و به همین دلیل بیشترین احتمال را
      دارد که چیزی به‌جا نگذارد: یازده روت پیدا می‌کند، هیچ‌کدام آزمون
      نمی‌گیرند، و رابط می‌گوید «انجام شد».
    -->
    <Harvest harvest={data.harvest} {target} />

    <div class="flex flex-wrap gap-3 text-sm">
      {#each [['فایلِ خوانده‌شده', data.source.files], ['endpoint', data.source.total], ['روت', data.source.routes.length], ['نیازموده', data.source.untouched.length]] as [label, value] (label)}
        <div class="rounded-xl border px-4 py-2">
          <span class="block text-[11px] text-muted-foreground">{label}</span>
          <span class="text-lg font-bold">{formatNumber(value)}</span>
        </div>
      {/each}
    </div>

    <p class="text-xs leading-6 text-muted-foreground">
      خواندنِ سورس نه مرورگر می‌خواهد نه مدل: مسیرِ فایل، رشتهٔ
      <code>case 'GET /x'</code> و <code>UNIQUE(...)</code> در schema. پس
      تاریخچه ندارد — همیشه همین یک ردیف است و با هر خواندن به‌روز می‌شود.
      {#if data.sourceRoot}
        سورس: <code dir="ltr" class="font-mono">{data.sourceRoot}</code>
      {/if}
    </p>

    {#if data.source.untouched.length}
      <section class="rounded-xl border p-4">
        <h2 class="mb-2 text-sm font-bold">
          endpointهایی که هیچ اجرایی صدایشان نزده
          <span class="font-normal text-muted-foreground">({formatNumber(data.source.untouched.length)})</span>
        </h2>
        <ul class="scroll-thin max-h-72 space-y-0.5 overflow-y-auto text-xs">
          {#each data.source.untouched as one (one.method + one.path)}
            <li dir="ltr" class="text-start font-mono">{one.method} {one.path}</li>
          {/each}
        </ul>
      </section>
    {/if}

    <div class="flex flex-wrap gap-2">
      <Button size="sm" href={base}>آنچه پیدا شد، در اپِ من</Button>
      <Button size="sm" variant="outline" href={`${base}/knowledge`}>دانسته‌ها</Button>
    </div>
  </div>
{:else}
  <!--
    جلسهٔ تمام‌شده: فقط آنچه مالِ **همین** جلسه است.

    صفحهٔ قبلی «صفحه‌های ثبت‌شده» و «یافته‌ها» را از کلِ پروژه می‌آورد، پس
    بعد از ده گشت هیچ‌کدام دربارهٔ گشتی نبودند که باز کرده بودی.
  -->
  <!--
    حکمِ کشف، پیش از هر عددِ دیگری.

    «۲۸ حالت» و «۹۴ کنش» عددهای بزرگی‌اند که کارِ نکرده را کرده نشان
    می‌دهند. سوالی که واقعاً مهم است این است که فردا چه چیزی هست که بشود
    اجرایش کرد — پس اول می‌آید.
  -->
  <Harvest harvest={data.harvest} {target} />

  <div class="mb-5 flex flex-wrap gap-3 text-sm">
    {#each [['قدم', session.steps], ['یافته', session.findings]] as [label, value] (label)}
      <div class="rounded-xl border px-4 py-2">
        <span class="block text-[11px] text-muted-foreground">{label}</span>
        <span class="text-lg font-bold">{formatNumber(value)}</span>
      </div>
    {/each}
    {#if session.bench}
      <div class="rounded-xl border px-4 py-2">
        <span class="block text-[11px] text-muted-foreground">زیرِ بررسیِ</span>
        <span class="text-sm font-medium">{session.bench}</span>
      </div>
    {/if}
    {#if !session.finishedAt}
      <div class="rounded-xl border border-amber-500/40 px-4 py-2">
        <span class="block text-[11px] text-muted-foreground">وضعیت</span>
        <span class="text-sm font-medium text-amber-600 dark:text-amber-400">ناتمام ماند</span>
      </div>
    {/if}
  </div>

  {#if data.findings.length}
    <section class="mb-5 rounded-xl border border-destructive/30 p-4">
      <h2 class="mb-2 text-sm font-bold">یافته‌های همین جلسه</h2>
      <ul class="space-y-1 text-xs leading-6">
        {#each data.findings as one (one.fingerprint)}
          <li>
            <span class="text-destructive">●</span>
            {one.message}
            {#if one.route}
              <code dir="ltr" class="ms-1 font-mono text-[10px] text-muted-foreground">{one.route}</code>
            {/if}
          </li>
        {/each}
      </ul>
      <Button size="sm" variant="ghost" class="mt-2" href={`${base}/triage`}>رفتن به یافته‌ها</Button>
    </section>
  {/if}

  {#if data.steps.length}
    <section class="rounded-xl border p-4">
      <h2 class="mb-2 text-sm font-bold">
        قدم‌ها <span class="font-normal text-muted-foreground">({formatNumber(data.steps.length)})</span>
      </h2>
      <ul class="scroll-thin max-h-96 space-y-0.5 overflow-y-auto text-xs">
        {#each data.steps as one, index (index)}
          <li class="flex items-center gap-2 border-b py-1 last:border-0">
            <span class="w-8 shrink-0 text-muted-foreground">{formatNumber(index + 1)}</span>
            <span class="min-w-0 flex-1 truncate">{one.step}</span>
            {#if one.route}
              <code dir="ltr" class="shrink-0 font-mono text-[10px] text-muted-foreground">{one.route}</code>
            {/if}
            {#if one.findings}
              <Badge variant="destructive" class="shrink-0 text-[10px]">{formatNumber(one.findings)}</Badge>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    <p class="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      قدمی ثبت نشده.
    </p>
  {/if}

  <div class="mt-4 flex flex-wrap gap-2">
    <Button size="sm" href={base}>آنچه پیدا شد، در اپِ من</Button>
    <Button size="sm" variant="outline" href={`/runs/${encodeURIComponent(session.id)}`}>
      عکس‌ها و خطِ زمانی
    </Button>
  </div>
{/if}
