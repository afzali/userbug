<script>
  import 'vazirmatn/Vazirmatn-font-face.css';
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button/index.js';

  let { children } = $props();
  let dark = $state(false);

  /**
   * ناوبری تابعِ فضای کاری است.
   *
   * بیرون از پروژه، فقط فهرست پروژه‌ها معنا دارد: «تریاژ» بی‌آنکه بدانیم کدام
   * پروژه، یعنی همان پیش‌فرضِ خاموشی که فضای کاری برای حذفش ساخته شد.
   */
  /**
   * پروژه فقط از مسیر نمی‌آید.
   *
   * صفحهٔ `/runs/<runId>` زیر `/projects/` نیست و `params.target` ندارد، پس
   * منوی کناری به فهرست پروژه‌ها برمی‌گشت — درست وسط کاری که کاربر داخل یک
   * پروژه شروع کرده بود. ولی خودِ اجرا می‌داند مالِ کدام هدف است، پس همان را
   * می‌خوانیم.
   */
  let target = $derived(page.params.target || page.data?.run?.target || '');
  let inProject = $derived(Boolean(target));
  let base = $derived(`/projects/${encodeURIComponent(target)}`);
  /** روی صفحهٔ اجرا هیچ‌کدام از ردیف‌ها فعال نیست؛ نشانِ جداگانه‌اش را می‌گذاریم. */
  let onRunPage = $derived(page.url.pathname.startsWith('/runs/'));

  let nav = $derived(
    inProject
      ? [
          { href: base, label: 'اجرا', icon: '▶', exact: true },
          { href: `${base}/triage`, label: 'تریاژ', icon: '◇' },
          { href: `${base}/compare`, label: 'مقایسه', icon: '⇄' },
          { href: `${base}/files`, label: 'سناریوها', icon: '⌘' },
        ]
      : [
          { href: '/', label: 'پروژه‌ها', icon: '◫', exact: true },
          { href: '/projects/new', label: 'پروژهٔ تازه', icon: '＋' },
        ]
  );

  onMount(() => {
    dark = document.documentElement.classList.contains('dark');
  });

  function toggleTheme() {
    dark = !dark;
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('userbug-theme', dark ? 'dark' : 'light');
  }

  function isActive(item) {
    return item.exact ? page.url.pathname === item.href : page.url.pathname.startsWith(item.href);
  }
</script>

<svelte:head>
  <title>userbug · رابط آزمون کاربر</title>
  <meta name="description" content="رابط محلی اجرای سناریوها و تریاژ یافته‌های userbug" />
</svelte:head>

<div class="min-h-screen bg-background lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
  <aside class="z-20 border-b bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-l">
    <div class="flex items-center justify-between gap-3 px-4 py-4 lg:px-5 lg:py-6">
      <a href="/" class="flex items-center gap-3">
        <span class="grid size-10 place-items-center rounded-xl bg-sidebar-primary text-lg font-black text-sidebar-primary-foreground shadow-sm">u</span>
        <span><strong class="block text-base tracking-tight">userbug</strong><small class="text-xs text-muted-foreground">کاربر، نه فقط تست</small></span>
      </a>
      <Button variant="ghost" size="icon" onclick={toggleTheme} aria-label="تغییر پوسته" title="تغییر پوسته">{dark ? '☀' : '☾'}</Button>
    </div>

    {#if inProject}
      <!-- کدام پروژه، همیشه دیده شود: بدون آن، تریاژ و مقایسه بی‌بافتار می‌شوند. -->
      <div class="mx-4 mb-3 rounded-lg border bg-background/60 px-3 py-2">
        <!--
          فلش در span جداگانه و aria-hidden است، وگرنه نامِ دسترس‌پذیرِ پیوند
          «← همهٔ پروژه‌ها» می‌شد و هر توصیفِ دقیقی به آن نمی‌خورد.
        -->
        <a href="/" class="text-xs text-muted-foreground hover:text-foreground"><span aria-hidden="true">←</span> همهٔ پروژه‌ها</a>
        <strong class="code-value mt-1 block truncate text-sm">{target}</strong>
        {#if onRunPage}
          <!-- روی صفحهٔ اجرا هیچ ردیفی فعال نیست؛ پس همین‌جا می‌گوییم کجاییم. -->
          <span class="mt-1 block text-[11px] text-muted-foreground">در حال دیدنِ یک اجرا</span>
        {/if}
      </div>
    {/if}

    <nav class="scroll-thin flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-4">
      {#each nav as item (item.href)}
        <a href={item.href} class={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive(item) ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'}`} aria-current={isActive(item) ? 'page' : undefined}>
          <span class="grid size-6 place-items-center text-base" aria-hidden="true">{item.icon}</span>{item.label}
        </a>
      {/each}
    </nav>

    <div class="mx-4 mt-auto hidden rounded-xl border bg-background/60 p-4 text-xs leading-6 text-muted-foreground lg:block">
      <strong class="mb-1 block text-foreground">کاملاً محلی</strong>
      داده‌ها مستقیماً از <code class="code-value">runs/</code> خوانده می‌شوند و سرور فقط روی <code class="code-value">127.0.0.1</code> گوش می‌دهد.
    </div>
  </aside>

  <div class="min-w-0">
    <header class="sticky top-0 z-10 hidden h-14 items-center justify-end border-b bg-background/85 px-6 backdrop-blur lg:flex">
      <span class="flex items-center gap-2 text-xs text-muted-foreground"><span class="size-2 rounded-full bg-emerald-500"></span> آمادهٔ اجرای محلی</span>
    </header>
    <main class="surface-grid min-h-[calc(100vh-3.5rem)] p-4 sm:p-6 lg:p-8">
      <div class="mx-auto max-w-[1500px]">{@render children()}</div>
    </main>
  </div>
</div>
