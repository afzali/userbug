<script>
  import { goto, invalidateAll } from '$app/navigation';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { formatNumber } from '$lib/format.js';
  import { pickState } from '../../../../../../src/map/quest.js';

  let { data } = $props();

  let target = $derived(data.target);
  let base = $derived(`/projects/${encodeURIComponent(target)}`);
  let map = $derived(data.map);
  let states = $derived(map?.states || []);
  let hasMap = $derived(states.length > 0);

  let from = $state('');
  /**
   * دانه — یک بار در کلِ خزش، نه در هر برگشت به خانه.
   *
   * ── چرا کشویی جدا از «مسیرِ ورود» ──
   *
   * مسیرِ ورود ده‌ها بار بازپخش می‌شود، پس باید بی‌اثر باشد. «فایل نمونه را
   * وارد کن» آنجا یعنی ده‌ها ایمپورتِ تکراری. و بی آن، نقشه از اپِ **خالی**
   * درمی‌آید: روی nepi چهارده گره پیدا شد و «ویرایشِ کتاب» میانشان نبود،
   * چون کتابی نبود.
   */
  let seed = $state('');

  /** سناریوی انتخاب‌شده، برای هشدارِ «ضبطِ خام». */
  let selectedEntry = $derived(
    data.scenarios.find((item) => `scenarios/${target}/${item.path}` === from) || null
  );
  let states_cap = $state(60);
  let minutes = $state(20);
  let fresh = $state(false);
  let headed = $state(false);
  /** شناسهٔ حسابی که خزش می‌سازد و به خاطر می‌سپارد. خالی یعنی هویتِ تازه هر بار. */
  /**
   * «از کجا شروع کند» — یک انتخاب، نه سه تنظیمِ جدا.
   *
   * ── چرا این حالت اضافه شد ──
   *
   * سه فیلدِ قبلی (`from`، `remember`، `profile`) سه راهِ متفاوتِ **یک** کار
   * بودند: رساندنِ خزنده به حالتِ وارد‌شده. ولی کنار هم مثل سه تنظیمِ مستقل
   * نشسته بودند و هیچ‌جا نوشته نبود که با هم چه می‌کنند — پس کاربر یا
   * هیچ‌کدام را می‌زد و خزش پشتِ صفحهٔ ورود می‌ماند، یا هر سه را.
   *
   * پیش‌فرض از خودِ پروژه می‌آید: اگر نشستی از گشت مانده، همان؛ وگرنه
   * حسابی اگر هست؛ وگرنه کاربرِ تازه.
   */
  let startMode = $state(data.hasProfile ? 'session' : data.accounts.length ? 'account' : 'fresh');
  let remember = $state(data.accounts[0]?.id || '');
  /**
   * پرچم‌های واقعی از انتخابِ بالا مشتق می‌شوند.
   *
   * یک منبعِ حقیقت: رابط یک پرسش می‌پرسد و همین‌جا به زبانِ خزش ترجمه
   * می‌شود. اگر هر کدام `state` جدا می‌ماندند، دو جا می‌دانستند «ادامهٔ
   * نشست یعنی چه» و دیر یا زود واگرا می‌شدند.
   */
  let profile = $derived(startMode === 'session');
  /** هویتِ ذخیره‌شده فقط در حالتِ «با حسابی که دارم» معنا دارد. */
  let rememberId = $derived(startMode === 'account' ? remember : '');
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
  /** «ورود» یا «دانه» — یک فرم، دو خروجی. */
  let entryKind = $state('entry');
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
        body: JSON.stringify({ target, from: entrySource, account: entryAccount, kind: entryKind }),
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
      if (entryDraft.kind === 'seed') seed = `scenarios/${target}/${payload.relative}`;
      else from = `scenarios/${target}/${payload.relative}`;
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
          /**
           * در حالتِ «ادامهٔ نشست» مسیرِ ورود فرستاده نمی‌شود.
           *
           * مرورگر از قبل وارد است؛ بازپخشِ فرمِ ورود روی صفحه‌ای که فرم
           * ندارد، در هر برگشت به خانه یک شکستِ بی‌دلیل است.
           */
          from: startMode === 'session' ? '' : from,
          seed,
          states: states_cap,
          minutes,
          fresh,
          headed,
          remember: rememberId,
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
        <form class="space-y-4" onsubmit={start}>
          <!--
            سه پرسش، نه هشت فیلد.

            ── چرا این صفحه بازنویسی شد ──

            کاربر گفت: «طراحی این صفحه گیجم کرده. می‌خواهم بتوانم به راحتی
            بگویم چطور خزش کن، دنبالِ چی باش، از کجا شروع کن.»

            فرمِ قبلی هشت کنترلِ هم‌وزن بود — مسیرِ ورود، دادهٔ اولیه، «حسابی
            که به خاطر بسپارد»، «همان مرورگرِ خزشِ قبلی» — و رابطهٔ میانشان
            هیچ‌جا نوشته نبود. بدتر: **سه تای اول سه راهِ متفاوتِ یک کار
            بودند** (شروع کردن از حالتِ وارد‌شده) ولی کنار هم مثل سه تنظیمِ
            مستقل نشسته بودند، پس کاربر یا هیچ‌کدام را می‌زد یا هر سه را.

            حالا همان سه پرسش‌اند، و اولی یک انتخابِ **یکی‌از‌سه** است.
          -->
          <fieldset class="space-y-2">
            <legend class="text-xs font-semibold">۱. از کجا شروع کند؟</legend>

            <!--
              ادامهٔ نشستِ گشت — اول، چون بعد از گشت طبیعی‌ترین کار است.

              این گزینه از قبل بود ولی نامش «همان مرورگرِ خزشِ قبلی» بود: کسی
              که تازه گشت رفته و تیکِ «نشست بماند» را زده، هیچ دلیلی نداشت فکر
              کند این جمله دربارهٔ اوست.
            -->
            <label class="flex items-start gap-2 rounded-lg border p-2.5 text-xs {startMode === 'session' ? 'border-primary bg-accent/40' : ''}">
              <input type="radio" bind:group={startMode} value="session" class="mt-0.5" disabled={!data.hasProfile} />
              <span>
                <strong>ادامهٔ همان نشست</strong>
                {#if data.hasProfile}
                  <span class="block text-[11px] leading-5 text-muted-foreground">
                    همان مرورگری که در گشت واردش شدی — نشست و کَش سرِ جایشان‌اند،
                    پس خزش از همان‌جا ادامه می‌دهد و ورود لازم ندارد.
                  </span>
                {:else}
                  <span class="block text-[11px] leading-5 text-muted-foreground">
                    نشستی ذخیره نشده. یک <a class="underline underline-offset-2" href={`${base}/tour`}>گشت</a>
                    با تیکِ «نشست بماند» بروید تا این گزینه فعال شود.
                  </span>
                {/if}
              </span>
            </label>

            <!-- با حسابِ ذخیره‌شده: ورود را سناریو می‌زند، با مقدارهای همان حساب -->
            <label class="flex items-start gap-2 rounded-lg border p-2.5 text-xs {startMode === 'account' ? 'border-primary bg-accent/40' : ''}">
              <input type="radio" bind:group={startMode} value="account" class="mt-0.5" />
              <span class="min-w-0 flex-1">
                <strong>با حسابی که دارم</strong>
                <span class="block text-[11px] leading-5 text-muted-foreground">
                  هر بار از نو وارد می‌شود، با ایمیل و رمزِ همان حساب.
                </span>
                {#if startMode === 'account'}
                  <select bind:value={remember} class="mt-1.5 h-8 w-full rounded-md border bg-background px-2 text-xs">
                    <option value="">— حساب را انتخاب کنید —</option>
                    {#each data.accounts as account (account.id)}
                      <option value={account.id}>{account.id}{account.email ? ` — ${account.email}` : ''}</option>
                    {/each}
                  </select>
                  {#if !data.accounts.length}
                    <span class="mt-1 block text-[11px] text-amber-700 dark:text-amber-300">
                      حسابی ذخیره نشده.
                      <a class="underline underline-offset-2" href={`${base}/config`}>در «پیکربندی» یکی بسازید</a>
                      — ایمیل و رمزِ کاربری که خودتان در اپ ساخته‌اید.
                    </span>
                  {/if}
                {/if}
              </span>
            </label>

            <!-- کاربرِ تازه: سناریوی ورود ثبت‌نام می‌کند و هویت ذخیره می‌شود -->
            <label class="flex items-start gap-2 rounded-lg border p-2.5 text-xs {startMode === 'fresh' ? 'border-primary bg-accent/40' : ''}">
              <input type="radio" bind:group={startMode} value="fresh" class="mt-0.5" />
              <span>
                <strong>کاربرِ تازه بساز</strong>
                <span class="block text-[11px] leading-5 text-muted-foreground">
                  هر خزش با هویتِ نو ثبت‌نام می‌کند و اپِ خالی را می‌بیند. برای
                  آزمودنِ مسیرِ نخستین‌بار خوب است، برای دیدنِ صفحه‌های داده‌دار نه.
                </span>
              </span>
            </label>

            <!-- مسیرِ ورود فقط وقتی معنا دارد که خزش باید خودش وارد شود -->
            {#if startMode !== 'session'}
              <label class="block space-y-1 ps-6">
                <span class="text-[11px] text-muted-foreground">با کدام سناریو وارد شود</span>
                <select bind:value={from} class="h-8 w-full rounded-md border bg-background px-2 text-xs">
                  <option value="">— بدون ورود؛ از صفحهٔ اول —</option>
                  {#each data.scenarios as scenario (scenario.path)}
                    <!-- سناریویی که خزش نمی‌تواند بازپخشش کند، انتخاب‌شدنی نیست -->
                    <option
                      value={`scenarios/${target}/${scenario.path}`}
                      disabled={scenario.blockers.length > 0}
                    >
                      {scenario.name}{scenario.blockers.length
                        ? ` — ${scenario.blockers.join('، ')} ندارد`
                        : scenario.recorded
                          ? ' — ضبطِ خام'
                          : ''}
                    </option>
                  {/each}
                </select>
              </label>
            {/if}

          <!--
            هشدار **پیش از** خزش، نه بعدش.

            تا امروز فقط وقتی گفته می‌شد که خزش تمام شده و روی `/login` مانده
            بود — یعنی دقیقاً بعد از هدر رفتنِ چند دقیقه. حالا همان جمله
            کنارِ کشویی است، جایی که هنوز می‌شود کاری کرد.
          -->
          <!--
            ضبطِ خام به‌عنوان مسیرِ ورود، خزش را می‌کشد.

            ── چرا این هشدار لازم شد ──

            کاربر گشت رفت و بعد همان پیش‌نویسِ گشت را انتخاب کرد — طبیعی‌ترین
            کار، چون تنها گزینهٔ کشویی بود. سه خزش پشتِ سرِ هم با صفر قدم
            مرد: `locator.click: Timeout — «نشان نده»`. ضبطِ گشت کلیکِ بی‌شرط
            دارد، از جمله بستنِ مودالی که فقط بارِ اول می‌آید؛ و خزش ده‌ها بار
            به خانه برمی‌گردد.
          -->
          {#if selectedEntry?.recorded}
            <div class="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-[11px] leading-6">
              <p class="font-medium text-destructive">این ضبطِ خامِ گشت است، نه مسیرِ ورود.</p>
              <p class="mt-0.5 text-muted-foreground">
                کلیک‌هایش بی‌شرط‌اند — از جمله بستنِ پنجره‌هایی که فقط بارِ اول
                می‌آیند. خزش ده‌ها بار به خانه برمی‌گردد و بارِ دوم همان‌جا
                می‌شکند.
              </p>
              <button type="button" class="mt-1.5 underline underline-offset-2" onclick={loadEntryOptions}>
                از رویش یک مسیرِ ورودِ درست بساز
              </button>
            </div>
          {/if}

          <!--
            هشدارِ «ورود ندارد» فقط وقتی که واقعاً لازم است.

            در حالتِ «ادامهٔ نشست» مرورگر از قبل وارد است و مسیرِ ورود اصلاً
            معنا ندارد؛ نمایشِ این هشدار آنجا یعنی گفتنِ حرفی که غلط است —
            و بدتر از سکوت.
          -->
          {#if startMode !== 'session' && !from}
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
                <div class="flex gap-1 text-[11px]">
                  {#each [['entry', 'مسیرِ ورود'], ['seed', 'دادهٔ اولیه']] as [value, label] (value)}
                    <button
                      type="button"
                      class={`flex-1 rounded-md border px-2 py-1 ${entryKind === value ? 'border-primary bg-accent' : ''}`}
                      onclick={() => { entryKind = value; entryDraft = null; }}
                    >
                      {label}
                    </button>
                  {/each}
                </div>

                <label class="block space-y-1">
                  <span class="text-[11px] text-muted-foreground">از روی کدام سناریو</span>
                  <select bind:value={entrySource} class="h-8 w-full rounded-md border bg-background px-2 text-xs">
                    <option value="">— انتخاب کنید —</option>
                    {#each entryOptions.candidates as item (item.path)}
                      <option value={item.path}>{item.name}</option>
                    {/each}
                  </select>
                </label>

                <label class="block space-y-1" hidden={entryKind === 'seed'}>
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

          </fieldset>

          <fieldset class="space-y-2 border-t pt-3">
            <legend class="text-xs font-semibold">۲. دنبالِ چه بگردد؟</legend>

          <!--
            دانه — جدا، چون **یک بار** اجرا می‌شود.

            اگر در «مسیرِ ورود» می‌نشست، در هر برگشت به خانه دوباره ایمپورت
            می‌شد و نقشه از اپی درمی‌آمد که هیچ کاربری نمی‌سازدش.
          -->
          <label class="block space-y-1">
            <span class="text-[11px] text-muted-foreground">دادهٔ اولیه (اختیاری)</span>
            <select bind:value={seed} class="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">— بدون داده؛ اپ همان است که هست —</option>
              {#each data.scenarios as scenario (scenario.path)}
                <option
                  value={`scenarios/${target}/${scenario.path}`}
                  disabled={scenario.blockers.length > 0}
                >
                  {scenario.name}{scenario.blockers.length ? ` — ${scenario.blockers.join('، ')} ندارد` : ''}
                </option>
              {/each}
            </select>
            <span class="block text-[11px] leading-5 text-muted-foreground">
              <strong>یک بار</strong> پیش از خزش اجرا می‌شود — مثلاً وارد کردنِ
              فایلِ نمونه. بی آن، نقشه از اپِ خالی درمی‌آید و صفحه‌هایی که به
              داده نیاز دارند اصلاً دیده نمی‌شوند.
            </span>
          </label>

          <label class="block space-y-1">
            <span class="text-[11px] text-muted-foreground">اول سراغِ چه برود</span>
            <Input bind:value={focus} placeholder="مثلاً: کتاب واژه‌نامه — خالی یعنی همه‌جا" class="h-8" />
            <span class="block text-[11px] leading-5 text-muted-foreground">
              فیلتر نیست، <strong>اولویت</strong> است: چیزی حذف نمی‌شود، فقط
              زودتر دیده می‌شود. روت‌هایی که در سورس هست و خزش ندیده، خودکار
              اولویت می‌گیرند.
            </span>
          </label>
          </fieldset>

          <fieldset class="space-y-2 border-t pt-3">
            <legend class="text-xs font-semibold">۳. تا کجا بگردد؟</legend>
            <div class="grid grid-cols-2 gap-2">
              <label class="block space-y-1">
                <span class="text-[11px] text-muted-foreground">سقف حالت</span>
                <Input type="number" min="1" max="1000" bind:value={states_cap} class="h-8" />
              </label>
              <label class="block space-y-1">
                <span class="text-[11px] text-muted-foreground">سقف دقیقه</span>
                <Input type="number" min="1" max="1000" bind:value={minutes} class="h-8" />
              </label>
            </div>

            <label class="flex items-center gap-2 text-xs">
              <input type="checkbox" bind:checked={headed} />
              مرورگر دیده شود
            </label>
          </fieldset>

          <!--
            تکلیفِ نقشهٔ موجود — پرسشِ چهارم، و فقط وقتی نقشه‌ای هست.

            ── چرا از «تا کجا بگردد» بیرون آمد ──

            کاربر پرسید: «چرا هنوز ـاز صفر، نه ادامهٔ نقشهٔ موجودـ را داریم؟
            مگر در بالا انتخاب نکرده‌ام؟»

            حق داشت که گیج شود، هرچند این دو یکی نیستند: بالا دربارهٔ
            **مرورگر و هویت** است (چطور وارد شود)، این یکی دربارهٔ **فایلِ
            نقشه** (آنچه از خزش‌های قبلی مانده). ولی هر دو واژهٔ «تازه» را
            داشتند و این یکی زیرِ عنوانِ «تا کجا بگردد» نشسته بود — که اصلاً
            سقف نیست.

            حالا نامش خودِ نقشه را می‌گوید، عددِ حالت‌های فعلی کنارش است تا
            پیامد ملموس باشد، و روی پروژه‌ای که هنوز نقشه ندارد اصلاً نشان
            داده نمی‌شود — گزینه‌ای که هیچ کاری نمی‌کند، فقط گیج می‌کند.
          -->
          {#if hasMap}
            <fieldset class="space-y-1.5 border-t pt-3">
              <legend class="text-xs font-semibold">۴. با نقشهٔ موجود چه کند؟</legend>
              <label class="flex items-start gap-2 text-xs">
                <input type="checkbox" bind:checked={fresh} class="mt-0.5" />
                <span>
                  نقشه را از نو بساز
                  <span class="block text-[11px] leading-5 text-muted-foreground">
                    نقشهٔ فعلی ({formatNumber(states.length)} حالت) دور ریخته می‌شود.
                    خالی یعنی روی همان ادامه می‌دهد و فقط چیزهای تازه را اضافه می‌کند.
                  </span>
                </span>
              </label>
            </fieldset>
          {/if}

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

      <!--
        نقشه فقط نیمی از پوشش است: صفحه‌ها را می‌بیند، بک‌اند و قاعده‌های
        schema را نه. لینک همین‌جاست چون کسی که «در سورس هست، نرسیدیم» را
        این پایین می‌خواند، همان لحظه سؤالِ بعدی‌اش را دارد.
      -->
      <Card.Root>
        <Card.Header class="pb-3">
          <Card.Title class="text-sm">بقیهٔ سورس</Card.Title>
          <Card.Description>بک‌اند و قاعده‌های schema، که نقشه نمی‌بیندشان.</Card.Description>
        </Card.Header>
        <Card.Content>
          <Button href={`${base}/source`} variant="outline" size="sm" class="w-full">
            چه چیزی هست که به آن نرسیده‌ایم
          </Button>
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
