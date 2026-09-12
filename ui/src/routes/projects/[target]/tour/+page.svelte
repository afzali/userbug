<script>
  /**
   * پنلِ گشتِ زنده.
   *
   * ── چرا اینجا و نه داخلِ خودِ اپ ──
   *
   * پنجرهٔ مرورگر کنارِ این صفحه باز است و کاربر در آن کار می‌کند. توضیحِ
   * صفحه را همین‌جا می‌نویسد، نه در یک HUD تزریق‌شده به اپ — چون تزریقِ عنصر
   * به صفحهٔ تحت تست دقیقاً همان تداخلی است که این ابزار برای کشفش ساخته شده.
   *
   * ── چرا SSE و نه polling ──
   *
   * گشت رخدادمحور است: کاربر کلیک می‌کند و باید همان لحظه ببیند ضبط شده.
   * polling یا کند است یا پرهزینه، و «همان لحظه» چیزی است که به کاربر
   * می‌گوید ابزار واقعاً دارد نگاه می‌کند.
   */
  import { onDestroy } from 'svelte';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';

  let { data } = $props();

  // svelte-ignore state_referenced_locally
  let running = $state(Boolean(data.tour?.running));
  // svelte-ignore state_referenced_locally
  let steps = $state(data.tour?.steps || []);
  // svelte-ignore state_referenced_locally
  let pages = $state(data.tour?.pages || []);
  // svelte-ignore state_referenced_locally
  let findings = $state(data.tour?.findings || []);
  // svelte-ignore state_referenced_locally
  let url = $state(data.tour?.url || '');

  /**
   * مسیرِ نسبی، نه آدرس کامل.
   *
   * صفحه‌های ثبت‌شده پایین همین پنل با مسیر نشان داده می‌شوند (`/contents`)،
   * پس بالای جعبه هم باید همان باشد؛ وگرنه کاربر باید خودش
   * `http://localhost:5173/contents` را با `/contents` تطبیق بدهد.
   */
  let currentPath = $derived.by(() => {
    if (!url) return '';
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  });
  // svelte-ignore state_referenced_locally
  let recording = $state(data.tour?.recording ?? true);

  let purpose = $state('');
  let noteText = $state('');
  let scenarioName = $state('');
  let busy = $state('');
  let error = $state('');
  let result = $state(null);
  let warning = $state('');

  let source = null;
  let retry = null;
  let attempts = $state(0);
  let disconnected = $state(false);

  /**
   * قطعیِ لحظه‌ای نباید پنل را بکشد.
   *
   * ── چه اتفاقی می‌افتاد ──
   *
   * `onerror` جریان را برای همیشه می‌بست. یعنی هر بار که اتصال یک لحظه
   * می‌پرید — که در جریانی که ساعت‌ها باز می‌ماند حتمی است — پنل ساکت
   * می‌شد: گشت در مرورگر زنده بود و ضبط می‌کرد، ولی این صفحه دیگر چیزی
   * نشان نمی‌داد. با رفرش برمی‌گشت، که دقیقاً نشانهٔ همین است.
   *
   * بستنِ صریح، بازوصلیِ خودکارِ `EventSource` را هم از بین می‌برد؛ پس
   * بدترینِ هر دو دنیا بود.
   *
   * ── چرا وضعیت پیش از بازوصل پاک می‌شود ──
   *
   * جریان، تاریخچه را از اول بازپخش می‌کند (تا پنلی که دیر رسیده خالی
   * نماند). اگر آرایه‌ها را پاک نکنیم، هر بازوصل قدم‌ها را دوباره اضافه
   * می‌کند و شمارنده دو برابر می‌شود — عددی که راست به نظر می‌رسد و نیست.
   */
  function listen() {
    close();
    disconnected = false;
    source = new EventSource(`/api/tour/events?target=${encodeURIComponent(data.target)}`);

    source.onopen = () => {
      attempts = 0;
      disconnected = false;
    };

    source.onmessage = (message) => {
      let event;
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }
      apply(event);
    };

    source.onerror = () => {
      close();
      // گشتِ تمام‌شده بازوصل نمی‌خواهد؛ `stopped` از قبل `running` را خوابانده.
      if (!running) return;

      disconnected = true;
      attempts += 1;
      if (attempts > 10) return;

      const wait = Math.min(1000 * attempts, 8000);
      retry = setTimeout(() => {
        steps = [];
        pages = [];
        findings = [];
        listen();
      }, wait);
    };
  }

  function close() {
    if (retry) clearTimeout(retry);
    retry = null;
    source?.close();
    source = null;
  }
  onDestroy(close);

  function apply(event) {
    if (event.type === 'step') steps = [...steps, event.step];
    else if (event.type === 'step-removed') steps = steps.filter((item) => item.index !== event.index);
    else if (event.type === 'page') pages = [...pages.filter((item) => item.path !== event.page.path), event.page];
    else if (event.type === 'finding') findings = [...findings, event.finding];
    else if (event.type === 'navigated' || event.type === 'started') url = event.url || url;
    else if (event.type === 'recording') recording = event.recording;
    else if (event.type === 'warning') warning = event.message;
    else if (event.type === 'stopped') {
      running = false;
      close();
    }
  }

  async function send(body) {
    busy = body.action;
    error = '';
    try {
      const response = await fetch('/api/tour', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target: data.target, ...body }),
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

  async function start() {
    result = null;
    const payload = await send({ action: 'start' });
    if (!payload) return;
    running = true;
    url = payload.url || '';
    steps = payload.steps || [];
    pages = payload.pages || [];
    findings = payload.findings || [];
    recording = payload.recording ?? true;
    listen();
  }

  async function notePage() {
    const payload = await send({ action: 'note-page', purpose });
    if (payload) purpose = '';
  }

  async function note() {
    const payload = await send({ action: 'note', message: noteText });
    if (payload) noteText = '';
  }

  async function stop(discard) {
    const payload = await send({ action: 'stop', name: scenarioName || undefined, discard });
    if (!payload) return;
    running = false;
    close();
    result = payload;
  }
</script>

<svelte:head><title>گشت زنده — {data.target}</title></svelte:head>

<PageHeader
  eyebrow="پروژهٔ {data.project?.name || data.target}"
  title="گشت زنده"
  description="مرورگر باز می‌شود و شما مثل یک کاربر واقعی کار می‌کنید: وارد شوید، منوها را بگردید، صفحه‌ها را ببینید. هرچه می‌کنید ضبط می‌شود و هر جا خواستید بگویید این صفحه برای چیست."
>
  {#snippet actions()}
    {#if running}
      <Button variant="outline" disabled={Boolean(busy)} onclick={() => send({ action: 'recording', on: !recording })}>
        {recording ? 'توقف ضبط' : 'ادامهٔ ضبط'}
      </Button>
      <Button disabled={Boolean(busy)} onclick={() => stop(false)}>پایان و ذخیره</Button>
      <Button variant="outline" disabled={Boolean(busy)} onclick={() => stop(true)}>پایان بدون ذخیره</Button>
    {:else}
      <Button disabled={Boolean(busy)} onclick={start}>{busy === 'start' ? 'در حال باز کردن…' : 'شروع گشت'}</Button>
    {/if}
  {/snippet}
</PageHeader>

{#if error}
  <div class="mb-4 whitespace-pre-line rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</div>
{/if}
{#if warning}
  <div class="mb-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">⚠ {warning}</div>
{/if}

{#if result}
  <section class="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm leading-7">
    {#if result.discarded}
      <p>گشت بدون ذخیره بسته شد.</p>
    {:else}
      <p class="mb-2 font-bold">گشت ذخیره شد.</p>
      <ul class="list-inside list-disc">
        <li>{result.written.pages} صفحه در شناخت ثبت شد</li>
        <li>{result.written.cached} مدخلِ کش با <code>resolvedBy: human</code> — این قدم‌ها دیگر مدل نمی‌خواهند</li>
        {#if result.written.scenario}
          <li>
            پیش‌نویس: <code>{result.written.scenario}</code>
            <a class="text-primary underline" href={`/projects/${data.target}/files?kind=scenario&relative=${encodeURIComponent(result.written.scenario)}`}>بازش کن</a>
          </li>
        {/if}
        <li>پرونده: {result.written.dossier.replaced} تازه · {result.written.dossier.conflicts} تعارض</li>
      </ul>
      <p class="mt-2 text-xs text-muted-foreground">
        پیش‌نویس <code>status: draft</code> است. تا یک بار اجرا نشده، سناریو نیست.
      </p>

      <!--
        قدمِ بعد، صریح.

        تا امروز گشت اینجا تمام می‌شد: گزارش می‌داد و رها می‌کرد. ولی کلِ
        ارزشِ گشت در چیزی است که **بعدش** ممکن می‌شود — شناختی که حالا پر
        شده، به فهرستِ «چه باید آزمود» تبدیل می‌شود.
      -->
      <div class="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
        <span class="text-xs text-muted-foreground">قدم بعد:</span>
        <Button href={`/projects/${data.target}/proposals`} size="sm">ببین چه باید آزمود</Button>
        <Button href={`/projects/${data.target}/knowledge`} size="sm" variant="outline">شناختِ ساخته‌شده</Button>
      </div>
    {/if}
  </section>
{/if}

{#if !running && !result}
  <section class="rounded-xl border border-dashed p-6 text-sm leading-7 text-muted-foreground">
    <p class="mb-3 font-semibold text-foreground">گشت هنوز شروع نشده.</p>
    <p>
      «شروع گشت» یک پنجرهٔ مرورگر باز می‌کند. آن پنجره را کنارِ همین صفحه بگذارید: در آن کار کنید و
      در این صفحه توضیح بدهید. هر خطای کنسول، هر ۵۰۰، و هر چکِ همگانی همان لحظه اینجا ثبت می‌شود —
      یعنی باگی که حین آشنایی ببینید، یافتهٔ واقعی است نه یک تمرین.
    </p>
  </section>
{/if}

{#if running}
  <div class="mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
    <Badge variant={recording ? 'default' : 'outline'}>{recording ? 'در حال ضبط' : 'ضبط متوقف'}</Badge>
    {#if disconnected}
      <!--
        سکوتِ بی‌توضیح بدترین حالت است: گشت زنده بود و پنل مرده به نظر
        می‌رسید. حالا می‌گوید دارد برمی‌گردد.
      -->
      <Badge variant="destructive">اتصال قطع شد — تلاش {attempts}</Badge>
    {/if}
    <code class="min-w-0 flex-1 truncate text-xs">{url || '—'}</code>
    <span class="text-xs text-muted-foreground">{steps.length} قدم · {pages.length} صفحه · {findings.length} یافته</span>
  </div>

  <section class="mb-6 rounded-xl border p-4">
    <!--
      «این صفحه» کدام صفحه است؟

      کاربر می‌پرسید «نمی‌دانم چطور باید روی هر بخش کامنت بگذارم» در حالی که
      پنل چهار صفحه را درست ثبت کرده بود. مشکل فهمیدنِ سیستم نبود، نگفتنِ
      پنل بود: جعبه می‌گفت «این صفحه» و هیچ‌جا نمی‌گفت کدام.

      یادداشت همیشه به صفحه‌ای می‌چسبد که **همین حالا** در پنجرهٔ گشت باز
      است. حالا همان مسیر بالای جعبه نوشته می‌شود و با هر ناوبری عوض می‌شود.
    -->
    <h2 class="mb-1 flex flex-wrap items-baseline gap-2 text-sm font-bold">
      <span>این صفحه برای چیست؟</span>
      <code dir="ltr" class="rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal">{currentPath || '—'}</code>
    </h2>
    <p class="mb-3 text-xs leading-6 text-muted-foreground">
      یادداشت به همان صفحه‌ای می‌چسبد که <strong>همین حالا</strong> در پنجرهٔ گشت باز است. در آن
      پنجره به صفحهٔ دلخواه بروید، بعد اینجا بنویسید. جملهٔ شما <code>by: user</code> می‌گیرد —
      پراعتمادترین چیزی که این سیستم دارد. بی‌توضیح هم می‌توانید ثبت کنید؛ آن‌وقت فقط نقشه است،
      نه معنا.
    </p>
    <div class="flex flex-wrap gap-2">
      <Input bind:value={purpose} placeholder="مثلاً: اینجا فهرست اسناد کاربر است" disabled={Boolean(busy)} />
      <Button variant="outline" disabled={Boolean(busy)} onclick={notePage}>ثبت این صفحه</Button>
    </div>

    <div class="mt-3 flex flex-wrap gap-2">
      <Input bind:value={noteText} placeholder="ایرادی دیدید؟ همین‌جا بنویسید تا یافته شود" disabled={Boolean(busy)} />
      <Button variant="outline" disabled={Boolean(busy) || !noteText.trim()} onclick={note}>ثبت ایراد</Button>
    </div>

    <div class="mt-3">
      <Input bind:value={scenarioName} placeholder="نام سناریو (خالی = «آشنایی با سامانه»)" disabled={Boolean(busy)} />
    </div>
  </section>
{/if}

{#if steps.length}
  <section class="mb-6 rounded-xl border p-4">
    <h2 class="mb-1 text-sm font-bold">قدم‌های ضبط‌شده</h2>
    <p class="mb-3 text-xs leading-6 text-muted-foreground">
      هرکدام با توصیفِ معنایی ثبت شده (نقش و نام)، نه مسیرِ DOM. قدمی که اشتباه بوده را حذف کنید تا
      وارد پیش‌نویس نشود.
    </p>
    <ol class="flex flex-col gap-1 text-sm">
      {#each steps as step (step.index)}
        <li class="flex items-center gap-2 rounded-lg border px-3 py-1.5">
          <Badge variant="outline">{step.action}</Badge>
          <span class="min-w-0 flex-1 truncate">
            {step.label || step.action}
            {#if step.secret}<span class="text-xs text-muted-foreground"> · رمز → {'{{identity.password}}'}</span>{/if}
            {#if step.needsFixture}<span class="text-xs text-amber-600"> · فایل لازم دارد: {step.needsFixture}</span>{/if}
          </span>
          {#if running}
            <button
              class="text-xs text-muted-foreground hover:text-destructive"
              onclick={() => send({ action: 'remove-step', index: step.index })}>حذف</button
            >
          {/if}
        </li>
      {/each}
    </ol>
  </section>
{/if}

{#if pages.length}
  <section class="mb-6 rounded-xl border p-4">
    <h2 class="mb-3 text-sm font-bold">صفحه‌های ثبت‌شده</h2>
    <ul class="flex flex-col gap-1 text-sm">
      {#each pages as page (page.path)}
        <li class="rounded-lg border px-3 py-1.5">
          <code class="text-xs">{page.path}</code>
          <Badge variant={page.by === 'user' ? 'default' : 'secondary'}>{page.by === 'user' ? 'کاربر' : 'گشت'}</Badge>
          {#if page.purpose}<span> — {page.purpose}</span>{/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if findings.length}
  <section class="mb-6 rounded-xl border border-destructive/30 p-4">
    <h2 class="mb-1 text-sm font-bold">یافته‌های همین گشت</h2>
    <p class="mb-3 text-xs text-muted-foreground">
      این‌ها به تریاژ می‌روند، مثل هر یافتهٔ دیگری. نخستین دقایقی که آدم با اپ کار می‌کند
      پربارترین دقایقِ کشف است.
    </p>
    <ul class="flex flex-col gap-1 text-sm">
      {#each findings as finding (finding.fingerprint + finding.at)}
        <li class="rounded-lg border px-3 py-1.5">
          <Badge variant="outline">{finding.checkId || finding.source}</Badge>
          <span> {finding.message}</span>
        </li>
      {/each}
    </ul>
  </section>
{/if}
