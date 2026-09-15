<script>
  /**
   * شناختِ پروژه — دیدن، ساختن، و اصلاح کردن.
   *
   * ── چرا برچسبِ منبع روی **هر** ردیف است ──
   *
   * پرونده هم جملهٔ کاربر را دارد هم حدسِ مدل. اگر هر دو یک شکل دیده شوند،
   * صفحه‌ای خوش‌قیافه می‌سازد که خواننده را گمراه می‌کند: شش ماه بعد کسی
   * نمی‌داند کدام را خودش گفته.
   *
   * ── چرا پرسش‌ها اولین چیزِ صفحه‌اند ──
   *
   * جوابِ کاربر پراعتمادترین چیزی است که این سیستم می‌گیرد، و تنها راهی است
   * که چیزی `by: user` می‌شود. اگر پایینِ صفحه بود، کسی تا آنجا نمی‌رفت.
   */
  import { invalidateAll } from '$app/navigation';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import ModelPicker from '$lib/components/ModelPicker.svelte';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { formatDate, formatNumber } from '$lib/format.js';

  let { data, target } = $props();

  let base = $derived(`/projects/${encodeURIComponent(target)}`);

  /**
   * «این پروژه چیست» — متنی که خودت می‌نویسی.
   *
   * ── چرا این کادر لازم بود ──
   *
   * همهٔ این صفحه چیزهایی است که **ماشین** فهمیده: روت از سورس، واژه از
   * گشت، خلاصه از مدل. جایی نبود که آدم بنویسد «این اپ چیست، این اصطلاح
   * اینجا یعنی چه» — و همان چیزی است که مدل از سورس درنمی‌آورد.
   *
   * هرچه اینجا بنویسی، بالای **هر** prompt می‌نشیند: ساختِ سناریو، کاوش،
   * بازنویسی، و «چرا این شد؟».
   */
  // svelte-ignore state_referenced_locally
  let brief = $state(data.found.brief || '');
  // svelte-ignore state_referenced_locally
  let briefSaved = $state(data.found.brief || '');
  let briefBusy = $state(false);
  let briefNote = $state('');

  /**
   * اسکنِ دوبارهٔ سورس — endpointها و قاعده‌ها.
   *
   * از صفحهٔ «سورس» آمد. هیچ مدلی صدا نمی‌زند: هر سه عدد از حقیقتِ نحوی
   * می‌آیند، پس صفحه‌ای که فقط برای نگاه کردن باز می‌شود پول خرج نمی‌کند.
   */
  async function rescan() {
    busy = 'source';
    error = '';
    feedback = '';
    try {
      const response = await fetch('/api/source', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target: target }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'خوانده نشد');
      feedback =
        `${payload.files} فایل خوانده شد · ${payload.endpoints} endpoint` +
        (payload.invariantsAdded ? ` · ${payload.invariantsAdded} ناوردای تازه` : '');
      await invalidateAll();
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  async function saveBrief() {
    briefBusy = true;
    briefNote = '';
    try {
      const response = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target: target, text: brief }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'ذخیره نشد');
      briefSaved = brief;
      briefNote = 'ذخیره شد — از این به بعد بالای هر prompt می‌نشیند.';
    } catch (cause) {
      briefNote = cause.message;
    } finally {
      briefBusy = false;
    }
  }

  // svelte-ignore state_referenced_locally
  let dossier = $state(data.found.dossier);
  // svelte-ignore state_referenced_locally
  let pages = $state(data.found.pages || []);
  // svelte-ignore state_referenced_locally
  let coverage = $state(data.found.coverage);
  // svelte-ignore state_referenced_locally
  let history = $state(data.found.history || []);

  // svelte-ignore state_referenced_locally
  let docs = $state(data.found.docs || []);

  let newDoc = $state({ url: '', note: '' });

  let busy = $state('');
  let feedback = $state('');
  let error = $state('');
  let model = $state('');
  let dryResult = $state(null);
  let showHistory = $state(false);
  let answers = $state({});
  /** پرسشی که همین حالا در حالِ اصلاح است؛ رشتهٔ خالی یعنی هیچ‌کدام. */
  let editing = $state('');

  const SOURCE_LABEL = { user: 'کاربر', tour: 'گشت', source: 'سورس', run: 'اجرا', docs: 'مستند', model: 'مدل' };
  /** کاربر برجسته می‌شود چون تنها منبعی است که قضاوتِ آدم پشتش است. */
  const SOURCE_TONE = { user: 'default', tour: 'secondary', source: 'secondary' };
  const toneOf = (by) => SOURCE_TONE[by] || 'outline';

  let started = $derived(Boolean(coverage?.started));
  let openQuestions = $derived((dossier?.openQuestions || []).filter((item) => !item.answer));
  let answeredQuestions = $derived((dossier?.openQuestions || []).filter((item) => item.answer));
  let pageByPath = $derived(new Map(pages.map((item) => [item.path, item])));
  let conflicted = $derived((dossier?.routes || []).filter((item) => item.conflict?.length));

  async function send(body) {
    busy = body.action;
    error = '';
    feedback = '';
    try {
      const response = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target: target, ...body }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'انجام نشد');
      return payload;
    } catch (cause) {
      error = cause.message;
      return null;
    } finally {
      busy = '';
    }
  }

  /** هر پاسخِ موفق، کلِ وضعیت را تازه می‌کند تا صفحه با دیسک واگرا نشود. */
  function absorb(payload) {
    if (!payload || payload.dry) return;
    dossier = payload.dossier;
    pages = payload.pages || [];
    coverage = payload.coverage;
    history = payload.history || [];
    docs = payload.docs || [];
  }

  async function addDoc() {
    const payload = await send({ action: 'doc-add', ...newDoc });
    if (!payload) return;
    absorb(payload);
    feedback = `واکشی شد: ${payload.saved.relative} — این متن by: docs است، نه by: user.`;
    newDoc = { url: '', note: '' };
  }

  const kb = (bytes) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);

  async function digest({ dry }) {
    dryResult = null;
    const payload = await send({ action: 'digest', dry, model });
    if (!payload) return;

    if (payload.dry) {
      dryResult = payload;
      feedback = `${payload.files} فایل خوانده شد · ${payload.routes.length} روت پیدا شد · چیزی ذخیره نشد`;
      return;
    }

    absorb(payload);
    feedback =
      `${payload.scan.routes} روت · ${payload.merge.replaced} تازه یا جایگزین · ` +
      `${payload.merge.kept} دست‌نخورده · ${payload.merge.conflicts} تعارض` +
      (payload.spent ? ` · ${payload.spent.toFixed(4)}$` : '');
  }

  async function answer(question, { edited = false } = {}) {
    const text = String(answers[question] ?? '').trim();
    if (!text) return;
    const payload = await send({ action: 'answer', question, answer: text });
    if (!payload) return;
    absorb(payload);
    answers = { ...answers, [question]: '' };
    editing = '';
    feedback = edited
      ? 'جواب اصلاح شد؛ بندی که از جوابِ قبلی ساخته شده بود هم برداشته شد.'
      : 'ثبت شد؛ این بند حالا by: user است و حدسِ مدل عوضش نمی‌کند.';
  }

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

  let map = $derived(data.crawl.map);

  /**
   * جاهایی که فقط گشت می‌شناسدشان — خزش هنوز نرفته.
   *
   * تعریفش با استفاده‌اش در یک فایل می‌ماند: وقتی ستونِ گزارش از صفحهٔ نقشه
   * به اینجا آمد، این یکی جا ماند و صفحه با `ReferenceError` افتاد — بی
   * اینکه `svelte-check` چیزی بگوید.
   */
  let tourOnly = $derived(
    (data.found.places || []).filter((one) => one.by.includes('tour') && !one.by.includes('crawl'))
  );
  let states = $derived(map?.states || []);
  let hasMap = $derived(states.length > 0);

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
</script>

<div class="space-y-6">
  <!--
    دکمه‌های «چه پیدا شد»: خواندنِ سورس و ساختِ شناخت.

    این‌ها هم یک راهِ کشف‌اند، ولی راهی که مرورگر لازم ندارد — پس کنارِ
    نتیجه می‌نشینند نه کنارِ گشت و خزش.
  -->
  <div class="flex flex-wrap items-center gap-2">
    <Button variant="outline" disabled={Boolean(busy)} onclick={() => digest({ dry: true })}>
      {busy === 'digest' ? '…' : 'فقط ساختار (رایگان)'}
    </Button>
    <Button disabled={Boolean(busy)} onclick={() => digest({ dry: false })}>
      {busy === 'digest' ? 'در حال خواندن…' : started ? 'به‌روزرسانی از سورس' : 'ساختِ شناخت از سورس'}
    </Button>
    <!--
      قدمِ بعد از شناخت، «چه باید آزمود» است.

      این صفحه می‌گوید چه می‌دانیم؛ آن یکی می‌گوید از آنچه می‌دانیم، چه چیزی
      آزموده نشده. بی این دکمه، صفحه در خودش تمام می‌شد.
    -->
    <!--
      خواندنِ دوبارهٔ سورس — بی هیچ فراخوانی مدل.

      از صفحهٔ «سورس» آمد که در همین صفحه ادغام شد. اسکنِ endpointها و
      قاعده‌ها نحوی است: مسیرِ فایل، رشتهٔ `case 'GET /x'`، و `UNIQUE(...)`.
    -->
    <Button variant="outline" disabled={busy === 'source' || !data.found.hasSource} onclick={rescan}>
      {busy === 'source' ? 'در حال خواندن…' : 'خواندنِ دوبارهٔ سورس'}
    </Button>
    <Button href={`/projects/${encodeURIComponent(target)}/missions`} variant="outline">چه باید آزمود</Button>
  </div>

{#if error}
  <div class="mb-4 whitespace-pre-line rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</div>
{/if}
{#if feedback}
  <div class="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">{feedback}</div>
{/if}

<!--
  «این پروژه چیست» — اولِ صفحه، چون زمینه پیش از فهرست می‌آید.

  بقیهٔ این صفحه چیزهایی است که ماشین فهمیده. این یکی تنها جایی است که
  خودِ آدم حرف می‌زند، و همان چیزی است که مدل از سورس درنمی‌آورد: اینکه
  «کتاب» و «پاراگراف» در این اپ یعنی چه.
-->
<section class="mb-6 rounded-xl border bg-card p-4">
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <h2 class="text-sm font-bold">این پروژه چیست؟</h2>
    <span class="text-[11px] text-muted-foreground">
      نوشتهٔ شما · بالای <strong>هر</strong> prompt می‌نشیند
    </span>
  </div>
  <p class="mt-1 text-xs leading-6 text-muted-foreground">
    استک، واحدهای اصلی، اصطلاحاتِ خودتان، و هر چیزی که از سورس پیدا نیست.
    هرچه اینجا دقیق‌تر باشد، مدل کمتر از نامِ دکمه‌ها حدس می‌زند.
  </p>

  <Textarea
    bind:value={brief}
    rows="4"
    class="mt-3"
    placeholder="مثلاً: نپی یک کتاب‌خوانِ آفلاین است. «کتاب» واحدِ اصلی است و از «پاراگراف» ساخته می‌شود. همگام‌سازی اختیاری است و با سرورِ PHP کار می‌کند."
  />

  <div class="mt-2 flex flex-wrap items-center gap-2">
    <Button size="sm" onclick={saveBrief} disabled={briefBusy || brief === briefSaved}>
      {briefBusy ? 'در حال ذخیره…' : 'ذخیره'}
    </Button>
    {#if briefNote}<span class="text-xs text-muted-foreground">{briefNote}</span>{/if}
    {#if brief !== briefSaved}<span class="text-xs text-amber-600 dark:text-amber-300">ذخیره‌نشده</span>{/if}
  </div>
</section>

<div class="mb-6 max-w-md">
  <label class="mb-1 block text-xs text-muted-foreground" for="k-model">مدل تحلیل (اختیاری)</label>
  <ModelPicker bind:value={model} disabled={Boolean(busy)} />
</div>

{#if !started}
  <!-- پروژهٔ بی‌شناخت با پروژهٔ صفردرصد یکی نیست؛ اولی هنوز شروع نشده -->
  <section class="rounded-xl border border-dashed p-6 text-sm leading-7 text-muted-foreground">
    <p class="mb-3 font-semibold text-foreground">هنوز چیزی دربارهٔ این پروژه نمی‌دانیم.</p>
    <p>
      «ساختِ شناخت از سورس» فهرست روت‌ها و استک را <em>بی‌مدل</em> استخراج می‌کند و بعد یک فراخوانی مدل
      برای معنا و پرسش‌ها می‌زند. اگر پروژه <code>source.root</code> ندارد، شناخت از راه پاسخ به پرسش‌ها
      و (به‌زودی) گشتِ زنده ساخته می‌شود.
    </p>
  </section>
{:else}
  <section class="mb-6 grid gap-3 sm:grid-cols-4">
    <div class="rounded-xl border p-4">
      <p class="text-xs text-muted-foreground">سنجهٔ شناخت</p>
      <p class="text-2xl font-extrabold">{Math.round((coverage?.score || 0) * 100)}٪</p>
    </div>
    <div class="rounded-xl border p-4">
      <p class="text-xs text-muted-foreground">روتِ هدف‌دار</p>
      <p class="text-2xl font-extrabold">{coverage?.routes.described} / {coverage?.routes.known}</p>
    </div>
    <div class="rounded-xl border p-4">
      <p class="text-xs text-muted-foreground">صفحهٔ ثبت‌شده</p>
      <p class="text-2xl font-extrabold">{coverage?.pages.total}{#if coverage?.pages.stale}<span class="text-sm font-normal text-muted-foreground"> ({coverage.pages.stale} کهنه)</span>{/if}</p>
    </div>
    <div class="rounded-xl border p-4">
      <p class="text-xs text-muted-foreground">پرسشِ بی‌جواب</p>
      <p class="text-2xl font-extrabold">{coverage?.questionsOpen}</p>
    </div>
  </section>
{/if}

{#if dryResult}
  <section class="mb-6 rounded-xl border p-4">
    <h2 class="mb-2 text-sm font-bold">پیش‌نمایشِ ساختار — ذخیره نشد</h2>
    <p class="mb-3 text-xs text-muted-foreground">
      استک: {Object.entries(dryResult.stack).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}
      · آشکارساز: {Object.entries(dryResult.byDetector).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ') || 'هیچ'}
    </p>
    <ul class="scroll-thin max-h-52 overflow-y-auto text-sm">
      {#each dryResult.routes as route (route.path)}
        <li class="py-0.5 font-mono text-xs">{route.path}</li>
      {:else}
        <li class="text-muted-foreground">هیچ روتی پیدا نشد — این پروژه با قاعده‌های شناخته‌شده نمی‌خواند.</li>
      {/each}
    </ul>
  </section>
{/if}

{#if openQuestions.length}
  <section class="mb-6 rounded-xl border border-primary/30 p-4">
    <h2 class="mb-1 text-sm font-bold">پرسش‌های بی‌جواب</h2>
    <p class="mb-4 text-xs leading-6 text-muted-foreground">
      این‌ها را مدل از سورس نفهمید. جوابِ شما <code>by: user</code> می‌گیرد و از این به بعد هیچ حدسی
      عوضش نمی‌کند — پرسیدن ارزان‌تر از حدس زدن است.
    </p>
    <ul class="flex flex-col gap-3">
      {#each openQuestions as item (item.q)}
        <li class="rounded-lg border p-3">
          <p class="mb-2 text-sm">{item.q}</p>
          <div class="flex gap-2">
            <Input bind:value={answers[item.q]} placeholder="جوابتان…" disabled={Boolean(busy)} />
            <Button
              variant="outline"
              disabled={Boolean(busy) || !String(answers[item.q] ?? '').trim()}
              onclick={() => answer(item.q)}>ثبت</Button
            >
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if dossier?.summary}
  <section class="mb-6 rounded-xl border p-4">
    <h2 class="mb-2 text-sm font-bold">این اپ چیست</h2>
    <p class="text-sm leading-7">{dossier.summary}</p>
    <div class="mt-3 flex flex-wrap gap-2 text-xs">
      {#each Object.entries(dossier.stack || {}) as [key, value]}
        {#if value && !['by', 'at', 'conflict'].includes(key)}<Badge variant="secondary">{key}: {value}</Badge>{/if}
      {/each}
      {#if dossier.auth?.kind && dossier.auth.kind !== 'unknown'}
        <Badge variant="secondary">ورود: {dossier.auth.kind}</Badge>
        {#if dossier.auth.loginPath}<Badge variant="outline">{dossier.auth.loginPath}</Badge>{/if}
      {/if}
    </div>
  </section>
{/if}

{#if conflicted.length}
  <section class="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
    <h2 class="mb-1 text-sm font-bold">تعارض‌ها</h2>
    <p class="mb-3 text-xs leading-6 text-muted-foreground">
      اینجا حرفِ تازه با بندِ معتبرتر نخوانده. بندِ اصلی <strong>عوض نشده</strong>؛ حرفِ تازه کنارش
      ثبت شده تا خودتان تصمیم بگیرید.
    </p>
    <ul class="flex flex-col gap-2 text-sm">
      {#each conflicted as route (route.path)}
        <li class="rounded-lg border p-3">
          <p class="font-mono text-xs">{route.path}</p>
          <p class="mt-1">مانده: {route.purpose || '—'} <Badge variant={toneOf(route.by)}>{SOURCE_LABEL[route.by]}</Badge></p>
          {#each route.conflict as item}
            <p class="mt-1 text-xs text-muted-foreground">در برابرِ [{SOURCE_LABEL[item.by]}]: {item.note}</p>
          {/each}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<!--
  جاهای اپ — از خزش، گشت، و سورس، در یک فهرست.

  ── چرا جدولِ «روت‌ها» جایش را داد ──

  آن جدول فقط `dossier.routes` را می‌خواند، یعنی چیزی که `learn` از سورس
  درآورده. پس مودالی که خزش پیدا کرده بود و صفحه‌ای که فقط گشت دیده بود،
  هیچ‌کدام در آن نبودند — و عددِ پوشش همیشه از واقعیت خوش‌بین‌تر بود.
-->
<section class="mb-6 rounded-xl border p-4">
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <h2 class="text-sm font-bold">جاهای اپ</h2>
    <span class="text-[11px] text-muted-foreground">
      {formatNumber(data.found.placeCoverage.crawled)} خزش ·
      {formatNumber(data.found.placeCoverage.toured)} گشت ·
      {formatNumber(data.found.placeCoverage.untouched)} فقط در سورس
    </span>
  </div>

  {#if !data.found.places.length}
    <p class="mt-2 text-xs leading-6 text-muted-foreground">
      هنوز هیچ‌جایی شناخته نشده. یک
      <a class="underline underline-offset-2" href={`${base}/discover`}>گشت</a> بروید یا
      <a class="underline underline-offset-2" href={`${base}/discover`}>خزش</a> کنید.
    </p>
  {:else}
    <div class="scroll-thin mt-3 max-h-96 overflow-auto">
      <table class="w-full text-sm">
        <thead class="text-xs text-muted-foreground">
          <tr class="border-b">
            <th class="p-2 text-right">جا</th>
            <th class="p-2 text-right">از کجا می‌دانیم</th>
            <th class="p-2 text-right">کنش</th>
            <th class="p-2 text-right">قرارداد</th>
          </tr>
        </thead>
        <tbody>
          {#each data.found.places as place (place.key)}
            <tr class="border-b last:border-0">
              <td class="whitespace-nowrap p-2 font-mono text-xs">
                {place.route}{place.view ? ` ▸ ${place.view}` : ''}
                {#if place.purpose}<span class="block font-sans text-[11px] text-muted-foreground">{place.purpose.slice(0, 70)}</span>{/if}
              </td>
              <td class="p-2">
                {#each place.by as source (source)}
                  <Badge variant={source === 'source' ? 'outline' : 'secondary'} class="me-1 text-[10px]">
                    {data.found.byLabel[source] || source}
                  </Badge>
                {/each}
              </td>
              <td class="p-2 text-xs text-muted-foreground">
                {#if place.actions}{formatNumber(place.tried)} از {formatNumber(place.actions)}{:else}—{/if}
              </td>
              <td class="p-2 text-xs">
                {#if place.contract}
                  {formatNumber(place.contract)} بند
                {:else if place.by.includes('crawl') || place.by.includes('tour')}
                  <!--
                    رفته‌ایم آنجا و نمی‌دانیم چه چیزی همیشه هست — یعنی هیچ
                    انتظاری هم نمی‌شود نوشت.
                  -->
                  <span class="text-amber-600 dark:text-amber-400">ندارد</span>
                {:else}
                  <span class="text-muted-foreground">نرفته‌ایم</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

{#if dossier?.risks?.length}
  <section class="mb-6 rounded-xl border p-4">
    <h2 class="mb-1 text-sm font-bold">خطرها</h2>
    <p class="mb-3 text-xs text-muted-foreground">
      این برچسب‌ها مستقیم به <code>explore.avoid</code> اضافه می‌شوند، پس کاوشگر رویشان کلیک نمی‌کند.
    </p>
    <ul class="flex flex-wrap gap-2">
      {#each dossier.risks as risk (risk.label)}
        <li class="rounded-lg border px-3 py-1.5 text-sm">
          <strong>{risk.label}</strong>
          {#if risk.why}<span class="text-muted-foreground"> — {risk.why}</span>{/if}
          <Badge variant={toneOf(risk.by)}>{SOURCE_LABEL[risk.by]}</Badge>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if dossier?.glossary?.length}
  <section class="mb-6 rounded-xl border p-4">
    <h2 class="mb-3 text-sm font-bold">واژه‌نامه</h2>
    <ul class="grid gap-2 text-sm sm:grid-cols-2">
      {#each dossier.glossary as item (item.term)}
        <li><strong>{item.term}</strong> — {item.meaning} <Badge variant={toneOf(item.by)}>{SOURCE_LABEL[item.by]}</Badge></li>
      {/each}
    </ul>
  </section>
{/if}

<section class="mb-6 rounded-xl border p-4">
  <h2 class="mb-1 text-sm font-bold">مستنداتِ بیرونی</h2>
  <p class="mb-3 text-xs leading-6 text-muted-foreground">
    آدرسِ مستندِ پروژه را بدهید تا واکشی و در شناخت ذخیره شود. این متن
    <code>by: docs</code> می‌گیرد و <strong>هرگز</strong> به <code>by: user</code> ترفیع نمی‌شود — متنِ یک
    صفحهٔ وب داده است، نه دستور. اعتمادش هم پایین‌تر از سورس است: کد آنچه <em>هست</em> را می‌گوید،
    مستند آنچه <em>قرار بود باشد</em>.
    <br />
    آدرسِ محلی و شبکهٔ خصوصی واکشی نمی‌شوند.
  </p>

  {#if docs.length}
    <ul class="mb-4 flex flex-col gap-1 text-sm">
      {#each docs as doc (doc.relative)}
        <li class="flex items-center gap-2 rounded-lg border px-3 py-1.5">
          <code class="min-w-0 flex-1 truncate">{doc.relative}</code>
          <span class="text-xs text-muted-foreground">{kb(doc.bytes)}</span>
          <button
            class="text-xs text-muted-foreground hover:text-destructive"
            disabled={Boolean(busy)}
            onclick={() => send({ action: 'doc-remove', relative: doc.relative }).then(absorb)}>حذف</button
          >
        </li>
      {/each}
    </ul>
  {/if}

  <div class="grid gap-2 sm:grid-cols-3">
    <Input bind:value={newDoc.url} placeholder="https://…" disabled={Boolean(busy)} />
    <Input bind:value={newDoc.note} placeholder="چرا این سند؟ (اختیاری)" disabled={Boolean(busy)} />
    <Button variant="outline" disabled={Boolean(busy) || !newDoc.url.trim()} onclick={addDoc}>
      {busy === 'doc-add' ? 'در حال واکشی…' : 'واکشی و ذخیره'}
    </Button>
  </div>
</section>

{#if answeredQuestions.length}
  <!--
    جوابِ ثبت‌شده باید قابلِ اصلاح باشد.

    ── چرا فقط دیدن کافی نبود ──

    جوابِ کاربر `by: user` می‌شود و هیچ حلقهٔ خودکاری عوضش نمی‌کند — که درست
    است، ولی یعنی یک جوابِ عجولانه تا ابد می‌ماند و همه‌چیزِ پایین‌دستش
    (پیشنهادها، `explore.avoid`، prompt مدل) رویش بنا می‌شود. چیزی که
    تغییرناپذیر است باید دستِ‌کم به دستِ **خودِ آدم** تغییرپذیر باشد.
  -->
  <section class="mb-6 rounded-xl border p-4">
    <h2 class="mb-1 text-sm font-bold">پرسش‌های جواب‌گرفته</h2>
    <p class="mb-3 text-xs text-muted-foreground">
      جوابِ شما <code>by: user</code> است و مدل عوضش نمی‌کند — ولی خودتان
      می‌توانید. اصلاحِ جواب، بندی را که از جوابِ قبلی ساخته شده بود هم برمی‌دارد.
    </p>
    <ul class="flex flex-col gap-3 text-sm">
      {#each answeredQuestions as item (item.q)}
        <li class="rounded-lg border p-3">
          <span class="block text-muted-foreground">{item.q}</span>

          {#if editing === item.q}
            <div class="mt-2 flex flex-wrap gap-2">
              <Input bind:value={answers[item.q]} disabled={Boolean(busy)} class="min-w-60 flex-1" />
              <Button
                size="sm"
                disabled={Boolean(busy) || !String(answers[item.q] ?? '').trim()}
                onclick={() => answer(item.q, { edited: true })}>ذخیره</Button
              >
              <Button size="sm" variant="ghost" disabled={Boolean(busy)} onclick={() => (editing = '')}>انصراف</Button>
            </div>
          {:else}
            <div class="mt-1 flex flex-wrap items-baseline gap-2">
              <span class="flex-1">← {item.answer}</span>
              {#if item.answeredAt}
                <span class="text-[11px] text-muted-foreground">{formatDate(item.answeredAt)}</span>
              {/if}
              <button
                class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onclick={() => {
                  editing = item.q;
                  answers = { ...answers, [item.q]: item.answer };
                }}>اصلاح</button
              >
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<section class="mb-6 rounded-xl border p-4">
  <button class="text-sm font-bold" onclick={() => (showHistory = !showHistory)}>
    تاریخچهٔ شناخت {showHistory ? '▾' : '▸'}
    <span class="font-normal text-muted-foreground">({history.length})</span>
  </button>
  {#if showHistory}
    <!-- پرونده می‌گوید الان چه می‌دانیم؛ این می‌گوید چطور به اینجا رسیدیم -->
    <ul class="scroll-thin mt-3 max-h-72 overflow-y-auto text-xs">
      {#each history as row}
        <li class="border-b py-1 last:border-0">
          <span class="text-muted-foreground">{formatDate(row.at)}</span>
          <Badge variant="outline">{row.op}</Badge>
          <Badge variant={toneOf(row.by)}>{SOURCE_LABEL[row.by] || row.by}</Badge>
          <span class="font-mono">{row.path}</span>
          {#if row.why}<span class="text-muted-foreground"> — {row.why}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<!--
  بقیهٔ سورس — بک‌اند و قاعده‌ها.

  ── چرا اینجا و نه در صفحهٔ خودش ──

  کاربر پرسید «چرا شناخت و سورس دوتاست؟ مگر یکی نیستند؟» — بودند. هر دو
  یک پرسش را جواب می‌دادند: این اپ چه دارد و چقدرش را لمس کرده‌ایم.
  تفکیکشان تاریخی بود (یکی از مدل و گشت، آن یکی از اسکنِ ایستا) نه مفهومی.
-->
{#if data.found.hasSource}
  <div class="mb-6 grid gap-6 lg:grid-cols-2">

    <!-- ── ۲. بک‌اند ── -->
    <Card.Root>
      <Card.Header class="pb-3">
        <Card.Title class="text-sm">بک‌اند</Card.Title>
        <Card.Description>endpointها، در برابر آنچه اجراها واقعاً صدا زده‌اند.</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-3 text-sm">
        {#if !data.found.endpoints?.scanned}
          <p class="text-xs leading-6 text-muted-foreground">
            هنوز خوانده نشده. «خواندنِ دوبارهٔ سورس» را بزنید.
          </p>
        {:else}
          <div class="flex items-baseline justify-between">
            <span class="text-muted-foreground">در سورس</span>
            <strong class="text-lg">{formatNumber(data.found.endpoints.total)}</strong>
          </div>
          <div class="flex items-baseline justify-between">
            <span class="text-muted-foreground">آزموده</span>
            <strong class={touched ? '' : 'text-destructive'}>{formatNumber(touched)}</strong>
          </div>
          <div class="flex items-baseline justify-between">
            <span class="text-muted-foreground">تماسِ ثبت‌شده</span>
            <strong>{formatNumber(data.found.endpoints.calls)}</strong>
          </div>

          {#if data.found.endpoints.untouched.length}
            <div class="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs">
              <p class="font-medium text-destructive">
                {formatNumber(data.found.endpoints.untouched.length)} endpoint، هیچ اجرایی صدایشان نزده
              </p>
              <ul class="mt-1.5 max-h-52 space-y-0.5 overflow-y-auto">
                {#each data.found.endpoints.untouched as row (row.path)}
                  <li dir="ltr" class="font-mono text-[11px]">
                    <span class="text-muted-foreground">{row.methods.join(',') || '?'}</span>
                    {row.path}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          <!--
            فعلِ نیازموده، جدا از مسیرِ نیازموده.

            `GET /keys` را هزار بار زده‌ایم و `DELETE` همان مسیر را هرگز — و
            دومی همان‌جاست که باگ می‌نشیند.
          -->
          {#if data.found.endpoints.partial.length}
            <div class="rounded-lg border p-2.5 text-xs">
              <p class="font-medium">مسیر آزموده شده، این فعل‌ها نه:</p>
              <ul class="mt-1.5 space-y-0.5">
                {#each data.found.endpoints.partial as row (row.path)}
                  <li dir="ltr" class="font-mono text-[11px]">
                    <span class="text-destructive">{row.untried.join(',')}</span> {row.path}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if data.found.endpoints.unknown.length}
            <details class="text-xs">
              <summary class="cursor-pointer text-muted-foreground">
                {formatNumber(data.found.endpoints.unknown.length)} مسیر صدا خورد و در سورس نبود
              </summary>
              <!-- یا آشکارساز کور است، یا سرویسِ بیرونی. هر دو خبرند، نه نویز. -->
              <ul class="mt-1.5 space-y-0.5">
                {#each data.found.endpoints.unknown as row (row)}
                  <li dir="ltr" class="font-mono text-[11px] text-muted-foreground">{row}</li>
                {/each}
              </ul>
            </details>
          {/if}

          {#if data.found.endpoints.at}
            <p class="text-[11px] text-muted-foreground">
              آخرین خواندن: {formatDate(data.found.endpoints.at)} · {formatNumber(data.found.endpoints.files)} فایل
            </p>
          {/if}
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- ── ۳. قاعده‌ها ── -->
    <Card.Root>
      <Card.Header class="pb-3">
        <Card.Title class="text-sm">قاعده‌ها</Card.Title>
        <Card.Description>آنچه schema اجبار می‌کند — و می‌شود تلاش کرد بشکندش.</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-3 text-sm">
        <div class="flex items-baseline justify-between">
          <span class="text-muted-foreground">ناوردا</span>
          <strong class="text-lg">{formatNumber(data.found.invariants.total)}</strong>
        </div>
        <div class="flex items-baseline justify-between">
          <span class="text-muted-foreground">یکتایی</span>
          <strong>{formatNumber(data.found.invariants.unique)}</strong>
        </div>
        <div class="flex items-baseline justify-between">
          <span class="text-muted-foreground">اجباری‌بودن</span>
          <strong>{formatNumber(data.found.invariants.notNull)}</strong>
        </div>
        {#if data.found.invariants.silenced}
          <div class="flex items-baseline justify-between">
            <span class="text-muted-foreground">خاموش‌شده با دلیل</span>
            <strong>{formatNumber(data.found.invariants.silenced)}</strong>
          </div>
        {/if}

        {#if data.found.invariants.sample.length}
          <ul class="space-y-1.5 border-t pt-2 text-xs leading-6">
            {#each data.found.invariants.sample as row (row.id)}
              <li>
                {row.statement}
                {#if row.from}<span dir="ltr" class="block font-mono text-[11px] text-muted-foreground">{row.from}</span>{/if}
              </li>
            {/each}
          </ul>
          <Button href={`${base}/missions`} variant="outline" size="sm" class="w-full">
            پیشنهادهایی که از این‌ها درآمده
          </Button>
        {:else}
          <p class="text-xs leading-6 text-muted-foreground">
            هیچ ناوردایی ثبت نشده. اگر پروژه SQL دارد، «خواندنِ دوبارهٔ سورس» آن را پیدا می‌کند.
          </p>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>
{:else}
  <section class="mb-6 rounded-xl border border-dashed p-6 text-sm leading-7">
    <p class="font-medium">این پروژه سورسی اعلام نکرده.</p>
    <p class="mt-1 max-w-2xl text-muted-foreground">
      کلید <code>source.root</code> را در پیکربندی پروژه بگذارید تا معلوم شود چه
      endpointها و چه قاعده‌هایی وجود دارند که هنوز آزموده نشده‌اند.
    </p>
    <Button href={`${base}/files?kind=target`} variant="outline" size="sm" class="mt-3">پیکربندی پروژه</Button>
  </section>
{/if}

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
        {#if data.found.placeCoverage?.total}
          <div class="rounded-lg border bg-muted/30 p-2.5 text-[11px] leading-6">
            <p>
              <strong>{formatNumber(data.found.placeCoverage.total)} جای شناخته‌شده</strong> —
              {formatNumber(data.found.placeCoverage.crawled)} خزش · {formatNumber(data.found.placeCoverage.toured)} گشت
              {#if data.found.placeCoverage.untouched}
                · <span class="text-amber-600 dark:text-amber-400">
                    {formatNumber(data.found.placeCoverage.untouched)} فقط در سورس، هیچ‌کس نرفته
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
            {#if data.found.placeCoverage.withoutContract}
              <!--
                «رفته‌ایم ولی نمی‌دانیم اینجا چه چیزی همیشه هست» — و آن دقیقاً
                جایی است که هیچ انتظاری نمی‌شود نوشت.
              -->
              <p class="text-muted-foreground">
                {formatNumber(data.found.placeCoverage.withoutContract)} جا قرارداد ندارد؛
                {formatNumber(data.found.placeCoverage.contracts)} بندِ «همیشه اینجا بوده» ثبت شده.
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
        {#if data.crawl.mispredicted?.length}
          <details class="text-xs">
            <summary class="cursor-pointer">
              پیش‌بینی نخواند ({formatNumber(data.crawl.mispredicted.length)})
              <span class="text-[11px] text-muted-foreground">— سورس یک چیز گفت، کلیک چیز دیگری</span>
            </summary>
            <div class="mt-2 space-y-1.5">
              {#each data.crawl.mispredicted.slice(0, 8) as row (row.label + row.predicted)}
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

        {#if data.crawl.unreached.length}
          <details class="text-xs">
            <summary class="cursor-pointer">در سورس هست، نرسیدیم ({formatNumber(data.crawl.unreached.length)})</summary>
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each data.crawl.unreached as route (route)}
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

        {#if data.crawl.extra.length && data.crawl.knownRoutes.length}
          <details class="text-xs">
            <summary class="cursor-pointer">دیدیم، در سورس نبود ({formatNumber(data.crawl.extra.length)})</summary>
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each data.crawl.extra as route (route)}
                <Badge variant="outline" class="font-mono text-[11px]">{route}</Badge>
              {/each}
            </div>
          </details>
        {/if}

        <!--
          پیوند به «بقیهٔ سورس» حذف شد: بک‌اند و قاعده‌ها حالا در همین صفحه
          و چند بخش پایین‌ترند. پیوندی که به خودِ صفحه برگردد، فقط سردرگمی
          اضافه می‌کند.
        -->
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
