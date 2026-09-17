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

  let { roots = [], selected = '', picked = new Set(), open = new Set(), onPick, onOpen, onToggle, onReview } = $props();

  /**
   * ── چرا نما و صفحه دو ستونِ متفاوت دارند ──
   *
   * رخدادِ اجرا نما را نمی‌شناسد، پس «۱۱ اجرا» روی یک مودال یعنی عددِ
   * صفحهٔ میزبان. آنچه دربارهٔ نما می‌دانیم از خزش می‌آید: چند کنشش امتحان
   * شده. و «۰ از ۲۸» صادق‌ترین چیزی است که می‌شود گفت — یعنی هرگز باز
   * نشده.
   */
  /**
   * قاعدهٔ یک ردیف: **نام · یک نشان · کی · چند سناریو**. و بس.
   *
   * ── چرا قاعده لازم بود ──
   *
   * کاربر گفت «نه خیلی پرجزئیات». آن جمله خودبه‌خود رعایت نمی‌شود: هر بار
   * که عددِ تازه‌ای پیدا می‌شود (کنش، بازدید، قرارداد، پیش‌نویس) وسوسه
   * هست که یک ستونِ دیگر اضافه شود، و شش ماه بعد همان جدولِ شلوغ را
   * داریم.
   *
   * پس سقف: چهار چیز روی ردیف، بقیه در پنلِ کناری.
   */
  const MARK = {
    broken: { glyph: '✗', tone: 'text-destructive', title: 'ایرادِ باز دارد' },
    ok: { glyph: '✓', tone: 'text-emerald-600 dark:text-emerald-400', title: 'آخرین بررسی سالم بود' },
    planned: { glyph: '◔', tone: 'text-sky-600 dark:text-sky-400', title: 'سناریو دارد ولی هنوز اجرا نشده' },
    never: { glyph: '?', tone: 'text-amber-600 dark:text-amber-400', title: 'هنوز بررسی نشده' },
    none: { glyph: '·', tone: 'text-muted-foreground/50', title: '' },
  };

  function markOf(node) {
    if (node.shelf) return MARK.none;
    /**
     * فیچر هنوز شمارشِ خودش را ندارد — رخدادِ اجرا فیچر را نمی‌شناسد،
     * همان‌طور که نما را نمی‌شناخت. تا آن روز، نشانِ «هنوز بررسی نشده»
     * تنها چیزِ صادقانه است؛ تیکِ قرضیِ صفحهٔ میزبان همان سبزِ دروغینی
     * است که یک بار دیده شد.
     */
    if (node.feature) return MARK.never;
    if (node.counts?.openFindings) return MARK.broken;
    if (node.counts?.runs) return MARK.ok;
    if (node.counts?.planned?.length) return MARK.planned;
    /**
     * نما شمارشِ اجرا ندارد (رخدادِ اجرا نما را نمی‌شناسد)، پس آنچه
     * دربارهٔ آن می‌دانیم از خزش می‌آید: کنشی که امتحان شده یا نشده.
     */
    if (node.view && node.tried) return MARK.ok;
    return MARK.never;
  }

  /** «کی» — کوتاه‌ترین شکلِ ممکن، چون فقط یک ستون جا دارد. */
  function whenOf(node) {
    const at = node.counts?.lastAt;
    if (!at) return '';
    const days = Math.floor((Date.now() - Date.parse(at)) / 86_400_000);
    if (Number.isNaN(days)) return '';
    if (days <= 0) return 'امروز';
    if (days === 1) return 'دیروز';
    if (days < 30) return `${formatNumber(days)} روز پیش`;
    return `${formatNumber(Math.floor(days / 30))} ماه پیش`;
  }

  /** «چند سناریو» — و صفر یک خبر است، پس پنهان نمی‌شود. */
  function scenariosOf(node) {
    if (node.shelf) return '';
    /**
     * فیچرِ حدسی «بی‌سناریو»ی زرد نمی‌گیرد.
     *
     * زرد یعنی «اینجا کار هست، برو بساز». ولی فیچری که فقط مدل گفته،
     * اول باید تأیید شود — سناریو ساختن برای چیزی که شاید اصلاً وجود
     * نداشته باشد، کارِ اضافه است نه کارِ عقب‌افتاده.
     */
    /** نشانِ «مشکوک» همین را می‌گوید؛ دو بار گفتنش فقط ستون را پر می‌کند. */
    if (node.feature) return node.confidence === 'suspected' ? '' : 'بی‌سناریو';
    if (node.view) return node.actions ? `${formatNumber(node.tried)}/${formatNumber(node.actions)} کنش` : '';
    const count = node.counts?.scenarios?.length || 0;
    const planned = node.counts?.planned?.length || 0;
    if (count) return `${formatNumber(count)} سناریو`;
    if (planned) return `${formatNumber(planned)} نیازموده`;
    return 'بی‌سناریو';
  }

</script>

{#snippet row(node, depth)}
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
        {#if !node.shelf}
          {@const mark = markOf(node)}
          <span class={`shrink-0 text-xs ${mark.tone}`} title={mark.title}>{mark.glyph}</span>
        {/if}
        <span
          class={`truncate ${node.shelf ? 'text-muted-foreground' : 'font-medium'} ${
            node.confidence === 'suspected' ? 'opacity-60' : ''
          }`}
        >
          {node.view ? '· ' : ''}{node.feature ? '◇ ' : ''}{node.title}
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

      <!-- «کی» — یک ستونِ باریک، خالی وقتی هرگز بررسی نشده -->
      <span class="hidden w-20 shrink-0 text-start text-[11px] text-muted-foreground sm:block">
        {whenOf(node)}
      </span>

      <!-- «چند سناریو» — و «بی‌سناریو» زرد است، چون کار می‌سازد -->
      <span
        class={`w-24 shrink-0 text-start text-[11px] ${
          scenariosOf(node) === 'بی‌سناریو' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
        }`}
      >
        {scenariosOf(node)}
      </span>

      <!--
        آیکونِ بررسی روی هر ردیف.

        کاربر گفت: «حتی می‌تواند دکمهٔ بررسی روی روت‌ها و فیچرهایی که داخلِ
        همان صفحه هستند به‌صورت آیکون باشد که سریع رویش کلیک کند».

        دامنه از خودِ ردیف می‌آید، پس هیچ فرمی لازم نیست تا بپرسد «کجا».
      -->
      <button
        type="button"
        class="grid size-6 shrink-0 place-items-center rounded-md text-[11px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        title={`بررسیِ «${node.title}»`}
        aria-label={`بررسیِ ${node.title}`}
        onclick={(event) => { event.stopPropagation(); onReview?.(node); }}
      >
        ▶
      </button>
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
