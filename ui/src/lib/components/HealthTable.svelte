<script>
  /**
   * «کدام سفر سالم است، و از کی؟»
   *
   * ── چرا این جدول ساخته شد ──
   *
   * کاربر گفت: «مأموریت‌هایی مثل ثبت‌نام، ورود، فراموشی رمز، افزودن کتاب،
   * هایلایت و بازیابی آن — برای من مهم است بدانم اینها همه بررسی شده‌اند.»
   *
   * ابزار همهٔ داده‌اش را داشت و این پرسش را جواب نمی‌داد: هر اجرا جداگانه
   * گزارش می‌شد و هیچ‌چیز در **طولِ زمان** نگاه نمی‌کرد. «ورود آخرین بار کی
   * سبز بود» جوابی نداشت جز باز کردنِ ده گزارشِ HTML.
   *
   * ── چرا این کارت بالای اجراهاست ──
   *
   * فهرستِ اجراها تاریخِ **کارِ ابزار** است؛ این یکی وضعیتِ **اپِ کاربر**.
   * دومی همان چیزی است که آدم صبح می‌آید ببیند.
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { formatNumber } from '$lib/format.js';
  import { daysSinceGreen, summarize } from '../../../../src/runs/health.js';

  let { rows = [], base = '' } = $props();

  let sum = $derived(summarize(rows));

  /**
   * «سالم»های کهنه پنهان می‌شوند، بقیه نه.
   *
   * فهرستی که با سی ردیفِ سبز شروع شود، ردیفِ قرمزش را قورت می‌دهد. ولی
   * پنهان‌کردنشان هم با عدد همراه است، وگرنه همان پوششِ خوش‌بینانه می‌شود.
   */
  let open = $state(false);
  let visible = $derived(open ? rows : rows.filter((row) => row.verdict !== 'passed'));

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
</script>

<Card.Root>
  <Card.Header class="pb-3">
    <Card.Title class="text-sm">سلامتِ سفرها</Card.Title>
    <Card.Description>
      {#if rows.length}
        {formatNumber(sum.passed)} سالم · {formatNumber(sum.failed)} شکست ·
        {formatNumber(sum.findings)} ایراد · {formatNumber(sum.never)} هرگز اجرا نشد
      {:else}
        هنوز سناریویی نه نوشته شده نه اجرا.
      {/if}
    </Card.Description>
  </Card.Header>

  <Card.Content class="space-y-2">
    {#if !rows.length}
      <p class="text-xs leading-6 text-muted-foreground">
        هر سناریو که بنویسید یا از نقشه پیشنهاد شود، اینجا یک ردیف می‌گیرد و
        بعد از هر اجرا سبز یا قرمز می‌شود.
      </p>
    {:else}
      {#each visible as row (row.name)}
        {@const look = LOOK[row.verdict] || LOOK.unknown}
        {@const stale = row.verdict === 'passed' ? daysSinceGreen(row) : null}
        <div class="rounded-lg border p-2.5">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="min-w-0 text-sm font-medium">
              <span class={look.tone}>{look.mark}</span>
              {row.name}
            </span>
            <span class="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
              <span class={look.tone}>{look.label}</span>
              <span>{when(row.at)}</span>
            </span>
          </div>

          <!--
            دلیل، همان‌جا. بی این، هر ردیفِ قرمز یعنی باز کردنِ یک گزارشِ
            HTML فقط برای فهمیدنِ اینکه چه شد.
          -->
          {#if row.error}
            <p dir="ltr" class="mt-1 truncate text-start font-mono text-[11px] text-muted-foreground">
              {row.error}
            </p>
          {/if}

          <div class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {#if row.verdict === 'never'}
              <span>نوشته شده، ولی هیچ اجرایی سراغش نرفته.</span>
            {:else}
              <span>{formatNumber(row.runs)} اجرا</span>
              {#if row.findings}<Badge variant="secondary" class="text-[10px]">{formatNumber(row.findings)} یافته</Badge>{/if}
              {#if row.verdict !== 'passed' && row.lastGreen}
                <span>آخرین بارِ سالم: {when(row.lastGreen.at)}</span>
              {/if}
              <!--
                سبزِ کهنه با سبزِ امروز یکی نیست: سفری که سه ماه پیش سبز بوده
                و از آن به بعد اجرا نشده، «سالم» نیست — فقط «آن موقع سالم بود».
              -->
              {#if stale !== null && stale >= 7}
                <span class="text-amber-600 dark:text-amber-400">{formatNumber(stale)} روز است دوباره اجرا نشده</span>
              {/if}
              {#if row.runId}
                <a class="underline underline-offset-2" href={`/runs/${encodeURIComponent(row.runId)}`}>آخرین اجرا</a>
              {/if}
            {/if}
          </div>
        </div>
      {/each}

      {#if sum.passed}
        <button
          type="button"
          class="w-full rounded-lg border border-dashed p-2 text-[11px] text-muted-foreground hover:bg-accent"
          onclick={() => (open = !open)}
        >
          {open ? 'پنهان کردنِ سالم‌ها' : `${formatNumber(sum.passed)} سفرِ سالم — نشان بده`}
        </button>
      {/if}

      {#if sum.unknown}
        <!--
          «نامعلوم» یعنی داده نداریم، نه یعنی سالم. اجرایی که با گزارشگرِ
          دیگری رفته وضعیتِ تست‌هایش ثبت نشده؛ سکوت اینجا یعنی کاربر آن
          ردیف‌ها را سبز بخواند.
        -->
        <p class="text-[11px] leading-5 text-muted-foreground">
          {formatNumber(sum.unknown)} ردیف «نامعلوم» است: آن اجرا با گزارشگرِ دیگری
          رفته و وضعیتِ تست‌ها ثبت نشده. یک اجرای تازه روشنش می‌کند.
        </p>
      {/if}

      {#if base}
        <a class="block text-[11px] underline underline-offset-4" href={`${base}/files`}>
          سناریوها را ببین یا تازه بنویس
        </a>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
