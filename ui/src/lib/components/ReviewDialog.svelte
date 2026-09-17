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
  import Advanced from '$lib/components/Advanced.svelte';
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

  /**
   * سناریوهای دامنه، بی تکرار — از **دو** منبع، و این تفاوت حلقه را باز کرد.
   *
   * ── باگی که با رفتنِ کلِ مسیر روی یک پروژهٔ تازه پیدا شد ──
   *
   * `counts.scenarios` از شاخصِ لمس می‌آید، و شاخصِ لمس از **اجراها**
   * ساخته می‌شود. یعنی فقط سناریویی را می‌شناسد که قبلاً اجرا شده.
   *
   * نتیجه‌اش یک حلقهٔ بسته بود: کاربر از زاویه سناریو می‌ساخت، درخت
   * می‌گفت «۱ نیازموده»، و همین دیالوگ می‌گفت **«هیچ سناریویی روی این
   * دامنه نیست — برو کشف کن»**. برای اجرا شدن باید از قبل اجرا شده
   * می‌بود. هیچ راهی از «ساختم» به «اجرا کن» وجود نداشت.
   *
   * `counts.planned` همان سناریوهای نوشته‌شده‌اند که هنوز اجرا نشده‌اند —
   * و دقیقاً همان چیزی‌اند که کاربر می‌خواهد اجرا کند.
   */
  let ran = $derived([...new Set(nodes.flatMap((one) => one.counts?.scenarios || []))]);

  /** نوشته‌شده ولی هنوز اجرانشده. پیش‌نویس‌ها جدا نگه داشته می‌شوند. */
  let planned = $derived.by(() => {
    const seen = new Map();
    for (const node of nodes) {
      for (const one of node.counts?.planned || []) {
        if (!seen.has(one.name)) seen.set(one.name, one);
      }
    }
    return [...seen.values()].filter((one) => !ran.includes(one.name));
  });

  /**
   * پیش‌نویس اجرا **می‌شود**، ولی معیارِ سلامت نیست.
   *
   * `yaml.spec.js` پیش‌نویس را اجرا می‌کند و فقط در عنوان علامتش می‌زند.
   * آنچه پیش‌نویس را واقعاً اجرانشدنی می‌کند، نشستنش در `_drafts/` است —
   * که `loadScenarios` بازگشتی نمی‌خواند. پس همان‌ها را باید اول رسمی
   * کرد، و این دیالوگ می‌تواند خودش انجامش دهد.
   */
  let drafts = $derived(planned.filter((one) => one.draft || String(one.path || '').startsWith('_drafts/')));

  let scenarios = $derived([...ran, ...planned.map((one) => one.name)]);

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

  /**
   * تنظیماتِ پیشرفته، در یک شیء — همان شیئی که کشف هم می‌گیرد.
   *
   * ── چرا شیء و نه پنج `$state` ──
   *
   * چون جعبه‌اش مشترک است. پنج متغیرِ جدا یعنی هر دیالوگ نسخهٔ خودش را
   * دارد، و افزودنِ یک ردیف به جعبه باید در هر دو جا تکرار شود — که
   * دقیقاً همان‌طور شروع می‌شود که دو واژه‌نامه.
   */
  let settings = $state({ device: '', persona: '', model: '', repeat: 1, headed: false });

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

      /**
       * پیش‌نویس‌ها اول از `_drafts/` بیرون می‌آیند، وگرنه اجرا با «۰ تست»
       * سبز تمام می‌شود — بدترین نوعِ شکست.
       */
      for (const one of drafts) {
        if (!one.path) continue;
        await fetch('/api/scenarios/promote', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
          body: JSON.stringify({ target, relative: one.path }),
        }).catch(() => null);
      }

      const job = await startJob(target, {
        kind: 'run',
        only: scenarios,
        bench: label.trim(),
        ...settings,
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
          {#each ran as one (one)}
            <li class="truncate text-[11px] text-muted-foreground">{one}</li>
          {/each}
          {#each planned as one (one.name)}
            <li class="flex items-baseline gap-1.5 text-[11px] text-muted-foreground">
              <span class="truncate">{one.name}</span>
              <!--
                «نخستین بار» خبر است: اگر این اجرا بشکند، لزوماً اپ خراب
                نشده — شاید سناریو هنوز درست نبوده.
              -->
              <Badge variant="outline" class="shrink-0 text-[9px]">نخستین بار</Badge>
            </li>
          {/each}
        </ul>

        {#if drafts.length}
          <p class="mt-2 rounded-lg border border-dashed p-2 text-[11px] leading-6">
            {formatNumber(drafts.length)} تای اینها پیش‌نویس‌اند و در
            <code class="font-mono">_drafts/</code> نشسته‌اند، جایی که اجراگر
            نمی‌بیندشان. با شروعِ بررسی خودشان رسمی می‌شوند.
          </p>
        {/if}
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
        همان جعبه‌ای که کشف هم می‌گذارد — یک واژه‌نامه، نه دو تا.
      -->
      <Advanced
        bind:value={settings}
        rows={['device', 'repeat', 'persona', 'model', 'headed']}
        disabled={busy}
      />

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
