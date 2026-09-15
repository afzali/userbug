<script>
  /**
   * «انتظار داشتیم چه ببینیم؟»
   *
   * ── چرا این پنل ساخته شد ──
   *
   * سناریوی ورودی که همین ابزار ساخته بود، چهل‌وهفت خط `fill` و `click`
   * داشت و **صفر `expect`**. یعنی ابزار می‌گفت «چیزی نشکست»، نه «کار درست
   * انجام شد».
   *
   * نوشتنِ آن انتظارها با دست سخت نیست، ولی کسی نمی‌داند چه بنویسد: باید
   * بدانی دقیقاً چه عنصری روی آن صفحه هست و توصیفِ پایدارش چیست.
   *
   * ── چرا فهرست، نه یک کادرِ متنِ آزاد ──
   *
   * انتظاری که به عنصرِ ناموجود اشاره کند، **برای همیشه قرمز** می‌ماند — و
   * آدم یاد می‌گیرد قرمزها را نادیده بگیرد. پس هر گزینه از چیزی ساخته شده
   * که واقعاً دیده شده: قراردادِ صفحه‌ها (چند بازدیدِ گشت) و برچسبِ کنش‌های
   * نقشه.
   *
   * مدل فقط **انتخاب** می‌کند و می‌گوید کجا؛ خودِ شرط را سرور می‌سازد.
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import ModelPicker from '$lib/components/ModelPicker.svelte';

  let { target, relative = '', yaml = '', onapplied } = $props();

  let candidates = $state([]);
  let steps = $state(0);
  let why = $state('');
  let rows = $state([]);
  let dropped = $state([]);
  let model = $state('');
  let busy = $state('');
  let error = $state('');
  let loaded = $state(false);
  let pick = $state('');

  async function load() {
    if (loaded) return;
    const url = `/api/scenarios/expect?target=${encodeURIComponent(target)}&relative=${encodeURIComponent(relative)}`;
    const response = await fetch(url);
    if (!response.ok) return;
    const payload = await response.json();
    candidates = payload.candidates || [];
    steps = payload.steps || 0;
    why = payload.why || '';
    loaded = true;
  }
  load();

  /** پیشنهادِ مدل — تنها کاری که پول خرج می‌کند. */
  async function propose() {
    busy = 'propose';
    error = '';
    dropped = [];
    try {
      const response = await fetch('/api/scenarios/expect', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target, yaml, model }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'پیشنهادی نیامد');

      rows = (payload.expectations || []).map((one) => ({ ...one, picked: true, hard: false }));
      dropped = payload.dropped || [];
      if (!rows.length) error = 'مدل هیچ انتظارِ معتبری پیشنهاد نداد. از فهرستِ پایین خودتان بردارید.';
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  /** افزودنِ دستی — رایگان، برای کسی که خودش می‌داند. */
  function addManual() {
    const candidate = candidates.find((one) => one.ref === pick);
    if (!candidate) return;
    rows = [
      ...rows,
      {
        ...candidate,
        after: steps || 1,
        kind: 'visible',
        why: `${candidate.label} باید دیده شود`,
        confidence: 'high',
        by: 'user',
        picked: true,
        hard: false,
      },
    ];
    pick = '';
  }

  async function apply() {
    busy = 'apply';
    error = '';
    try {
      const chosen = rows
        .filter((one) => one.picked)
        .map((one) => ({ ref: one.ref, after: one.after, kind: one.kind, why: one.why, hard: one.hard }));

      const response = await fetch('/api/scenarios/expect', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target, yaml, mode: 'apply', chosen }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'اضافه نشد');
      onapplied?.(payload);
      rows = [];
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  let chosenCount = $derived(rows.filter((one) => one.picked).length);
</script>

<div class="space-y-4">
  <div class="space-y-1.5">
    <p class="text-sm font-medium">
      بگو بعد از هر قدم چه باید دیده شود
      <span class="font-normal text-muted-foreground">— وگرنه سناریو فقط می‌گوید «چیزی نشکست»</span>
    </p>

    {#if why}
      <p class="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] leading-6">{why}</p>
    {:else}
      <div class="flex flex-wrap items-end gap-2">
        <Button variant="secondary" disabled={busy === 'propose' || !candidates.length} onclick={propose}>
          {busy === 'propose' ? 'در حال فکر…' : 'پیشنهاد بده'}
        </Button>
        <span class="text-[11px] text-muted-foreground">
          یک فراخوانی. {candidates.length} عنصرِ واقعی از گشت و نقشه در دستش است.
        </span>
      </div>
      <details class="text-[11px]">
        <summary class="cursor-pointer text-muted-foreground">با کدام مدل؟</summary>
        <div class="pt-2"><ModelPicker bind:value={model} disabled={busy === 'propose'} /></div>
      </details>
    {/if}
  </div>

  {#if error}<p class="text-xs text-destructive">{error}</p>{/if}

  {#each dropped as note (note)}
    <!--
      آنچه افتاد، دیده می‌شود: مدل گاهی عنصری می‌گوید که وجود ندارد، و حذفِ
      بی‌صدایش یعنی کاربر فکر کند آن هم سنجیده می‌شود.
    -->
    <p class="text-[11px] leading-5 text-amber-700 dark:text-amber-300">! {note}</p>
  {/each}

  {#if rows.length}
    <ul class="space-y-2">
      {#each rows as row, index (row.ref + index)}
        <li class="rounded-lg border p-2.5 {row.picked ? '' : 'opacity-50'}">
          <label class="flex items-start gap-2 text-xs">
            <input type="checkbox" bind:checked={row.picked} class="mt-1" />
            <span class="min-w-0 flex-1 space-y-1">
              <span class="block text-sm font-medium">{row.label}</span>
              <span class="block text-[11px] leading-5 text-muted-foreground">
                {row.route}{row.view ? ` ▸ ${row.view}` : ''} · {row.why}
              </span>

              <span class="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                <span class="text-muted-foreground">بعد از قدم</span>
                <Input type="number" min="0" max="200" bind:value={row.after} class="h-7 w-16 text-xs" />

                <select bind:value={row.kind} class="h-7 rounded-md border bg-background px-1.5 text-[11px]">
                  <option value="visible">باید دیده شود</option>
                  <option value="hidden">نباید دیده شود</option>
                </select>

                <!--
                  سخت یا نرم.

                  `assert` یافته ثبت می‌کند و می‌گذرد؛ `expect` همان‌جا
                  می‌شکند. حرفِ نیازموده‌ی مدل نباید بتواند بقیهٔ سناریو را از
                  اجرا بیندازد — پس پیش‌فرض نرم است و سخت‌شدنش تیکِ خودِ آدم.
                -->
                <label class="flex items-center gap-1">
                  <input type="checkbox" bind:checked={row.hard} />
                  قاعده است (همان‌جا بشکند)
                </label>

                {#if row.confidence === 'low'}
                  <Badge variant="outline" class="text-[10px]">مدل مطمئن نبود</Badge>
                {/if}
                {#if row.by === 'user'}
                  <Badge variant="secondary" class="text-[10px]">دستِ خودت</Badge>
                {/if}
              </span>
            </span>
          </label>
        </li>
      {/each}
    </ul>

    <Button disabled={!chosenCount || busy === 'apply'} onclick={apply}>
      {busy === 'apply' ? 'در حال افزودن…' : `افزودنِ ${chosenCount} انتظار`}
    </Button>
    <p class="text-[11px] leading-5 text-muted-foreground">
      چیزی روی دیسک نوشته نمی‌شود: تفاوت را می‌بینید و بعد خودتان ذخیره می‌کنید.
    </p>
  {/if}

  {#if candidates.length}
    <!--
      فهرستِ کامل، برای کسی که خودش می‌داند چه می‌خواهد.

      مدل میان‌بُر است نه دروازه: این مسیر هیچ فراخوانی ندارد.
    -->
    <div class="space-y-1.5 border-t pt-3">
      <p class="text-xs font-medium">یا خودت بردار — رایگان</p>
      <div class="flex flex-wrap gap-2">
        <select bind:value={pick} class="h-8 min-w-52 flex-1 rounded-md border bg-background px-2 text-xs">
          <option value="">— یکی از {candidates.length} عنصرِ واقعی —</option>
          {#each candidates as one (one.ref)}
            <option value={one.ref}>{one.route}{one.view ? ` ▸ ${one.view}` : ''} — {one.label}</option>
          {/each}
        </select>
        <Button variant="outline" size="sm" class="h-8" disabled={!pick} onclick={addManual}>افزودن</Button>
      </div>
      <p class="text-[11px] leading-5 text-muted-foreground">
        این‌ها عنصرهایی‌اند که در گشت یا خزش <strong>واقعاً دیده شده‌اند</strong> —
        پس انتظاری که از آن‌ها ساخته شود، فردا با دادهٔ دیگری نمی‌شکند.
      </p>
    </div>
  {/if}
</div>
