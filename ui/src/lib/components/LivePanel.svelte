<script>
  /**
   * کارِ در جریان — خزش یا کاوش.
   *
   * ── چرا ساخته شد ──
   *
   * این صفحه تا امروز برای هر چیزی جز گشت، `CrawlPanel` را نشان می‌داد —
   * یعنی یک **فرمِ شروع** ۸۶۱ خطی، درست بعد از اینکه کاربر «شروع» را زده
   * بود. و چون کاوشِ هدف‌دار پنلِ خودش را نداشت، آن هم به همین شاخه
   * می‌افتاد. کاربر پرسید: «اگر شروع شده، پس این چیه؟»
   *
   * جوابش این است که آن فرم هیچ ربطی به کارِ در جریان نداشت. چیزی که
   * اینجا لازم است سه جمله بیشتر نیست: چه کاری، با چه هدفی، و حالا کجاست.
   *
   * ── چرا قدم‌ها را دوباره چاپ نمی‌کند ──
   *
   * `RunPlayer` از قبل در همهٔ صفحه‌ها هست و قدم‌ها و یافته‌های زنده و
   * دکمهٔ لغو را دارد. تکرارش اینجا یعنی دو جا یک چیز را می‌گویند و روزی
   * یکی‌شان عقب می‌ماند. پس اینجا فقط **چه چیزی** در جریان است، و
   * خلاصه‌ای از پیشرفت که از همان یک منبع خوانده می‌شود.
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { ACTIVE, cancelJob, run } from '$lib/run-store.svelte.js';
  import { formatNumber } from '$lib/format.js';

  let { session, target } = $props();

  let base = $derived(`/projects/${encodeURIComponent(target)}`);

  const WHAT = {
    quest: {
      title: 'کاوشِ هدف‌دار',
      what: 'مرورگر باز است و دارد همان‌جایی را که گفتید عمیق بررسی می‌کند. هرچه دید به درختِ «اپِ من» اضافه می‌شود و اگر چیزی برای آزمودن پیدا کند، سناریوی پیش‌نویس می‌سازد.',
    },
    map: {
      title: 'خزشِ نقشه',
      what: 'مرورگر خودش هر دکمهٔ امن را می‌زند و می‌نویسد از کجا به کجا می‌رسد — مودال‌ها و منوهایی که آدرس ندارند هم. بی هیچ فراخوانی مدل.',
    },
  };

  let info = $derived(WHAT[session.kind] || { title: 'کشف', what: '' });

  /**
   * دامنه، به همان شکلی که به CLI رفت.
   *
   * `scope` رشتهٔ کاماخورده است چون پرچمِ خط فرمان همین را می‌خواهد. شکستنش
   * اینجا یعنی کاربر همان چیزی را ببیند که فرستاده شد، نه نسخهٔ بازنویسی‌شدهٔ
   * رابط.
   */
  let scope = $derived(
    String(session.scope || '')
      .split(',')
      .map((one) => one.trim())
      .filter(Boolean)
  );

  let busy = $derived(ACTIVE.has(run.job?.status));
  let canCancel = $derived(['starting', 'running'].includes(run.job?.status));
  let steps = $derived(run.steps.length);
  let findings = $derived(run.findings.length);
</script>

<section class="rounded-xl border bg-card p-5">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0">
      <h2 class="flex items-center gap-2 text-base font-bold">
        {#if busy}
          <span class="block size-3 shrink-0 animate-pulse rounded-full border-2 border-primary/30 border-t-primary"></span>
        {/if}
        {info.title}
      </h2>
      <p class="mt-1.5 max-w-3xl text-sm leading-7 text-muted-foreground">{info.what}</p>
    </div>

    <!--
      لغو اینجا هم هست، با اینکه در پلیر هم هست.

      ── چرا این یکی تکرارِ بد نیست ──

      پلیر یک نوارِ باریکِ ته صفحه است و دکمه‌اش تا بازش نکنی دیده نمی‌شود.
      این صفحه‌ای است که آدم عمداً آمده تا ببیند چه در جریان است؛ «بس کن»
      باید همان‌جا باشد که نگاه می‌کند.
    -->
    {#if canCancel}
      <Button variant="outline" size="sm" onclick={cancelJob}>بس کن</Button>
    {/if}
  </div>

  <!--
    جملهٔ هدف — تنها چیزی که کاوش دربارهٔ خودش دارد و هیچ‌جای دیگر نیست.

    بی این، صفحه فقط می‌گوید «کاوشی در جریان است» و کاربر باید یادش بماند
    خودش چه نوشته بود.
  -->
  {#if session.goal}
    <div class="mt-4 rounded-lg border bg-muted/30 p-3">
      <span class="block text-[11px] text-muted-foreground">چه خواستید</span>
      <p class="mt-0.5 text-sm leading-7">{session.goal}</p>
    </div>
  {/if}

  {#if scope.length || session.focus}
    <div class="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
      {#if scope.length}
        <span class="text-muted-foreground">دامنه:</span>
        {#each scope as one (one)}
          <Badge variant="outline" class="font-mono text-[10px]" dir="ltr">{one}</Badge>
        {/each}
      {/if}
      {#if session.focus}
        <span class="ms-2 text-muted-foreground">اولویت: {session.focus}</span>
      {/if}
    </div>
  {/if}

  <!--
    پیشرفت، از همان منبعی که پلیر می‌خواند.

    ── چرا فقط دو عدد ──

    فهرستِ قدم‌ها در پلیر است و اینجا تکرارش یعنی همان صفحهٔ شلوغی که
    داشتیم از آن فرار می‌کردیم. این دو عدد فقط جواب می‌دهند «دارد کار
    می‌کند یا گیر کرده».
  -->
  {#if run.job}
    <div class="mt-4 flex flex-wrap gap-3 text-sm">
      <div class="rounded-xl border px-4 py-2">
        <span class="block text-[11px] text-muted-foreground">قدم تا اینجا</span>
        <span class="text-lg font-bold">{formatNumber(steps)}</span>
      </div>
      <div class="rounded-xl border px-4 py-2" class:border-destructive={findings > 0}>
        <span class="block text-[11px] text-muted-foreground">یافته تا اینجا</span>
        <span class="text-lg font-bold" class:text-destructive={findings > 0}>{formatNumber(findings)}</span>
      </div>
    </div>

    <p class="mt-3 text-[11px] leading-6 text-muted-foreground">
      قدم‌به‌قدمش در نوارِ پایینِ صفحه است — و آن نوار همه‌جا همراهتان می‌آید،
      پس لازم نیست اینجا منتظر بمانید.
    </p>
  {/if}

  <!--
    راهِ بعدی، از همین حالا.

    کشف وقتی تمام شود چیزی به درخت اضافه می‌کند؛ گفتنِ اینکه کجا باید
    دنبالش گشت، بهتر از این است که کاربر بعد از پایان دنبالِ صفحه بگردد.
  -->
  <div class="mt-4 flex flex-wrap gap-2 border-t pt-4">
    <Button size="sm" variant="outline" href={base}>هرچه پیدا شود، در «اپِ من»</Button>
    <Button size="sm" variant="ghost" href={`${base}/runs`}>همهٔ کشف‌ها</Button>
  </div>
</section>
