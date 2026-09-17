<script>
  /**
   * درختِ قابلیت‌ها — یک ردیف برای هر بخشِ اپ.
   *
   * ── چرا درخت و نه جدول ──
   *
   * جدولِ «جاهای اپ» تخت بود و روی نپی خوانا: ۱۹ ردیف. روی اپی با دویست
   * صفحه همان جدول می‌شود دویست ردیفِ هم‌شکل که هیچ‌کس در آن چیزی پیدا
   * نمی‌کند — و پیدا شدن، کلِ کاری است که این صفحه باید بکند.
   *
   * ── چرا تیک روی هر ردیف ──
   *
   * «دکمهٔ مادر»: انتخابِ چند شاخه و بعد یک دورِ بررسی روی همان‌ها. تیک
   * روی گرهِ پدر، فرزندانش را هم می‌گیرد — چون آدم وقتی «کتاب‌ها» را
   * انتخاب می‌کند، منظورش همهٔ چیزهای زیرش است، نه فقط صفحهٔ فهرست.
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { formatNumber } from '$lib/format.js';

  let { roots = [], selected = '', picked = new Set(), open = new Set(), onPick, onOpen, onToggle } = $props();

  /**
   * ── چرا نما و صفحه دو ستونِ متفاوت دارند ──
   *
   * رخدادِ اجرا نما را نمی‌شناسد، پس «۱۱ اجرا» روی یک مودال یعنی عددِ
   * صفحهٔ میزبان. آنچه دربارهٔ نما می‌دانیم از خزش می‌آید: چند کنشش امتحان
   * شده. و «۰ از ۲۸» صادق‌ترین چیزی است که می‌شود گفت — یعنی هرگز باز
   * نشده.
   */
  function numbersOf(node) {
    if (node.view) {
      if (!node.actions) return { text: '—', tone: 'text-muted-foreground' };
      return {
        text: `${formatNumber(node.tried)}/${formatNumber(node.actions)} کنش`,
        tone: node.tried ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400',
      };
    }
    if (node.shelf) return { text: '', tone: '' };

    const count = node.counts.scenarios.length;
    if (count) {
      return {
        text: `${formatNumber(count)} سناریو · ${formatNumber(node.counts.runs)} اجرا`,
        tone: 'text-muted-foreground',
      };
    }

    /**
     * سناریوی نوشته‌شده‌ای که هنوز اجرا نشده.
     *
     * ── چرا حالتِ سومی لازم شد ──
     *
     * دو حالت داشتیم: «سناریو دارد» و «بی‌سناریو». کاربری که همین حالا از
     * یک زاویه سناریو ساخته، در هیچ‌کدام نمی‌گنجد — و چون شمارش از
     * **اجراها** می‌آمد، در «بی‌سناریو» می‌ماند. یعنی کارش را می‌کرد و
     * صفحه همان عدد را می‌گفت.
     *
     * «نوشته، نیازموده» هم صادق است هم قدمِ بعدی را نشان می‌دهد.
     */
    const planned = node.counts.planned?.length || 0;
    if (planned) {
      const draft = node.counts.planned.some((one) => one.draft);
      return {
        text: draft ? `${formatNumber(planned)} پیش‌نویس` : `${formatNumber(planned)} نیازموده`,
        tone: 'text-sky-600 dark:text-sky-400',
      };
    }

    /**
     * «رفته‌ایم و نیازموده‌ایم» از «اصلاً نرفته‌ایم» بدتر نیست — ولی یکی
     * نیست. خزش که رویش رفته یعنی می‌دانیم واقعاً وجود دارد.
     */
    return {
      text: node.counts.visits ? 'کشف شده · بی‌سناریو' : 'بی‌سناریو',
      tone: 'text-amber-600 dark:text-amber-400',
    };
  }
</script>

{#snippet row(node, depth)}
  {@const numbers = numbersOf(node)}
  {@const isOpen = open.has(node.id)}
  <li>
    <div
      class={`flex items-center gap-1.5 rounded-lg py-1.5 pe-2 text-sm transition-colors hover:bg-accent/50 ${
        selected === node.id ? 'bg-accent' : ''
      }`}
      style={`padding-inline-start: ${depth * 1.1 + 0.4}rem`}
    >
      <input
        type="checkbox"
        class="size-3.5 shrink-0"
        checked={picked.has(node.id)}
        onchange={() => onPick?.(node)}
        aria-label={`انتخاب ${node.title}`}
      />

      <!--
        دکمهٔ باز و بسته فقط وقتی فرزند هست.

        جای خالی‌اش با یک `span` پر می‌شود، وگرنه برگ‌ها نسبت به شاخه‌ها
        جابه‌جا می‌شوند و ستونِ عنوان دندانه‌دار می‌شود.
      -->
      {#if node.children.length}
        <button
          type="button"
          class="grid size-4 shrink-0 place-items-center text-[10px] text-muted-foreground hover:text-foreground"
          onclick={() => onToggle?.(node.id)}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'بستن' : 'باز کردن'}
        >
          {isOpen ? '▾' : '▸'}
        </button>
      {:else}
        <span class="size-4 shrink-0" aria-hidden="true"></span>
      {/if}

      <button
        type="button"
        class="flex min-w-0 flex-1 items-baseline gap-2 text-start"
        onclick={() => onOpen?.(node)}
      >
        <span
          class={`truncate ${node.shelf ? 'text-muted-foreground' : 'font-medium'} ${
            node.confidence === 'suspected' ? 'opacity-60' : ''
          }`}
        >
          {node.view ? '· ' : ''}{node.title}
        </span>
        {#if node.children.length && !isOpen}
          <span class="shrink-0 text-[10px] text-muted-foreground">({formatNumber(node.children.length)})</span>
        {/if}
        {#if node.edited}
          <span class="shrink-0 text-[10px] text-primary" title="نامش را خودتان گذاشته‌اید">✎</span>
        {/if}
        {#if node.missing}
          <span class="shrink-0 text-[10px] text-amber-600 dark:text-amber-400" title="در آخرین کشف دیده نشد">؟</span>
        {/if}
        <!--
          مشکوک — یک درخت، نه دو.

          ── چرا نشانِ کوچک و نه فهرستِ جدا ──

          وسوسه این بود که «آنچه دیده‌ایم» و «آنچه سورس می‌گوید» دو فهرست
          شوند. آن دقیقاً همان دو درختی است که نباید داشته باشیم.

          پس همان یک درخت، و گرهی که هیچ مرورگری به آن نرسیده کم‌رنگ است و
          یک نشان دارد. حلش هم یک کلیک است: یا خزشِ بعدی می‌رسد، یا شما
          می‌گویید «هست، از این راه».
        -->
        {#if node.confidence === 'suspected'}
          <span
            class="shrink-0 rounded border border-dashed px-1 text-[9px] text-muted-foreground"
            title="فقط سورس یا مدل می‌گوید اینجا هست — هیچ مرورگری هنوز نرسیده"
          >
            مشکوک
          </span>
        {/if}
      </button>

      <span
        dir="ltr"
        class="hidden shrink-0 text-start font-mono text-[10px] text-muted-foreground/70 sm:block"
      >
        {node.view ? '' : node.route}
      </span>

      <span class={`w-32 shrink-0 text-start text-[11px] ${numbers.tone}`}>{numbers.text}</span>

      <span class="w-10 shrink-0 text-start text-[11px]">
        {#if node.counts.openFindings}
          <Badge variant="destructive" class="px-1.5 py-0 text-[10px]">
            {formatNumber(node.counts.openFindings)}
          </Badge>
        {/if}
      </span>
    </div>

    {#if node.children.length && isOpen}
      <ul>
        {#each node.children as child (child.id)}
          {@render row(child, depth + 1)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<ul class="divide-y divide-border/40">
  {#each roots as node (node.id)}
    {@render row(node, 0)}
  {/each}
</ul>
