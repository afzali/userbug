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
   * گزینه‌ها گزینه‌های متفاوتِ یک چیزند و هیچ‌کدام تنظیمِ اضافه‌ای لازم
   * ندارند جز «کجا» برای حالتِ محدود. تنظیماتِ ریز (سقف‌ها، دستگاه،
   * پروفایل) داخلِ خودِ جلسه‌اند، جایی که معنا دارند.
   */
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { run, startJob } from '$lib/run-store.svelte.js';

  let { target, project = null, scope = null, onClose, onStarted } = $props();

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

  let how = $state('tour');
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

  async function start() {
    busy = true;
    error = '';
    try {
      if (how === 'tour') {
        const response = await fetch('/api/tour', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
          body: JSON.stringify({ target, action: 'start' }),
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
          ? { kind: 'quest', goal: where.trim() || 'همه‌جای اپ را بررسی کن' }
          : { kind: 'map' }
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
