<script>
  /**
   * «یک بررسی تازه شروع کن» — فرمِ اجرا و زمان‌بندی، در یک کارت.
   *
   * ── چرا از صفحه به کامپوننت آمد ──
   *
   * سه در برای یک کار داشتیم: /run فرم داشت و تاریخچه، /rounds دورها را
   * نشان می‌داد و می‌گفت «دورِ تازه از اپِ من شروع می‌شود»، و خودِ درخت هم
   * دکمهٔ دور داشت. کاربر نمی‌دانست کدام را بزند — و این دقیقاً همان
   * «فهرستِ امکانات»ی است که منو دو بار از آن فرار کرده.
   *
   * حالا یک صفحه است، «بررسی». این فرم بخشی از آن شد، پس باید کامپوننت
   * می‌شد وگرنه آن صفحه هزار خط می‌شد — همان درسی که FoundPanel با ۱۰۳۹
   * خط داد.
   */
  import { ACTIVE, run, startJob as startShared } from '$lib/run-store.svelte.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import ModelPicker from '$lib/components/ModelPicker.svelte';
  import { formatNumber } from '$lib/format.js';

  let { target, project, schedules = [] } = $props();

  let scenario = $state('');
  /**
   * سناریوهای تیک‌خورده.
   *
   * ── چرا کشویی کافی نبود ──
   *
   * کشویی فقط دو حال داشت: یک سناریو، یا همه. ولی کاری که آدم واقعاً
   * می‌کند وسطِ این دوتاست: «این سه تا که به ورود مربوط‌اند را ببر».
   */
  let picked = $state(new Set());
  /** اسمِ این بررسی. اختیاری، ولی در «دورها» و تریاژ همان چیزی است که یادت می‌ماند. */
  let bench = $state('');
  let device = $state('');
  let persona = $state('');
  let depth = $state('');
  let model = $state('');
  let repeat = $state(1);
  let headed = $state(false);
  let author = $state(false);
  let error = $state('');
  let showSchedule = $state(false);
  let scheduleBusy = $state(false);
  let scheduleForm = $state({ key: '', time: '02:00', frequency: 'daily', days: 'MON' });

  let busy = $derived(ACTIVE.has(run.job?.status));
  /** سناریوهای اجراشدنی، یک بار — هم برای تیک‌ها، هم برای کشویی. */
  let runnableScenarios = $derived((project?.scenarios || []).filter((item) => item.executable));

  function togglePick(name) {
    const next = new Set(picked);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    picked = next;
  }

  /**
   * شروعِ هر کاری، یک راه — و آن راه بیرون از این کامپوننت است.
   *
   * فرم، نوارِ فرمان، و دکمهٔ دورِ درخت همه از `run-store` می‌گذرند، همان‌جا
   * که پلیر هم از آن می‌خواند.
   */
  async function startJob(options) {
    const job = await startShared(target, options);
    if (!job) error = run.error;
    return job;
  }

  async function start(event) {
    event.preventDefault();
    await startJob({
      grep: scenario,
      only: [...picked],
      bench,
      device,
      persona,
      depth,
      model,
      repeat,
      headed,
      author,
    });
  }
  async function scheduleRequest(url, options) {
    scheduleBusy = true;
    error = '';
    try {
      const response = await fetch(url, {
        ...options,
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'انجام نشد');
      location.reload();
    } catch (cause) {
      error = cause.message;
      scheduleBusy = false;
    }
  }

  function addSchedule() {
    return scheduleRequest('/api/schedules', {
      method: 'POST',
      body: JSON.stringify({
        ...scheduleForm,
        target,
        grep: scenario,
        device,
        persona,
        model,
        depth,
        repeat,
      }),
    });
  }

  function runSchedule(key) {
    return scheduleRequest(`/api/schedules/${encodeURIComponent(key)}`, { method: 'POST' });
  }

  function removeSchedule(key) {
    if (!confirm(`زمان‌بندی «${key}» و تسکش در ویندوز حذف شوند؟`)) return;
    return scheduleRequest(`/api/schedules/${encodeURIComponent(key)}`, { method: 'DELETE' });
  }

</script>

<!--
  ── چرا این کارت دیگر «اجرای تازه» نیست ──

  «اجرا» کارِ ابزار را می‌گوید. آنچه آدم می‌کند یک **بررسی** است: چند سناریو
  را روی بخشی از اپ می‌برد تا ببیند سالم است یا نه. اسمِ درست، همان اسمی
  است که در ذهنِ کاربر هست.

  و اسمِ روی این بار اختیاری است ولی بی‌دلیل نیست: همان است که این بررسی
  را در «دورها» و در تریاژ از بقیه جدا می‌کند.
-->
  <Card.Root class="h-fit gap-5">
    <Card.Header>
      <Card.Title>یک بررسی تازه</Card.Title>
      <Card.Description>هر بار یک اجرا، چون همه مرورگر باز می‌کنند. اسمی که بگذارید، این بار را در «دورها» و در کنارِ هر یافته نشان می‌دهد.</Card.Description>
    </Card.Header>
    <Card.Content>
      <form class="space-y-4" onsubmit={start}>
        <!--
          تیک، نه کشویی.

          کشویی فقط «یکی» یا «همه» می‌داد؛ کارِ واقعی وسطِ این دوتاست. تیکِ
          هیچ‌کدام یعنی همه — همان پیش‌فرضِ قبلی، پس کسی که تا دیروز فقط
          «شروع اجرا» می‌زد، هیچ تغییری نمی‌بیند.
        -->
        <div class="space-y-1.5 text-sm font-medium">
          <div class="flex items-baseline justify-between gap-2">
            <span>سناریوها</span>
            <span class="text-[11px] font-normal text-muted-foreground">
              {picked.size ? `${formatNumber(picked.size)} انتخاب‌شده` : 'هیچ تیکی = همه'}
            </span>
          </div>

          {#if runnableScenarios.length}
            <div class="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border p-1.5">
              {#each runnableScenarios as item (item.path || item.name)}
                <label class="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm font-normal hover:bg-accent/50">
                  <input
                    type="checkbox"
                    class="mt-1"
                    checked={picked.has(item.name)}
                    disabled={busy}
                    onchange={() => togglePick(item.name)}
                  />
                  <span class="min-w-0 flex-1 break-words">
                    {item.name}
                    <!-- پیش‌نویس اجرا می‌شود ولی رگرسیون نیست؛ در فهرست هم باید فرق کند -->
                    {#if item.status === 'draft'}
                      <span class="text-[10px] text-muted-foreground">· پیش‌نویس</span>
                    {/if}
                  </span>
                </label>
              {/each}
            </div>
            {#if picked.size}
              <button
                type="button"
                class="text-[11px] text-muted-foreground underline underline-offset-2"
                onclick={() => { picked = new Set(); }}
              >
                برداشتنِ همهٔ تیک‌ها
              </button>
            {/if}
          {:else}
            <p class="rounded-lg border border-dashed p-3 text-center text-xs font-normal text-muted-foreground">
              سناریوی اجراشدنی‌ای نیست.
            </p>
          {/if}
        </div>

        <!--
          اسمِ بار.

          ارزشش در فهرست نیست، در تریاژ است: یافته‌ای که هفتهٔ بعد باز می‌شود
          باید بتواند بگوید «در بررسیِ پس از اصلاح هم بود» — چیزی که رشتهٔ
          تاریخِ اجرا هرگز نگفت.
        -->
        <label class="block space-y-1.5 text-sm font-medium">
          <span>اسمِ این بررسی <span class="font-normal text-muted-foreground">(اختیاری)</span></span>
          <Input bind:value={bench} placeholder="مثلاً: پیش از انتشار ۴.۲" disabled={busy} maxlength="60" />
          <span class="block text-[11px] font-normal leading-5 text-muted-foreground">
            بی‌اسم هم اجرا می‌شود و زیرِ «بی‌نام» می‌نشیند. با اسم، یک ردیفِ خودش
            می‌گیرد — و آن‌وقت می‌شود پرسید نسبت به بارِ قبل چه فرق کرد.
          </span>
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="block space-y-1.5 text-sm font-medium">
            <span>دستگاه</span>
            <Input bind:value={device} placeholder={project?.device || 'desktop'} disabled={busy} />
          </label>
          <label class="block space-y-1.5 text-sm font-medium">
            <span>تکرار</span>
            <Input type="number" min="1" max="10" bind:value={repeat} disabled={busy} />
          </label>
        </div>
        <label class="block space-y-1.5 text-sm font-medium">
          <span>رفتار کاربر</span>
          <select class="app-select" bind:value={persona} disabled={busy}>
            <option value="">پیش‌فرض سناریو</option><option value="novice">تازه‌کار</option><option value="pro">حرفه‌ای</option>
          </select>
        </label>

        <!--
          انتخاب مدل، ردیفِ خودش.

          ── چرا از کنارِ «رفتار کاربر» درآمد ──

          نصفِ عرضِ یک ستونِ ۲۳rem جا نداشت: خودِ کنترل یک ورودی است به‌علاوهٔ
          دکمهٔ «فهرست»، و بازشدنش پنلی است با جست‌وجو و فهرستِ بلندِ مدل‌ها با
          قیمت — که در نصفِ ستون خوانده نمی‌شد.

          و یک نقصِ واقعی هم همین‌جا بود: `div`ِ آن شبکهٔ دوستونی هرگز بسته
          نشده بود، پس ردیفِ تیک‌های زیرش هم داخلش می‌افتاد.
        -->
        <ModelPicker bind:value={model} disabled={busy} />

        <div class="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <label class="flex items-center gap-2"><input type="checkbox" bind:checked={headed} disabled={busy} /> مرورگر دیده شود</label>
          <label class="flex items-center gap-2"><input type="checkbox" bind:checked={author} disabled={busy} /> ساخت پیش‌نویس کاوش</label>
        </div>
        {#if error}<p class="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>{/if}
        <!--
          لغو به پلیر رفت: همان‌جایی که اجرا دیده می‌شود، همان‌جا هم متوقف
          می‌شود. دو دکمهٔ لغو در دو جا یعنی روزی یکی‌شان وضعیت را تازه نکند.
        -->
        <Button type="submit" class="w-full" disabled={run.submitting || busy || !target}>
          {run.submitting ? 'در حال شروع…' : busy ? 'کاری در جریان است' : 'شروعِ بررسی'}
        </Button>
      </form>
    </Card.Content>

    <!--
      زمان‌بندی همان‌جایی است که پرچم‌ها را انتخاب می‌کنید، چون همان پرچم‌ها را
      ذخیره می‌کند. زمان‌بندِ واقعی سیستم است؛ رابط فقط ورودی‌هایش را می‌سازد.
    -->
    <Card.Content class="space-y-3 border-t pt-5">
      <div class="flex items-center justify-between gap-2">
        <strong class="text-sm">زمان‌بندی</strong>
        <Button variant="ghost" size="sm" onclick={() => { showSchedule = !showSchedule; }}>{showSchedule ? 'بستن' : 'افزودن'}</Button>
      </div>

      {#each schedules as item (item.key)}
        <div class="rounded-lg border p-3 text-xs leading-6">
          <div class="flex items-center justify-between gap-2">
            <span class="code-value">{item.key}</span>
            {#if item.installed}
              <span class="text-emerald-700 dark:text-emerald-300">فعال</span>
            {:else}
              <!-- فایلش هست ولی تسک نیست: پنهان کردنش یعنی کاربر فکر کند هر شب اجرا می‌شود. -->
              <span class="text-destructive">در زمان‌بند نیست</span>
            {/if}
          </div>
          <p class="text-muted-foreground">
            {item.frequency === 'weekly' ? `هفتگی ${item.days?.join('،')} · ${item.time}` : `روزانه ${item.time}`}
            {#if item.grep} · {item.grep}{/if}
          </p>
          {#if item.lastLog}<p class="text-muted-foreground">{item.lastLog}</p>{/if}
          <div class="mt-2 flex gap-2">
            <Button variant="outline" size="sm" onclick={() => runSchedule(item.key)} disabled={scheduleBusy}>اجرا کن</Button>
            <Button variant="ghost" size="sm" onclick={() => removeSchedule(item.key)} disabled={scheduleBusy}>حذف</Button>
          </div>
        </div>
      {/each}

      {#if showSchedule}
        <div class="space-y-3 rounded-lg border border-dashed p-3">
          <label class="block space-y-1.5 text-sm font-medium"><span>کلید</span><Input bind:value={scheduleForm.key} dir="ltr" placeholder="nightly" /></label>
          <div class="grid grid-cols-2 gap-2">
            <label class="block space-y-1.5 text-sm font-medium"><span>ساعت</span><Input bind:value={scheduleForm.time} dir="ltr" placeholder="02:00" /></label>
            <label class="block space-y-1.5 text-sm font-medium">
              <span>تکرار</span>
              <select class="app-select" bind:value={scheduleForm.frequency}><option value="daily">روزانه</option><option value="weekly">هفتگی</option></select>
            </label>
          </div>
          {#if scheduleForm.frequency === 'weekly'}
            <label class="block space-y-1.5 text-sm font-medium"><span>روزها</span><Input bind:value={scheduleForm.days} dir="ltr" placeholder="MON,WED,FRI" /></label>
          {/if}
          <p class="text-xs leading-6 text-muted-foreground">انتخابِ سناریو، دستگاه، رفتار کاربر و مدلِ همین فرم در زمان‌بندی ذخیره می‌شوند — بررسیِ شبانه هم یک بررسی است.</p>
          <Button class="w-full" onclick={addSchedule} disabled={scheduleBusy || !scheduleForm.key || !scheduleForm.time}>{scheduleBusy ? 'در حال ساخت…' : 'ساخت زمان‌بندی'}</Button>
        </div>
      {/if}
    </Card.Content>
  </Card.Root>