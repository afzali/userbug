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

  let { node, target, busy = false, onEdit, onReset, onClose, onRun, onQuest, onFeats, featNote = '', hasFeats = false } = $props();

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
    /**
     * فیچر زاویه ندارد — هنوز.
     *
     * `anglesFor` کنش‌های **صفحه** را می‌خواند، پس پرسیدنش برای یک فیچر
     * زاویه‌های کلِ صفحه را برمی‌گرداند و زیرِ نامِ «هایلایت» می‌نشاند.
     * جوابِ دقیقاً غلط، بدتر از جوابِ نداشتن است.
     */
    if (node.feature) return;
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
  let confirming = $state(false);
  let reach = $state('');

  /**
   * تأییدِ آدم که گرهِ مشکوک واقعاً هست.
   *
   * `confirmed` و `reach` هر دو `by: user` می‌شوند و هیچ استخراجی بعداً
   * عوضشان نمی‌کند — همان قاعده‌ای که نامِ دستی رویش بنا شده.
   */
  async function confirm() {
    saving = true;
    error = '';
    try {
      await onEdit?.({ id: node.id, confirmed: true, reach });
      confirming = false;
      reach = '';
    } catch (cause) {
      error = cause.message;
    } finally {
      saving = false;
    }
  }
  let title = $state('');
  let desc = $state('');
  /**
   * «کارِ درستش چیست» — تنها جای این ابزار که انتظار به زبانِ آدم نوشته
   * می‌شود.
   *
   * کاربر گفت: «وقتی فلان اکت شد باید این‌جوری بشه». امروز سناریو فقط
   * می‌گوید چه کن، نه چه باید ببینی — و بی آن، هر اجرا فقط می‌تواند
   * خطای صریح را ببیند، نه کارِ غلطِ بی‌خطا.
   *
   * اینجا کوچک شروع می‌شود: یک جمله، روی فیچر، که مستقیم به prompt
   * سناریو می‌رود.
   */
  let expected = $state('');
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
    confirming = false;
    reach = '';
    title = node.title || '';
    desc = node.desc || '';
    expected = node.expected || '';
    error = '';
  });

  async function save() {
    saving = true;
    error = '';
    try {
      await onEdit?.({ id: node.id, title, desc, ...(node.feature ? { expected } : {}) });
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

  const BY = { crawl: 'خزش', tour: 'گشت', source: 'سورس', derived: 'ساختار', user: 'خودتان', model: 'حدسِ مدل' };

  /**
   * «کجا» به زبانِ آدم.
   *
   * مسیرِ خام برای نما گمراه‌کننده است: `/contents` می‌گوید صفحه، در حالی
   * که این یک مودال **داخلِ** آن صفحه است.
   */
  let where = $derived(
    (node?.view ? `${node.route} ▸ ${node.view}` : node?.route || '') +
      /** هش جای دقیق‌ترِ یک فیچر است — `#notes` با `#search` دو جای متفاوتند. */
      (node?.hash ? ` #${node.hash}` : '')
  );

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
      <!--
        نامِ مدل و نامِ آدم یک‌شکل دیده نمی‌شوند.

        بی این، شش ماه بعد کسی نمی‌داند «قفسهٔ کتاب‌ها» را خودش نوشته یا
        یک مدلِ ارزان حدس زده — و تفاوتشان همان چیزی است که تصمیم می‌گیرد
        رویش حساب کنی یا نه.
      -->
      {#if node.titleBy === 'user'}
        <Badge class="text-[10px]">نامش را خودتان گذاشته‌اید</Badge>
      {:else if node.titleBy === 'model'}
        <Badge variant="outline" class="text-[10px]">نامش را مدل ساخته</Badge>
      {/if}
      {#if node.missing}
        <Badge variant="outline" class="text-[10px] text-amber-600 dark:text-amber-400">
          در آخرین کشف دیده نشد
        </Badge>
      {/if}
    </div>

    {#if editing}
      <Textarea bind:value={desc} rows="3" class="mb-2 text-xs" placeholder="این قابلیت چه کار می‌کند؟" maxlength="500" />
      {#if node.feature}
        <!--
          «کارِ درستش چیست» — و چرا فقط روی فیچر.

          روی یک صفحه این سوال جوابِ روشنی ندارد («صفحهٔ کتاب باید چه
          بکند؟»). روی یک فیچر دارد: «وقتی متن را انتخاب کردم و هایلایت
          زدم، باید رنگی بماند حتی بعد از رفرش». همان جمله‌ای است که
          سناریو می‌تواند ادعایش را از رویش بسازد.
        -->
        <label class="mb-2 block">
          <span class="mb-1 block text-[11px] font-semibold">کارِ درستش چیست؟</span>
          <Textarea
            bind:value={expected}
            rows="3"
            class="text-xs"
            placeholder="وقتی … شد، باید … شود"
            maxlength="500"
          />
        </label>
      {/if}
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

    {#if node.feature && !editing}
      {#if node.expected}
        <div class="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <p class="text-[11px] font-semibold">کارِ درستش</p>
          <p class="mt-1 text-xs leading-6">{node.expected}</p>
        </div>
      {:else}
        <p class="mb-4 rounded-lg border border-dashed p-2.5 text-[11px] leading-6 text-muted-foreground">
          هنوز ننوشته‌اید کارِ درستِ این فیچر چیست. با آن، سناریو می‌تواند
          ادعا هم داشته باشد، نه فقط کلیک.
        </p>
      {/if}

      {#if node.actions?.length}
        <div class="mb-4 border-t pt-3">
          <p class="mb-1.5 text-[11px] text-muted-foreground">از این عناصر ساخته شده:</p>
          <div class="flex flex-wrap gap-1">
            {#each node.actions as one (one)}
              <Badge variant="outline" class="text-[10px]">{one}</Badge>
            {/each}
          </div>
        </div>
      {/if}
    {/if}

    {#if error}<p class="mb-3 text-xs text-destructive">{error}</p>{/if}

    <!--
      حلِ شک — کاری که فقط آدم می‌تواند بکند.

      ── چرا این بخش لازم بود ──

      اسکنِ سورس یازده روت می‌دهد و خزش به دوتایش می‌رسد. نُه گرهِ باقی
      دو حالتِ کاملاً متفاوت دارند و ابزار نمی‌تواند تفکیکشان کند:

        واقعاً نیست (کدِ مرده، فیچرِ حذف‌شده)
        هست، ولی خزنده راهش را بلد نبود

      تنها کسی که می‌داند شمایید. و «از چه راهی می‌شود رسید» همان چیزی
      است که خزنده نداشت — پس هم شک را برمی‌دارد هم به سناریوی بعدی
      می‌گوید چطور برود.
    -->
    {#if node.feature && node.confidence === 'suspected'}
      <!--
        تأییدِ فیچرِ حدسی — همان قاعده، فرمِ کوتاه‌تر.

        گرهِ مشکوک «از چه راهی می‌شود رسید» می‌خواهد، چون خزنده راه را
        بلد نبوده. فیچر این را لازم ندارد: جایش از قبل معلوم است و
        خزنده همان‌جا بوده. سوال فقط این است که آنچه مدل حدس زده
        واقعاً یک کار است یا نه — و جوابش یک کلیک است.
      -->
      <div class="mb-4 rounded-lg border border-dashed p-2.5">
        <p class="text-xs font-semibold">این را مدل حدس زده</p>
        <p class="mt-1 text-[11px] leading-6 text-muted-foreground">
          از روی کنش‌های این صفحه ساخته شده، نه از چیزی که کسی دیده باشد.
          تا تأییدش نکنید، برایش سناریو خواسته نمی‌شود.
        </p>
        <Button
          size="sm"
          class="mt-2"
          disabled={saving}
          onclick={() => { saving = true; error = ''; Promise.resolve(onEdit?.({ id: node.id, title: node.title })).catch((cause) => { error = cause.message; }).finally(() => { saving = false; }); }}
        >
          بله، این کار هست
        </Button>
      </div>
    {:else if !node.feature && node.confidence === 'suspected'}
      <div class="mb-4 rounded-lg border border-dashed p-2.5">
        <p class="text-xs font-semibold">هنوز کسی اینجا نرفته</p>
        <p class="mt-1 text-[11px] leading-5 text-muted-foreground">
          {node.by.includes('source')
            ? 'سورس می‌گوید این مسیر هست، ولی هیچ گشت و خزشی به آن نرسیده.'
            : 'مدل حدس زده که این هست؛ هنوز دیده نشده.'}
          یا واقعاً نیست، یا هست و خزنده راهش را بلد نبود — و این را فقط
          شما می‌دانید.
        </p>

        {#if confirming}
          <Input
            bind:value={reach}
            class="mt-2 h-8 text-xs"
            maxlength="300"
            placeholder="از چه راهی می‌شود رسید؟ مثلاً: منوی کاربر ← تنظیمات پیشرفته"
          />
          <div class="mt-2 flex gap-2">
            <Button size="sm" disabled={saving} onclick={confirm}>
              {saving ? 'ذخیره…' : 'هست — ثبت کن'}
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onclick={() => { confirming = false; }}>انصراف</Button>
          </div>
          <p class="mt-1 text-[10px] leading-5 text-muted-foreground">
            جمله اختیاری است ولی بی آن، تأیید فقط یک تیک است — دفعهٔ بعد
            هم کسی نمی‌داند چطور به اینجا برسد.
          </p>
        {:else}
          <div class="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={saving} onclick={() => { confirming = true; }}>
              هست، من دیده‌ام
            </Button>
            <Button size="sm" variant="ghost" class="text-muted-foreground" disabled={saving} onclick={() => mark('gone')}>
              نیست، حذفش کن
            </Button>
          </div>
        {/if}
      </div>
    {:else if !node.feature && node.confirmedBy === 'user'}
      <div class="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
        <p class="text-xs">
          <strong>شما تأیید کرده‌اید که اینجا هست.</strong>
          {#if node.reach}<span class="block text-[11px] text-muted-foreground">راهش: {node.reach}</span>{/if}
        </p>
      </div>
    {/if}

    <!--
      شمارش و زاویه، فقط برای صفحه و نما.

      فیچر هنوز هیچ‌کدام را ندارد: رخدادِ اجرا فیچر را نمی‌شناسد و
      `anglesFor` کنش‌های کلِ صفحه را می‌خواند. نشان دادنِ هر دو زیرِ نامِ
      یک فیچر، عددِ قرضی است — همان اشتباهی که یک بار روی نماها رخ داد و
      مودالی که هرگز باز نشده بود «۳ سناریو · ۱۱ اجرا» می‌گفت.
    -->
    {#if !node.feature}
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

    {#if node.counts.planned?.length}
      <!--
        سناریوی نوشته‌شده که هنوز اجرا نشده.

        ── چرا این بخش لازم بود ──

        با ساختنِ `nepi4` کلِ حلقه را رفتم: قابلیت ← زاویه ← بساز ← ذخیره.
        فایل ساخته شد و **هیچ‌جا دیده نشد** — درخت همان «بی‌سناریو» را
        می‌گفت. کاربری که همه‌چیز را درست انجام دهد و صفر بازخورد بگیرد،
        دفعهٔ بعد امتحانش نمی‌کند.

        و پیش‌نویس باید بگوید که **اجرا نمی‌شود**: تا رسمی نشود،
        `loadScenarios` برش نمی‌دارد و در فرمِ بررسی هم نمی‌آید. سکوت
        دربارهٔ این یعنی کاربر منتظرِ نتیجه‌ای می‌ماند که هرگز نمی‌آید.
      -->
      <div class="mb-4 rounded-lg border border-sky-500/40 bg-sky-500/5 p-2.5">
        <p class="text-xs font-semibold">
          {formatNumber(node.counts.planned.length)} سناریو نوشته شده، هنوز اجرا نشده
        </p>
        <ul class="mt-1 space-y-1">
          {#each node.counts.planned as one (one.path)}
            <li class="flex items-center gap-2 text-xs">
              <span class="min-w-0 flex-1 truncate">{one.name}</span>
              {#if one.draft}<Badge variant="outline" class="shrink-0 text-[10px]">پیش‌نویس</Badge>{/if}
              <a
                class="shrink-0 text-[11px] underline underline-offset-2 text-muted-foreground hover:text-foreground"
                href={`${base}/files?kind=scenario&relative=${encodeURIComponent(one.path)}`}
              >
                باز کن
              </a>
            </li>
          {/each}
        </ul>
        {#if node.counts.planned.some((one) => one.draft)}
          <p class="mt-1.5 text-[11px] leading-5 text-muted-foreground">
            پیش‌نویس تا <strong>رسمی</strong> نشود اجرا نمی‌شود — نه در فرمِ بررسی
            می‌آید و نه رگرسیون شمرده می‌شود. بازش کنید، بازبینی کنید، و
            «رسمی‌اش کن» را بزنید.
          </p>
        {/if}
      </div>
    {/if}

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

    {/if}

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

      <!--
        «این صفحه چه کارهایی دارد؟» — لایهٔ سومِ درخت، با دکمه.

        ── چرا اینجا و نه بالای صفحه ──

        این تنها دکمهٔ پنل است که پول خرج می‌کند، و هزینه‌اش صفحه‌به‌صفحه
        است. دکمه‌ای بالای درخت یعنی «برای هر صد صفحه یک فراخوانی» — که
        هیچ‌کس نمی‌زندش. اینجا کاربر روی صفحه‌ای ایستاده که همین حالا
        می‌داند فیچرِ پنهان دارد.
      -->
      {#if !node.feature && !node.shelf}
        <Button
          size="sm"
          variant="outline"
          class="w-full"
          disabled={busy || !node.actions}
          onclick={() => onFeats?.(node, hasFeats)}
        >
          {hasFeats ? 'دوباره دنبالِ فیچر بگرد' : 'این صفحه چه کارهایی دارد؟'}
        </Button>
        {#if !node.actions}
          <p class="text-[11px] leading-6 text-muted-foreground">
            نقشه برای اینجا کنشی ندارد؛ اول یک کشف رویش لازم است.
          </p>
        {/if}
        {#if featNote}<p class="text-[11px] leading-6 text-muted-foreground">{featNote}</p>{/if}
      {/if}
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
      {#if node.feature}
        <!--
          فیچر «حذف شده» نمی‌گیرد، پاک می‌شود.

          `gone` برای گره‌ای است که در فایلِ مشتق می‌ماند و هر استخراج
          دوباره می‌سازدش، پس باید نشانه‌ای داشته باشد که سراغش نروند.
          فیچر در فایلِ خودش است؛ نبودنش یعنی نبودن، و ردیفِ مردهٔ
          نگه‌داشته‌شده فقط شلوغی است.
        -->
        <Button
          size="sm"
          variant="ghost"
          class="w-full text-muted-foreground"
          disabled={saving}
          onclick={() => onReset?.(node.id)}
        >
          {node.confidence === 'suspected' ? 'نه، چنین کاری نداریم' : 'حذفِ این فیچر'}
        </Button>
      {:else if node.status === 'gone'}
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
      شناسه: <code class="font-mono">{node.id}</code>
      <!--
        خطِ فرمان فقط برای گره‌ها.

        `capabilities --set` روی `capabilities.edits.json` می‌نویسد و فیچر
        آنجا نیست. دستوری که کپی شود و کار نکند، بدتر از نبودنش است.
      -->
      {#if !node.feature}
        · از خط فرمان:
        <code class="font-mono" dir="ltr">userbug capabilities {target} --set {node.id} --title …</code>
      {/if}
    </p>
  </aside>
{/if}
