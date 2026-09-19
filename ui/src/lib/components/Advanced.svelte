<script>
  /**
   * «پیشرفته» — یک جعبه، برای هر کاری که مرورگر باز می‌کند.
   *
   * ── چرا مشترک و نه یکی در هر دیالوگ ──
   *
   * کاربر گفت این تنظیمات «بهتر است در پیشرفته باشد که همان اول دمِ چشمش
   * نباشد». تا دیروز فقط بررسی چنین جعبه‌ای داشت و کشف هیچ — یعنی
   * «نشستِ مرورگر بماند؟»، «حسابِ موجود یا تازه؟»، «از صفر یا ادامه؟»
   * هیچ‌جای رابط پرسیده نمی‌شد و فقط از خط فرمان در دسترس بود.
   *
   * ساختنِ جعبهٔ دومی در کشف، جوابِ ساده بود و جوابِ غلط: دو جعبه یعنی دو
   * واژه‌نامه. «مرورگر دیده شود» در یکی و «headed» در دیگری، و شش ماه بعد
   * کسی نمی‌داند این دو یک چیزند.
   *
   * پس یک جعبه، و هر فراخوان می‌گوید کدام ردیف‌ها را می‌خواهد. ردیف‌ها
   * **دقیقاً** پرچم‌های خط فرمان‌اند: چیزی که اینجا هست، آنجا هم هست.
   *
   * ── چرا شمارنده روی سرِ جعبه ──
   *
   * جعبهٔ بسته‌ای که داخلش تنظیمِ غیرپیش‌فرض دارد، تله است: کاربر «شروع»
   * می‌زند و اجرا کارِ دیگری می‌کند. پس سرِ جعبه می‌گوید چند چیز دست‌کاری
   * شده، حتی وقتی بسته است.
   */
  import { Input } from '$lib/components/ui/input/index.js';
  import ModelPicker from '$lib/components/ModelPicker.svelte';
  import { formatNumber } from '$lib/format.js';

  let {
    /** تنظیمات، دوطرفه. هر ردیفی که در `rows` نباشد دست نمی‌خورد. */
    value = $bindable({}),
    /** کدام ردیف‌ها دیده شوند — به ترتیبِ همین آرایه نه، به ترتیبِ زیر. */
    rows = [],
    /** برای ردیفِ `from`: نامِ سناریوهای موجود. */
    scenarios = [],
    /** برای ردیفِ `remember`: حساب‌های ذخیره‌شدهٔ همین پروژه. */
    accounts = [],
    /** آیا نشستِ مرورگرِ دفعهٔ قبل روی دیسک هست. */
    hasProfile = false,
    /**
     * آیا این کار می‌تواند نشست را از **هیچ** بسازد.
     *
     * گشت می‌تواند: آدم خودش با دست وارد می‌شود. خزش نمی‌تواند — پروفایلِ
     * خالی برایش بی‌فایده است، چون کسی نیست که ورود را پر کند. پس همان
     * گزینه روی یکی همیشه باز است و روی دیگری فقط وقتی نشستی از قبل هست.
     */
    canCreateSession = false,
    /**
     * سناریویی که اگر چیزی انتخاب نشود، **خودش** بازپخش می‌شود.
     *
     * برای کاوش پر است (`map.entry.scenario`) و برای خزش خالی. گزینهٔ
     * خالیِ کشویی تا امروز برای هر دو «هیچ — از خودِ آدرسِ اول شروع کن»
     * بود، که برای کاوش دروغ است: آنجا خالی یعنی «خودکار».
     */
    entryFallback = '',
    disabled = false,
  } = $props();

  /**
   * پیش‌فرضِ هر ردیف — تنها مرجعِ «دست‌کاری شده یا نه».
   *
   * بی این، شمارنده باید حدس بزند؛ و حدسش روزی `repeat: 1` را تغییر
   * حساب می‌کند و شمارنده‌ای که همیشه عددی نشان دهد، همان نشان ندادن است.
   */
  const DEFAULTS = {
    from: '',
    profile: false,
    remember: '',
    fresh: false,
    states: '',
    minutes: '',
    depth: '',
    device: '',
    persona: '',
    model: '',
    repeat: 1,
    headed: false,
  };

  let has = $derived(new Set(rows));

  let changed = $derived(
    rows.filter((key) => {
      const now = value?.[key];
      const base = DEFAULTS[key];
      if (typeof base === 'boolean') return Boolean(now) !== base;
      if (typeof base === 'number') return Number(now || base) !== base;
      return String(now ?? '') !== base;
    }).length
  );

  let open = $state(false);

  /* ───────────── «از کجا شروع کند؟» ───────────── */

  /**
   * یک انتخاب، نه سه تنظیمِ جدا.
   *
   * ── چرا عوض شد ──
   *
   * این جعبه `from` و `profile` را دو کنترلِ مستقل نشان می‌داد و
   * `remember` را اصلاً نداشت. ولی هر سه یک کار می‌کنند: رساندنِ خزنده
   * به حالتِ **وارد‌شده**. کاربر یا هیچ‌کدام را می‌زد و خزش پشتِ صفحهٔ
   * ورود می‌ماند، یا هر سه را.
   *
   * `CrawlPanel` همین درس را گرفته بود و همین شکل را داشت — ولی آن
   * صفحهٔ «خزشِ دقیق» است و درِ پیش‌فرضِ کشف این مودال. یعنی نسخهٔ
   * اصلاح‌شده جایی بود که کمتر کسی می‌رفت.
   *
   * ── چرا پیش‌فرض «نشستِ قبلی» است ──
   *
   * چون اگر نشستی هست، نخواستنش تصمیمِ نادری است و خواستنش کارِ همیشگی.
   * پیش‌فرضِ قبلی (هیچ‌کدام) یعنی خزشی که روی اپِ ورود‌دار به صفحهٔ ورود
   * می‌رسید و همان‌جا می‌ماند — همان چیزی که هشدارِ بالای همین مودال
   * دربارهٔ آن حرف می‌زند.
   *
   * و چون پیش‌فرضِ CLI نیست، شمارندهٔ سرِ جعبه نشانش می‌دهد. این درست
   * است: جعبهٔ بسته‌ای که داخلش تنظیمِ غیرپیش‌فرض دارد باید بگوید.
   */
  let asks = $derived(has.has('profile') || has.has('remember'));

  // svelte-ignore state_referenced_locally
  let startMode = $state(
    hasProfile || canCreateSession ? 'session' : accounts.length ? 'account' : 'fresh'
  );
  // svelte-ignore state_referenced_locally
  let account = $state(accounts[0]?.id || '');

  /**
   * پرچم‌های واقعی از همین انتخاب مشتق می‌شوند — یک منبعِ حقیقت.
   *
   * و در حالتِ «ادامهٔ نشست» مسیرِ ورود فرستاده نمی‌شود: مرورگر از قبل
   * وارد است و بازپخشِ فرمِ ورود روی صفحه‌ای که فرم ندارد، یک شکستِ
   * بی‌دلیل است.
   */
  $effect(() => {
    if (!asks) return;
    value.profile = startMode === 'session';
    value.remember = startMode === 'account' ? account : '';
    if (startMode === 'session') value.from = '';
  });

  /**
   * سه گزینه، و متنِ هرکدام تابعِ کاری است که دارد انجام می‌شود.
   *
   * ── چرا «حساب» فقط گاهی هست ──
   *
   * `--remember` فقط پرچمِ `map` است. گشت آن را ندارد (آدم خودش وارد
   * می‌شود) و کاوش هم نه. گزینه‌ای که پرچم نسازد، کنترلی است که هیچ کاری
   * نمی‌کند و کاربر فکر می‌کند کرد.
   */
  const MODES = $derived(
    [
      {
        key: 'session',
        label: canCreateSession ? 'نشست بماند' : 'ادامهٔ همان نشست',
        hint: canCreateSession
          ? hasProfile
            ? 'همان مرورگرِ ذخیره‌شده باز می‌شود — احتمالاً از قبل واردید. هرچه اینجا تغییر دهید هم می‌ماند و خزشِ بعدی می‌بیندش.'
            : 'هرچه اینجا وارد شوید و بسازید در همین پروژه می‌ماند، و خزشِ بعدی با «ادامهٔ همان نشست» همان را می‌بیند.'
          : 'همان مرورگری که در گشت واردش شدید — نشست و کَش سرِ جایشان‌اند، پس ورود لازم ندارد.',
        /** گشت نشست را **می‌سازد**، پس نبودنِ پروفایل مانعش نیست. */
        off: hasProfile || canCreateSession ? '' : 'نشستی ذخیره نشده. یک گشت با «نشست بماند» بروید.',
      },
      has.has('remember') && {
        key: 'account',
        label: 'با حسابی که دارم',
        hint: 'بارِ اول با این حساب وارد می‌شود و نشستش را نگه می‌دارد.',
        off: accounts.length ? '' : 'حسابی ذخیره نشده. در «دادهٔ آزمون» یکی بسازید.',
      },
      {
        key: 'fresh',
        label: canCreateSession ? 'مرورگرِ موقت' : 'مرورگرِ تازه',
        hint: canCreateSession
          ? 'در پایانِ گشت پاک می‌شود. هرچه اینجا وارد شوید، برای خزشِ بعدی نمی‌ماند.'
          : 'بی نشست و بی حساب. برای اپی که ورود ندارد، یا وقتی می‌خواهید کاربرِ مهمان را ببینید.',
        off: '',
      },
    ].filter(Boolean)
  );
</script>

{#if rows.length}
  <details class="mt-3 rounded-lg border p-2.5" bind:open>
    <summary class="flex cursor-pointer items-center gap-2 text-xs font-medium">
      <span>پیشرفته</span>
      <!--
        تنظیمِ غیرپیش‌فرض، حتی وقتی جعبه بسته است.

        این تنها چیزی است که جعبهٔ جمع‌شونده را از تله بودن درمی‌آورد.
      -->
      {#if changed}
        <span class="rounded-full bg-primary/10 px-1.5 text-[10px] font-normal text-primary">
          {formatNumber(changed)} تنظیم
        </span>
      {/if}
    </summary>

    <div class="mt-3 space-y-3">
      <!--
        «از کجا شروع کند؟» — یک پرسش، سه جواب.

        «هر بار از صفر شروع کردن» بزرگ‌ترین اصطکاکِ خزش روی اپِ ورود‌دار
        است: خزنده به صفحهٔ ورود می‌رسد، حسابی ندارد، و همان‌جا می‌ماند.
        تا دیروز جوابش سه کنترلِ مستقل بود که هیچ‌جا نوشته نبود با هم چه
        می‌کنند — و یکی‌شان (حساب) اصلاً اینجا نبود.
      -->
      {#if asks}
        <fieldset class="space-y-1.5">
          <legend class="mb-1 text-xs font-medium">از کجا شروع کند؟</legend>
          {#each MODES as mode (mode.key)}
            <label
              class={`flex items-start gap-2 rounded-lg border p-2 text-xs ${
                startMode === mode.key ? 'border-primary bg-accent/40' : ''
              } ${mode.off ? 'opacity-60' : ''}`}
            >
              <input
                type="radio"
                class="mt-0.5"
                value={mode.key}
                bind:group={startMode}
                disabled={disabled || Boolean(mode.off)}
              />
              <span class="min-w-0">
                {mode.label}
                <span class="block text-[11px] leading-5 text-muted-foreground">
                  {mode.off || mode.hint}
                </span>

                <!--
                  کشویی داخلِ همان گزینه، نه زیرِ کلِ گروه.

                  «کدام حساب» فقط وقتی پرسیده می‌شود که «با حسابی که دارم»
                  انتخاب شده باشد؛ بیرون از آن، کنترلی است که به جایی وصل
                  نیست.
                -->
                {#if mode.key === 'account' && startMode === 'account' && accounts.length}
                  <select class="app-select mt-1.5" bind:value={account} {disabled}>
                    {#each accounts as one (one.id)}
                      <option value={one.id}>{one.id}{one.email ? ` · ${one.email}` : ''}</option>
                    {/each}
                  </select>
                {/if}
              </span>
            </label>
          {/each}
        </fieldset>
      {/if}

      <!--
        مسیرِ ورود — و چرا زیرِ همان پرسش نشسته.

        این هم راهِ چهارمِ همان کار است: قدم‌های یک سناریو پیش از شروع
        بازپخش می‌شوند. ولی در حالتِ «ادامهٔ نشست» بی‌معناست (مرورگر از
        قبل وارد است) پس همان‌جا ناپدید می‌شود، نه اینکه خاکستری بماند و
        کاربر حدس بزند چرا.
      -->
      {#if has.has('from') && (!asks || startMode !== 'session')}
        <label class="block space-y-1 text-xs">
          <span class="text-muted-foreground">
            {asks ? 'و اول این سناریو را بازپخش کن' : 'اول با این سناریو وارد شو'}
          </span>
          <select class="app-select" bind:value={value.from} {disabled}>
            <option value="">
              {entryFallback
                ? `خودکار — «${entryFallback}» (مسیرِ ورودِ نقشه)`
                : 'هیچ — از خودِ آدرسِ اول شروع کن'}
            </option>
            {#each scenarios as one (one)}
              <option value={one}>{one}</option>
            {/each}
          </select>
          <span class="block text-[11px] leading-5 text-muted-foreground">
            قدم‌های آن سناریو پیش از شروع بازپخش می‌شوند. برای اپی که ورود
            دارد، این تفاوتِ «کلِ اپ» با «فقط صفحهٔ ورود» است.
            <!--
              ── چرا این جمله لازم است ──

              کاوش «ادامهٔ نشست» و «با حسابی که دارم» ندارد و نبودنشان شبیهِ
              جاافتادگی است. ولی نمی‌تواند داشته باشد: کاوش یک سناریو
              می‌سازد و از اجراگرِ معمولی می‌گذراندش، و آن اجراگر پروفایلِ
              ماندگار ندارد — فقط گشت و خزش دارند.

              پس همین ردیف **راهِ ورودِ** کاوش است، و باید بگوید.
            -->
            {#if !asks}
              <!--
                ── چرا «نشستِ قبلی» اینجا نیست، و چه چیزی جایش را می‌گیرد ──

                کاوش یک فایلِ سناریو می‌سازد و از اجراگرِ معمولی
                می‌گذراندش، و آن اجراگر پروفایلِ ماندگار ندارد — عمداً:
                سناریویی که فقط چون مرورگر اتفاقاً وارد بود سبز شود،
                همان سبزِ دروغینی است که این ابزار برای گرفتنش ساخته شده.

                راهِ ورودش بازپخشِ قدم‌هاست، که هم قطعی است هم روی
                ماشینِ دیگر هم کار می‌کند.
              -->
              راهِ ورودِ این کار همین است — نه نشستِ مرورگر، چون خروجی‌اش
              یک سناریوست و سناریو باید از صفر هم کار کند. حساب هم از داخلِ
              خودِ سناریو می‌آید (<code class="font-mono">{'{{account.…}}'}</code>).
            {/if}
          </span>
        </label>
      {/if}

      {#if has.has('fresh')}
        <label class="flex items-start gap-2 border-t pt-3 text-xs">
          <input type="checkbox" bind:checked={value.fresh} class="mt-0.5" {disabled} />
          <span>
            نقشه را از صفر بساز
            <span class="block text-[11px] leading-5 text-muted-foreground">
              دربارهٔ <strong>نقشه</strong> است، نه مرورگر: پیش‌فرض، خزش نقشهٔ
              موجود را ادامه می‌دهد و این گزینه دورش می‌ریزد — وقتی اپ آن‌قدر
              عوض شده که نقشهٔ قدیم گمراه می‌کند.
            </span>
          </span>
        </label>
      {/if}

      {#if has.has('states') || has.has('minutes') || has.has('depth')}
        <div class="grid grid-cols-2 gap-3">
          {#if has.has('states')}
            <label class="block space-y-1 text-xs">
              <span class="text-muted-foreground">سقفِ حالت</span>
              <Input type="number" min="1" max="500" bind:value={value.states} class="h-8" {disabled} />
            </label>
          {/if}
          {#if has.has('minutes')}
            <label class="block space-y-1 text-xs">
              <span class="text-muted-foreground">سقفِ دقیقه</span>
              <Input type="number" min="1" max="120" bind:value={value.minutes} class="h-8" {disabled} />
            </label>
          {/if}
          {#if has.has('depth')}
            <label class="block space-y-1 text-xs">
              <span class="text-muted-foreground">سقفِ قدم</span>
              <Input type="number" min="1" max="100" bind:value={value.depth} class="h-8" {disabled} />
            </label>
          {/if}
          {#if has.has('repeat')}
            <label class="block space-y-1 text-xs">
              <span class="text-muted-foreground">تکرار</span>
              <Input type="number" min="1" max="10" bind:value={value.repeat} class="h-8" {disabled} />
            </label>
          {/if}
        </div>
      {:else if has.has('repeat')}
        <label class="block space-y-1 text-xs">
          <span class="text-muted-foreground">تکرار</span>
          <Input type="number" min="1" max="10" bind:value={value.repeat} class="h-8" {disabled} />
        </label>
      {/if}

      {#if has.has('device')}
        <label class="block space-y-1 text-xs">
          <span class="text-muted-foreground">دستگاه</span>
          <Input bind:value={value.device} dir="ltr" placeholder="desktop" class="h-8" {disabled} />
        </label>
      {/if}

      {#if has.has('persona')}
        <label class="block space-y-1 text-xs">
          <span class="text-muted-foreground">رفتار کاربر</span>
          <select class="app-select" bind:value={value.persona} {disabled}>
            <option value="">پیش‌فرض سناریو</option>
            <option value="novice">تازه‌کار</option>
            <option value="pro">حرفه‌ای</option>
          </select>
        </label>
      {/if}

      {#if has.has('model')}
        <ModelPicker bind:value={value.model} {disabled} />
      {/if}

      {#if has.has('headed')}
        <label class="flex items-center gap-2 text-xs">
          <input type="checkbox" bind:checked={value.headed} {disabled} /> مرورگر دیده شود
        </label>
      {/if}

      <!--
        حساب و فایل — جایشان اینجا نیست، و گفتنش لازم است.

        کاربر گفت «آپلودِ داده و حسابِ کاربری از مسیرهای داخلِ صفحه در
        دسترس باشند، نه از منوی اصلی». پس اینجا فقط اشاره می‌شود که کجا
        تنظیم می‌شوند — وگرنه کسی که دنبالشان است فکر می‌کند وجود ندارند.
      -->
      <p class="border-t pt-2 text-[11px] leading-5 text-muted-foreground">
        حسابِ ذخیره‌شده و فایلِ نمونه در «دادهٔ آزمون» ساخته می‌شوند — و
        سناریو خودش می‌گوید کدام فایل را می‌خواهد.
      </p>
    </div>
  </details>
{/if}
