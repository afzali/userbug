<script>
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import FindingCard from '$lib/components/FindingCard.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { formatDate, formatNumber } from '$lib/format.js';

  let { data } = $props();
  // وضعیت هر ردیف در فرم تریاژ محلی و قابل‌ویرایش است.
  // svelte-ignore state_referenced_locally
  let items = $state(
    data.findings.map((item) => ({ ...item, triage: { ...item.triage }, saving: false, feedback: '', asking: false }))
  );

  /**
   * «چرا این شد؟» — از یافته به سورس.
   *
   * ── چرا دکمه، و نه خودکار ──
   *
   * مدل صدا می‌زند. چهل یافته یعنی چهل فراخوانی، برای چیزی که شاید فقط
   * دو تایش را بخواهی بدانی. و جوابش **فرضیه** است نه فکت، پس باید کسی
   * خواسته باشدش.
   *
   * جواب ذخیره می‌شود: فرضیه با رفرشِ صفحه عوض نمی‌شود، و پرداختِ دوباره
   * برای همان جواب یعنی بودجه‌ای که بی‌صدا آب می‌رود.
   */
  async function explain(item) {
    item.asking = true;
    item.feedback = '';
    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target: data.target, fingerprint: item.fingerprint }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'نشد');
      item.explain = payload.explain;
    } catch (cause) {
      item.feedback = cause.message;
    } finally {
      item.asking = false;
    }
  }

  const CONFIDENCE = { high: 'اطمینانِ بالا', medium: 'اطمینانِ متوسط', low: 'اطمینانِ کم' };
  let search = $state('');
  let status = $state('active');
  /**
   * فیلتر منبع و سناریو.
   *
   * «مزاحم» و «خطای کلاینت» و «لاگ سرور» جنس کاملاً متفاوتی‌اند و معمولاً
   * آدم دنبال یکی‌شان است، نه همه با هم. همین‌طور وقتی یک سناریو را اصلاح
   * می‌کنید، بقیه فقط نویزند.
   */
  let source = $state('all');
  let scenario = $state('all');
  /**
   * فیلترِ «برگشته».
   *
   * جدا از `status` است چون یک بُعدِ دیگر است: نقصِ برگشته هنوز
   * `resolved` است، فقط ادعایش باطل شده. قاطی کردنشان یعنی یا در
   * «رفع‌شده» گم می‌شود یا از «نیازمند رسیدگی» بیرون می‌ماند.
   */
  let onlyRegressed = $state(false);

  const SOURCE_LABELS = {
    blocker: 'مزاحم',
    scenario: 'سنجش سناریو',
    server: 'لاگ سرور',
    console: 'کنسول مرورگر',
    pageerror: 'خطای جاوااسکریپت',
    http: 'پاسخ ۴xx/۵xx',
    network: 'شبکه',
    dialog: 'پنجرهٔ مرورگر',
  };
  const sourceLabelOf = (key) => SOURCE_LABELS[key] || key;

  const sources = $derived([...new Set(items.map((item) => item.source))].sort());
  const scenarios = $derived([...new Set(items.flatMap((item) => item.steps || []))].sort());

  let filtered = $derived.by(() => items.filter((item) => {
    const matchesText = !search || `${item.normalized} ${item.source} ${item.fingerprint}`.toLowerCase().includes(search.toLowerCase());
    /**
     * «نیازمند رسیدگی» شاملِ برگشته‌هاست.
     *
     * ── چرا این خط جداگانه لازم شد ──
     *
     * نقصِ برگشته هنوز `resolved` است — کسی وضعیتش را عوض نکرده، فقط
     * ادعایش باطل شده. با فیلترِ پیش‌فرض دقیقاً همان سطری پنهان می‌شد که
     * باید اول دیده می‌شد. در نخستین آزمایش هم همین شد: شمارندهٔ
     * «۱ برگشته» درست بود و خودِ ردیف در فهرست نبود.
     */
    const matchesStatus =
      status === 'all'
        ? true
        : status === 'active'
          ? item.regressed || !['resolved', 'ignored'].includes(item.triage.status)
          : item.triage.status === status;
    const matchesSource = source === 'all' || item.source === source;
    const matchesScenario = scenario === 'all' || (item.steps || []).includes(scenario);
    const matchesRegressed = !onlyRegressed || item.regressed;
    return matchesText && matchesStatus && matchesSource && matchesScenario && matchesRegressed;
  }));

  /** شمارِ برگشته‌ها — روی دکمهٔ فیلتر، تا بی باز کردنش هم دیده شود. */
  const regressedCount = $derived(items.filter((item) => item.regressed).length);

  /**
   * «چه باید می‌شد» — برای یافته‌های قرارداد.
   *
   * ── چرا این تکه لازم شد ──
   *
   * یافتهٔ `contract` در `detail` یک JSON خام داشت و همان‌طور چاپ می‌شد:
   * بیست خط `{"missing":[{"role":"button",…}]}`. کاربر باید JSON می‌خواند
   * تا بفهمد «دکمهٔ نپی دیگر نیست». چیزی که خوانده نشود، گزارش نیست.
   */
  function expectedOf(item) {
    const detail = item.latest?.detail ?? item.detail;
    if (!detail || typeof detail === 'string') return null;
    const missing = detail.missing;
    if (!Array.isArray(missing) || !missing.length) return null;
    return {
      path: detail.path || '',
      mode: detail.mode || '',
      items: missing.map((one) => one.name || one.label || one.text || one.role || JSON.stringify(one)),
    };
  }

  /** برچسبِ فارسیِ وضعیت، برای جاهایی که فقط خوانده می‌شود. */
  const STATUS_LABELS = {
    open: 'باز',
    acknowledged: 'بررسی‌شده',
    resolved: 'رفع‌شده',
    ignored: 'نادیده‌گرفته',
  };

  /**
   * خروجی CSV از همان چیزی که روی صفحه دیده می‌شود، نه از کل داده.
   *
   * اگر فیلتر را نادیده می‌گرفت، کاربر فیلتر می‌کرد، خروجی می‌گرفت، و فایل
   * چیز دیگری بود — بی‌آنکه بفهمد.
   *
   * BOM لازم است: اکسل بدون آن UTF-8 را نمی‌شناسد و فارسی را درهم نشان
   * می‌دهد.
   */
  function exportCsv() {
    const cell = (raw) => {
      const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
      return `"${text.replace(/"/g, '""')}"`;
    };

    const header = [
      'اثرانگشت', 'منبع', 'وضعیت', 'قضاوت', 'برگشته', 'یادداشت', 'پیام',
      'چه باید می‌بود', 'قدم‌ها', 'دستگاه‌ها', 'بنچ‌ها',
      'تعداد رخداد', 'تعداد اجرا', 'اولین بار', 'آخرین بار', 'زمانِ آخرین تصمیم',
    ];
    const rows = filtered.map((item) => [
      item.fingerprint,
      sourceLabelOf(item.source),
      item.triage.status,
      item.triage.verdict || '',
      item.regressed ? 'بله' : '',
      item.triage.note,
      item.message || item.normalized,
      (expectedOf(item)?.items || []).join(' · '),
      (item.steps || []).join(' · '),
      (item.devices || []).join(' · '),
      (item.benches || []).join(' · '),
      item.count,
      item.runs.length,
      item.firstSeen,
      item.lastSeen,
      item.triage.updatedAt || '',
    ].map(cell).join(','));

    const body = [header.map(cell).join(','), ...rows].join('\r\n');
    const blob = new Blob(['\uFEFF' + body], {

      type: 'text/csv;charset=utf-8',
    });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `triage-${data.target}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function save(item) {
    item.saving = true;
    item.feedback = '';
    try {
      const response = await fetch(`/api/triage/${encodeURIComponent(data.target)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({
          fingerprint: item.fingerprint,
          status: item.triage.status,
          note: item.triage.note,
          verdict: item.triage.verdict || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'ذخیره نشد');
      item.triage = payload.triage;
      /**
       * آنچه برچسب در شناخت تغییر داد، همان‌جا گفته می‌شود.
       *
       * بدون این، حلقه نامرئی است: کاربر «قلابی» می‌زند و هیچ نشانه‌ای
       * نمی‌بیند که چکِ پرسروصدا دارد خاموش می‌شود.
       */
      item.feedback = payload.learned?.applied?.length ? payload.learned.applied.join(' · ') : 'ذخیره شد';
    } catch (cause) {
      item.feedback = cause.message;
    } finally {
      item.saving = false;
    }
  }
</script>

<PageHeader eyebrow="ادغام بر پایهٔ اثرانگشت" title="تریاژ {data.project.name}" description="هر نقص در تمام اجراها یک ردیف می‌شود؛ وضعیت و یادداشت در فایل triage پروژه ذخیره می‌شود، نه دیتابیس.">
  <!--
    تریاژ ته‌خطِ مسیر نیست؛ حلقه است.

    قضاوتی که اینجا ثبت می‌شود به شناخت برمی‌گردد (قلابی → چک خاموش، باگِ
    واقعی → خطر، رفتارِ درست → قرارداد). پس پایانِ این صفحه باید به همان‌جا
    اشاره کند، نه فقط «بازگشت».
  -->
  {#snippet actions()}
    <Button href={`/projects/${encodeURIComponent(data.target)}/knowledge`} variant="outline">شناخت</Button>
    <Button href={`/projects/${encodeURIComponent(data.target)}`} variant="ghost">بازگشت به اجرا</Button>
  {/snippet}
</PageHeader>

<div class="mb-5 space-y-3 rounded-xl border bg-card p-4">
  <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
    <Input bind:value={search} placeholder="جست‌وجوی پیام، منبع یا اثرانگشت…" />
    <select class="app-select" bind:value={status}><option value="active">نیازمند رسیدگی</option><option value="open">باز</option><option value="acknowledged">بررسی‌شده</option><option value="resolved">رفع‌شده</option><option value="ignored">نادیده‌گرفته</option><option value="all">همه</option></select>
  </div>

  <div class="grid gap-3 sm:grid-cols-[13rem_minmax(0,1fr)_auto]">
    <select class="app-select" bind:value={source}>
      <option value="all">همهٔ منبع‌ها</option>
      {#each sources as key (key)}<option value={key}>{sourceLabelOf(key)}</option>{/each}
    </select>

    <select class="app-select" bind:value={scenario}>
      <option value="all">همهٔ قدم‌ها و سناریوها</option>
      {#each scenarios as name (name)}<option value={name}>{name}</option>{/each}
    </select>

    <div class="flex items-center gap-2">
      <!--
        دکمهٔ «برگشته» فقط وقتی هست که برگشته‌ای هست — و آن‌وقت پررنگ.
        گزینه‌ای که همیشه صفر است، فقط جا می‌گیرد.
      -->
      {#if regressedCount}
        <Button
          variant={onlyRegressed ? 'destructive' : 'outline'}
          size="sm"
          class="h-9"
          onclick={() => { onlyRegressed = !onlyRegressed; }}
        >
          {formatNumber(regressedCount)} برگشته
        </Button>
      {/if}
      <Badge variant="outline" class="h-9 px-3">{formatNumber(filtered.length)} از {formatNumber(items.length)}</Badge>
      <Button variant="outline" size="sm" class="h-9" onclick={exportCsv} disabled={!filtered.length}>خروجی CSV</Button>
    </div>
  </div>

  {#if source !== 'all' || scenario !== 'all' || status !== 'active' || search || onlyRegressed}
    <button type="button" class="text-xs text-muted-foreground underline underline-offset-4" onclick={() => { search = ''; status = 'active'; source = 'all'; scenario = 'all'; onlyRegressed = false; }}>
      پاک کردن فیلترها
    </button>
  {/if}
</div>

<div class="grid gap-4 xl:grid-cols-2">
  {#each filtered as item (item.fingerprint)}
    <FindingCard finding={item}>
      <!--
        «رفع شد، دوباره آمد» — بلندترین حرفِ این صفحه.

        نقصی که یک بار رفع اعلام شده و برگشته، یعنی یا اصلاح نگرفته یا
        رگرسیون است. تا امروز همان ردیفِ سبز سرِ جایش می‌ماند و هیچ‌کس
        نمی‌فهمید.
      -->
      {#if item.regressed}
        <div class="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs leading-6">
          <strong class="text-destructive">رفع‌شده اعلام شده بود و دوباره پیدا شد.</strong>
          <span class="block text-muted-foreground">
            تصمیمِ «رفع‌شده» در {formatDate(item.triage.updatedAt)} ثبت شد، ولی این نقص در
            {formatDate(item.lastSeen)} دوباره دیده شد. یا اصلاح نگرفته، یا برگشته.
          </span>
        </div>
      {/if}

      <!--
        چهار پرسشی که هر ردیف باید جوابشان را بدهد: کجا، از کجا فهمیدیم،
        چه باید می‌شد، و ما چه کردیم. پیش از این فقط سومی و چهارمی بودند،
        آن هم به‌شکل JSONِ خام.
      -->
      <dl class="mb-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[6rem_minmax(0,1fr)]">
        {#if item.routes?.length || expectedOf(item)?.path}
          <dt class="text-muted-foreground">کجا</dt>
          <dd dir="ltr" class="font-mono">{(item.routes || [expectedOf(item)?.path]).filter(Boolean).join(' · ')}</dd>
        {/if}

        <dt class="text-muted-foreground">از کجا فهمیدیم</dt>
        <dd>
          {sourceLabelOf(item.source)}
          <span class="text-muted-foreground">
            · در {formatNumber(item.runs.length)} اجرا، {formatNumber(item.count)} بار
            · آخرین: {formatDate(item.lastSeen)}
          </span>
        </dd>

        {#if item.benches?.length}
          <dt class="text-muted-foreground">در بنچِ</dt>
          <dd class="flex flex-wrap gap-1.5">
            {#each item.benches as name (name)}
              <span class="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">{name}</span>
            {/each}
          </dd>
        {/if}

        {#if expectedOf(item)}
          <dt class="text-muted-foreground">چه باید می‌بود</dt>
          <dd>
            <span class="text-muted-foreground">این‌ها پیش‌تر همیشه بودند و حالا نیستند:</span>
            <ul class="mt-1 space-y-0.5">
              {#each expectedOf(item).items as name (name)}
                <li class="before:me-1 before:text-muted-foreground/60 before:content-['•']">{name}</li>
              {/each}
            </ul>
          </dd>
        {/if}
      </dl>
      <div class="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
        <select class="app-select" bind:value={item.triage.status}><option value="open">باز</option><option value="acknowledged">بررسی‌شده</option><option value="resolved">رفع‌شده</option><option value="ignored">نادیده‌گرفته</option></select>
        <select class="app-select" bind:value={item.triage.verdict} title="این برچسب به شناخت برمی‌گردد: «قلابی» چکِ پرسروصدا را خاموش می‌کند، «باگ واقعی» به خطرها می‌رود."><option value="">قضاوت؟</option><option value="false-positive">قلابی</option><option value="real-bug">باگ واقعی</option><option value="by-design">رفتار درست است</option><option value="later">بعداً</option></select>
        <Input bind:value={item.triage.note} placeholder="یادداشت تریاژ…" />
        <Button size="sm" onclick={() => save(item)} disabled={item.saving}>{item.saving ? '…' : 'ذخیره'}</Button>
      </div>
      {#if item.feedback}<p class="mt-2 text-xs text-muted-foreground">{item.feedback}</p>{/if}

      <!--
        فرضیهٔ سورس — با برچسبِ «حدس»، نه کنارِ فکت‌ها.

        ── چرا این تفکیک اینجا هم تکرار می‌شود ──

        همان قانونِ `by:` در پرونده. بالای این کارت فکت است (چه شد، کجا، چند
        بار) و این تکه حدسِ مدل. اگر بی مرز کنار هم می‌نشستند، فردا کسی
        فرضیه را به‌عنوان علتِ قطعی نقل می‌کرد.
      -->
      <div class="mt-3 border-t pt-3">
        {#if item.explain}
          <div class="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs leading-6">
            <div class="flex flex-wrap items-center gap-2">
              <strong>چرا احتمالاً این شد</strong>
              <span class="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                حدسِ مدل · {CONFIDENCE[item.explain.confidence] || item.explain.confidence}
              </span>
            </div>

            <p>{item.explain.cause}</p>

            {#if item.explain.where?.length}
              <div>
                <span class="text-muted-foreground">جایی که احتمالاً مسئول است:</span>
                <ul class="mt-1 space-y-1">
                  {#each item.explain.where as row (row.file)}
                    <li>
                      <code dir="ltr" class="font-mono text-[11px]">{row.file}</code>
                      <span class="block text-muted-foreground">{row.why}</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}

            <!--
              «کجاهای دیگر همین الگو هست» — همان چیزی که خواسته شد: نه
              گشتنِ سورس دنبال باگ، بلکه بردنِ یک شکستِ دیده‌شده به جاهای
              مشابهی که هنوز آزموده نشده‌اند.
            -->
            {#if item.explain.siblings?.length}
              <div>
                <span class="text-muted-foreground">همین الگو جای دیگر هم هست:</span>
                <ul class="mt-1 space-y-1">
                  {#each item.explain.siblings as row (row.file)}
                    <li>
                      <code dir="ltr" class="font-mono text-[11px]">{row.file}</code>
                      <span class="block text-muted-foreground">{row.why}</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if item.explain.next}
              <p class="rounded-md bg-background p-2">
                <span class="text-muted-foreground">برای آزمودنِ این فرضیه:</span>
                {item.explain.next}
              </p>
            {/if}

            <p class="text-[11px] text-muted-foreground">
              {item.explain.model} · {formatDate(item.explain.at)}
              <button type="button" class="underline underline-offset-2" onclick={() => explain(item)} disabled={item.asking}>
                {item.asking ? 'دوباره می‌پرسم…' : 'دوباره بپرس'}
              </button>
            </p>
          </div>
        {:else}
          <Button variant="ghost" size="sm" onclick={() => explain(item)} disabled={item.asking}>
            {item.asking ? 'دارم سورس را می‌خوانم…' : 'چرا این شد؟ — از سورس بپرس'}
          </Button>
        {/if}
      </div>

      <!--
        تاریخچهٔ تصمیم‌ها.

        «رفع شد» و بعد «دوباره پیدا شد» و بعد «این بار واقعاً رفع شد» سه
        تصمیمِ متفاوت‌اند. با نگه داشتنِ فقط آخری، هفتهٔ بعد کسی نمی‌فهمد
        این نقص بار اول هم رفع اعلام شده بود.
      -->
      {#if item.triage.history?.length > 1}
        <details class="mt-3 text-xs">
          <summary class="cursor-pointer text-muted-foreground">
            {formatNumber(item.triage.history.length)} تصمیمِ پیشین
          </summary>
          <ol class="mt-2 space-y-1.5 border-s ps-3">
            {#each item.triage.history.slice().reverse() as row, index (row.at + index)}
              <li class="leading-6">
                <span class="font-medium">{STATUS_LABELS[row.status] || row.status}</span>
                <span class="text-muted-foreground">· {formatDate(row.at)}</span>
                {#if row.note}<span class="block text-muted-foreground">«{row.note}»</span>{/if}
              </li>
            {/each}
          </ol>
        </details>
      {/if}
      <details class="mt-3 text-xs"><summary class="cursor-pointer text-muted-foreground">اجراهای دیده‌شده</summary><div class="mt-2 flex flex-wrap gap-2">{#each item.runs.slice().reverse() as runId}<a class="code-value rounded border px-2 py-1 hover:bg-accent" href={`/runs/${encodeURIComponent(runId)}`}>{runId}</a>{/each}</div></details>
    </FindingCard>
  {:else}<p class="rounded-xl border border-dashed p-12 text-center text-muted-foreground xl:col-span-2">یافته‌ای با این فیلتر نیست.</p>{/each}
</div>
