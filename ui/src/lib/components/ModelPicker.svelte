<script>
  /**
   * انتخاب مدل هوش مصنوعی.
   *
   * ── چرا هم ورودی متنی و هم فهرست ──
   *
   * فهرست از OpenRouter زنده می‌آید و ممکن است نیاید: کلید نباشد، شبکه نرسد،
   * یا سرویس پایین باشد. اگر فقط کشویی بود، آن‌وقت اجرا هم گیر می‌کرد — در
   * حالی که انتخاب مدل قابلیتی اضافه است، نه پیش‌نیازِ اجرا. پس ورودی متنی
   * می‌ماند و فهرست کمکِ آن است.
   *
   * ── چرا datalist کافی نبود ──
   *
   * نسخهٔ اول یک `datalist` بود با شصت مدلِ رایگان. سه ایراد داشت: فهرست کامل
   * نبود، اندازهٔ کانتکست و رایگان‌بودن دیده نمی‌شد، و در فارسی جست‌وجوی
   * مرورگر روی `value`ِ لاتین کار نمی‌کرد. حالا فهرست باز می‌شود، فیلتر دارد،
   * و هر ردیف می‌گوید با چه چیزی طرفیم.
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';

  let { value = $bindable(''), disabled = false } = $props();

  let open = $state(false);
  let models = $state([]);
  let loading = $state(false);
  let error = $state('');
  let onlyFree = $state(true);
  let filter = $state('');

  const visible = $derived(
    models
      .filter((model) => (onlyFree ? model.free : true))
      .filter((model) => {
        const needle = filter.trim().toLowerCase();
        if (!needle) return true;
        return `${model.id} ${model.name}`.toLowerCase().includes(needle);
      })
      .slice(0, 200)
  );

  /** شمارش با ارقام فارسی، مثل بقیهٔ رابط. */
  function compact(context) {
    if (!context) return '—';
    if (context >= 1_000_000) return `${Math.round(context / 100_000) / 10}M`;
    if (context >= 1000) return `${Math.round(context / 1000)}K`;
    return String(context);
  }

  async function load() {
    if (models.length || loading) return;
    loading = true;
    error = '';
    try {
      // بدون `free=1`: فهرست کامل می‌آید و فیلترِ رایگان محلی است، تا تغییرِ
      // فیلتر یک رفت‌وبرگشتِ تازه نخواهد.
      const response = await fetch('/api/models?limit=400');
      if (!response.ok) throw new Error(`فهرست مدل‌ها نیامد (${response.status})`);
      models = (await response.json()).models || [];
    } catch (cause) {
      error = cause.message;
    } finally {
      loading = false;
    }
  }

  function toggle() {
    open = !open;
    if (open) load();
  }

  function pick(model) {
    value = model.id;
    open = false;
  }
</script>

<div class="space-y-1.5">
  <div class="flex items-end gap-2">
    <label class="flex-1 space-y-1.5 text-sm font-medium">
      <span>مدل هوش مصنوعی</span>
      <Input bind:value spellcheck="false" dir="ltr" placeholder="پیش‌فرض کانفیگ" {disabled} />
    </label>
    <Button type="button" variant="outline" size="sm" onclick={toggle} {disabled}>
      {open ? 'بستن' : 'فهرست'}
    </Button>
  </div>

  {#if value}
    <p class="text-xs text-muted-foreground">
      این اجرا با <span dir="ltr" class="font-mono">{value}</span> می‌رود و بر کانفیگ می‌چربد.
      <button type="button" class="underline underline-offset-4" onclick={() => (value = '')}>پاک کن</button>
    </p>
  {/if}

  {#if open}
    <div class="rounded-lg border bg-card p-3 space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <Input bind:value={filter} placeholder="جست‌وجو در نام یا اسلاگ…" class="h-8 flex-1 min-w-40" />
        <label class="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" bind:checked={onlyFree} /> فقط رایگان
        </label>
      </div>

      {#if loading}
        <p class="py-6 text-center text-xs text-muted-foreground">در حال گرفتن فهرست زنده…</p>
      {:else if error}
        <p class="py-4 text-center text-xs text-destructive">
          {error}
          <br />
          می‌توانید اسلاگ را دستی بنویسید؛ اجرا به آن وابسته نیست.
        </p>
      {:else if !visible.length}
        <p class="py-6 text-center text-xs text-muted-foreground">مدلی با این فیلتر نیست.</p>
      {:else}
        <ul class="max-h-72 space-y-1 overflow-y-auto">
          {#each visible as model (model.id)}
            <li>
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-right hover:bg-accent focus-visible:bg-accent focus-visible:outline-none {value === model.id ? 'bg-accent' : ''}"
                onclick={() => pick(model)}
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm">{model.name}</span>
                  <span dir="ltr" class="block truncate font-mono text-[11px] text-muted-foreground">{model.id}</span>
                </span>
                <span class="flex shrink-0 items-center gap-2">
                  <span class="text-[11px] text-muted-foreground">{compact(model.context)}</span>
                  {#if model.free}<Badge variant="secondary" class="text-[10px]">رایگان</Badge>{/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
        <p class="text-[11px] text-muted-foreground">
          {visible.length} از {models.length} مدل — فهرست زنده از OpenRouter
        </p>
      {/if}
    </div>
  {/if}
</div>
