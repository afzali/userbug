<script>
  /**
   * صفحهٔ نقشه — «چه کار کنم؟»، و بعد یک فرم.
   *
   * ── چرا دوباره بازطراحی شد ──
   *
   * کاربر گفت: «نقشهٔ کار و خزشِ دستی مگر دو راه مجزا نیستند؟ اگر آن را
   * پر کنم عملاً داینامیک همان فرمِ دستی را پر کرده‌ام. تازه قدم بعد، و
   * بقیهٔ سورس، و در سورس هست نرسیدیم… کلی چیز دارد. گیج‌کننده است.»
   *
   * هر دو ایراد درست بود:
   *
   *   ۱. **دو فرم برای یک کار.** نقشهٔ کار یک راهِ دیگر برای پر کردنِ همان
   *      فرم است، نه مسیری موازی. حالا یکی است: جمله فرم را پر می‌کند، و
   *      همان فرم — با همان دکمه — خزش را شروع می‌کند.
   *
   *   ۲. **هفت کارتِ هم‌وزن در ستونِ چپ.** «قدم بعد»، «بقیهٔ سورس»،
   *      «عددها»، «در سورس هست نرسیدیم»، «دیدیم در سورس نبود»، «پیش‌بینی
   *      نخواند» — همه گزارشِ نقشه بودند ولی وسطِ کنترل‌ها نشسته بودند.
   *      حالا ستونِ چپ فقط «چه کار کنم» است و گزارش‌ها یک کارت کنارِ خودِ
   *      نقشه.
   *
   * ── سه کار، نه هشت تنظیم ──
   *
   * کاربر گفت چه می‌خواهد: «ساده بتواند بگوید چه را بگرد و می‌دانم چیست و
   * کمکت می‌کنم، یا برو هر چه می‌خواهی بگرد». یعنی دو حالت، و سومی که از
   * قبل بود (کاوشِ عمیق با مدل). همان سه، به‌صورتِ یک انتخابِ یکی‌از‌سه.
   */
  import { goto, invalidateAll } from '$app/navigation';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PlanBox from '$lib/components/PlanBox.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { formatNumber } from '$lib/format.js';
  import { pickState } from '../../../../../../src/map/quest.js';

  let { data } = $props();

  let target = $derived(data.target);
  let base = $derived(`/projects/${encodeURIComponent(target)}`);
  let map = $derived(data.map);
  let states = $derived(map?.states || []);
  let hasMap = $derived(states.length > 0);

  /**
   * تنها پرسشِ اولِ این صفحه.
   *
   * `explore` — برو بگرد، هرچه بود.
   * `scoped`  — این را بگرد؛ می‌دانم کجاست و کمک می‌کنم.
   * `quest`   — این یکی را عمیق بررسی کن و سناریو بنویس.
   *
   * هر سه یک اجرا می‌سازند و از همان `POST /api/jobs` می‌گذرند. تفاوتشان در
   * این است که کدام بخشِ فرمِ پایین معنا دارد — و فقط همان‌ها دیده می‌شوند.
   */
  let mode = $state('explore');

  /** جملهٔ کاربر. هم نقشهٔ کار از آن درمی‌آید، هم هدفِ کاوش. */
  let sentence = $state('');

  /* ── فرم: همان تصمیم‌هایی که خزش لازم دارد ── */

  let from = $state('');
  /**
   * دانه — یک بار در کلِ خزش، نه در هر برگشت به خانه.
   *
   * مسیرِ ورود ده‌ها بار بازپخش می‌شود، پس باید بی‌اثر باشد. «فایل نمونه را
   * وارد کن» آنجا یعنی ده‌ها ایمپورتِ تکراری. و بی آن، نقشه از اپِ **خالی**
   * درمی‌آید: روی نپی چهارده گره پیدا شد و «ویرایشِ کتاب» میانشان نبود،
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

  /**
   * «از کجا شروع کند» — یک انتخاب، نه سه تنظیمِ جدا.
   *
   * سه فیلدِ قبلی (`from`، `remember`، `profile`) سه راهِ متفاوتِ **یک** کار
   * بودند: رساندنِ خزنده به حالتِ وارد‌شده. کنار هم مثل سه تنظیمِ مستقل
   * نشسته بودند و هیچ‌جا نوشته نبود که با هم چه می‌کنند — پس کاربر یا
   * هیچ‌کدام را می‌زد و خزش پشتِ صفحهٔ ورود می‌ماند، یا هر سه را.
   */
  let startMode = $state(data.hasProfile ? 'session' : data.accounts.length ? 'account' : 'fresh');
  let remember = $state(data.accounts[0]?.id || '');

  /** پرچم‌های واقعی از انتخابِ بالا مشتق می‌شوند: یک منبعِ حقیقت. */
  let profile = $derived(startMode === 'session');
  let rememberId = $derived(startMode === 'account' ? remember : '');

  /** واژه‌هایی که اول سراغشان برود. فیلتر نیست، اولویت است. */
  let focus = $state('');

  /**
   * دامنه — مرز، نه اولویت.
   *
   * روی نپی، از ۲۲ حالتِ نقشه **۹ تا در `/ai-chat`** افتاد در حالی که
   * خواستهٔ کاربر کتاب بود. `focus` فقط ترتیب را عوض می‌کند، پس نزدیک به
   * نیمی از بودجه رفت جایی که هیچ‌کس نخواسته بود.
   *
   * آرایه است نه رشته: نقشهٔ کار هم آرایه می‌دهد، و تکه‌تکه بودنش یعنی
   * حذفِ یک مورد یک کلیک است، نه ویرایشِ یک متنِ کاماخورده.
   */
  let scope = $state([]);
  let scopeAdd = $state('');

  /**
   * روت‌ها و نماهایی که از قبل می‌شناسیم — تا دامنه از حدس نوشته نشود.
   *
   * تایپ کردنشان با دست یعنی غلط‌های املایی‌ای که بی‌صدا هیچ حالتی را
   * نمی‌گیرند و خزش را به «صف تمام شد» با صفر کنش می‌رسانند.
   */
  let scopeChoices = $derived([
    ...new Set([
      ...states.map((one) => one.route).filter(Boolean),
      ...states.map((one) => one.view).filter(Boolean),
    ]),
  ]);

  /** از کدام نقشهٔ کار آمده — تا اجرا در همان فایل ثبت شود. */
  let missionSlug = $state('');

  let busy = $state(false);
  let error = $state('');
  let saveNote = $state('');
  let planner;

  /**
   * نقشهٔ کار → همین فرم.
   *
   * ── چرا اینجا و نه در کارتِ نقشهٔ کار ──
   *
   * چون آن‌وقت دو جا می‌دانستند «نقشهٔ کار یعنی چه» و دیر یا زود واگرا
   * می‌شدند. حالا سرور یک بار ترجمه می‌کند (`missionToJob`) و رابط یک بار،
   * به همین فیلدها — و کاربر دقیقاً همان چیزی را می‌بیند که می‌توانست با
   * دست پر کند.
   */
  function applyPlan(plan) {
    if (!plan) return;
    mode = 'scoped';
    startMode = plan.start?.mode || startMode;
    if (plan.start?.account) remember = plan.start.account;
    from = plan.start?.entry ? `scenarios/${target}/${plan.start.entry}` : '';
    scope = [...(plan.scope || [])];
    focus = (plan.look || []).join(' ');
    missionSlug = plan.slug || '';
    saveNote = plan.slug ? `از نقشهٔ کارِ «${plan.slug}»` : 'این نقشهٔ کار هنوز ذخیره نشده.';
  }

  /** فرم → فایلِ نقشهٔ کار. همان شکلی که سرور می‌شناسد. */
  async function saveMission() {
    saveNote = '';
    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({
          target,
          action: 'save',
          mission: {
            goal: sentence.trim() || focus.trim() || 'خزشِ محدود',
            text: sentence,
            // دستِ آدم است، نه پیشنهادِ مدل — همان قاعدهٔ `by:` پرونده
            by: 'user',
            start: {
              mode: startMode,
              account: rememberId,
              entry: from ? from.replace(`scenarios/${target}/`, '') : '',
            },
            scope,
            look: focus.trim() ? focus.trim().split(/\s+/) : [],
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'ذخیره نشد');
      missionSlug = payload.mission.slug;
      saveNote = `ذخیره شد: ${payload.mission.slug}`;
      await planner?.refresh();
    } catch (cause) {
      saveNote = cause.message;
    }
  }

  function dropScope(one) {
    scope = scope.filter((item) => item !== one);
  }

  function pushScope() {
    const value = scopeAdd.trim();
    if (!value || scope.includes(value)) return;
    scope = [...scope, value];
    scopeAdd = '';
  }

  /* ── ساختِ «مسیرِ ورود» — همین‌جا، چون همین‌جاست که کم می‌آید ── */

  /**
   * کاربری در تنظیمات حساب ساخت، فایل نمونه آپلود کرد، کلید مدل گذاشت، و
   * خزش را زد — و خزنده روی صفحهٔ ورود ماند. هر سه کار درست بودند ولی
   * هیچ‌کدام به خزش وصل نبود: **خزنده بلد نیست وارد شود**، یک سناریوی ورود
   * را بازپخش می‌کند. و نوشتنِ آن سناریو با دست سخت است (همه‌چیز باید زیر
   * `when` برود) — ولی قدم‌هایش از قبل روی دیسک‌اند.
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

  /* ── گزارشِ نقشه ── */

  /**
   * کدام نما، همین حالا که دارد تایپ می‌کند.
   *
   * کاوش چند دقیقه طول می‌کشد و پول خرج می‌کند. اگر هدف به هیچ نمایی نخورد،
   * از صفحهٔ اول شروع می‌شود و همان کاوشِ آزادِ گران است — و کاربر تازه در
   * پایان می‌فهمد. `pickState` خالص است، پس همین‌جا در مرورگر جواب می‌دهد.
   */
  let questTarget = $derived(sentence.trim().length >= 3 ? pickState(map, sentence) : null);

  /**
   * برچسبِ دسته‌ها به فارسی، یک جا.
   *
   * همان فهرستِ `src/map/render.js`. تکرارش عمدی است و کوچک: آن یکی برای
   * ترمینال است و این یکی برای رابط.
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

  /** جاهایی که فقط گشت می‌شناسدشان — خزش هنوز نرفته. */
  let tourOnly = $derived(
    (data.unified || []).filter((one) => one.by.includes('tour') && !one.by.includes('crawl'))
  );

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

  /* ── شروع ── */

  /**
   * یک دکمه، سه کار.
   *
   * دو فرمِ قبلی دو تابعِ شروع داشتند و هر کدام چیزی می‌فرستاد که آن یکی
   * نمی‌فرستاد. یکی‌شان یعنی هر تصمیم دقیقاً یک بار گرفته می‌شود.
   */
  async function start(event) {
    event.preventDefault();
    error = '';
    busy = true;
    try {
      const body =
        mode === 'quest'
          ? { target, kind: 'quest', goal: sentence, from, headed }
          : {
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
              scope: mode === 'scoped' ? scope.join(',') : '',
              // اجرا در فایلِ نقشهٔ کار ثبت می‌شود — اگر از یکی آمده باشد
              mission: mode === 'scoped' ? missionSlug : '',
            };

      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'شروع نشد');
      // اجرای زنده در فضای کاری دیده می‌شود؛ خزش هم یک اجراست
      await goto(`/projects/${encodeURIComponent(target)}`);
    } catch (cause) {
      error = cause.message;
      busy = false;
    }
  }

  /**
   * شمارهٔ گام‌ها، وگرنه «۱ … ۳» می‌شود.
   *
   * در حالتِ «خودت بگرد» پرسشِ دامنه اصلاً نشان داده نمی‌شود، و شماره‌های
   * ثابت آن‌وقت یک پرسشِ **گم‌شده** را تبلیغ می‌کنند: کاربر دنبالِ ۲ می‌گردد
   * که وجود ندارد.
   */
  let stepNo = $derived.by(() => {
    let i = 0;
    const out = { start: ++i };
    if (mode === 'scoped') out.scope = ++i;
    if (mode !== 'quest') out.caps = ++i;
    return out;
  });

  let canStart = $derived(mode === 'explore' || sentence.trim().length >= 5);
  let startLabel = $derived(
    mode === 'quest' ? 'برو بررسی کن' : mode === 'scoped' ? 'شروع خزشِ محدود' : 'شروع خزش'
  );
</script>

<PageHeader title="نقشهٔ اپ" description="هر حالتی که می‌شود به آن رسید — بی یک فراخوانی مدل" />

{#if !hasMap}
  <!--
    حالتِ خالی، با توضیحِ اینکه این کجای مسیر است. کاربر نباید با فرمی
    روبه‌رو شود که نمی‌داند چرا باید پرش کند.
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
      همهٔ حالت‌ها پشتِ صفحهٔ ورود ماندند؛ این نقشه صفحهٔ ورود است، نه اپ. در
      «از کجا شروع کند» یک <strong>سناریوی ورود</strong> انتخاب کنید و
      <strong>حسابی که به خاطر بسپارد</strong> را پر بگذارید.
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

<div class="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
  <div class="space-y-4">
    <form class="space-y-4" onsubmit={start}>
      <!--
        پرسشِ اول و تنها: چه کار کنم؟

        ── چرا سه گزینه و نه یک فرم ──

        کاربر گفت: «ساده بتواند بگوید چه را بگرد و می‌دانم چیست و کمکت
        می‌کنم، یا برو هر چه می‌خواهی بگرد». این دقیقاً دو حالت است، و سومی
        از قبل بود (کاوشِ عمیق). فرمِ قبلی هر سه را در خودش داشت ولی هیچ‌جا
        نمی‌گفت — کاربر باید از ترکیبِ هشت کنترل حدس می‌زد دارد کدام کار را
        می‌کند.
      -->
      <Card.Root>
        <Card.Header class="pb-3">
          <Card.Title class="text-sm">چه کار کنم؟</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-2">
          <label class="flex items-start gap-2 rounded-lg border p-2.5 text-xs {mode === 'explore' ? 'border-primary bg-accent/40' : ''}">
            <input type="radio" bind:group={mode} value="explore" class="mt-0.5" />
            <span>
              <strong>خودت بگرد، هرچه بود</strong>
              <span class="block text-[11px] leading-5 text-muted-foreground">
                همه‌جا را می‌گردد و نقشه می‌سازد. بی فراخوانی مدل — فقط وقت.
              </span>
            </span>
          </label>

          <label class="flex items-start gap-2 rounded-lg border p-2.5 text-xs {mode === 'scoped' ? 'border-primary bg-accent/40' : ''}">
            <input type="radio" bind:group={mode} value="scoped" class="mt-0.5" />
            <span>
              <strong>می‌دانم کجا را می‌خواهم — کمکت می‌کنم</strong>
              <span class="block text-[11px] leading-5 text-muted-foreground">
                فقط همان‌جا را می‌گردد، پس کلِ وقت خرجِ چیزی می‌شود که خواسته‌ای.
              </span>
            </span>
          </label>

          <label class="flex items-start gap-2 rounded-lg border p-2.5 text-xs {mode === 'quest' ? 'border-primary bg-accent/40' : ''}">
            <input type="radio" bind:group={mode} value="quest" class="mt-0.5" />
            <span>
              <strong>این یکی را عمیق بررسی کن</strong>
              <span class="block text-[11px] leading-5 text-muted-foreground">
                مدل قدم‌به‌قدم می‌گردد و یک <strong>پیش‌نویسِ سناریو</strong>
                می‌نویسد. گران‌تر، و خروجی‌اش یک فایل است نه نقشه.
              </span>
            </span>
          </label>

          {#if mode === 'scoped'}
            <div class="border-t pt-2">
              <PlanBox
                bind:this={planner}
                {target}
                bind:sentence
                onplan={applyPlan}
                disabled={busy}
              />
            </div>
          {/if}

          {#if mode === 'quest'}
            <div class="space-y-2 border-t pt-2">
              <Input bind:value={sentence} placeholder="مثلاً: آپلودِ فایلِ تکراری چه می‌کند" class="h-9" />
              {#if sentence.trim().length >= 3}
                {#if questTarget}
                  <p class="rounded-lg border bg-muted/30 p-2 text-[11px] leading-5">
                    می‌رود به
                    <strong>{questTarget.state.route}{questTarget.state.view ? ` ▸ ${questTarget.state.view}` : ''}</strong>
                    در {questTarget.depth} قدمِ قطعی، بعد از آنجا می‌گردد.
                  </p>
                {:else}
                  <p class="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] leading-5">
                    هیچ نمایی در نقشه با این هدف نخواند، پس از صفحهٔ اول شروع
                    می‌شود و گران‌تر درمی‌آید. واژه‌ای بنویسید که در خودِ اپ
                    دیده می‌شود.
                  </p>
                {/if}
              {/if}
            </div>
          {/if}
        </Card.Content>
      </Card.Root>

      <!--
        و این کاری است که می‌کند.

        عنوانش عمداً خبری است نه پرسشی: این پنل **تأییدِ** تصمیم‌هاست، نه
        پرسش‌نامه‌ای که باید پرش کنی. در حالتِ «خودت بگرد» پیش‌فرض‌ها سرِ
        جایشان‌اند و هیچ‌کدام لازم نیست دست بخورد.
      -->
      <Card.Root>
        <Card.Header class="pb-3">
          <Card.Title class="text-sm">این کاری است که می‌کند</Card.Title>
          <Card.Description>هر کدام را می‌شود همین‌جا عوض کرد.</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          <fieldset class="space-y-2">
            <legend class="text-xs font-semibold">{formatNumber(stepNo.start)}. از کجا شروع کند؟</legend>

            <!--
              ادامهٔ نشستِ گشت — اول، چون بعد از گشت طبیعی‌ترین کار است.
              نامِ قبلی‌اش «همان مرورگرِ خزشِ قبلی» بود: کسی که تازه گشت رفته
              و تیکِ «نشست بماند» را زده، دلیلی نداشت فکر کند این جمله
              دربارهٔ اوست.
            -->
            <label class="flex items-start gap-2 rounded-lg border p-2.5 text-xs {startMode === 'session' ? 'border-primary bg-accent/40' : ''}">
              <input type="radio" bind:group={startMode} value="session" class="mt-0.5" disabled={!data.hasProfile} />
              <span>
                <strong>ادامهٔ همان نشست</strong>
                {#if data.hasProfile}
                  <span class="block text-[11px] leading-5 text-muted-foreground">
                    همان مرورگری که در گشت واردش شدی — نشست و کَش سرِ جایشان‌اند،
                    پس ورود لازم ندارد.
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
                      <a class="underline underline-offset-2" href={`${base}/config`}>در «پیکربندی» یکی بسازید</a>.
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
                  هر اجرا با هویتِ نو ثبت‌نام می‌کند و اپِ خالی را می‌بیند. برای
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
              ضبطِ خام به‌عنوان مسیرِ ورود، خزش را می‌کشد.

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
                  می‌آیند. خزش بارِ دوم همان‌جا می‌شکند.
                </p>
                <button type="button" class="mt-1.5 underline underline-offset-2" onclick={loadEntryOptions}>
                  از رویش یک مسیرِ ورودِ درست بساز
                </button>
              </div>
            {/if}

            <!--
              هشدارِ «ورود ندارد» فقط وقتی که واقعاً لازم است. در حالتِ
              «ادامهٔ نشست» مرورگر از قبل وارد است و این هشدار حرفی است که
              غلط است — بدتر از سکوت.
            -->
            {#if startMode !== 'session' && !from}
              <div class="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-[11px] leading-6">
                <p class="font-medium text-amber-700 dark:text-amber-300">بی مسیرِ ورود، خزش وارد نمی‌شود.</p>
                <p class="mt-0.5 text-muted-foreground">
                  خزنده خودش بلد نیست وارد شود؛ یک سناریوی ورود را بازپخش می‌کند.
                  حسابی که ذخیره کرده‌اید تا وقتی سناریویی به آن اشاره نکند،
                  استفاده نمی‌شود.
                </p>
                <button type="button" class="mt-1.5 underline underline-offset-2" onclick={loadEntryOptions}>
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

          <!--
            دامنه فقط در حالتِ «می‌دانم کجا» معنا دارد.

            در «خودت بگرد» نبودش خودِ تعریفِ آن حالت است، و در «کاوشِ عمیق»
            مسیر را نقشه تعیین می‌کند نه دامنه. نشان دادنِ کنترلی که کاری
            نمی‌کند، همان چیزی است که این صفحه را گیج‌کننده کرده بود.
          -->
          {#if mode === 'scoped'}
            <fieldset class="space-y-2 border-t pt-3">
              <legend class="text-xs font-semibold">{formatNumber(stepNo.scope)}. کجا را بگردد؟</legend>

              {#if scope.length}
                <ul class="flex flex-wrap gap-1.5">
                  {#each scope as one (one)}
                    <li>
                      <button
                        type="button"
                        class="rounded-full border px-2 py-0.5 text-[11px] hover:border-destructive hover:text-destructive"
                        onclick={() => dropScope(one)}
                      >
                        {one} ×
                      </button>
                    </li>
                  {/each}
                </ul>
                <p class="text-[11px] leading-5 text-muted-foreground">
                  رسیدن آزاد می‌ماند؛ فقط کنش‌های بیرونِ این‌ها امتحان نمی‌شوند.
                  نقشهٔ حاصل <strong>عمداً ناقص</strong> است و گزارش می‌گوید چند
                  حالت بیرون ماند.
                </p>
              {:else}
                <p class="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] leading-5">
                  دامنه خالی است، یعنی <strong>همه‌جا</strong> — همان چیزی که این
                  حالت برای جلوگیری از آن است. یک جمله بنویسید و «نقشه‌اش را
                  برایم بکش» را بزنید، یا از فهرستِ زیر بردارید.
                </p>
              {/if}

              <div class="flex gap-1.5">
                <Input bind:value={scopeAdd} list="ub-scope" class="h-8 text-xs" placeholder="روت (/…) یا نامِ نما" />
                <datalist id="ub-scope">
                  {#each scopeChoices as choice (choice)}<option value={choice}></option>{/each}
                </datalist>
                <Button type="button" size="sm" variant="outline" class="h-8" onclick={pushScope}>افزودن</Button>
              </div>

              <label class="block space-y-1">
                <span class="text-[11px] text-muted-foreground">آنجا اول سراغِ چه برود</span>
                <Input bind:value={focus} placeholder="مثلاً: هایلایت برچسب — خالی یعنی فرقی ندارد" class="h-8" />
              </label>

              <!--
                ذخیره‌کردن اختیاری است و بعد از اصلاح، نه قبلش.

                نقشهٔ کار یک **فایل** است: دیده می‌شود، کامیت می‌شود، هفتهٔ بعد
                بی فراخوانیِ دوباره اجرا می‌شود. ولی اجباری کردنش یعنی کسی که
                فقط یک بار چیزی را می‌خواهد، مجبور به نام‌گذاری شود.
              -->
              <div class="flex flex-wrap items-center gap-2 border-t pt-2">
                <Button type="button" size="sm" variant="outline" onclick={saveMission} disabled={busy}>
                  ذخیره به‌عنوان نقشهٔ کار
                </Button>
                {#if saveNote}<span class="text-[11px] text-muted-foreground">{saveNote}</span>{/if}
              </div>
            </fieldset>
          {/if}

          {#if mode !== 'quest'}
            <fieldset class="space-y-2 border-t pt-3">
              <legend class="text-xs font-semibold">{formatNumber(stepNo.caps)}. تا کجا بگردد؟</legend>
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
            </fieldset>
          {/if}

          <label class="flex items-center gap-2 text-xs">
            <input type="checkbox" bind:checked={headed} />
            مرورگر دیده شود
          </label>

          <!--
            چیزهایی که کم لازم می‌شوند، ولی وقتی لازم شدند جایگزین ندارند.
            زیر یک `details` می‌روند نه اینکه حذف شوند: پنهان‌کردنِ کامل یعنی
            کاربری که «ویرایشِ کتاب» در نقشه‌اش نیست، هرگز نفهمد چرا.
          -->
          {#if mode !== 'quest'}
            <details class="border-t pt-3 text-xs">
              <summary class="cursor-pointer font-semibold">تنظیم‌های کم‌کاربرد</summary>
              <div class="space-y-3 pt-3">
                <label class="block space-y-1">
                  <span class="text-[11px] text-muted-foreground">دادهٔ اولیه</span>
                  <select bind:value={seed} class="h-8 w-full rounded-md border bg-background px-2 text-xs">
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
                    <strong>یک بار</strong> پیش از خزش اجرا می‌شود — مثلاً وارد
                    کردنِ فایلِ نمونه. بی آن، نقشه از اپِ خالی درمی‌آید و
                    صفحه‌هایی که به داده نیاز دارند اصلاً دیده نمی‌شوند.
                  </span>
                </label>

                {#if hasMap}
                  <!--
                    تکلیفِ نقشهٔ موجود.

                    کاربر یک بار پرسید «مگر در بالا انتخاب نکرده‌ام؟» — حق
                    داشت گیج شود: بالا دربارهٔ **مرورگر و هویت** است، این یکی
                    دربارهٔ **فایلِ نقشه**. نامش حالا خودِ نقشه را می‌گوید و
                    عددِ حالت‌های فعلی کنارش است تا پیامد ملموس باشد.
                  -->
                  <label class="flex items-start gap-2">
                    <input type="checkbox" bind:checked={fresh} class="mt-0.5" />
                    <span>
                      نقشه را از نو بساز
                      <span class="block text-[11px] leading-5 text-muted-foreground">
                        نقشهٔ فعلی ({formatNumber(states.length)} حالت) دور ریخته می‌شود.
                        خالی یعنی روی همان ادامه می‌دهد و فقط چیزهای تازه را اضافه می‌کند.
                      </span>
                    </span>
                  </label>
                {/if}
              </div>
            </details>
          {/if}

          {#if error}<p class="text-xs text-destructive">{error}</p>{/if}

          <Button type="submit" class="w-full" disabled={busy || !canStart}>
            {busy ? 'در حال شروع…' : startLabel}
          </Button>
          <p class="text-[11px] leading-5 text-muted-foreground">
            {#if mode === 'quest'}
              خروجی‌اش یک <strong>پیش‌نویسِ سناریو</strong>ست با مقدمهٔ آماده —
              همان مسیری که نقشه بلد بود.
            {:else}
              مثل هر اجرای دیگری زنده دیده می‌شود؛ بعد از شروع به فضای کاری می‌رویم.
            {/if}
          </p>
        </Card.Content>
      </Card.Root>
    </form>

    {#if hasMap}
      <!--
        قدمِ بعد — تنها کارتی که در ستونِ کنترل مانده، چون **کار** است نه
        گزارش: هر نمایی که نقشه پیدا کرده و سناریویی سراغش نرفته، یک
        پیشنهاد است با مسیرِ واقعیِ رسیدنش.
      -->
      <Card.Root>
        <Card.Header class="pb-3">
          <Card.Title class="text-sm">بعدش چه؟</Card.Title>
        </Card.Header>
        <Card.Content>
          <Button href={`${base}/proposals`} class="w-full" size="sm">
            {data.fromMap
              ? `${data.fromMap} سناریوی پیشنهادی از این نقشه`
              : 'ببین چه باید آزمود'}
          </Button>
        </Card.Content>
      </Card.Root>
    {/if}
  </div>

  <div class="space-y-4">
    {#if !hasMap}
      <p class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        هنوز نقشه‌ای نیست.
      </p>
    {:else}
      <!--
        گزارشِ نقشه — یک کارت، نه پنج تا.

        «عددها»، «در سورس هست نرسیدیم»، «دیدیم در سورس نبود» و «پیش‌بینی
        نخواند» همه یک پرسش را جواب می‌دهند: این نقشه چه می‌گوید. پنج کارتِ
        هم‌وزن در ستونِ کنترل، هم آن ستون را یک کیلومتر می‌کرد هم هیچ‌کدام را
        مهم نشان نمی‌داد. حالا عددها همیشه پیدایند و تفصیل‌ها تا خواسته
        نشوند بسته‌اند.
      -->
      <Card.Root>
        <Card.Header class="pb-3">
          <Card.Title class="text-sm">این نقشه چه می‌گوید</Card.Title>
          {#if map.entry?.scenario}
            <Card.Description class="text-[11px]">مسیرِ ورود: {map.entry.scenario}</Card.Description>
          {/if}
        </Card.Header>
        <Card.Content class="space-y-3">
          <!--
            پوشش از **همهٔ** منابع، نه فقط خزش.

            کاربر پرسید «آیا گشت خودش یک نوع نقشه نیست؟» — بود، و این کارت
            تا امروز فقط گره‌های خزش را می‌شمرد. یعنی جایی که آدم در گشت
            دیده بود و جایی که فقط در سورس هست، هیچ‌کدام در مخرج نبودند و
            نمره از واقعیت خوش‌بین‌تر درمی‌آمد.
          -->
          {#if data.coverage?.total}
            <div class="rounded-lg border bg-muted/30 p-2.5 text-[11px] leading-6">
              <p>
                <strong>{formatNumber(data.coverage.total)} جای شناخته‌شده</strong> —
                {formatNumber(data.coverage.crawled)} خزش · {formatNumber(data.coverage.toured)} گشت
                {#if data.coverage.untouched}
                  · <span class="text-amber-600 dark:text-amber-400">
                      {formatNumber(data.coverage.untouched)} فقط در سورس، هیچ‌کس نرفته
                    </span>
                {/if}
              </p>
              <!--
                «جا» با «حالت» یکی نیست و باید گفته شود.
                حالت = روت + نما + شکلِ صفحه، پس یک جا می‌تواند چند حالت
                داشته باشد (کتابِ باز و کتابِ بسته). بی این توضیح، دو عددِ
                کنار هم که نمی‌خوانند فقط گیج می‌کنند.
              -->
              <p class="text-muted-foreground">
                «جا» یعنی روت و نما؛ یک جا می‌تواند چند حالتِ خزش داشته باشد.
              </p>
              {#if data.coverage.withoutContract}
                <!--
                  «رفته‌ایم ولی نمی‌دانیم اینجا چه چیزی همیشه هست» — و آن دقیقاً
                  جایی است که هیچ انتظاری نمی‌شود نوشت.
                -->
                <p class="text-muted-foreground">
                  {formatNumber(data.coverage.withoutContract)} جا قرارداد ندارد؛
                  {formatNumber(data.coverage.contracts)} بندِ «همیشه اینجا بوده» ثبت شده.
                </p>
              {/if}
            </div>
          {/if}

          <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
            {#each [['حالتِ خزش', states.length], ['کنش', totals.actions], ['امتحان‌شده', totals.tried], ['در صف', map.frontier?.length || 0]] as [label, value] (label)}
              <div>
                <span class="block text-[11px] text-muted-foreground">{label}</span>
                <span class="font-medium">{formatNumber(value)}</span>
              </div>
            {/each}
          </div>

          <details class="text-xs">
            <summary class="cursor-pointer text-muted-foreground">عددهای ریزتر</summary>
            <div class="mt-2 space-y-1.5">
              <div class="flex justify-between"><span class="text-muted-foreground">یال</span><span>{map.edges?.length || 0}</span></div>
              <div class="flex justify-between"><span class="text-muted-foreground">بی‌اثر</span><span>{totals.inert}</span></div>
              <div class="flex justify-between"><span class="text-muted-foreground">برگشت‌ناپذیر (نزده)</span><span>{totals.destructive}</span></div>
              {#if map.stats?.stoppedBecause}
                <div class="flex justify-between"><span class="text-muted-foreground">توقف</span><span>{map.stats.stoppedBecause}</span></div>
              {/if}
            </div>
          </details>

          <!--
            پیش‌بینیِ سورس در برابرِ آنچه واقعاً شد — اول، چون «جایی رفتیم که
            نباید» احتمالِ باگ بودنش از «کجا نرفتیم» بیشتر است.
          -->
          {#if data.mispredicted?.length}
            <details class="text-xs">
              <summary class="cursor-pointer">
                پیش‌بینی نخواند ({formatNumber(data.mispredicted.length)})
                <span class="text-[11px] text-muted-foreground">— سورس یک چیز گفت، کلیک چیز دیگری</span>
              </summary>
              <div class="mt-2 space-y-1.5">
                {#each data.mispredicted.slice(0, 8) as row (row.label + row.predicted)}
                  <div class="rounded-lg border p-2">
                    <span class="block font-medium">{row.label}</span>
                    <span dir="ltr" class="mt-1 block font-mono text-[11px] text-muted-foreground">
                      {row.predicted} → {row.actual}
                    </span>
                  </div>
                {/each}
              </div>
            </details>
          {/if}

          {#if data.unreached.length}
            <details class="text-xs">
              <summary class="cursor-pointer">در سورس هست، نرسیدیم ({formatNumber(data.unreached.length)})</summary>
              <div class="mt-2 flex flex-wrap gap-1.5">
                {#each data.unreached as route (route)}
                  <Badge variant="outline" class="font-mono text-[11px]">{route}</Badge>
                {/each}
              </div>
            </details>
          {/if}

          <!--
            جاهایی که فقط گشت می‌شناسدشان.

            تا امروز صفحهٔ نقشه این‌ها را اصلاً نشان نمی‌داد، چون فقط
            `map.json` را می‌خواند — و کاربر حق داشت بپرسد «مگر گشت خودش یک
            نوع نقشه نیست؟».
          -->
          {#if tourOnly.length}
            <details class="text-xs">
              <summary class="cursor-pointer">
                فقط در گشت دیده شده ({formatNumber(tourOnly.length)})
                <span class="text-[11px] text-muted-foreground">— خزش هنوز نرفته</span>
              </summary>
              <div class="mt-2 space-y-1">
                {#each tourOnly as one (one.key)}
                  <div class="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border p-2">
                    <span class="font-mono text-[11px]">{one.route}{one.view ? ` ▸ ${one.view}` : ''}</span>
                    <span class="text-[11px] text-muted-foreground">
                      {one.contract ? `${formatNumber(one.contract)} بندِ قرارداد` : 'بی قرارداد'}
                      {#if one.purpose}· {one.purpose.slice(0, 60)}{/if}
                    </span>
                  </div>
                {/each}
              </div>
            </details>
          {/if}

          {#if data.extra.length && data.knownRoutes.length}
            <details class="text-xs">
              <summary class="cursor-pointer">دیدیم، در سورس نبود ({formatNumber(data.extra.length)})</summary>
              <div class="mt-2 flex flex-wrap gap-1.5">
                {#each data.extra as route (route)}
                  <Badge variant="outline" class="font-mono text-[11px]">{route}</Badge>
                {/each}
              </div>
            </details>
          {/if}

          <!--
            نقشه فقط نیمی از پوشش است: صفحه‌ها را می‌بیند، بک‌اند و قاعده‌های
            schema را نه. لینک همین‌جاست چون کسی که «در سورس هست، نرسیدیم» را
            خوانده، همان لحظه سؤالِ بعدی‌اش را دارد.
          -->
          <a class="block text-xs underline underline-offset-4" href={`${base}/source`}>
            بقیهٔ سورس: بک‌اند و schema، که نقشه نمی‌بیندشان
          </a>
        </Card.Content>
      </Card.Root>

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
