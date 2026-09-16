<script>
  /**
   * یک قابلیت، از همهٔ زاویه‌ها — در یک پنل.
   *
   * ── چرا این پنل قلبِ طراحیِ تازه است ──
   *
   * چهار پرسشی که کاربر داشت، تا امروز در چهار صفحهٔ متفاوت جواب می‌گرفتند
   * و هیچ‌کدام دربارهٔ **یک چیزِ مشخص** نبود:
   *
   *   «این بخش چیست»            صفحهٔ کشف، جدولِ تختِ جاها
   *   «چند سناریو دارد»         صفحهٔ مأموریت‌ها، فهرستِ فایل‌ها
   *   «چند بار اجرا شده»        صفحهٔ اجرا، تاریخچه
   *   «چه ایرادی داشته»         تریاژ
   *
   * برای فهمیدنِ وضعیتِ «خواندن کتاب» باید هر چهار صفحه را باز می‌کردی و
   * خودت به هم می‌چسباندی. اینجا یک ردیف کلیک می‌شود و هر چهار جواب
   * می‌آید.
   *
   * ── چرا پنلِ کناری و نه صفحهٔ جدا ──
   *
   * درخت خودش جهت‌یاب است. رفتن به صفحهٔ دیگر یعنی باز کردنِ دوبارهٔ همان
   * شاخه‌ها موقعِ برگشت — و در اپی با دویست قابلیت، آن یعنی گم شدن.
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { faDigits, formatDate, formatNumber } from '$lib/format.js';

  let { node, target, busy = false, onEdit, onReset, onClose, onRun, onQuest } = $props();

  let base = $derived(`/projects/${encodeURIComponent(target)}`);

  /**
   * زاویه‌های آزمون — «برای این قابلیت چند سناریو لازم است؟»
   *
   * ── چرا با کلیک می‌آیند و نه با صفحه ──
   *
   * حسابشان `map.json` را می‌خواند و والدِ هر حالت را پیدا می‌کند. انجامش
   * برای همهٔ گره‌ها در هر بار باز شدنِ صفحه، خواندنِ چند مگابایت است برای
   * چیزی که کاربر شاید به یکی‌اش نگاه کند.
   */
  let angles = $state([]);
  let anglesFor = $state('');
  let anglesBusy = $state(false);

  $effect(() => {
    const id = node?.id;
    if (!id || anglesFor === id) return;
    anglesFor = id;
    angles = [];
    anglesBusy = true;
    fetch('/api/capabilities', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
      body: JSON.stringify({ target, action: 'angles', id }),
    })
      .then((response) => response.json())
      .then((payload) => {
        /** گرهِ عوض‌شده وسطِ راه: جوابِ کهنه نباید روی گرهِ تازه بنشیند. */
        if (anglesFor === id) angles = payload.angles || [];
      })
      .catch(() => {
        if (anglesFor === id) angles = [];
      })
      .finally(() => {
        if (anglesFor === id) anglesBusy = false;
      });
  });

  /**
   * ساخت از همان مسیرِ متن→YAML که پیشنهادها می‌روند.
   *
   * یک مسیرِ ساخت، نه دو تا — همان قاعده‌ای که `propose.js` رویش اصرار
   * دارد. مقدمهٔ قطعی (مسیرِ رسیدن، از نقشه) در آدرس نمی‌آید؛ متن کافی
   * است، چون خودِ متن می‌گوید کجا باید باز شود.
   */
  const composeHref = (angle) => `${base}/files?compose=${encodeURIComponent(angle.text)}`;

  let editing = $state(false);
  let title = $state('');
  let desc = $state('');
  let saving = $state(false);
  let error = $state('');

  /**
   * فرم با هر گره از نو پر می‌شود.
   *
   * بی این، باز کردنِ قابلیتِ دوم عنوانِ اولی را نشان می‌داد — و ذخیره‌اش
   * نامِ یک قابلیت را روی قابلیتِ دیگری می‌نوشت.
   */
  $effect(() => {
    const id = node?.id;
    if (!id) return;
    editing = false;
    title = node.title || '';
    desc = node.desc || '';
    error = '';
  });

  async function save() {
    saving = true;
    error = '';
    try {
      await onEdit?.({ id: node.id, title, desc });
      editing = false;
    } catch (cause) {
      error = cause.message;
    } finally {
      saving = false;
    }
  }

  async function mark(status) {
    saving = true;
    error = '';
    try {
      await onEdit?.({ id: node.id, status });
    } catch (cause) {
      error = cause.message;
    } finally {
      saving = false;
    }
  }

  const BY = { crawl: 'خزش', tour: 'گشت', source: 'سورس', derived: 'ساختار' };

  /**
   * «کجا» به زبانِ آدم.
   *
   * مسیرِ خام برای نما گمراه‌کننده است: `/contents` می‌گوید صفحه، در حالی
   * که این یک مودال **داخلِ** آن صفحه است.
   */
  let where = $derived(node?.view ? `${node.route} ▸ ${node.view}` : node?.route || '');

  /**
   * نمونهٔ واقعی، وقتی مسیر شناسه دارد.
   *
   * `/content/:id` بی مثال یک الگوی انتزاعی است؛ با مثال می‌شود چیزی که
   * می‌شود در مرورگر باز کرد.
   */
  let sample = $derived((node?.samples || []).find((one) => one !== node.route) || '');
</script>

{#if node}
  <aside
    class="scroll-thin sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border bg-card p-4"
  >
    <div class="mb-3 flex items-start justify-between gap-2">
      <div class="min-w-0">
        {#if editing}
          <Input bind:value={title} class="h-8" maxlength="80" placeholder="نامِ این قابلیت" />
        {:else}
          <h2 class="text-base font-bold break-words">{node.title}</h2>
        {/if}
        <p dir="ltr" class="mt-1 text-start font-mono text-[11px] break-all text-muted-foreground">
          {where}
        </p>
        {#if sample}
          <p dir="ltr" class="text-start font-mono text-[10px] break-all text-muted-foreground/70">
            مثلاً {sample}
          </p>
        {/if}
      </div>
      <Button variant="ghost" size="icon" class="size-7 shrink-0" onclick={onClose} aria-label="بستن">✕</Button>
    </div>

    <!--
      از کجا می‌دانیم — روی هر گره، نه در یک جدولِ جدا.

      همان قاعدهٔ پروندهٔ شناخت: بندی که نگوید از کجا آمده، حدسِ یک مدلِ
      ارزان و جملهٔ خودِ آدم را هم‌وزن نشان می‌دهد.
    -->
    <div class="mb-3 flex flex-wrap items-center gap-1.5">
      {#each node.by as source (source)}
        <Badge variant={source === 'source' ? 'outline' : 'secondary'} class="text-[10px]">
          {BY[source] || source}
        </Badge>
      {/each}
      {#if node.edited}<Badge class="text-[10px]">نامش را خودتان گذاشته‌اید</Badge>{/if}
      {#if node.missing}
        <Badge variant="outline" class="text-[10px] text-amber-600 dark:text-amber-400">
          در آخرین کشف دیده نشد
        </Badge>
      {/if}
    </div>

    {#if editing}
      <Textarea bind:value={desc} rows="3" class="mb-2 text-xs" placeholder="این قابلیت چه کار می‌کند؟" maxlength="500" />
      <div class="mb-4 flex gap-2">
        <Button size="sm" disabled={saving} onclick={save}>{saving ? 'ذخیره…' : 'ذخیره'}</Button>
        <Button size="sm" variant="ghost" disabled={saving} onclick={() => { editing = false; }}>انصراف</Button>
        {#if node.edited}
          <Button size="sm" variant="ghost" class="ms-auto text-muted-foreground" disabled={saving} onclick={() => onReset?.(node.id)}>
            برگردان به کشف‌شده
          </Button>
        {/if}
      </div>
    {:else}
      <p class="mb-3 text-xs leading-6 text-muted-foreground">
        {node.desc || 'توضیحی ثبت نشده.'}
        <button type="button" class="underline underline-offset-2" onclick={() => { editing = true; }}>ویرایش</button>
      </p>
    {/if}

    {#if error}<p class="mb-3 text-xs text-destructive">{error}</p>{/if}

    <!--
      ── چرا نما و صفحه دو جدولِ متفاوت دارند ──

      رخدادِ اجرا فقط `route` دارد و نما را نمی‌شناسد. پس «۱۱ اجرا» برای یک
      مودال یعنی عددِ صفحهٔ میزبان، که دروغ است — و بدترین نوعش، چون چیزی
      را آزموده نشان می‌دهد که نیست.

      آنچه دربارهٔ یک نما واقعاً می‌دانیم از خزش می‌آید: چند تا از کنش‌هایش
      امتحان شده. همان را می‌گوییم.
    -->
    <dl class="mb-4 space-y-2 border-t pt-3 text-xs">
      {#if node.view}
        <div class="flex items-baseline justify-between gap-2">
          <dt class="text-muted-foreground">کنشِ امتحان‌شده</dt>
          <dd class={node.actions && !node.tried ? 'font-bold text-amber-600 dark:text-amber-400' : 'font-medium'}>
            {node.actions ? `${formatNumber(node.tried)} از ${formatNumber(node.actions)}` : '—'}
          </dd>
        </div>
        {#if node.actions && !node.tried}
          <p class="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 leading-6">
            خزش هیچ‌یک از کنش‌های این نما را نزده — عملاً هرگز باز نشده.
          </p>
        {/if}
        <p class="text-[11px] leading-5 text-muted-foreground">
          شمارِ اجرا و سناریو برای نما وجود ندارد: رخدادِ اجرا فقط مسیر را
          می‌شناسد، نه نما. عددهای
          <code class="font-mono">{node.route}</code>
          مالِ صفحهٔ میزبان است، نه این مودال.
        </p>
      {:else}
        <div class="flex items-baseline justify-between gap-2">
          <dt class="text-muted-foreground">سناریو</dt>
          <dd class={node.counts.scenarios.length ? 'font-medium' : 'font-bold text-amber-600 dark:text-amber-400'}>
            {node.counts.scenarios.length ? formatNumber(node.counts.scenarios.length) : 'هیچ'}
          </dd>
        </div>
        <div class="flex items-baseline justify-between gap-2">
          <dt class="text-muted-foreground">اجرا</dt>
          <dd class="font-medium">{formatNumber(node.counts.runs)}</dd>
        </div>
        <div class="flex items-baseline justify-between gap-2">
          <dt class="text-muted-foreground">یافته</dt>
          <dd class={node.counts.openFindings ? 'font-medium text-destructive' : 'font-medium'}>
            {node.counts.findings
              ? `${formatNumber(node.counts.findings)}${node.counts.openFindings ? ` · ${formatNumber(node.counts.openFindings)} باز` : ''}`
              : '—'}
          </dd>
        </div>
        {#if node.counts.lastAt}
          <div class="flex items-baseline justify-between gap-2">
            <dt class="text-muted-foreground">آخرین بار</dt>
            <dd class="font-medium">{formatDate(node.counts.lastAt)}</dd>
          </div>
        {/if}
      {/if}

      {#if node.actions && !node.view}
        <div class="flex items-baseline justify-between gap-2">
          <dt class="text-muted-foreground">کنشِ امتحان‌شده</dt>
          <dd class="font-medium">{formatNumber(node.tried)} از {formatNumber(node.actions)}</dd>
        </div>
      {/if}
      {#if node.contract}
        <div class="flex items-baseline justify-between gap-2">
          <dt class="text-muted-foreground">قرارداد</dt>
          <dd class="font-medium">{formatNumber(node.contract)} بند</dd>
        </div>
      {/if}
    </dl>

    {#if node.counts.scenarios.length}
      <!--
        سناریوها با نام، نه فقط با عدد.

        «۳ سناریو» به کسی نمی‌گوید کدام سه‌تا — و همان لحظه‌ای که آدم
        می‌خواهد یکی را اجرا کند، عدد بی‌فایده است.
      -->
      <div class="mb-4 border-t pt-3">
        <p class="mb-2 text-xs font-semibold">سناریوهایی که اینجا را لمس کرده‌اند</p>
        <ul class="space-y-1">
          {#each node.counts.scenarios as name (name)}
            <li class="flex items-center gap-2 text-xs">
              <span class="min-w-0 flex-1 truncate">{name}</span>
              <button
                type="button"
                class="shrink-0 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                disabled={busy}
                onclick={() => onRun?.([name])}
              >
                اجرا
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!--
      «چه سناریوهایی برای این لازم است؟»

      ── چرا این بخش از فهرستِ پیشنهادها جداست ──

      `propose.js` دنبالِ **شکاف** است: روتی که هیچ سناریویی ندارد. با
      نخستین سناریو ساکت می‌شود، چون شکاف پر شده. ولی یک قابلیت با یک
      سناریو، از یک زاویه آزموده شده و از پنج زاویه نه.

      اینجا همان پنج زاویه است — و هر کدام شاهدِ خودش را دارد، وگرنه
      فهرستی می‌شود که دو بار چیزِ بی‌ربط بدهد و بارِ سوم بسته شود.
    -->
    <div class="mb-4 border-t pt-3">
      <p class="mb-2 text-xs font-semibold">
        چه سناریوهایی برای این لازم است؟
        {#if angles.length}
          <span class="font-normal text-muted-foreground">({formatNumber(angles.length)} زاویه)</span>
        {/if}
      </p>

      {#if anglesBusy}
        <p class="text-[11px] text-muted-foreground">در حال حساب کردن…</p>
      {:else if !angles.length}
        <p class="text-[11px] leading-5 text-muted-foreground">
          از ساختارِ این نما چیزی درنیامد. زاویه‌ها از کنش‌های واقعیِ خزش
          ساخته می‌شوند؛ جایی که خزش نرفته، حدسی هم نمی‌زنیم.
        </p>
      {:else}
        <ul class="space-y-1.5">
          {#each angles as angle (angle.id)}
            <li class="rounded-lg border p-2 {angle.covered ? 'opacity-55' : ''}">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-xs font-medium">
                    {angle.title}
                    {#if angle.covered}
                      <!--
                        «شاید پوشش دارد» و نه «دارد»: تطبیق از روی نامِ
                        سناریوست و نامِ سناریو همیشه کارش را نمی‌گوید.
                        ادعای قطعی اینجا یعنی زاویه‌ای که لازم است پنهان
                        بماند.
                      -->
                      <span class="text-[10px] font-normal text-muted-foreground">· شاید پوشش دارد</span>
                    {/if}
                  </p>
                  <p class="text-[11px] leading-5 text-muted-foreground">{angle.why}</p>
                  <p class="text-[10px] leading-4 text-muted-foreground/70">شاهد: {faDigits(angle.evidence)}</p>
                </div>
                <Button size="sm" variant="outline" class="h-7 shrink-0 text-[11px]" href={composeHref(angle)}>
                  بساز
                </Button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!--
      کارها — با دامنهٔ از پیش پر.

      ── چرا این مهم‌ترین قسمتِ پنل است ──

      تا امروز برای «فقط این بخش را بگرد» باید به صفحهٔ کشف می‌رفتی، حالتِ
      محدود را می‌زدی، و مسیر را دستی می‌نوشتی. حالا گره خودش می‌داند کجاست.
    -->
    <div class="space-y-2 border-t pt-3">
      <Button
        size="sm"
        class="w-full"
        disabled={busy}
        onclick={() => onQuest?.(node)}
      >
        بگرد اینجا
      </Button>
      <div class="grid grid-cols-2 gap-2">
        <!--
          ── چرا این دکمه دیگر «سناریو بساز» نیست ──

          بود، و به فهرستِ مأموریت‌ها می‌رفت — یعنی کاربر از یک قابلیتِ مشخص
          به یک فهرستِ عمومی پرت می‌شد و باید خودش دوباره پیدایش می‌کرد.
          ساختِ سناریو حالا بالاتر است، کنارِ همان زاویه‌ای که می‌خواهد.
        -->
        <Button size="sm" variant="outline" href={`${base}/missions`}>همهٔ سناریوها</Button>
        <Button
          size="sm"
          variant="outline"
          href={`${base}/triage?place=${encodeURIComponent(node.route)}`}
          disabled={!node.counts.findings}
        >
          ایرادهایش
        </Button>
      </div>

      <!--
        «حذف شده» — تصمیمِ آدم، نه حدسِ ابزار.

        استخراج هرگز این را نمی‌زند: نبودنِ یک گره در خزشِ امروز صد دلیل
        دارد که هیچ‌کدام حذف شدن نیست. ولی وقتی **شما** می‌دانید فیچر رفته،
        باید راهی باشد که ابزار دیگر سراغش نرود و در «بی‌سناریو» نشمردش.
      -->
      {#if node.status === 'gone'}
        <Button size="sm" variant="ghost" class="w-full" disabled={saving} onclick={() => mark('active')}>
          برگردان — هنوز هست
        </Button>
      {:else}
        <Button size="sm" variant="ghost" class="w-full text-muted-foreground" disabled={saving} onclick={() => mark('gone')}>
          این دیگر در اپ نیست
        </Button>
      {/if}
    </div>

    <p class="mt-3 border-t pt-2 text-[10px] text-muted-foreground">
      شناسه: <code class="font-mono">{node.id}</code> ·
      از خط فرمان: <code class="font-mono" dir="ltr">userbug capabilities {target} --set {node.id} --title …</code>
    </p>
  </aside>
{/if}
