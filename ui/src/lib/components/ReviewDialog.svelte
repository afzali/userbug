<script>
  /**
   * «بررسی» — اجرای سناریوهای یک دامنه.
   *
   * ── چرا مودال و چرا دامنه‌محور ──
   *
   * کاربر گفت دکمهٔ بررسی «پشتش هر نوع انتخابش تنظیماتِ خاصِ خودش را
   * دارد»: کلِ سایت یک لیبل می‌خواهد که بگوید عمومی بوده، و «فلان‌جا» باید
   * بداند کجاست.
   *
   * پس دامنه **ورودیِ** دیالوگ است نه چیزی که داخلش انتخاب شود — از سه
   * جا می‌آید و هر سه یک شکل: دکمهٔ بالای صفحه (کلِ اپ)، تیک‌های درخت
   * (چند بخش)، و آیکونِ `▶` هر ردیف (همان یک بخش).
   *
   * ── چرا وقتی سناریو نیست، صریح رد می‌کند ──
   *
   * بررسی یعنی **اجرای سناریوهای موجود**. اگر دامنه سناریویی ندارد، چیزی
   * برای اجرا نیست و ساختنش کارِ کشف است. مرزِ دو فعل همین‌جا نگه داشته
   * می‌شود — ولی با یک دکمه که همان‌جا به کشف می‌برد، نه با یک «نه».
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import ModelPicker from '$lib/components/ModelPicker.svelte';
  import { formatNumber } from '$lib/format.js';
  import { run, startJob } from '$lib/run-store.svelte.js';

  let { target, scope, onClose, onStarted, onDiscover } = $props();

  /**
   * `scope` از بیرون می‌آید:
   *   { kind: 'all' }                          کلِ اپ
   *   { kind: 'some', nodes: [...] }           تیک‌های درخت
   *   { kind: 'one',  nodes: [node] }          آیکونِ یک ردیف
   */
  let nodes = $derived(scope?.nodes || []);

  /** سناریوهای دامنه، بی تکرار. */
  let scenarios = $derived([
    ...new Set(nodes.flatMap((one) => one.counts?.scenarios || [])),
  ]);

  /**
   * نامِ پیش‌فرض از **دامنه** می‌آید.
   *
   * کاربر گفت: «اگر بگوید کلِ سایت را بررسی کن، منطقاً یک لیبل می‌زند که
   * بفهمیم جستجوی عمومی بوده». نامی که خودبه‌خود درست باشد، نامی است که
   * کاربر زحمتِ نوشتنش را نمی‌کشد و بعداً هم پشیمان نمی‌شود.
   */
  let label = $state('');
  let touched = $state(false);

  let suggested = $derived(
    scope?.kind === 'all'
      ? `بررسیِ کلِ اپ — ${new Date().toLocaleDateString('fa-IR')}`
      : nodes.length === 1
        ? `بررسیِ «${nodes[0].title}»`
        : `بررسیِ ${formatNumber(nodes.length)} بخش`
  );

  $effect(() => {
    /** تا دستِ کاربر نخورده، پیشنهاد با دامنه عوض می‌شود. */
    if (!touched) label = suggested;
  });

  let advanced = $state(false);
  let device = $state('');
  let persona = $state('');
  let model = $state('');
  let repeat = $state(1);
  let headed = $state(false);

  let busy = $state(false);
  let error = $state('');

  async function start() {
    busy = true;
    error = '';
    try {
      /**
       * قصدِ بررسی **پیش از** اجرا ثبت می‌شود.
       *
       * دامنه و توضیح در `run.json` نیستند. اگر بعد از اجرا ثبت شوند،
       * اجرایی که وسطِ راه بشکند بررسی‌ای بی‌دامنه به‌جا می‌گذارد — و
       * همان است که بعداً باید بگوید «قرار بود کجا را ببینم».
       */
      const response = await fetch('/api/rounds', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({
          target,
          name: label.trim(),
          note: scope?.kind === 'all' ? 'کلِ اپ' : '',
          scope: scope?.kind === 'all' ? [] : nodes.map((one) => one.id),
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'ثبت نشد');

      const job = await startJob(target, {
        kind: 'run',
        only: scenarios,
        bench: label.trim(),
        device,
        persona,
        model,
        repeat,
        headed,
      });
      if (!job) throw new Error(run.error || 'شروع نشد');
      onStarted?.();
    } catch (cause) {
      error = cause.message;
      busy = false;
    }
  }
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && !busy && onClose?.()} />

<div
  class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh]"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && !busy && onClose?.()}
>
  <div class="w-full max-w-lg rounded-xl border bg-card p-5 shadow-xl" role="dialog" aria-modal="true">
    <h2 class="text-base font-bold">بررسی</h2>

    <!--
      دامنه اول، چون همه‌چیزِ دیگر تابعِ آن است — نامِ پیش‌فرض، سناریوها،
      و اینکه اصلاً کاری برای انجام هست یا نه.
    -->
    <p class="mt-1 text-xs leading-6 text-muted-foreground">
      دامنه:
      {#if scope?.kind === 'all'}
        <strong class="text-foreground">کلِ اپ</strong>
      {:else if nodes.length === 1}
        <strong class="text-foreground">{nodes[0].title}</strong>
      {:else}
        <strong class="text-foreground">{formatNumber(nodes.length)} بخشِ انتخاب‌شده</strong>
      {/if}
    </p>

    {#if !scenarios.length}
      <!--
        مرزِ دو فعل، با یک راهِ بیرون.

        بررسی یعنی اجرای سناریوهای موجود. اینجا چیزی نیست که اجرا شود — و
        ساختنش کارِ کشف است. ولی «نه» گفتن و رها کردن، کاربر را همان‌جا
        گیر می‌اندازد.
      -->
      <div class="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs leading-6">
        <p class="font-semibold">هیچ سناریویی روی این دامنه نیست.</p>
        <p class="mt-1 text-muted-foreground">
          بررسی یعنی اجرای سناریوهایی که از قبل ساخته شده‌اند. ساختنشان کارِ
          <strong>کشف</strong> است — یک کشف روی همین دامنه، و بعد اینجا چیزی
          برای اجرا هست.
        </p>
      </div>
      <div class="mt-4 flex justify-end gap-2 border-t pt-4">
        <Button variant="ghost" size="sm" onclick={() => onClose?.()}>انصراف</Button>
        <Button size="sm" onclick={() => onDiscover?.(scope)}>یک کشف روی همین دامنه</Button>
      </div>
    {:else}
      <div class="mt-3 rounded-lg border p-2.5">
        <p class="text-xs font-medium">
          {formatNumber(scenarios.length)} سناریو اجرا می‌شود
        </p>
        <ul class="scroll-thin mt-1 max-h-28 space-y-0.5 overflow-y-auto">
          {#each scenarios as one (one)}
            <li class="truncate text-[11px] text-muted-foreground">{one}</li>
          {/each}
        </ul>
      </div>

      <label class="mt-3 block space-y-1.5 text-sm font-medium">
        <span>اسمِ این بررسی</span>
        <Input
          bind:value={label}
          class="h-9"
          maxlength="60"
          disabled={busy}
          oninput={() => { touched = true; }}
        />
        <span class="block text-[11px] font-normal leading-5 text-muted-foreground">
          این نام، بررسی را در «اجراها» و کنارِ هر یافته از بقیه جدا می‌کند — و
          آن‌وقت می‌شود پرسید نسبت به بارِ قبل چه فرق کرد.
        </span>
      </label>

      <!--
        پیشرفته، بسته.

        کاربر گفت این تنظیمات «بهتر است در پیشرفته باشد که همان اول دمِ
        چشمش نباشد». کسی که لازم دارد پیدایش می‌کند؛ بقیه هرگز نمی‌بینندش.
      -->
      <details class="mt-3 rounded-lg border p-2.5" bind:open={advanced}>
        <summary class="cursor-pointer text-xs font-medium">پیشرفته</summary>
        <div class="mt-3 space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <label class="block space-y-1 text-xs">
              <span class="text-muted-foreground">دستگاه</span>
              <Input bind:value={device} dir="ltr" placeholder="desktop" class="h-8" disabled={busy} />
            </label>
            <label class="block space-y-1 text-xs">
              <span class="text-muted-foreground">تکرار</span>
              <Input type="number" min="1" max="10" bind:value={repeat} class="h-8" disabled={busy} />
            </label>
          </div>
          <label class="block space-y-1 text-xs">
            <span class="text-muted-foreground">رفتار کاربر</span>
            <select class="app-select" bind:value={persona} disabled={busy}>
              <option value="">پیش‌فرض سناریو</option>
              <option value="novice">تازه‌کار</option>
              <option value="pro">حرفه‌ای</option>
            </select>
          </label>
          <ModelPicker bind:value={model} disabled={busy} />
          <label class="flex items-center gap-2 text-xs">
            <input type="checkbox" bind:checked={headed} disabled={busy} /> مرورگر دیده شود
          </label>
          <p class="text-[11px] leading-5 text-muted-foreground">
            حساب و فایلِ نمونه از «دادهٔ آزمون» می‌آیند و همان‌جا تنظیم می‌شوند —
            سناریو خودش می‌گوید کدام را می‌خواهد.
          </p>
        </div>
      </details>

      {#if error}
        <p class="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
          {error}
        </p>
      {/if}

      <div class="mt-4 flex items-center justify-end gap-2 border-t pt-4">
        <Badge variant="outline" class="me-auto text-[10px]">
          هر بار یک اجرا — همه مرورگر باز می‌کنند
        </Badge>
        <Button variant="ghost" size="sm" disabled={busy} onclick={() => onClose?.()}>انصراف</Button>
        <Button size="sm" disabled={busy || !label.trim()} onclick={start}>
          {busy ? 'در حال شروع…' : 'شروعِ بررسی'}
        </Button>
      </div>
    {/if}
  </div>
</div>
