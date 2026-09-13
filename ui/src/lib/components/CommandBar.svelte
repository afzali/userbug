<script>
  /**
   * درِ ورودی.
   *
   * ── چرا این ساخته شد ──
   *
   * یازده در داشتیم و هیچ راهرویی: هر قابلیت صفحهٔ خودش را گرفت، به‌ترتیبِ
   * ساخته‌شدن نه به‌ترتیبِ نیاز. کسی که می‌خواست «ببین باگی هست یا نه»
   * نمی‌دانست کدام را بزند، چون هیچ صفحه‌ای دقیقاً این نبود.
   *
   * ── چرا سه دکمه، و چرا اول ──
   *
   * سه کارِ رایج **صفر فراخوانی مدل** می‌گیرند: کلیدواژه‌شان قطعی است و
   * قاعده حلشان می‌کند. کادرِ متنِ آزاد تنها جایی است که ممکن است مدل صدا
   * زده شود، و فقط وقتی که هیچ قاعده‌ای نخورد.
   *
   * ── چرا همیشه می‌پرسد ──
   *
   * «بگرد» که اشتباه خوانده شود یعنی بیست دقیقه خزشِ جهش‌زا روی دادهٔ واقعی.
   * پس هیچ‌چیز بی دیدنِ فرمان اجرا نمی‌شود — همان قاعده‌ای که این ابزار برای
   * هر کارِ برگشت‌ناپذیرِ دیگر هم دارد.
   */
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';

  let { target, busy = false, onRun } = $props();

  let text = $state('');
  let thinking = $state(false);
  let result = $state(null);
  let error = $state('');

  const base = $derived(`/projects/${encodeURIComponent(target)}`);

  /**
   * جمله‌های آماده، نه منطقِ آماده.
   *
   * دکمه‌ها هم از همان `/api/intent` رد می‌شوند. وسوسهٔ ساختنِ نقشهٔ کار در
   * کلاینت هست و درست نیست: آن‌وقت دو جا می‌دانند «اجرا یعنی چه» و دیر یا
   * زود یکی‌شان عقب می‌ماند.
   */
  const QUICK = [
    { label: 'تست‌ها را بگیر', text: 'همهٔ تست‌ها را بگیر', hint: 'سناریوهای موجود' },
    { label: 'برو بگرد', text: 'برو بگرد و همه‌جا را کشف کن', hint: 'خزشِ خودکار' },
    { label: 'گشتِ زنده', text: 'گشتِ زنده برویم', hint: 'خودم نشانت می‌دهم' },
  ];

  async function ask(sentence) {
    thinking = true;
    error = '';
    result = null;
    try {
      const response = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target, text: sentence }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'نفهمیدم');
      result = payload;
    } catch (cause) {
      error = cause.message;
    } finally {
      thinking = false;
    }
  }

  function confirm() {
    const plan = result?.plan;
    if (!plan) return;
    // «گشت» و «یافته‌ها» اجرا نیستند، مقصدند
    if (plan.goto) return void goto(`${base}/${plan.goto}`);
    onRun?.(plan.job);
    result = null;
    text = '';
  }

  const RISK = {
    high: { label: 'داده می‌سازد', class: 'bg-destructive/10 text-destructive' },
    medium: { label: 'مدل صدا می‌زند', class: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
    low: { label: 'کم‌خطر', class: 'bg-muted text-muted-foreground' },
    none: { label: '', class: '' },
  };
</script>

<section class="mb-6 rounded-xl border bg-card p-4">
  <form
    class="flex flex-wrap items-center gap-2"
    onsubmit={(event) => {
      event.preventDefault();
      if (text.trim().length > 1) ask(text);
    }}
  >
    <Input
      bind:value={text}
      class="h-10 min-w-56 flex-1"
      placeholder="بگو چه کار کنم — مثلاً: برو بگرد ببین باگی هست"
      disabled={thinking || busy}
    />
    <Button type="submit" class="h-10" disabled={thinking || busy || text.trim().length < 2}>
      {thinking ? 'یک لحظه…' : 'بگو'}
    </Button>
  </form>

  <!-- سه کارِ رایج، بی یک فراخوانی مدل -->
  <div class="mt-3 flex flex-wrap gap-2">
    {#each QUICK as item (item.label)}
      <button
        type="button"
        class="rounded-lg border px-3 py-1.5 text-right text-xs transition-colors hover:bg-accent disabled:opacity-50"
        disabled={thinking || busy}
        onclick={() => ask(item.text)}
      >
        <span class="block font-medium">{item.label}</span>
        <span class="block text-[11px] text-muted-foreground">{item.hint}</span>
      </button>
    {/each}
  </div>

  {#if error}
    <p class="mt-3 text-sm text-destructive">{error}</p>
  {/if}

  {#if result && !result.understood}
    <!-- «نفهمیدم» بن‌بست نیست: همان لحظه فهرستِ کارها را می‌دهد -->
    <div class="mt-3 rounded-lg border border-dashed p-3 text-sm">
      <p class="text-muted-foreground">
        نفهمیدم چه می‌خواهی. یکی از این‌ها؟
        {#if result.why}<span class="text-[11px]">({result.why})</span>{/if}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        {#each result.options as option (option.id)}
          <button
            type="button"
            class="rounded-md border px-2 py-1 text-xs hover:bg-accent"
            onclick={() => ask(option.label)}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if result?.plan}
    <!--
      نقشهٔ کار، پیش از زدن.

      فرمانِ معادلش هم نوشته می‌شود: هم می‌گوید دقیقاً چه قرار است بشود، هم
      یادت می‌دهد همین کار از خط فرمان چه شکلی است — چون این ابزار هیچ‌چیزِ
      فقط-رابطی ندارد.
    -->
    <div class="mt-3 rounded-lg border bg-background p-3">
      <div class="flex flex-wrap items-center gap-2">
        <strong class="text-sm">{result.plan.label}</strong>
        {#if RISK[result.plan.risk]?.label}
          <span class={`rounded-md px-1.5 py-0.5 text-[11px] ${RISK[result.plan.risk].class}`}>
            {RISK[result.plan.risk].label}
          </span>
        {/if}
        <span class="text-[11px] text-muted-foreground">
          {result.by === 'model' ? 'با کمکِ مدل' : result.why}
        </span>
      </div>

      <p class="mt-1.5 text-sm leading-6 text-muted-foreground">{result.plan.summary}</p>

      {#if result.plan.command}
        <code dir="ltr" class="mt-2 block overflow-x-auto rounded-md bg-muted px-2 py-1.5 font-mono text-[11px]">
          {result.plan.command}
        </code>
      {/if}

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onclick={confirm} disabled={busy}>
          {result.plan.goto ? 'برویم' : 'بزن'}
        </Button>
        <Button size="sm" variant="ghost" onclick={() => { result = null; }}>انصراف</Button>

        {#if result.confidence === 'low' && result.alternatives?.length}
          <span class="text-[11px] text-muted-foreground">یا شاید:</span>
          {#each result.alternatives as option (option.id)}
            <button
              type="button"
              class="rounded-md border px-2 py-1 text-[11px] hover:bg-accent"
              onclick={() => ask(option.label)}
            >
              {option.label}
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</section>
