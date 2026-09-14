<script>
  /**
   * «سورس چه اعلام می‌کند، و ما به کجایش رسیده‌ایم».
   *
   * ── چرا این سه با هم یک صفحه‌اند ──
   *
   * سه شکافِ مستقل‌اند و هر کدام می‌تواند جدا از بقیه عقب باشد: صفحه‌ای که
   * خزش ندیده، endpointی که هیچ اجرایی صدا نزده، و قاعده‌ای که هیچ سناریویی
   * تلاش نمی‌کند بشکندش. تا امروز اولی ته صفحهٔ نقشه بود، دومی فقط در خط
   * فرمان، و سومی هیچ‌جا.
   *
   * ── و چرا این «تحلیلِ ایستا» نیست ──
   *
   * اینجا دنبالِ باگ در سورس نمی‌گردیم. فقط می‌پرسیم چه چیزی **اعلام شده**
   * و چه چیزی **لمس شده** — دو فهرست و یک تفریق. باگ را همان‌جا که همیشه
   * پیدا می‌شود پیدا می‌کنیم: در اجرای واقعی.
   */
  import { invalidateAll } from '$app/navigation';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { formatDate, formatNumber } from '$lib/format.js';

  let { data } = $props();

  let busy = $state(false);
  let error = $state('');
  let done = $state('');

  const base = $derived(`/projects/${encodeURIComponent(data.target)}`);

  async function rescan() {
    busy = true;
    error = '';
    done = '';
    try {
      const response = await fetch('/api/source', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target: data.target }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'خوانده نشد');
      done =
        `${formatNumber(payload.files)} فایل خوانده شد · ${formatNumber(payload.endpoints)} endpoint` +
        (payload.invariantsAdded ? ` · ${formatNumber(payload.invariantsAdded)} ناوردای تازه` : '');
      await invalidateAll();
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = false;
    }
  }

  /** نسبتِ لمس‌شده، برای وقتی که عدد به‌تنهایی چیزی نمی‌گوید. */
  const touched = $derived(
    data.endpoints ? data.endpoints.total - data.endpoints.untouched.length : 0
  );
</script>

<PageHeader
  eyebrow="سورس، نه حدس"
  title="چه چیزی هست که به آن نرسیده‌ایم"
  description="سورس اعلام می‌کند، اجراها لمس می‌کنند، و این صفحه تفریقشان است. هیچ فراخوانی مدلی ندارد.">
  {#snippet actions()}
    <Button onclick={rescan} disabled={busy || !data.hasSource}>
      {busy ? 'در حال خواندن…' : 'خواندنِ دوبارهٔ سورس'}
    </Button>
  {/snippet}
</PageHeader>

{#if !data.hasSource}
  <!--
    بی `source.root` این صفحه هیچ نمی‌داند. حالتِ خالی باید راهِ پر کردنش را
    بگوید، نه فقط بگوید خالی است.
  -->
  <section class="rounded-xl border border-dashed p-8 text-center">
    <p class="text-sm font-medium">این پروژه سورسی اعلام نکرده.</p>
    <p class="mx-auto mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
      کلید <code>source.root</code> را در پیکربندی پروژه بگذارید تا معلوم شود چه
      صفحه‌ها و چه endpointهایی وجود دارند که هنوز آزموده نشده‌اند.
    </p>
    <Button href={`${base}/files?kind=target`} variant="outline" class="mt-4">پیکربندی پروژه</Button>
  </section>
{:else}
  {#if error}<p class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>{/if}
  {#if done}<p class="mb-4 rounded-lg border bg-muted/40 p-3 text-sm">{done}</p>{/if}

  <div class="grid gap-6 lg:grid-cols-3">
    <!-- ── ۱. صفحه‌ها ── -->
    <Card.Root>
      <Card.Header class="pb-3">
        <Card.Title class="text-sm">صفحه‌ها</Card.Title>
        <Card.Description>روت‌هایی که در سورس اعلام شده‌اند.</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-3 text-sm">
        <div class="flex items-baseline justify-between">
          <span class="text-muted-foreground">در سورس</span>
          <strong class="text-lg">{formatNumber(data.routes.total)}</strong>
        </div>
        <div class="flex items-baseline justify-between">
          <span class="text-muted-foreground">حالتی که نقشه دیده</span>
          <strong>{formatNumber(data.routes.states)}</strong>
        </div>

        {#if data.routes.unreached.length}
          <div class="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
            <p class="font-medium text-amber-700 dark:text-amber-300">
              {formatNumber(data.routes.unreached.length)} صفحه، خزش به آن نرسیده
            </p>
            <div dir="ltr" class="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[11px]">
              {#each data.routes.unreached as route (route)}<span class="rounded bg-background px-1.5 py-0.5">{route}</span>{/each}
            </div>
            <!--
              علتش همیشه «باگ» نیست: صفحه‌ای که به حالتِ خاصی نیاز دارد، یا
              یتیم است. هر دو پرسشِ واقعی‌اند و هیچ‌کدام را نباید حدس زد.
            -->
            <p class="mt-1.5 text-muted-foreground">
              یا خزش راهی به آن‌ها نداشته، یا واقعاً از رابط دسترس‌پذیر نیستند.
            </p>
          </div>
          <Button href={`${base}/map`} variant="outline" size="sm" class="w-full">رفتن به نقشه</Button>
        {:else}
          <p class="text-xs leading-6 text-muted-foreground">
            هر صفحه‌ای که سورس اعلام کرده، در نقشه دیده شده.
          </p>
        {/if}

        <!--
          جهتِ برعکس: در مرورگر دیدیم و در سورس نبود. یا آشکارساز کور است،
          یا مسیر پویاست. هر دو پرسشِ واقعی‌اند.
        -->
        {#if data.routes.extra.length}
          <details class="text-xs">
            <summary class="cursor-pointer text-muted-foreground">
              {formatNumber(data.routes.extra.length)} صفحه دیده شد و در سورس نبود
            </summary>
            <div dir="ltr" class="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[11px]">
              {#each data.routes.extra as route (route)}<span class="rounded bg-muted px-1.5 py-0.5">{route}</span>{/each}
            </div>
          </details>
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- ── ۲. بک‌اند ── -->
    <Card.Root>
      <Card.Header class="pb-3">
        <Card.Title class="text-sm">بک‌اند</Card.Title>
        <Card.Description>endpointها، در برابر آنچه اجراها واقعاً صدا زده‌اند.</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-3 text-sm">
        {#if !data.endpoints?.scanned}
          <p class="text-xs leading-6 text-muted-foreground">
            هنوز خوانده نشده. «خواندنِ دوبارهٔ سورس» را بزنید.
          </p>
        {:else}
          <div class="flex items-baseline justify-between">
            <span class="text-muted-foreground">در سورس</span>
            <strong class="text-lg">{formatNumber(data.endpoints.total)}</strong>
          </div>
          <div class="flex items-baseline justify-between">
            <span class="text-muted-foreground">آزموده</span>
            <strong class={touched ? '' : 'text-destructive'}>{formatNumber(touched)}</strong>
          </div>
          <div class="flex items-baseline justify-between">
            <span class="text-muted-foreground">تماسِ ثبت‌شده</span>
            <strong>{formatNumber(data.endpoints.calls)}</strong>
          </div>

          {#if data.endpoints.untouched.length}
            <div class="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs">
              <p class="font-medium text-destructive">
                {formatNumber(data.endpoints.untouched.length)} endpoint، هیچ اجرایی صدایشان نزده
              </p>
              <ul class="mt-1.5 max-h-52 space-y-0.5 overflow-y-auto">
                {#each data.endpoints.untouched as row (row.path)}
                  <li dir="ltr" class="font-mono text-[11px]">
                    <span class="text-muted-foreground">{row.methods.join(',') || '?'}</span>
                    {row.path}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          <!--
            فعلِ نیازموده، جدا از مسیرِ نیازموده.

            `GET /keys` را هزار بار زده‌ایم و `DELETE` همان مسیر را هرگز — و
            دومی همان‌جاست که باگ می‌نشیند.
          -->
          {#if data.endpoints.partial.length}
            <div class="rounded-lg border p-2.5 text-xs">
              <p class="font-medium">مسیر آزموده شده، این فعل‌ها نه:</p>
              <ul class="mt-1.5 space-y-0.5">
                {#each data.endpoints.partial as row (row.path)}
                  <li dir="ltr" class="font-mono text-[11px]">
                    <span class="text-destructive">{row.untried.join(',')}</span> {row.path}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if data.endpoints.unknown.length}
            <details class="text-xs">
              <summary class="cursor-pointer text-muted-foreground">
                {formatNumber(data.endpoints.unknown.length)} مسیر صدا خورد و در سورس نبود
              </summary>
              <!-- یا آشکارساز کور است، یا سرویسِ بیرونی. هر دو خبرند، نه نویز. -->
              <ul class="mt-1.5 space-y-0.5">
                {#each data.endpoints.unknown as row (row)}
                  <li dir="ltr" class="font-mono text-[11px] text-muted-foreground">{row}</li>
                {/each}
              </ul>
            </details>
          {/if}

          {#if data.endpoints.at}
            <p class="text-[11px] text-muted-foreground">
              آخرین خواندن: {formatDate(data.endpoints.at)} · {formatNumber(data.endpoints.files)} فایل
            </p>
          {/if}
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- ── ۳. قاعده‌ها ── -->
    <Card.Root>
      <Card.Header class="pb-3">
        <Card.Title class="text-sm">قاعده‌ها</Card.Title>
        <Card.Description>آنچه schema اجبار می‌کند — و می‌شود تلاش کرد بشکندش.</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-3 text-sm">
        <div class="flex items-baseline justify-between">
          <span class="text-muted-foreground">ناوردا</span>
          <strong class="text-lg">{formatNumber(data.invariants.total)}</strong>
        </div>
        <div class="flex items-baseline justify-between">
          <span class="text-muted-foreground">یکتایی</span>
          <strong>{formatNumber(data.invariants.unique)}</strong>
        </div>
        <div class="flex items-baseline justify-between">
          <span class="text-muted-foreground">اجباری‌بودن</span>
          <strong>{formatNumber(data.invariants.notNull)}</strong>
        </div>
        {#if data.invariants.silenced}
          <div class="flex items-baseline justify-between">
            <span class="text-muted-foreground">خاموش‌شده با دلیل</span>
            <strong>{formatNumber(data.invariants.silenced)}</strong>
          </div>
        {/if}

        {#if data.invariants.sample.length}
          <ul class="space-y-1.5 border-t pt-2 text-xs leading-6">
            {#each data.invariants.sample as row (row.id)}
              <li>
                {row.statement}
                {#if row.from}<span dir="ltr" class="block font-mono text-[11px] text-muted-foreground">{row.from}</span>{/if}
              </li>
            {/each}
          </ul>
          <Button href={`${base}/proposals`} variant="outline" size="sm" class="w-full">
            پیشنهادهایی که از این‌ها درآمده
          </Button>
        {:else}
          <p class="text-xs leading-6 text-muted-foreground">
            هیچ ناوردایی ثبت نشده. اگر پروژه SQL دارد، «خواندنِ دوبارهٔ سورس» آن را پیدا می‌کند.
          </p>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>

  {#if data.stack?.framework || data.sourceRoot}
    <p class="mt-6 text-xs text-muted-foreground">
      {#if data.sourceRoot}<span dir="ltr" class="font-mono">{data.sourceRoot}</span>{/if}
      {#if data.stack?.framework}
        <Badge variant="outline" class="ms-2">{data.stack.framework}</Badge>
      {/if}
      {#if data.stack?.backend}<Badge variant="outline" class="ms-1">{data.stack.backend}</Badge>{/if}
      {#if data.stack?.db}<Badge variant="outline" class="ms-1">{data.stack.db}</Badge>{/if}
    </p>
  {/if}
{/if}
