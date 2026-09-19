<script>
  /**
   * «کشفِ تازه» — یک تصمیم، نه یک حالت.
   *
   * ── چرا مودال و نه رادیوی روی صفحه ──
   *
   * رادیوی قبلی همیشه روی صفحه بود، حتی وقتی گشتی در جریان بود. کاربر
   * گفت: «دستم اشتباهی بخوره به تغییرِ دکمهٔ کشف، استپ می‌خوره و خراب
   * می‌شه». حق داشت — کنترلی که کارِ در جریان را خراب کند، نباید کنارِ
   * همان کار بماند.
   *
   * مودال باز می‌شود، انتخاب می‌کنی، بسته می‌شود. بعدش دیگر **وجود ندارد**
   * که دستت به آن بخورد.
   *
   * ── چرا انتخاب و شروع در یک گام است ──
   *
   * گزینه‌ها گزینه‌های متفاوتِ یک چیزند و انتخابِ راه، خودش تصمیم است.
   * تنظیمِ ریز هست ولی زیرِ «پیشرفته» — و همان جعبه‌ای است که بررسی هم
   * دارد، نه نسخهٔ دومی با واژه‌های دیگر.
   *
   * ── چرا هر راه ردیف‌های خودش را دارد ──
   *
   * کاربر گفت «هر کدام از این انتخاب‌ها تنظیماتِ خاصِ خودش را دارد». و
   * صادقانه‌ترین شکلش این است که ردیف‌ها **همان پرچم‌های خط فرمانِ همان
   * کار** باشند: خزش `--profile` و `--fresh` دارد، کاوشِ محدود ندارد.
   * نشان دادنِ کنترلی که به جایی وصل نیست، بدتر از نبودنش است.
   */
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import Advanced from '$lib/components/Advanced.svelte';
  import { run, startJob } from '$lib/run-store.svelte.js';

  let {
    target,
    project = null,
    scope = null,
    scenarios = [],
    /** حساب‌های ذخیره‌شده و نشستِ مرورگر — ورودیِ «از کجا شروع کند؟». */
    accounts = [],
    hasProfile = false,
    /** سناریوی ورودِ نقشه — پیش‌فرضِ خاموشِ کاوش، نه خزش. */
    mapEntry = '',
    onClose,
    onStarted,
  } = $props();

  /**
   * دامنه، وقتی از درخت آمده‌ایم.
   *
   * ── چرا حالت را هم عوض می‌کند ──
   *
   * کسی که روی «افزودن کتاب» زده و گفته «اینجا را کشف کن»، منظورش خزشِ
   * کلِ اپ نیست. پس وقتی دامنه هست، پیش‌فرض «فقط فلان‌جا» می‌شود و متنش
   * هم از قبل پر است — همان کاری که خودش می‌خواست بنویسد.
   */
  let scoped = $derived(scope && scope.kind !== 'all' ? scope.nodes || [] : []);

  /**
   * راهِ پیش‌فرض، و چرا از بیرون هم می‌آید.
   *
   * `scope.how` را کسی می‌فرستد که از قبل می‌داند کدام راه را می‌خواهد —
   * مثلاً پیوندی که واژهٔ «گشت» را به اینجا آورده. بی این، آن پیوند فقط
   * مودال را باز می‌کرد و کاربر باید دوباره همان چیزی را انتخاب می‌کرد که
   * روی خودِ پیوند نوشته بود.
   */
  // svelte-ignore state_referenced_locally
  let how = $state(scope?.how || 'tour');
  let where = $state('');

  /**
   * دامنه با `$effect` پر می‌شود، نه با مقدارِ اولیهٔ `$state`.
   *
   * ── چرا، و چطور پیدا شد ──
   *
   * `scoped` خودش `$derived` است و وقتی `$state` مقداردهیِ اولیه می‌شود
   * هنوز خالی است. نتیجه: حالت درست انتخاب می‌شد («فقط فلان‌جا») ولی
   * کادرِ متن خالی می‌ماند — یعنی کاربر باید همان چیزی را تایپ می‌کرد که
   * با کلیک روی همان ردیف گفته بود.
   *
   * با `$effect` هم بارِ اول پر می‌شود هم وقتی دامنه عوض شود (مثلاً از
   * دیالوگِ بررسی که به اینجا تحویل می‌دهد).
   */
  let seeded = $state('');
  $effect(() => {
    const key = scoped.map((one) => one.id).join(',');
    if (!scoped.length || seeded === key) return;
    seeded = key;
    how = 'scoped';
    where =
      scoped.length === 1
        ? `${scoped[0].route}${scoped[0].view ? ` و نمای «${scoped[0].view}»` : ''} را کامل بررسی کن`
        : `این بخش‌ها را بررسی کن: ${[...new Set(scoped.map((one) => one.route))].join('، ')}`;
  });
  let busy = $state(false);
  let error = $state('');

  const WAYS = [
    {
      key: 'tour',
      title: 'خودم نشانت می‌دهم',
      hint: 'مرورگر باز می‌شود و شما مثل یک کاربر کار می‌کنید. هرچه کردید ضبط می‌شود — دقیق‌ترین راه، و کندترین.',
    },
    {
      key: 'crawl',
      title: 'خودت برو بگرد',
      hint: 'هر دکمهٔ امنی را می‌زند و می‌نویسد از کجا به کجا می‌رسد. بی هوش مصنوعی.',
      /**
       * همان هشدارِ قدمِ دومِ ساختِ پروژه، در همان لحظهٔ تصمیم.
       *
       * روی یک پروژهٔ تازه همین گزینه زده شد و خزنده از صفحهٔ ورود رد
       * نشد: دو حالت، صفِ صفر. دانشی که فقط در مستندات باشد، در لحظهٔ
       * تصمیم وجود ندارد.
       */
      warn:
        'اگر اپ ورود دارد، خزنده معمولاً روی همان صفحهٔ ورود می‌ماند — چون ' +
        'هنوز حسابی ندارد که با آن وارد شود. اول یک بار «خودم نشانت می‌دهم» ' +
        'بروید و وارد شوید؛ نشست می‌ماند.',
    },
    {
      key: 'scoped',
      title: 'فقط فلان‌جا را بگرد',
      hint: 'می‌گویید کجا، و همان‌جا را عمیق بررسی می‌کند.',
    },
    {
      key: 'source',
      title: 'سورس را بخوان',
      hint: 'رایگان — نه مرورگر می‌خواهد نه مدل. روت، endpoint و قاعده‌های schema از خودِ کد.',
    },
  ];

  let noSource = $derived(how === 'source' && !project?.sourceRoot);

  /**
   * تنظیمات — یک شیء، و ردیف‌هایش تابعِ راهِ انتخاب‌شده.
   *
   * `source` هیچ ردیفی ندارد چون نه مرورگر باز می‌کند نه مدل صدا می‌زند؛
   * جعبهٔ خالی خودش پنهان می‌شود.
   *
   * `tour` هم ندارد: گشت تنظیمش را داخلِ خودش دارد، همان‌جا که کاربر
   * وسطِ کار است و می‌داند چه می‌خواهد.
   */
  let settings = $state({
    from: '',
    profile: false,
    /** با کدام حسابِ ذخیره‌شده وارد شود — تا دیروز اصلاً اینجا نبود. */
    remember: '',
    fresh: false,
    states: '',
    minutes: '',
    depth: '',
    model: '',
    headed: false,
  });

  /**
   * ── چرا `remember` فقط به خزش اضافه شد ──
   *
   * قاعدهٔ این جعبه این است که هر ردیف **دقیقاً** یک پرچمِ خط فرمانِ همان
   * کار باشد. `userbug quest` فقط `--from`، `--depth`، `--model` و
   * `--headed` دارد؛ `--profile` و `--remember` مالِ `map` اند.
   *
   * گذاشتنِ آن‌ها زیرِ «فقط فلان‌جا را بگرد» یعنی دو کنترل که هیچ کاری
   * نمی‌کنند و کاربر فکر می‌کند کردند — بدترین نوعِ ایراد، چون خطا
   * نمی‌دهد.
   */
  /**
   * ── چرا گشت هم `profile` دارد و کاوش ندارد ──
   *
   * `startTour` از اول `profile` می‌پذیرفت و همان پوشه‌ای را می‌گیرد که
   * خزش با `--profile` می‌گیرد. ولی این مودال هیچ‌وقت نمی‌فرستادش، پس
   * **هر گشتی که از اینجا شروع می‌شد پروفایلِ موقت می‌گرفت و در پایان پاک
   * می‌شد** — یعنی دقیقاً آن چیزی که کلِ «اول یک بار گشت برو و وارد شو»
   * رویش بنا شده، کار نمی‌کرد.
   *
   * کاوش ندارد چون **نمی‌تواند**: `quest` یک فایلِ سناریو می‌سازد و از
   * اجراگرِ معمولی می‌گذراندش، و آن اجراگر `launchPersistentContext`
   * ندارد — فقط گشت و خزش دارند. راهِ ورودش `--from` است، همان ردیفی که
   * از قبل هست.
   *
   * کنترلی که پرچم نسازد، بدتر از نبودنش است.
   */
  const ROWS = {
    crawl: ['from', 'profile', 'remember', 'fresh', 'states', 'minutes', 'headed'],
    scoped: ['from', 'depth', 'model', 'headed'],
    tour: ['profile'],
    source: [],
  };

  let rows = $derived(ROWS[how] || []);

  /**
   * پیش‌فرضِ خاموشِ «مسیرِ ورود» — فقط برای کاوش.
   *
   * `userbug map` وقتی `--from` نگیرد واقعاً از آدرسِ اول شروع می‌کند؛
   * فقط `quest` است که به `map.entry.scenario` برمی‌گردد. نوشتنِ یک
   * متن برای هر دو یعنی یکی‌شان دروغ بگوید.
   */
  let entryFallback = $derived(how === 'scoped' ? mapEntry : '');

  /** فقط ردیف‌هایی که این راه دارد — تا تنظیمی که دیده نمی‌شود، فرستاده هم نشود. */
  let payload = $derived(
    Object.fromEntries(rows.map((key) => [key, settings[key]]).filter(([, one]) => one !== '' && one !== false))
  );

  async function start() {
    busy = true;
    error = '';
    try {
      if (how === 'tour') {
        const response = await fetch('/api/tour', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
          /**
           * `profile` تا امروز فرستاده نمی‌شد.
           *
           * سرور پیش‌فرضش را `false` می‌گیرد، یعنی پوشهٔ موقت — و
           * `TourSession` در پایان پاکش می‌کند. پس کاربر وارد می‌شد،
           * حساب می‌ساخت، و هیچ‌کدام برای خزشِ بعدی نمی‌ماند.
           */
          body: JSON.stringify({ target, action: 'start', profile: Boolean(settings.profile) }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'گشت شروع نشد');
        /**
         * گشت تا تمام نشود `run.json` ندارد، پس شناسهٔ پایدار هم ندارد.
         * `live` همان جلسهٔ در جریان است و وقتی تمام شد، ردیفِ خودش را در
         * فهرست می‌گیرد.
         */
        return void onStarted?.('live');
      }

      if (how === 'source') {
        const response = await fetch('/api/source', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
          body: JSON.stringify({ target }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'سورس خوانده نشد');
        return void onStarted?.('source');
      }

      const job = await startJob(
        target,
        how === 'scoped'
          ? { kind: 'quest', goal: where.trim() || 'همه‌جای اپ را بررسی کن', ...payload }
          : { kind: 'map', ...payload }
      );
      if (!job) throw new Error(run.error || 'شروع نشد');
      /**
       * کارِ خزش تازه شروع شده و هنوز `runId` ندارد؛ `live` همان جلسهٔ
       * در جریان را نشان می‌دهد و پلیر هم از قبل وصل است.
       */
      onStarted?.('live');
    } catch (cause) {
      error = cause.message;
      busy = false;
    }
  }
</script>

<!--
  مودالِ ساده، نه کتابخانه.

  `Escape` و کلیکِ پس‌زمینه می‌بندند، و فوکوس روی نخستین گزینه می‌رود.
  چیزی بیش از این برای یک انتخابِ چهارگزینه‌ای، وابستگیِ اضافه است.
-->
<svelte:window onkeydown={(event) => event.key === 'Escape' && !busy && onClose?.()} />

<div
  class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh]"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && !busy && onClose?.()}
>
  <div class="w-full max-w-lg rounded-xl border bg-card p-5 shadow-xl" role="dialog" aria-modal="true">
    <h2 class="text-base font-bold">چطور کشفش کنم؟</h2>
    <p class="mt-1 mb-4 text-xs leading-6 text-muted-foreground">
      هر سه راه یک جواب می‌دهند: درختِ بخش‌ها و قابلیت‌ها در «اپِ من». فرقشان
      در دقت و هزینهٔ وقت است.
    </p>

    <div class="space-y-2">
      {#each WAYS as way (way.key)}
        <label
          class="flex items-start gap-2.5 rounded-lg border p-3 text-sm {how === way.key
            ? 'border-primary bg-accent/40'
            : ''}"
        >
          <input type="radio" bind:group={how} value={way.key} class="mt-1" disabled={busy} />
          <span class="min-w-0">
            <strong>{way.title}</strong>
            <span class="block text-xs leading-6 text-muted-foreground">{way.hint}</span>

            {#if way.warn && how === way.key}
              <span class="mt-2 block rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] leading-6">
                {way.warn}
              </span>
            {/if}

            {#if way.key === 'scoped' && how === 'scoped'}
              <Input
                bind:value={where}
                class="mt-2 h-9"
                placeholder="مثلاً: برو در تنظیمات و همهٔ گزینه‌هایش را امتحان کن"
                disabled={busy}
              />
            {/if}
          </span>
        </label>
      {/each}
    </div>

    <!--
      همان جعبهٔ بررسی، با ردیف‌های این راه.

      و چون جعبه سرِ خودش می‌گوید چند تنظیم دست‌کاری شده، کاربری که
      «پیشرفته» را باز نمی‌کند هم می‌فهمد چیزی داخلش هست.
    -->
    <!--
      گشت می‌تواند نشست را **بسازد**؛ خزش فقط می‌تواند مصرفش کند.

      پس روی گشت، گزینهٔ «نشست» حتی وقتی هیچ پروفایلی نیست هم باید باز
      باشد — همان بارِ اول است که می‌سازدش.
    -->
    <Advanced
      bind:value={settings}
      {rows}
      {scenarios}
      {accounts}
      {hasProfile}
      canCreateSession={how === 'tour'}
      {entryFallback}
      disabled={busy}
    />

    <!--
      راهِ فرمِ کاملِ خزش — فقط وقتی خزش انتخاب است.

      ── چرا این لینک لازم شد ──

      آن فرم تا امروز روی `discover/live` می‌نشست، یعنی روی صفحه‌ای که
      **بعد** از شروع به آن می‌رسیدی. جایش غلط بود و از آنجا رفت؛ ولی
      چیزهایی دارد که اینجا نیست — دانه، دامنه، واژه‌های اولویت، انتخابِ
      حساب، و نقشهٔ کار. لینکِ نداشته یعنی همان قابلیت‌ها گم شوند.
    -->
    {#if how === 'crawl'}
      <p class="mt-2 text-[11px] leading-6 text-muted-foreground">
        دانه، دامنه، واژه‌های اولویت یا نقشهٔ کار می‌خواهید؟
        <a class="underline underline-offset-4" href={`/projects/${encodeURIComponent(target)}/discover/new`}>
          خزشِ دقیق
        </a>
      </p>
    {/if}

    {#if noSource}
      <!--
        گزینه‌ای که نمی‌تواند کار کند باید **پیش از** زدن بگوید، نه بعدش.
      -->
      <p class="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-[11px] leading-6">
        این پروژه <code>source.root</code> ندارد، پس چیزی از کد خوانده نمی‌شود.
        در پیکربندی پروژه بگذاریدش.
      </p>
    {/if}

    {#if error}
      <p class="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
        {error}
      </p>
    {/if}

    <div class="mt-4 flex justify-end gap-2 border-t pt-4">
      <Button variant="ghost" size="sm" disabled={busy} onclick={() => onClose?.()}>انصراف</Button>
      <Button size="sm" disabled={busy || noSource} onclick={start}>
        {busy ? 'در حال شروع…' : 'شروع'}
      </Button>
    </div>
  </div>
</div>
