<script>
  import { goto, invalidateAll } from '$app/navigation';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { pickState } from '../../../../../../src/map/quest.js';

  let { data } = $props();

  let target = $derived(data.target);
  let base = $derived(`/projects/${encodeURIComponent(target)}`);
  let map = $derived(data.map);
  let states = $derived(map?.states || []);
  let hasMap = $derived(states.length > 0);

  let from = $state('');
  let states_cap = $state(60);
  let minutes = $state(20);
  let fresh = $state(false);
  let headed = $state(false);
  /** شناسهٔ حسابی که خزش می‌سازد و به خاطر می‌سپارد. خالی یعنی هویتِ تازه هر بار. */
  let remember = $state('crawler');
  /** پروفایلِ ماندگار: نشستِ خزشِ قبلی می‌ماند، پس ورود یک‌بار است. */
  let profile = $state(true);
  /** واژه‌هایی که اول سراغشان برود. فیلتر نیست، اولویت است. */
  let focus = $state('');
  let busy = $state(false);
  let error = $state('');

  /**
   * ساختنِ «مسیرِ ورود» — همین‌جا، چون همین‌جاست که کم می‌آید.
   *
   * ── چرا لازم شد ──
   *
   * کاربری در تنظیمات حساب ساخت، فایل نمونه آپلود کرد، کلید مدل گذاشت، و
   * خزش را زد — و خزنده روی صفحهٔ ورود ماند. هر سه کار درست بودند ولی
   * هیچ‌کدام به خزش وصل نبود: **خزنده بلد نیست وارد شود**، یک سناریوی ورود
   * را بازپخش می‌کند.
   *
   * و نوشتنِ آن سناریو با دست سخت است (همه‌چیز باید زیر `when` برود). ولی
   * قدم‌هایش از قبل روی دیسک‌اند، در پیش‌نویسِ گشت یا کاوش.
   */
  let entrySource = $state('');
  let entryAccount = $state('');
  let entryOptions = $state(null);
  let entryDraft = $state(null);
  let entryBusy = $state(false);
  let entryError = $state('');

  async function loadEntryOptions() {
    if (entryOptions) return;
    const response = await fetch(`/api/scenarios/entry?target=${encodeURIComponent(target)}`);
    if (response.ok) entryOptions = await response.json();
  }

  async function buildEntryScenario() {
    entryBusy = true;
    entryError = '';
    try {
      const response = await fetch('/api/scenarios/entry', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target, from: entrySource, account: entryAccount }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'ساخته نشد');
      entryDraft = payload;
    } catch (cause) {
      entryError = cause.message;
    } finally {
      entryBusy = false;
    }
  }

  /** ذخیره از همان دروازهٔ همیشگی، و بعد خودش در کشویی انتخاب می‌شود. */
  async function saveEntryScenario() {
    entryBusy = true;
    entryError = '';
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({
          kind: 'scenario',
          target,
          relative: entryDraft.relative,
          content: entryDraft.yaml,
          createOnly: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'ذخیره نشد');
      from = `scenarios/${target}/${payload.relative}`;
      entryDraft = null;
      // فهرستِ کشویی از سرور می‌آید، پس باید تازه شود تا فایلِ نو در آن باشد
      await invalidateAll();
    } catch (cause) {
      entryError = cause.message;
    } finally {
      entryBusy = false;
    }
  }

  /** هدفِ کاوش. نقشه مسیرِ رسیدن را می‌دهد، مدل فقط همان‌جا فکر می‌کند. */
  let goal = $state('');
  let questBusy = $state(false);
  let questError = $state('');

  /**
   * کدام نما، همین حالا که دارد تایپ می‌کند.
   *
   * ── چرا پیش از اجرا نشان داده می‌شود ──
   *
   * کاوش چند دقیقه طول می‌کشد و پول خرج می‌کند. اگر هدف به هیچ نمایی نخورد،
   * از صفحهٔ اول شروع می‌شود و همان کاوشِ آزادِ گران است — و کاربر تازه در
   * پایان می‌فهمد. `pickState` خالص است، پس همین‌جا در مرورگر جواب می‌دهد.
   */
  let questTarget = $derived(goal.trim().length >= 3 ? pickState(map, goal) : null);

  /**
   * برچسبِ دسته‌ها به فارسی، یک جا.
   *
   * همان فهرستِ `src/map/render.js`. تکرارش عمدی است و کوچک: آن یکی برای
   * ترمینال است و این یکی برای رابط؛ یکی کردنشان یعنی یک ماژولِ مشترک برای
   * پنج رشته.
   */
  const KIND = {
    nav: 'ناوبری',
    mutate: 'جهش',
    inert: 'بی‌اثر',
    unknown: 'نامعلوم',
    input: 'ورودی',
    noise: 'نمایشی',
    destructive: 'برگشت‌ناپذیر',
    avoided: 'ممنوع',
  };

  /** خانوادهٔ روت → حالت‌ها. همان دسته‌بندیِ نقشه، بی تاکسونومیِ تازه. */
  let families = $derived.by(() => {
    const groups = new Map();
    for (const state of states) {
      const list = groups.get(state.route) || [];
      list.push(state);
      groups.set(state.route, list);
    }
    return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  });

  let totals = $derived.by(() => {
    const out = { actions: 0, tried: 0, inert: 0, destructive: 0 };
    for (const state of states) {
      for (const action of state.actions || []) {
        out.actions++;
        if (action.tried) out.tried++;
        if (action.inert) out.inert++;
        if (action.kind === 'destructive') out.destructive++;
      }
    }
    return out;
  });

  function kindsOf(state) {
    const counts = {};
    for (const action of state.actions || []) counts[action.kind] = (counts[action.kind] || 0) + 1;
    return Object.entries(counts).sort(([, a], [, b]) => b - a);
  }

  async function startQuest(event) {
    event.preventDefault();
    questError = '';
    questBusy = true;
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target, kind: 'quest', goal, from, headed }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'کاوش شروع نشد');
      await goto(`/projects/${encodeURIComponent(target)}`);
    } catch (cause) {
      questError = cause.message;
      questBusy = false;
    }
  }

  async function start(event) {
    event.preventDefault();
    error = '';
    busy = true;
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({
          target,
          kind: 'map',
          from,
          states: states_cap,
          minutes,
          fresh,
          headed,
          remember,
          profile,
          focus,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'خزش شروع نشد');
      // اجرای زنده در فضای کاری دیده می‌شود؛ خزش هم یک اجراست
      await goto(`/projects/${encodeURIComponent(target)}`);
    } catch (cause) {
      error = cause.message;
      busy = false;
    }
  }
</script>

<PageHeader title="نقشهٔ اپ" subtitle="هر حالتی که می‌شود به آن رسید — بی یک فراخوانی مدل" />

{#if !hasMap}
  <!--
    حالتِ خالی، با توضیحِ اینکه این کجای مسیر است.
    همان درسِ «از کجا شروع کنیم»: کاربر نباید با فرمی روبه‌رو شود که
    نمی‌داند چرا باید پرش کند.
  -->
  <section class="mb-6 rounded-xl border bg-muted/30 p-6">
    <h2 class="text-base font-semibold">این صفحه چیست</h2>
    <p class="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
      گشت آن‌جایی را می‌شناسد که <strong>شما</strong> بردید. نقشه بقیه را پیدا
      می‌کند: مرورگر خودش هر دکمه‌ای را که امن است می‌زند و می‌نویسد از کجا به
      کجا می‌رسد — صفحه‌ها، و مودال‌ها و منوهایی که اصلاً آدرس ندارند.
      نتیجه‌اش فهرستی است که بعد از آن معلوم می‌شود چه چیزهایی باید آزموده شوند.
    </p>
    <p class="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
      خزش هوش مصنوعی مصرف نمی‌کند و چند دقیقه طول می‌کشد. هر کلیک از همان
      داور و چک‌های همیشگی رد می‌شود، پس یافته‌هایش یافتهٔ واقعی‌اند.
    </p>
  </section>
{/if}

<!--
  خزشی که پشتِ صفحهٔ ورود مانده، «موفق» به نظر می‌رسد: صف تمام می‌شود و چند
  گره پیدا می‌شود. بی این هشدار، کاربر نقشهٔ چهار گره‌ای می‌بیند و فکر می‌کند
  اپش همین‌قدر است — همان شکستِ خاموشی که این ابزار برای شکارش ساخته شده،
  این بار در خودش.
-->
{#if data.stuck}
  <section class="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm leading-7">
    <p class="font-semibold text-destructive">خزش وارد نشد.</p>
    <p class="mt-1 text-muted-foreground">
      همهٔ حالت‌ها پشتِ صفحهٔ ورود ماندند؛ این نقشه صفحهٔ ورود است، نه اپ. یک
      <strong>سناریوی ورود</strong> در فرمِ کناری انتخاب کنید و
      <strong>حسابی که به خاطر بسپارد</strong> را پر بگذارید — بارِ اول کاربر
      می‌سازد، دفعه‌های بعد با همان وارد می‌شود.
    </p>
    {#if !data.scenarios.length}
      <p class="mt-1 text-muted-foreground">
        هنوز سناریویی ندارید: یک <a class="underline underline-offset-2" href={`${base}/tour`}>گشت</a>
        بروید تا قدم‌های ورود ضبط شود، یا در
        <a class="underline underline-offset-2" href={`${base}/files`}>سناریوها</a> یکی بنویسید.
      </p>
    {/if}
  </section>
{/if}

<div class="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
  <div class="space-y-4">
    <Card.Root>
      <Card.Header>
        <Card.Title class="text-sm">{hasMap ? 'خزشِ دوباره' : 'شروع خزش'}</Card.Title>
      </Card.Header>
      <Card.Content>
        <form class="space-y-3" onsubmit={start}>
          <label class="block space-y-1">
            <span class="text-xs text-muted-foreground">مسیرِ ورود (سناریو)</span>
            <select bind:value={from} class="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">— بدون ورود؛ از صفحهٔ اول —</option>
              {#each data.scenarios as scenario (scenario.path)}
                <!-- سناریویی که خزش نمی‌تواند بازپخشش کند، انتخاب‌شدنی نیست -->
                <option
                  value={`scenarios/${target}/${scenario.path}`}
                  disabled={scenario.blockers.length > 0}
                >
                  {scenario.name}{scenario.blockers.length ? ` — ${scenario.blockers.join('، ')} ندارد` : ''}
                </option>
              {/each}
            </select>
            <span class="block text-[11px] leading-5 text-muted-foreground">
              اپی که ورود دارد، برای ناشناس یک صفحه است. یک سناریوی کوچکِ ورود
              بدهید تا نقشه از داخل شروع شود.
            </span>
          </label>

          <!--
            هشدار **پیش از** خزش، نه بعدش.

            تا امروز فقط وقتی گفته می‌شد که خزش تمام شده و روی `/login` مانده
            بود — یعنی دقیقاً بعد از هدر رفتنِ چند دقیقه. حالا همان جمله
            کنارِ کشویی است، جایی که هنوز می‌شود کاری کرد.
          -->
          {#if !from}
            <div class="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-[11px] leading-6">
              <p class="font-medium text-amber-700 dark:text-amber-300">بی مسیرِ ورود، خزش وارد نمی‌شود.</p>
              <p class="mt-0.5 text-muted-foreground">
                خزنده خودش بلد نیست وارد شود؛ یک سناریوی ورود را بازپخش می‌کند.
                حسابی که در «حساب و فایل» ذخیره کرده‌اید تا وقتی سناریویی به آن
                اشاره نکند، استفاده نمی‌شود.
              </p>
              <button
                type="button"
                class="mt-1.5 underline underline-offset-2"
                onclick={loadEntryOptions}
              >
                از روی گشت یا کاوشِ قبلی برایم بساز
              </button>
            </div>
          {/if}

          {#if entryOptions}
            <!--
              هیچ مدلی صدا زده نمی‌شود: قدم‌های ورود از قبل ضبط شده‌اند و
              برچسب‌هایشان از DOM واقعی آمده، نه از حدس.
            -->
            <div class="space-y-2 rounded-lg border p-2.5">
              {#if entryOptions.candidates.length}
                <label class="block space-y-1">
                  <span class="text-[11px] text-muted-foreground">از روی کدام سناریو</span>
                  <select bind:value={entrySource} class="h-8 w-full rounded-md border bg-background px-2 text-xs">
                    <option value="">— انتخاب کنید —</option>
                    {#each entryOptions.candidates as item (item.path)}
                      <option value={item.path}>{item.name}</option>
                    {/each}
                  </select>
                </label>

                <label class="block space-y-1">
                  <span class="text-[11px] text-muted-foreground">با کدام حساب</span>
                  <select bind:value={entryAccount} class="h-8 w-full rounded-md border bg-background px-2 text-xs">
                    <option value="">— هر اجرا کاربرِ تازه بسازد —</option>
                    {#each entryOptions.accounts as item (item.id)}
                      <option value={item.id}>{item.id}{item.email ? ` — ${item.email}` : ''}</option>
                    {/each}
                  </select>
                  <a class="block text-[11px] underline underline-offset-2" href={`${base}/config`}>
                    حساب یا فایلِ تازه اضافه کنم
                  </a>
                </label>

                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  class="w-full"
                  disabled={!entrySource || entryBusy}
                  onclick={buildEntryScenario}
                >
                  {entryBusy ? 'یک لحظه…' : 'بساز'}
                </Button>
              {:else}
                <p class="text-[11px] leading-6 text-muted-foreground">
                  هیچ سناریویی با فرمِ ورود پیدا نشد. یک بار
                  <a class="underline underline-offset-2" href={`${base}/tour`}>گشتِ زنده</a>
                  بروید و خودتان وارد شوید؛ قدم‌هایش ضبط می‌شود و بعد از همان
                  ساخته می‌شود.
                </p>
              {/if}

              {#if entryError}<p class="text-[11px] text-destructive">{entryError}</p>{/if}

              {#if entryDraft}
                <div class="space-y-1.5 border-t pt-2">
                  {#each entryDraft.notes as note (note)}
                    <p class="text-[11px] leading-5 text-amber-700 dark:text-amber-300">{note}</p>
                  {/each}
                  <pre dir="ltr" class="max-h-52 overflow-auto rounded-md bg-muted p-2 font-mono text-[10px] leading-4">{entryDraft.yaml}</pre>
                  <Button type="button" size="sm" class="w-full" disabled={entryBusy} onclick={saveEntryScenario}>
                    ذخیره در scenarios/{target}/{entryDraft.relative}
                  </Button>
                </div>
              {/if}
            </div>
          {/if}

          <div class="grid grid-cols-2 gap-2">
            <label class="block space-y-1">
              <span class="text-xs text-muted-foreground">سقف حالت</span>
              <Input type="number" min="1" max="1000" bind:value={states_cap} />
            </label>
            <label class="block space-y-1">
              <span class="text-xs text-muted-foreground">سقف دقیقه</span>
              <Input type="number" min="1" max="1000" bind:value={minutes} />
            </label>
          </div>

          <label class="block space-y-1">
            <span class="text-xs text-muted-foreground">اول سراغِ چه برود</span>
            <Input bind:value={focus} placeholder="مثلاً: کتاب واژه‌نامه — خالی یعنی همه‌جا" />
            <span class="block text-[11px] leading-5 text-muted-foreground">
              فیلتر نیست، <strong>اولویت</strong> است: چیزی حذف نمی‌شود، فقط
              زودتر دیده می‌شود. روت‌هایی که در سورس هست و خزش ندیده، خودکار
              اولویت می‌گیرند.
            </span>
          </label>

          <label class="block space-y-1">
            <span class="text-xs text-muted-foreground">حسابی که به خاطر بسپارد</span>
            <Input bind:value={remember} placeholder="crawler — خالی یعنی هر بار کاربر تازه" />
            <span class="block text-[11px] leading-5 text-muted-foreground">
              <strong>خودش وارد نمی‌شود</strong> — فرم را سناریوی ورودِ بالا پر
              می‌کند. این فقط می‌گوید هویتی که آنجا ساخته شد، با چه شناسه‌ای
              ذخیره بماند تا دفعهٔ بعد همان باشد.
            </span>
          </label>

          <label class="flex items-start gap-2 text-xs">
            <input type="checkbox" bind:checked={profile} class="mt-0.5" />
            <span>
              همان مرورگرِ خزشِ قبلی
              <span class="block text-[11px] leading-5 text-muted-foreground">
                نشست و کش می‌مانند، پس بعد از بارِ اول ورود لازم نیست.
              </span>
            </span>
          </label>

          <label class="flex items-center gap-2 text-xs">
            <input type="checkbox" bind:checked={fresh} />
            از صفر، نه ادامهٔ نقشهٔ موجود
          </label>
          <label class="flex items-center gap-2 text-xs">
            <input type="checkbox" bind:checked={headed} />
            مرورگر دیده شود
          </label>

          {#if error}<p class="text-xs text-destructive">{error}</p>{/if}

          <Button type="submit" class="w-full" disabled={busy}>
            {busy ? 'در حال شروع…' : 'شروع خزش'}
          </Button>
          <p class="text-[11px] leading-5 text-muted-foreground">
            خزش مثل هر اجرای دیگری زنده دیده می‌شود؛ بعد از شروع به فضای کاری
            می‌رویم.
          </p>
        </form>
      </Card.Content>
    </Card.Root>

    {#if hasMap}
      <!--
        قدمِ بعد.

        نقشه تا امروز هیچ پایانی نداشت: عدد نشان می‌داد و رها می‌کرد. ولی
        ارزشش در چیزی است که بعدش ممکن می‌شود — هر مودالی که پیدا شده، یک
        پیشنهادِ سناریو با مسیرِ رسیدنش.
      -->
      <Card.Root>
        <Card.Header class="pb-3">
          <Card.Title class="text-sm">قدم بعد</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-2">
          <Button href={`${base}/proposals`} class="w-full" size="sm">
            {data.fromMap
              ? `${data.fromMap} سناریوی پیشنهادی از این نقشه`
              : 'ببین چه باید آزمود'}
          </Button>
          <p class="text-[11px] leading-5 text-muted-foreground">
            {#if data.fromMap}
              هر کدام با <strong>مسیرِ واقعیِ رسیدن</strong> ساخته می‌شود، نه حدسِ
              مدل — پس سناریویی که درمی‌آید واقعاً به آن نما می‌رسد.
            {:else}
              هر نمایی که نقشه پیدا کند و هیچ سناریویی سراغش نرود، یک پیشنهاد
              می‌شود. فعلاً همه پوشش دارند.
            {/if}
          </p>
        </Card.Content>
      </Card.Root>

      <!--
        کاوشِ هدف‌دار.

        ── چرا اینجا و نه در صفحهٔ اجرا ──

        ارزشِ این کار از نقشه می‌آید: بی نقشه، کاوش از صفحهٔ اول شروع می‌کند و
        نیمی از فراخوانی‌هایش خرجِ رسیدن می‌شود نه گشتن. پس همان‌جا که نقشه
        هست پیشنهاد می‌شود، نه جایی که کاربر باید یادش بیفتد نقشه‌ای دارد.
      -->
      <Card.Root>
        <Card.Header class="pb-3">
          <Card.Title class="text-sm">این یکی را بررسی کن</Card.Title>
          <Card.Description>
            نقشه رایگان می‌بردت آنجا؛ مدل فقط همان‌جا فکر می‌کند.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <form class="space-y-3" onsubmit={startQuest}>
            <label class="block space-y-1">
              <span class="text-xs text-muted-foreground">چه چیزی را بررسی کنم</span>
              <Input bind:value={goal} placeholder="مثلاً: آپلودِ فایلِ تکراری چه می‌کند" />
            </label>

            {#if goal.trim().length >= 3}
              {#if questTarget}
                <p class="rounded-lg border bg-muted/30 p-2 text-[11px] leading-5">
                  می‌رود به
                  <strong>{questTarget.state.route}{questTarget.state.view ? ` ▸ ${questTarget.state.view}` : ''}</strong>
                  در {questTarget.depth} قدمِ قطعی، بعد از آنجا می‌گردد.
                </p>
              {:else}
                <p class="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] leading-5">
                  هیچ نمایی در نقشه با این هدف نخواند، پس از صفحهٔ اول شروع
                  می‌شود و گران‌تر درمی‌آید. واژه‌ای بنویسید که در خودِ اپ دیده
                  می‌شود.
                </p>
              {/if}
            {/if}

            {#if questError}<p class="text-xs text-destructive">{questError}</p>{/if}

            <Button type="submit" variant="secondary" class="w-full" size="sm" disabled={questBusy || goal.trim().length < 5}>
              {questBusy ? 'در حال شروع…' : 'برو بررسی کن'}
            </Button>
            <p class="text-[11px] leading-5 text-muted-foreground">
              خروجی‌اش یک <strong>پیش‌نویسِ سناریو</strong>ست با مقدمهٔ آماده —
              همان مسیری که نقشه بلد بود. مسیرِ ورود و «مرورگر دیده شود» از
              فرمِ بالا برداشته می‌شوند.
            </p>
          </form>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header><Card.Title class="text-sm">عددها</Card.Title></Card.Header>
        <Card.Content class="space-y-2 text-sm">
          <div class="flex justify-between"><span class="text-muted-foreground">حالت</span><span>{states.length}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">یال</span><span>{map.edges?.length || 0}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">کنش</span><span>{totals.actions}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">امتحان‌شده</span><span>{totals.tried}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">بی‌اثر</span><span>{totals.inert}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">برگشت‌ناپذیر (نزده)</span><span>{totals.destructive}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">در صف</span><span>{map.frontier?.length || 0}</span></div>
          {#if map.stats?.stoppedBecause}
            <div class="flex justify-between"><span class="text-muted-foreground">توقف</span><span>{map.stats.stoppedBecause}</span></div>
          {/if}
          {#if map.entry?.scenario}
            <div class="pt-1 text-xs text-muted-foreground">مسیرِ ورود: {map.entry.scenario}</div>
          {/if}
        </Card.Content>
      </Card.Root>

      <!--
        تفاضلِ سورس و خزش — گران‌ترین حرفِ این صفحه و ارزان‌ترین محاسبه‌اش.
        صفحه‌ای که در کد هست و از رابط به آن نمی‌رسند، یا یتیم است یا
        نیازمندِ حالتی که نساختیم؛ هر دو یک پرسشِ واقعی‌اند.
      -->
      <!--
        پیش‌بینیِ سورس در برابرِ آنچه واقعاً شد.

        این کارت عمداً بالای تفاضلِ روت‌هاست: آن یکی «کجا نرفتیم» را می‌گوید
        و این یکی «جایی رفتیم که نباید» — و دومی احتمالِ باگ بودنش بیشتر است.
      -->
      {#if data.mispredicted?.length}
        <Card.Root>
          <Card.Header>
            <Card.Title class="text-sm">پیش‌بینی نخواند ({data.mispredicted.length})</Card.Title>
            <Card.Description>سورس یک چیز گفت، کلیک چیز دیگری نشان داد.</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-2">
            {#each data.mispredicted.slice(0, 8) as row (row.label + row.predicted)}
              <div class="rounded-lg border p-2 text-xs">
                <span class="block font-medium">{row.label}</span>
                <span dir="ltr" class="mt-1 block font-mono text-[11px] text-muted-foreground">
                  {row.predicted} → {row.actual}
                </span>
              </div>
            {/each}
          </Card.Content>
        </Card.Root>
      {/if}

      {#if data.unreached.length}
        <Card.Root>
          <Card.Header><Card.Title class="text-sm">در سورس هست، نرسیدیم ({data.unreached.length})</Card.Title></Card.Header>
          <Card.Content class="flex flex-wrap gap-1.5">
            {#each data.unreached as route (route)}
              <Badge variant="outline" class="font-mono text-[11px]">{route}</Badge>
            {/each}
          </Card.Content>
        </Card.Root>
      {/if}

      {#if data.extra.length && data.knownRoutes.length}
        <Card.Root>
          <Card.Header><Card.Title class="text-sm">دیدیم، در سورس نبود ({data.extra.length})</Card.Title></Card.Header>
          <Card.Content class="flex flex-wrap gap-1.5">
            {#each data.extra as route (route)}
              <Badge variant="outline" class="font-mono text-[11px]">{route}</Badge>
            {/each}
          </Card.Content>
        </Card.Root>
      {/if}
    {/if}
  </div>

  <div class="space-y-4">
    {#if !hasMap}
      <p class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        هنوز نقشه‌ای نیست.
      </p>
    {:else}
      {#each families as [route, group] (route)}
        <Card.Root>
          <Card.Header class="pb-3">
            <Card.Title class="font-mono text-sm">{route}</Card.Title>
            <Card.Description>{group.length} حالت</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-2">
            {#each group as state (state.id)}
              {@const tried = (state.actions || []).filter((action) => action.tried).length}
              <div class="rounded-lg border p-3">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-medium">
                    {state.view ? `▸ ${state.view}` : state.title || 'نمای اصلی'}
                  </span>
                  {#if state.pathBroken}
                    <Badge variant="destructive" class="text-[10px]">مسیر شکسته</Badge>
                  {/if}
                  <span class="text-[11px] text-muted-foreground">{tried} از {(state.actions || []).length} کنش امتحان شد</span>
                </div>

                <div class="mt-2 flex flex-wrap gap-1.5">
                  {#each kindsOf(state) as [kind, count] (kind)}
                    <Badge variant="secondary" class="text-[10px]">{count} {KIND[kind] || kind}</Badge>
                  {/each}
                </div>

                <p class="mt-2 font-mono text-[11px] text-muted-foreground">
                  {state.sample || route}
                  {#if state.path?.length}· {state.path.length} قدم تا اینجا{/if}
                </p>
              </div>
            {/each}
          </Card.Content>
        </Card.Root>
      {/each}
    {/if}
  </div>
</div>
