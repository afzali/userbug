<script>
  /**
   * «پیشرفته» — یک جعبه، برای هر کاری که مرورگر باز می‌کند.
   *
   * ── چرا مشترک و نه یکی در هر دیالوگ ──
   *
   * کاربر گفت این تنظیمات «بهتر است در پیشرفته باشد که همان اول دمِ چشمش
   * نباشد». تا دیروز فقط بررسی چنین جعبه‌ای داشت و کشف هیچ — یعنی
   * «نشستِ مرورگر بماند؟»، «حسابِ موجود یا تازه؟»، «از صفر یا ادامه؟»
   * هیچ‌جای رابط پرسیده نمی‌شد و فقط از خط فرمان در دسترس بود.
   *
   * ساختنِ جعبهٔ دومی در کشف، جوابِ ساده بود و جوابِ غلط: دو جعبه یعنی دو
   * واژه‌نامه. «مرورگر دیده شود» در یکی و «headed» در دیگری، و شش ماه بعد
   * کسی نمی‌داند این دو یک چیزند.
   *
   * پس یک جعبه، و هر فراخوان می‌گوید کدام ردیف‌ها را می‌خواهد. ردیف‌ها
   * **دقیقاً** پرچم‌های خط فرمان‌اند: چیزی که اینجا هست، آنجا هم هست.
   *
   * ── چرا شمارنده روی سرِ جعبه ──
   *
   * جعبهٔ بسته‌ای که داخلش تنظیمِ غیرپیش‌فرض دارد، تله است: کاربر «شروع»
   * می‌زند و اجرا کارِ دیگری می‌کند. پس سرِ جعبه می‌گوید چند چیز دست‌کاری
   * شده، حتی وقتی بسته است.
   */
  import { Input } from '$lib/components/ui/input/index.js';
  import ModelPicker from '$lib/components/ModelPicker.svelte';
  import { formatNumber } from '$lib/format.js';

  let {
    /** تنظیمات، دوطرفه. هر ردیفی که در `rows` نباشد دست نمی‌خورد. */
    value = $bindable({}),
    /** کدام ردیف‌ها دیده شوند — به ترتیبِ همین آرایه نه، به ترتیبِ زیر. */
    rows = [],
    /** برای ردیفِ `from`: نامِ سناریوهای موجود. */
    scenarios = [],
    disabled = false,
  } = $props();

  /**
   * پیش‌فرضِ هر ردیف — تنها مرجعِ «دست‌کاری شده یا نه».
   *
   * بی این، شمارنده باید حدس بزند؛ و حدسش روزی `repeat: 1` را تغییر
   * حساب می‌کند و شمارنده‌ای که همیشه عددی نشان دهد، همان نشان ندادن است.
   */
  const DEFAULTS = {
    from: '',
    profile: false,
    fresh: false,
    states: '',
    minutes: '',
    depth: '',
    device: '',
    persona: '',
    model: '',
    repeat: 1,
    headed: false,
  };

  let has = $derived(new Set(rows));

  let changed = $derived(
    rows.filter((key) => {
      const now = value?.[key];
      const base = DEFAULTS[key];
      if (typeof base === 'boolean') return Boolean(now) !== base;
      if (typeof base === 'number') return Number(now || base) !== base;
      return String(now ?? '') !== base;
    }).length
  );

  let open = $state(false);
</script>

{#if rows.length}
  <details class="mt-3 rounded-lg border p-2.5" bind:open>
    <summary class="flex cursor-pointer items-center gap-2 text-xs font-medium">
      <span>پیشرفته</span>
      <!--
        تنظیمِ غیرپیش‌فرض، حتی وقتی جعبه بسته است.

        این تنها چیزی است که جعبهٔ جمع‌شونده را از تله بودن درمی‌آورد.
      -->
      {#if changed}
        <span class="rounded-full bg-primary/10 px-1.5 text-[10px] font-normal text-primary">
          {formatNumber(changed)} تنظیم
        </span>
      {/if}
    </summary>

    <div class="mt-3 space-y-3">
      <!--
        نشست و حساب — همان چیزی که کاربر خواست و تا امروز فقط در خط فرمان بود.

        «هر بار از صفر شروع کردن» بزرگ‌ترین اصطکاکِ خزش روی اپِ ورود‌دار
        است: خزنده به صفحهٔ ورود می‌رسد، حسابی ندارد، و همان‌جا می‌ماند.
      -->
      {#if has.has('from')}
        <label class="block space-y-1 text-xs">
          <span class="text-muted-foreground">اول با این سناریو وارد شو</span>
          <select class="app-select" bind:value={value.from} {disabled}>
            <option value="">هیچ — از خودِ آدرسِ اول شروع کن</option>
            {#each scenarios as one (one)}
              <option value={one}>{one}</option>
            {/each}
          </select>
          <span class="block text-[11px] leading-5 text-muted-foreground">
            قدم‌های آن سناریو پیش از شروع بازپخش می‌شوند. برای اپی که ورود
            دارد، این تفاوتِ «کلِ اپ» با «فقط صفحهٔ ورود» است.
          </span>
        </label>
      {/if}

      {#if has.has('profile')}
        <label class="flex items-start gap-2 text-xs">
          <input type="checkbox" bind:checked={value.profile} class="mt-0.5" {disabled} />
          <span>
            همان مرورگرِ دفعهٔ قبل
            <span class="block text-[11px] leading-5 text-muted-foreground">
              نشست، حساب و تنظیماتی که در گشت ساخته‌اید می‌مانند. بی این، هر
              بار یک مرورگرِ تازه و بی‌حافظه.
            </span>
          </span>
        </label>
      {/if}

      {#if has.has('fresh')}
        <label class="flex items-start gap-2 text-xs">
          <input type="checkbox" bind:checked={value.fresh} class="mt-0.5" {disabled} />
          <span>
            نقشه را از صفر بساز
            <span class="block text-[11px] leading-5 text-muted-foreground">
              پیش‌فرض، خزش نقشهٔ موجود را ادامه می‌دهد. این گزینه دورش
              می‌ریزد — وقتی اپ آن‌قدر عوض شده که نقشهٔ قدیم گمراه می‌کند.
            </span>
          </span>
        </label>
      {/if}

      {#if has.has('states') || has.has('minutes') || has.has('depth')}
        <div class="grid grid-cols-2 gap-3">
          {#if has.has('states')}
            <label class="block space-y-1 text-xs">
              <span class="text-muted-foreground">سقفِ حالت</span>
              <Input type="number" min="1" max="500" bind:value={value.states} class="h-8" {disabled} />
            </label>
          {/if}
          {#if has.has('minutes')}
            <label class="block space-y-1 text-xs">
              <span class="text-muted-foreground">سقفِ دقیقه</span>
              <Input type="number" min="1" max="120" bind:value={value.minutes} class="h-8" {disabled} />
            </label>
          {/if}
          {#if has.has('depth')}
            <label class="block space-y-1 text-xs">
              <span class="text-muted-foreground">سقفِ قدم</span>
              <Input type="number" min="1" max="100" bind:value={value.depth} class="h-8" {disabled} />
            </label>
          {/if}
          {#if has.has('repeat')}
            <label class="block space-y-1 text-xs">
              <span class="text-muted-foreground">تکرار</span>
              <Input type="number" min="1" max="10" bind:value={value.repeat} class="h-8" {disabled} />
            </label>
          {/if}
        </div>
      {:else if has.has('repeat')}
        <label class="block space-y-1 text-xs">
          <span class="text-muted-foreground">تکرار</span>
          <Input type="number" min="1" max="10" bind:value={value.repeat} class="h-8" {disabled} />
        </label>
      {/if}

      {#if has.has('device')}
        <label class="block space-y-1 text-xs">
          <span class="text-muted-foreground">دستگاه</span>
          <Input bind:value={value.device} dir="ltr" placeholder="desktop" class="h-8" {disabled} />
        </label>
      {/if}

      {#if has.has('persona')}
        <label class="block space-y-1 text-xs">
          <span class="text-muted-foreground">رفتار کاربر</span>
          <select class="app-select" bind:value={value.persona} {disabled}>
            <option value="">پیش‌فرض سناریو</option>
            <option value="novice">تازه‌کار</option>
            <option value="pro">حرفه‌ای</option>
          </select>
        </label>
      {/if}

      {#if has.has('model')}
        <ModelPicker bind:value={value.model} {disabled} />
      {/if}

      {#if has.has('headed')}
        <label class="flex items-center gap-2 text-xs">
          <input type="checkbox" bind:checked={value.headed} {disabled} /> مرورگر دیده شود
        </label>
      {/if}

      <!--
        حساب و فایل — جایشان اینجا نیست، و گفتنش لازم است.

        کاربر گفت «آپلودِ داده و حسابِ کاربری از مسیرهای داخلِ صفحه در
        دسترس باشند، نه از منوی اصلی». پس اینجا فقط اشاره می‌شود که کجا
        تنظیم می‌شوند — وگرنه کسی که دنبالشان است فکر می‌کند وجود ندارند.
      -->
      <p class="border-t pt-2 text-[11px] leading-5 text-muted-foreground">
        حسابِ ذخیره‌شده و فایلِ نمونه در «دادهٔ آزمون» تنظیم می‌شوند و سناریو
        خودش می‌گوید کدام را می‌خواهد.
      </p>
    </div>
  </details>
{/if}
