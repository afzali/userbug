<script>
  /**
   * جمله → نقشهٔ کار. **فقط همین** — دیدن و اصلاح و اجرا جای دیگری است.
   *
   * ── چرا این کارت کوچک شد ──
   *
   * نسخهٔ اولش یک فرمِ کامل بود: نقشهٔ کار را نشان می‌داد، اجازهٔ اصلاح
   * می‌داد، و خودش خزش را شروع می‌کرد. یعنی صفحهٔ نقشه دو فرم داشت که هر دو
   * یک کار می‌کردند. کاربر درست گفت:
   *
   *   «مأموریت و خزشِ دستی مگر دو راه مجزا نیستند؟ اگر مأموریت را پر کنم،
   *    عملاً داینامیک همان فرمِ دستی را پر کرده‌ام.»
   *
   * حق داشت. نقشهٔ کار یک **راهِ دیگر برای پر کردنِ همان فرم** است، نه مسیری
   * موازی. پس این کارت فقط جمله را می‌گیرد و نتیجه را به فرم می‌دهد؛ دیدن و
   * اصلاح و شروع همان‌جا انجام می‌شود که همیشه.
   */
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import ModelPicker from '$lib/components/ModelPicker.svelte';

  let { target, sentence = $bindable(''), onplan, disabled = false } = $props();

  let model = $state('');
  let missions = $state([]);
  let busy = $state(false);
  let error = $state('');
  let dropped = $state([]);

  async function load() {
    const response = await fetch(`/api/mission?target=${encodeURIComponent(target)}`);
    if (!response.ok) return;
    missions = (await response.json()).missions || [];
  }

  /**
   * روی مرورگر، نه در رندرِ سرور.
   *
   * فراخوانیِ نسبی در SSR ممکن نیست و کلِ صفحهٔ نقشه را با ۵۰۰ می‌اندازد —
   * برای کارتی که فقط بخشی از آن است.
   */
  onMount(load);

  /** صفحه بعد از «ذخیره به‌عنوان مأموریت» صدایش می‌زند تا فهرست تازه شود. */
  export async function refresh() {
    await load();
  }

  async function propose(event) {
    event?.preventDefault();
    busy = true;
    error = '';
    dropped = [];
    try {
      const response = await fetch('/api/mission', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target, action: 'propose', text: sentence, model }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'نقشهٔ کار ساخته نشد');

      /**
       * آنچه افتاد، دیده می‌شود.
       *
       * مدل گاهی روتی می‌گوید که وجود ندارد. حذفِ بی‌صدایش یعنی کاربر فکر
       * می‌کند آنجا هم گشته می‌شود — و نتیجه‌اش خزشی است که هیچ کنشی امتحان
       * نمی‌کند ولی «صف تمام شد» گزارش می‌دهد.
       */
      dropped = payload.mission?.dropped || [];
      onplan?.(payload.mission);
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = false;
    }
  }

  function pick(mission) {
    sentence = mission.text || mission.goal || '';
    dropped = [];
    onplan?.(mission);
  }
</script>

<div class="space-y-2">
  <Textarea
    bind:value={sentence}
    rows={2}
    class="text-sm leading-6"
    placeholder="برو داخل کتاب و همهٔ ابزارهای متن را ببین"
    {disabled}
  />

  <div class="flex flex-wrap items-center gap-2">
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onclick={propose}
      disabled={busy || disabled || sentence.trim().length < 5}
    >
      {busy ? 'در حال فکر…' : 'نقشه‌اش را برایم بکش'}
    </Button>
    <span class="text-[11px] leading-5 text-muted-foreground">
      یک فراخوانی مدل. فرمِ پایین پر می‌شود — بعد خودت اصلاحش کن.
    </span>
  </div>

  {#if error}<p class="text-xs text-destructive">{error}</p>{/if}

  {#each dropped as note (note)}
    <p class="text-[11px] leading-5 text-amber-700 dark:text-amber-300">! {note}</p>
  {/each}

  <details class="text-[11px]">
    <summary class="cursor-pointer text-muted-foreground">با کدام مدل؟</summary>
    <div class="pt-2"><ModelPicker bind:value={model} disabled={busy} /></div>
  </details>

  {#if missions.length}
    <!--
      مأموریت‌های ذخیره‌شده = همان جمله‌ها، بی فراخوانیِ دوباره.

      نقشهٔ کار یک فایل است؛ اگر هفتهٔ بعد همان کار لازم شد، دلیلی ندارد
      دوباره پول بدهیم تا مدل همان جواب را بسازد.
    -->
    <div class="space-y-1 border-t pt-2">
      <p class="text-[11px] text-muted-foreground">یا یکی از مأموریت‌های ذخیره‌شده — رایگان:</p>
      <ul class="flex flex-wrap gap-1.5">
        {#each missions as one (one.slug)}
          <li>
            <button
              type="button"
              class="rounded-full border px-2 py-0.5 text-[11px] hover:border-primary hover:bg-accent"
              onclick={() => pick(one)}
              {disabled}
            >
              {one.goal.slice(0, 40)}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
