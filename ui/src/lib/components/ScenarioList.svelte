<script>
  /**
   * فهرست فایل‌های پروژه، دسته‌بندی‌شده.
   *
   * ── چرا کمبوباکس بد بود ──
   *
   * همه‌چیز در یک `<select>` بود: کانفیگ پروژه، سناریوهای تأییدشده،
   * پیش‌نویس‌های تولیدشدهٔ مدل، و اسکریپت‌های جاوااسکریپت — بدون هیچ نشانی از
   * اینکه کدام کدام است. کاربر باید از روی مسیرِ فایل حدس می‌زد.
   *
   * این‌ها جنسِ متفاوتی دارند و رفتار متفاوتی هم: پیش‌نویس رگرسیون شمرده
   * نمی‌شود، اسکریپت را مفسر YAML نمی‌خواند، و کانفیگ اصلاً سناریو نیست.
   * پس در فهرست هم جدا می‌مانند.
   */
  import { Badge } from '$lib/components/ui/badge/index.js';

  let { scenarios = [], target, activeKind = 'target', activeRelative = '' } = $props();

  const base = $derived(`/projects/${encodeURIComponent(target)}/files`);

  /**
   * دسته‌ها به ترتیبِ اهمیت، نه الفبا.
   *
   * چیزی که هر روز باز می‌شود بالا می‌ماند؛ پیش‌نویس و اسکریپت پایین‌ترند
   * چون کمتر دست می‌خورند.
   */
  const groups = $derived([
    {
      key: 'approved',
      title: 'سناریوها',
      hint: 'اجرا می‌شوند و رگرسیون شمرده می‌شوند',
      items: scenarios.filter(
        (s) => s.kind === 'yaml' && s.status !== 'draft' && s.status !== 'invalid' && !s.path.startsWith('_drafts/')
      ),
    },
    {
      key: 'draft',
      title: 'پیش‌نویس‌ها',
      hint: 'تولیدشده یا بازبینی‌نشده — تا تأیید نشوند رگرسیون نیستند',
      items: scenarios.filter((s) => s.status === 'draft' || s.path.startsWith('_drafts/')),
    },
    {
      key: 'script',
      title: 'اسکریپت‌ها',
      hint: 'جاوااسکریپت مستقیم، بیرون از مفسر YAML',
      items: scenarios.filter((s) => s.kind !== 'yaml'),
    },
    {
      key: 'invalid',
      title: 'خراب',
      hint: 'خوانده نشدند؛ تا اصلاح نشوند اجرا نمی‌شوند',
      items: scenarios.filter((s) => s.status === 'invalid'),
    },
  ].filter((group) => group.items.length));

  function href(item) {
    return `${base}?kind=scenario&relative=${encodeURIComponent(item.path)}`;
  }

  const rowClass = (active) =>
    `block rounded-lg border px-3 py-2 text-right transition-colors ${
      active ? 'border-primary bg-accent' : 'border-transparent hover:bg-accent/50'
    }`;
</script>

<div class="space-y-5">
  <div>
    <p class="mb-1.5 text-xs font-semibold text-muted-foreground">تنظیمات</p>
    <a href={`${base}?kind=target`} class={rowClass(activeKind === 'target')}>
      <span class="block text-sm">پیکربندی پروژه</span>
      <span dir="ltr" class="block truncate font-mono text-[11px] text-muted-foreground">{target}.config.js</span>
    </a>
  </div>

  {#each groups as group (group.key)}
    <div>
      <div class="mb-1.5 flex items-baseline justify-between gap-2">
        <p class="text-xs font-semibold text-muted-foreground">{group.title}</p>
        <span class="text-[11px] text-muted-foreground">{group.items.length}</span>
      </div>
      <p class="mb-2 text-[11px] leading-5 text-muted-foreground/80">{group.hint}</p>

      <ul class="space-y-1">
        {#each group.items as item (item.path)}
          <li>
            <a href={href(item)} class={rowClass(activeKind === 'scenario' && activeRelative === item.path)}>
              <span class="flex items-center justify-between gap-2">
                <span class="min-w-0 flex-1 truncate text-sm">{item.name || item.path}</span>
                {#if group.key === 'invalid'}<Badge variant="destructive" class="shrink-0 text-[10px]">خراب</Badge>{/if}
              </span>
              <span class="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span dir="ltr" class="min-w-0 truncate font-mono">{item.path}</span>
                {#if item.steps}<span class="shrink-0">· {item.steps} قدم</span>{/if}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/each}

  {#if !groups.length}
    <p class="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
      هنوز سناریویی نیست. از پنل کناری یکی بسازید.
    </p>
  {/if}
</div>
