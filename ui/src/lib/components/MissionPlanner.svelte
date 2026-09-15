<script>
  /**
   * «مأموریت» — جمله، نقشهٔ کار، و اصلاحِ آدم پیش از خرج کردن.
   *
   * ── چرا این میان جمله و خزش نشست ──
   *
   * تا امروز جمله مستقیم به اجرا می‌رفت: `quest` بلافاصله شروع می‌کرد به
   * گشتن و فراخوانی. اگر بد فهمیده بود، بیست‌وپنج قدم و چند دقیقه رفته بود
   * تا معلوم شود.
   *
   * اصلاحِ یک **نقشه** رایگان است؛ اصلاحِ یک **اجرا** گران. و این همان
   * الگویی است که هر جای دیگرِ این ابزار جواب داده: نوارِ فرمان، تفاوتِ
   * «بازنویسی»، پیش‌نمایشِ «واردکردنِ بسته». فقط گران‌ترین کار — خزش — این
   * مرحله را نداشت.
   *
   * ── چرا اصلاح با کشویی است، نه متنِ آزاد ──
   *
   * دامنه‌ای که به هیچ حالتی نمی‌خورد (غلطِ تایپی هم کافی است) خطا نمی‌دهد:
   * خزش می‌رود، هیچ کنشی امتحان نمی‌کند، و گزارش می‌گوید «صف تمام شد» —
   * شبیهِ موفقیت. پس هرچه انتخاب می‌شود از فهرستِ واقعیِ سرور می‌آید.
   */
  import { onMount } from 'svelte';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import ModelPicker from '$lib/components/ModelPicker.svelte';

  let { target, onstarted } = $props();

  let text = $state('');
  let model = $state('');
  let mission = $state(null);
  let missions = $state([]);
  let world = $state({ routes: [], views: [], accounts: [], scenarios: [], hasSession: false });
  let busy = $state('');
  let error = $state('');
  let saved = $state(false);

  /** سقف‌ها همراهِ اجرا می‌روند، نه داخلِ فایلِ مأموریت: تصمیمِ امروزند. */
  let states = $state(40);
  let minutes = $state(12);
  let headed = $state(false);

  /** چیزی که در کشویی «دامنه» می‌آید: هرچه سرور واقعاً می‌شناسد. */
  let choices = $derived([...world.routes, ...world.views]);
  let addScope = $state('');

  async function load() {
    const response = await fetch(`/api/mission?target=${encodeURIComponent(target)}`);
    if (!response.ok) return;
    const payload = await response.json();
    missions = payload.missions || [];
    world = payload.world || world;
  }
  /**
   * روی مرورگر، نه در رندرِ سرور.
   *
   * فراخوانیِ نسبی در SSR اصلاً ممکن نیست و صفحه را با خطای ۵۰۰ می‌اندازد —
   * یعنی صفحهٔ نقشه کلاً باز نمی‌شود، برای کارتی که فقط بخشی از آن است.
   */
  onMount(load);

  async function post(body) {
    const response = await fetch('/api/mission', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
      body: JSON.stringify({ target, ...body }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'انجام نشد');
    return payload;
  }

  async function propose(event) {
    event.preventDefault();
    busy = 'propose';
    error = '';
    saved = false;
    try {
      mission = (await post({ action: 'propose', text, model })).mission;
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  async function save() {
    busy = 'save';
    error = '';
    try {
      // هرچه ذخیره می‌شود دوباره از صافیِ سرور رد می‌شود — آدم هم غلط تایپ می‌کند
      mission = (await post({ action: 'save', mission })).mission;
      saved = true;
      await load();
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  async function run(slug) {
    busy = `run:${slug}`;
    error = '';
    try {
      await post({ action: 'run', slug, states, minutes, headed });
      onstarted?.();
    } catch (cause) {
      error = cause.message;
      busy = '';
    }
  }

  /** ذخیره و اجرا، چون آدمی که تأیید کرده دو کلیک نمی‌خواهد. */
  async function saveAndRun() {
    await save();
    if (!error && mission?.slug) await run(mission.slug);
  }

  async function remove(slug) {
    busy = `remove:${slug}`;
    error = '';
    try {
      missions = (await post({ action: 'remove', slug })).missions || [];
      if (mission?.slug === slug) saved = false;
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  /**
   * هر دست‌کاری، نقشه را **مالِ آدم** می‌کند.
   *
   * ── چرا این مهم است ──
   *
   * همان قاعدهٔ `by:` در پروندهٔ شناخت: چیزی که آدم نوشته نباید به نامِ مدل
   * ثبت شود. نقشه‌ای که دامنه‌اش را خودت عوض کرده‌ای، دیگر «پیشنهادِ مدل»
   * نیست — و اگر برچسبش همان بماند، بعداً کسی به آن بی‌اعتماد می‌شود که
   * حقِ اعتماد داشت.
   */
  function touch() {
    saved = false;
    if (mission) mission.by = 'user';
  }

  function dropScope(one) {
    mission.scope = mission.scope.filter((item) => item !== one);
    touch();
  }

  function pushScope() {
    const value = addScope.trim();
    if (!value || mission.scope.includes(value)) return;
    mission.scope = [...mission.scope, value];
    addScope = '';
    touch();
  }

  function dropLook(index) {
    mission.look = mission.look.filter((_, i) => i !== index);
    touch();
  }
</script>

<Card.Root>
  <Card.Header class="pb-3">
    <Card.Title class="text-sm">مأموریت</Card.Title>
    <Card.Description>
      بنویس چه می‌خواهی. یک فراخوانی مدل یک <strong>نقشهٔ کار</strong> می‌سازد،
      تو اصلاحش می‌کنی — رایگان — و بعد خزش فقط همان را می‌گردد.
    </Card.Description>
  </Card.Header>

  <Card.Content class="space-y-4">
    <form class="space-y-2" onsubmit={propose}>
      <Textarea
        bind:value={text}
        rows={2}
        class="text-sm leading-6"
        placeholder="برو داخل کتاب و همهٔ ابزارهای متن را ببین"
      />
      <div class="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={busy === 'propose' || text.trim().length < 5}>
          {busy === 'propose' ? 'در حال فکر…' : 'نقشهٔ کار را بساز'}
        </Button>
        <span class="text-[11px] text-muted-foreground">یک فراخوانی — هنوز هیچ مرورگری باز نمی‌شود.</span>
      </div>
      <ModelPicker bind:value={model} disabled={busy === 'propose'} />
    </form>

    {#if error}<p class="text-xs text-destructive">{error}</p>{/if}

    {#if mission}
      <!--
        نقشهٔ کار، باز و قابلِ دست‌کاری.

        اینکه فقط نشان داده شود و دکمهٔ «تأیید» بخورد کافی نبود: کاربر وقتی
        نقشه را می‌بیند دقیقاً همان لحظه می‌فهمد کجا را اشتباه فهمیده — و
        اگر نتواند همان‌جا عوضش کند، برمی‌گردد جمله را دوباره می‌نویسد و یک
        فراخوانی دیگر خرج می‌شود.
      -->
      <div class="space-y-3 rounded-xl border bg-muted/20 p-3">
        <div class="flex items-start justify-between gap-2">
          <p class="text-[11px] text-muted-foreground">
            {mission.by === 'user' ? 'دستِ خودت' : mission.by === 'rule' ? 'دامنه از نقشه آمد' : 'پیشنهادِ مدل'}
            {#if mission.model}· <span dir="ltr" class="font-mono">{mission.model}</span>{/if}
          </p>
          {#if saved}<Badge variant="secondary" class="text-[10px]">ذخیره شد</Badge>{/if}
        </div>

        <label class="block space-y-1">
          <span class="text-[11px] text-muted-foreground">هدف</span>
          <Input bind:value={mission.goal} class="h-8" oninput={touch} />
        </label>

        {#if mission.why}
          <p class="text-[11px] leading-5 text-muted-foreground">چرا این مسیر: {mission.why}</p>
        {/if}

        <!-- ۱. از کجا شروع کند — همان سه حالتِ فرمِ خزش، با یک منبعِ حقیقت -->
        <fieldset class="space-y-1.5">
          <legend class="text-xs font-semibold">از کجا شروع کند</legend>
          <label class="flex items-center gap-2 text-xs">
            <input
              type="radio"
              bind:group={mission.start.mode}
              value="session"
              disabled={!world.hasSession}
              onchange={touch}
            />
            <span>
              ادامهٔ نشستِ گشت
              {#if !world.hasSession}
                <span class="text-[11px] text-muted-foreground">(نشستی ذخیره نشده)</span>
              {/if}
            </span>
          </label>

          <label class="flex items-center gap-2 text-xs">
            <input type="radio" bind:group={mission.start.mode} value="account" onchange={touch} />
            <span>با حسابِ ذخیره‌شده</span>
            {#if mission.start.mode === 'account'}
              <select
                bind:value={mission.start.account}
                onchange={touch}
                class="h-7 rounded-md border bg-background px-2 text-xs"
              >
                {#each world.accounts as id (id)}<option value={id}>{id}</option>{/each}
              </select>
            {/if}
          </label>

          <label class="flex items-center gap-2 text-xs">
            <input type="radio" bind:group={mission.start.mode} value="fresh" onchange={touch} />
            <span>کاربرِ تازه بسازد</span>
          </label>

          {#if mission.start.mode !== 'session'}
            <label class="flex flex-wrap items-center gap-2 text-xs">
              <span class="text-muted-foreground">سناریوی ورود</span>
              <select
                bind:value={mission.start.entry}
                onchange={touch}
                class="h-7 min-w-40 rounded-md border bg-background px-2 text-xs"
              >
                <option value="">(بی سناریوی ورود)</option>
                {#each world.scenarios as one (one)}<option value={one}>{one}</option>{/each}
              </select>
            </label>
          {/if}
        </fieldset>

        <!-- ۲. دامنه — مرز، نه اولویت -->
        <fieldset class="space-y-1.5 border-t pt-2">
          <legend class="text-xs font-semibold">کجا را بگردد</legend>
          {#if mission.scope.length}
            <ul class="flex flex-wrap gap-1.5">
              {#each mission.scope as one (one)}
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
          {:else}
            <p class="text-[11px] leading-5 text-amber-600">
              دامنه خالی است، یعنی <strong>همه‌جا</strong> — همان چیزی که این
              مرحله برای جلوگیری از آن ساخته شد. یکی از فهرست بردارید.
            </p>
          {/if}

          <div class="flex gap-1.5">
            <Input bind:value={addScope} list="ub-mission-scope" class="h-7 text-xs" placeholder="افزودنِ روت یا نما" />
            <datalist id="ub-mission-scope">
              {#each choices as one (one)}<option value={one}></option>{/each}
            </datalist>
            <Button type="button" size="sm" variant="outline" class="h-7" onclick={pushScope}>افزودن</Button>
          </div>
        </fieldset>

        <!-- ۳. چه چیزی را امتحان کند — اولویت، چون مرز از قبل گذاشته شده -->
        {#if mission.look?.length}
          <fieldset class="space-y-1 border-t pt-2">
            <legend class="text-xs font-semibold">آنجا دنبالِ چه بگردد</legend>
            <ul class="space-y-1">
              {#each mission.look as one, index (one)}
                <li class="flex items-center justify-between gap-2 text-xs">
                  <span>· {one}</span>
                  <button
                    type="button"
                    class="text-[11px] text-muted-foreground hover:text-destructive"
                    onclick={() => dropLook(index)}
                  >
                    حذف
                  </button>
                </li>
              {/each}
            </ul>
          </fieldset>
        {/if}

        {#if mission.notes}
          <p class="rounded-lg border bg-background p-2 text-[11px] leading-5">
            <strong>مدل گفت:</strong>
            {mission.notes}
          </p>
        {/if}

        <!--
          آنچه افتاد، دیده می‌شود.

          حذفِ بی‌صدای یک دامنهٔ اختراعی یعنی کاربر فکر می‌کند دو جا گشته شد.
        -->
        {#if mission.dropped?.length}
          <ul class="space-y-0.5 text-[11px] leading-5 text-amber-600">
            {#each mission.dropped as one (one)}<li>! {one}</li>{/each}
          </ul>
        {/if}

        <div class="flex flex-wrap items-center gap-2 border-t pt-2 text-xs">
          <label class="flex items-center gap-1">
            سقفِ حالت
            <Input type="number" bind:value={states} min="1" max="1000" class="h-7 w-16 text-xs" />
          </label>
          <label class="flex items-center gap-1">
            دقیقه
            <Input type="number" bind:value={minutes} min="1" max="1000" class="h-7 w-16 text-xs" />
          </label>
          <label class="flex items-center gap-1">
            <input type="checkbox" bind:checked={headed} />
            مرورگر دیده شود
          </label>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button type="button" size="sm" onclick={saveAndRun} disabled={!!busy}>
            {busy.startsWith('run') ? 'در حال شروع…' : 'ذخیره و اجرا'}
          </Button>
          <Button type="button" size="sm" variant="outline" onclick={save} disabled={!!busy || saved}>
            {busy === 'save' ? 'در حال ذخیره…' : 'فقط ذخیره'}
          </Button>
        </div>
      </div>
    {/if}

    {#if missions.length}
      <!--
        مأموریت‌های ذخیره‌شده — چون همان کار هفتهٔ بعد دوباره لازم می‌شود.

        و چون فایل‌اند، نه prompt: دیده می‌شوند، اصلاح می‌شوند، کامیت می‌شوند.
      -->
      <div class="space-y-2 border-t pt-3">
        <p class="text-xs font-semibold">مأموریت‌های ذخیره‌شده</p>
        <ul class="space-y-1.5">
          {#each missions as one (one.slug)}
            <li class="rounded-lg border p-2 text-xs">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate font-medium">{one.goal}</p>
                  <p class="mt-0.5 text-[11px] text-muted-foreground">
                    {one.scope?.length ? one.scope.join('، ') : 'همه‌جا'}
                    {#if one.runs?.length}· {one.runs.length} اجرا{/if}
                  </p>
                </div>
                <div class="flex shrink-0 gap-1">
                  <Button type="button" size="sm" variant="outline" class="h-7" onclick={() => run(one.slug)} disabled={!!busy}>
                    {busy === `run:${one.slug}` ? '…' : 'اجرا'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" class="h-7" onclick={() => remove(one.slug)} disabled={!!busy}>
                    حذف
                  </Button>
                </div>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
