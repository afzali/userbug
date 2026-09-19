<script>
  /**
   * پلیرِ اجرا — هر جا که هستی، همراهت.
   *
   * ── چرا ساخته شد ──
   *
   * کاربر گفت: «اجرا در همهٔ اینهاست و در هر گامی ممکن است باشد؛ بهتر است
   * شبیه پلیری باشد که هر جا لازم شد به‌خوبی دیده شود.»
   *
   * و راست می‌گفت: خزش از صفحهٔ نقشه شروع می‌شود، اجرای یک سفر از
   * مأموریت‌ها، گشت از صفحهٔ گشت — ولی **نمای زنده** فقط در صفحهٔ خانه بود.
   * یعنی همان لحظه‌ای که کاری را شروع می‌کردی و جای دیگری می‌رفتی، دیگر
   * نمی‌دیدی چه می‌شود. و اجرا چند دقیقه طول می‌کشد؛ کسی آن چند دقیقه را
   * خیره به یک صفحه نمی‌ماند.
   *
   * ── چرا بسته، مگر اینکه خودت بازش کنی ──
   *
   * نوارِ یک‌خطی همیشه هست و جا نمی‌گیرد. باز شدنش تصمیمِ آدم است، وگرنه
   * هر بار که خزشی شروع می‌شود نصفِ صفحه‌ای که در آن کار می‌کنی می‌رود.
   *
   * استثنا: **یافته**. وقتی چیزی پیدا شد، عدد قرمز روی نوار می‌نشیند — چون
   * همان چیزی است که برایش اجرا گرفته‌ای.
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { formatNumber } from '$lib/format.js';
  import { ACTIVE, cancelJob, run } from '$lib/run-store.svelte.js';

  let busy = $derived(ACTIVE.has(run.job?.status));
  let canCancel = $derived(['starting', 'running'].includes(run.job?.status));
  let latestStep = $derived(run.steps.at(-1));
  let activeRun = $derived(run.job?.activeRun || run.job?.runs?.at(-1));
  let base = $derived(`/projects/${encodeURIComponent(run.target)}`);

  const KIND = { map: 'خزشِ نقشه', quest: 'کاوشِ هدف‌دار', tour: 'گشتِ زنده', run: 'اجرای سناریو' };
  let title = $derived(KIND[run.job?.options?.kind] || 'اجرا');

  /**
   * وضعیت به فارسی، و بی خوش‌بینی.
   *
   * اجرایی که `failed` تمام شده نباید شبیه «تمام شد» دیده شود — همان درسی
   * که `RunCard` هم گرفت.
   */
  const STATUS = {
    starting: 'در حال شروع',
    running: 'در جریان',
    cancelling: 'در حال لغو',
    finished: 'تمام شد',
    failed: 'شکست',
    cancelled: 'لغو شد',
    /**
     * ارتباط قطع شد — نه «تمام شد» و نه «در جریان».
     *
     * سرورِ رابط که ری‌استارت شود، کارهای در حافظه‌اش می‌روند. نشان دادنِ
     * «در جریان» بعد از آن، حرفی است که غلط است.
     */
    lost: 'ارتباط قطع شد',
  };
</script>

{#if run.job}
  <!--
    `fixed` و پایین: نوار نباید جای محتوا را بگیرد یا با اسکرول برود.
    `z-40` زیرِ مودالِ راهنماست و بالای بقیه.
  -->
  <div class="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-3">
    <div class="pointer-events-auto w-full max-w-4xl overflow-hidden rounded-xl border bg-card shadow-lg">
      <!-- ── نوارِ همیشگی ── -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-xs">
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 text-right"
          onclick={() => (run.open = !run.open)}
        >
          <span class="shrink-0">
            {#if busy}
              <span class="block size-3 animate-pulse rounded-full border-2 border-primary/30 border-t-primary"></span>
            {:else}
              <span class="block size-3 rounded-full {run.job.status === 'finished'
                ? 'bg-emerald-500'
                : run.job.status === 'lost'
                  ? 'bg-muted-foreground'
                  : 'bg-destructive'}"></span>
            {/if}
          </span>

          <strong class="shrink-0">{title}</strong>
          <span class="text-muted-foreground">{STATUS[run.job.status] || run.job.status}</span>

          {#if latestStep}
            <span class="min-w-0 flex-1 truncate text-muted-foreground">
              · قدم {formatNumber(run.steps.length)}: {latestStep.step}
            </span>
          {/if}
        </button>

        <div class="flex shrink-0 items-center gap-2">
          {#if run.findings.length}
            <!-- یافته همان چیزی است که برایش اجرا گرفته‌ای؛ پس همیشه دیده می‌شود -->
            <Badge variant="destructive">{formatNumber(run.findings.length)} یافته</Badge>
          {/if}
          {#if canCancel}
            <Button size="sm" variant="outline" onclick={cancelJob}>توقف</Button>
          {/if}
          <Button size="sm" variant="ghost" onclick={() => (run.open = !run.open)}>
            {run.open ? 'بستن' : 'باز کن'}
          </Button>
          {#if !busy}
            <!-- اجرای تمام‌شده باید بشود کنارش گذاشت، وگرنه نوار تا رفرش می‌ماند -->
            <Button size="sm" variant="ghost" onclick={() => (run.job = null)} aria-label="پنهان">✕</Button>
          {/if}
        </div>
      </div>

      {#if run.open}
        <div class="grid max-h-[60vh] gap-0 overflow-auto border-t md:grid-cols-[minmax(0,1fr)_16rem]">
          <div class="p-3">
            {#if latestStep?.shot && activeRun}
              <img
                src={`/api/runs/${encodeURIComponent(latestStep.runId || activeRun)}/assets/${latestStep.shot
                  .split('/')
                  .map(encodeURIComponent)
                  .join('/')}`}
                alt={`عکس قدم ${latestStep.step}`}
                class="max-h-80 w-full rounded-lg border bg-muted object-contain"
              />
              <div class="mt-2 flex items-center justify-between gap-3 text-xs">
                <strong>{latestStep.step}</strong>
                <span class="text-muted-foreground">{latestStep.route || ''}</span>
              </div>
            {:else}
              <div class="grid min-h-40 place-items-center rounded-lg border border-dashed bg-muted/30 text-center text-xs text-muted-foreground">
                {busy ? 'منتظر نخستین قدم و عکس…' : 'این اجرا عکسی ثبت نکرده است'}
              </div>
            {/if}
          </div>

          <div class="border-t bg-muted/30 p-3 md:border-t-0 md:border-r">
            <div class="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div><strong class="block text-base">{formatNumber(run.steps.length)}</strong><small class="text-muted-foreground">قدم</small></div>
              <div><strong class="block text-base text-destructive">{formatNumber(run.findings.length)}</strong><small class="text-muted-foreground">یافته</small></div>
              <div><strong class="block text-base">{formatNumber(run.errors.length)}</strong><small class="text-muted-foreground">خطا</small></div>
            </div>

            <div class="scroll-thin max-h-56 space-y-2 overflow-auto">
              {#each [...run.findings, ...run.errors].slice(-20).reverse() as item, index (index)}
                <p class="rounded-lg border bg-background p-2 text-[11px] leading-5">
                  {item.normalized || item.message}
                </p>
              {:else}
                <p class="py-6 text-center text-[11px] text-muted-foreground">هنوز خطایی دیده نشده.</p>
              {/each}
            </div>

            <div class="mt-3 flex flex-wrap gap-2">
              {#if !busy && run.findings.length}
                <!--
                  «تریاژ» نامِ قدیمیِ آن صفحه است و در منو «یافته‌ها» نوشته.
                  دو نام برای یک جا، یعنی کاربر باید خودش بفهمد یکی‌اند.
                -->
                <Button href={`${base}/triage`} size="sm">{formatNumber(run.findings.length)} یافته را ببین</Button>
              {/if}
              {#if activeRun}
                <Button href={`/runs/${encodeURIComponent(activeRun)}`} size="sm" variant="outline">صفحهٔ اجرا</Button>
              {/if}
            </div>
          </div>
        </div>

        {#if run.output.length}
          <details class="border-t">
            <summary class="cursor-pointer px-3 py-2 text-xs font-medium">
              خروجی اجراگر ({formatNumber(run.output.length)} خط آخر)
            </summary>
            <pre class="scroll-thin max-h-48 overflow-auto border-t bg-slate-950 p-3 text-[11px] leading-5 text-slate-200" dir="auto">{run.output.join('\n')}</pre>
          </details>
        {/if}
      {/if}
    </div>
  </div>
{/if}
