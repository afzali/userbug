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
  let known = $derived(page.params.target || page.data?.run?.target || '');

  /**
   * پروژه‌ای که تویش بودیم، روی صفحه‌های سراسری هم یادمان می‌ماند.
   *
   * ── چرا لازم شد ──
   *
   * `/settings` زیرِ `/projects/` نیست، پس با یک کلیک روی «تنظیمات» کلِ منوی
   * پروژه ناپدید می‌شد: کاربر می‌رفت مدل را درست کند و راهِ برگشت به «چه باید
   * آزمود» را گم می‌کرد. همان تلهٔ `/runs/<id>` بود که یک بار با خواندنِ هدف
   * از خودِ اجرا حل شده بود.
   *
   * فقط برای همان صفحه‌های سراسری که از **داخلِ** پروژه باز می‌شوند. صفحهٔ
   * فهرستِ پروژه‌ها و فرمِ پروژهٔ تازه عمداً بیرون‌اند: آنجا واقعاً از پروژه
   * بیرون آمده‌ای.
   */
  let remembered = $state('');
  $effect(() => {
    if (known) remembered = known;
  });

  const KEEPS_PROJECT = new Set(['/settings']);
  let target = $derived(known || (KEEPS_PROJECT.has(page.url.pathname) ? remembered : ''));
  let inProject = $derived(Boolean(target));
  let base = $derived(`/projects/${encodeURIComponent(target)}`);
  /** روی صفحهٔ اجرا هیچ‌کدام از ردیف‌ها فعال نیست؛ نشانِ جداگانه‌اش را می‌گذاریم. */
  let onRunPage = $derived(page.url.pathname.startsWith('/runs/'));

  /**
   * ── چرا هر ردیف زیرنویس دارد ──
   *
   * نامِ کوتاه کارِ بخش را نمی‌گوید. «تریاژ» و «چه باید آزمود» برای کسی که
   * این ابزار را نساخته هیچ معنایی ندارند.
   *
   * دو لایه: `hint` همیشه دیده می‌شود و در سه چهار واژه می‌گوید اینجا چیست؛
   * `title` روی hover جملهٔ کامل را می‌دهد. زیرنویس از `lg` به بالا می‌آید،
   * چون روی موبایل منو یک نوارِ افقی است و آنجا جا ندارد.
   *
   * ── تاریخچه، تا دوباره همان راه نرویم ──
   *
   * اول نُه آیتمِ تخت بود، بعد چهار گروه با هشت ردیف. هر بار مشکل یکی بود و
   * گروه‌بندی حلش نکرد: منو فهرستِ **امکانات** بود، و آدم دنبالِ فهرستِ
   * امکانات نیست، دنبالِ کارش است. جوابش بیرونِ منو بود.
   */
  /**
   * سه ردیف، نه یازده.
   *
   * ── چرا کوچک شد ──
   *
   * چهار گروه و هشت «جا» داشتیم، و هر کدام به‌ترتیبِ ساخته‌شدن آمده بود نه
   * به‌ترتیبِ نیاز. کسی که می‌خواست «ببین باگی هست یا نه» نمی‌دانست کدام را
   * بزند، چون هیچ‌کدام دقیقاً این نبود.
   *
   * حالا آن سؤال جای دیگری جواب می‌گیرد: نوارِ فرمان بالای صفحهٔ اجرا. پس
   * منو دیگر لازم نیست فهرستِ امکانات باشد؛ فقط سه جایی است که آدم واقعاً
   * **می‌ماند** و کار می‌کند: اجرا می‌گیرد، یافته می‌خواند، سناریو ویرایش
   * می‌کند.
   *
   * ── و بقیه کجا رفتند ──
   *
   * هیچ‌جا حذف نشد؛ از جایی صدا زده می‌شوند که معنا دارند. گشت و نقشه و
   * شناخت از نوارِ پیشرفتِ همان صفحهٔ اجرا (که عددِ هرکدام را هم نشان
   * می‌دهد)، «چه باید آزمود» از کارتِ «قدم بعد»ِ نقشه، و «حساب و چک» از
   * صفحهٔ سناریوها. ردیفی که فقط برای «همه‌چیز در منو باشد» می‌ماند، منو را
   * به فهرستِ امکانات تبدیل می‌کند — همان چیزی که بودیم.
   */
  let nav = $derived(
    inProject
      ? [
          {
            /**
             * ترتیبِ کار، نه ترتیبِ ساخت.
             *
             * ── چرا «یافته‌ها» عقب رفت ──
             *
             * زیرِ «اجرا» نشسته بود و پیش از «سناریوها» — یعنی وارونهٔ کاری
             * که آدم می‌کند: سناریو می‌نویسی، اجرا می‌گیری، **بعد** یافته
             * می‌خوانی. ترتیبِ منو خودش یک جملهٔ آموزشی است و آن جمله غلط بود.
             */
            label: '',
            items: [
              {
                href: base,
                label: 'اجرا',
                icon: '▶',
                exact: true,
                hint: 'بگو چه کار کنم',
                title: 'نوارِ فرمان، شروعِ اجرا، جریانِ زنده با عکس و خطا، و تاریخچهٔ اجراها. گشت و نقشه و شناخت هم از همین صفحه شروع می‌شوند.',
              },
              {
                /**
                 * ── چرا «سناریوها» جایش را داد ──
                 *
                 * همان فایل‌هاست، با نگاهِ درست: نه بر اساسِ فایل، بلکه بر
                 * اساسِ پرسشی که آدم صبح با آن می‌آید — «کدام سفر سالم است؟».
                 * ویرایشگر از دست نرفته؛ از همان فهرست باز می‌شود. دو ردیفِ
                 * منو برای یک چیز، همان ایرادی است که کاربر دو بار گرفت.
                 */
                href: `${base}/missions`,
                label: 'مأموریت‌ها',
                icon: '⌘',
                hint: 'سفرها و سلامتشان',
                title: 'ثبت‌نام، ورود، فراموشی رمز… — هر سفر یک ردیف، با اینکه آخرین بار سالم بود یا نه، و اینکه اصلاً چیزی را می‌سنجد یا فقط می‌گوید «چیزی نشکست».',
              },
              {
                href: `${base}/triage`,
                label: 'یافته‌ها',
                icon: '◇',
                hint: 'ایرادها و وضعیتشان',
                title: 'هر نقص یک ردیف، ادغام‌شده در همهٔ اجراها: باز، پذیرفته‌شده، رفع‌شده یا نادیده. قضاوتِ شما به شناخت هم برمی‌گردد.',
              },
            ],
          },
          {
            /**
             * ── چرا این دو ردیف برگشتند ──
             *
             * سه‌ردیفی کردن درست بود ولی زیادی رفت: «سورس» فقط از یک کارتِ
             * تهِ صفحهٔ نقشه در دسترس بود و «حساب و فایل» فقط از سرصفحهٔ
             * سناریوها. هیچ‌کدام چیزی نیستند که آدم اتفاقی رویشان بیفتد —
             * سراغشان می‌رود، با یک سؤالِ مشخص در ذهن.
             *
             * ولی جدا از سه‌تای بالا می‌مانند: آن‌ها **کار** اند، این‌ها
             * **مرجع**. یک فهرستِ پنج‌تایی دوباره همان منوی بی‌ترتیب می‌شد.
             */
            label: 'مرجع',
            items: [
              {
                /**
                 * ── چرا «شناخت» و «سورس» یکی شدند ──
                 *
                 * کاربر پرسید «مگر یکی نیستند؟» — بودند: هر دو یک پرسش را
                 * جواب می‌دادند، «این اپ چه دارد و چقدرش را لمس کرده‌ایم».
                 * تفکیکشان تاریخی بود (یکی از مدل و گشت پر می‌شد، آن یکی از
                 * اسکنِ ایستا) نه مفهومی — و هر کدام نصفِ پوشش را می‌شمرد.
                 */
                href: `${base}/app`,
                label: 'اپ',
                icon: '◱',
                hint: 'چه دارد، چقدرش را دیده‌ایم',
                title: 'توضیحِ خودت، صفحه‌ها و مودال‌ها از گشت و خزش، endpointهای بک‌اند و قاعده‌های schema از سورس — و اینکه چقدرِ هر کدام لمس شده.',
              },
              {
                /**
                 * ── چرا نامش عوض شد ──
                 *
                 * «پیکربندی» یک کشوی خرت‌وپرت شده بود: حساب، فایل، چک، و یک
                 * لینک به فایل کانفیگ — چهار چیزِ بی‌ربط. چک‌ها به یافته‌ها
                 * رفتند (جایی که وقتی قلابی می‌دهند سراغشان می‌روید) و آنچه
                 * ماند یک جنس است: دادهٔ ورودیِ اجرا.
                 */
                href: `${base}/config`,
                label: 'دادهٔ آزمون',
                icon: '⚒',
                hint: 'حساب و فایل',
                title: 'حساب‌هایی که سناریو با آن‌ها وارد می‌شود، و فایل‌هایی که آپلود می‌کند — و راهی به فایلِ پیکربندیِ خودِ پروژه.',
              },
            ],
          },
        ]
      : [
          {
            label: '',
            items: [
              {
                href: '/',
                label: 'پروژه‌ها',
                icon: '◫',
                exact: true,
                hint: 'همهٔ اپ‌های تحت تست',
                title: 'فهرست پروژه‌ها، با آخرین اجرای هرکدام.',
              },
              {
                href: '/projects/new',
                label: 'پروژهٔ تازه',
                icon: '＋',
                hint: 'وصل کردن اپِ تازه',
                title: 'آدرس فرانت و API، محیط، دستگاه، مسیر لاگ‌ها و پوشهٔ سورس.',
              },
            ],
          },
        ]
  );

  /**
   * تنظیمات در هیچ گروهی نیست، چون قدمی از مسیر نیست.
   *
   * زیرِ «یافته‌ها» نشسته بود و آن غلط بود. ولی از منو هم نمی‌شود برداشتش:
   * خطای مدل وسطِ کار پیدا می‌شود، نه در صفحهٔ اولِ فهرست پروژه‌ها.
   */
  const settingsLink = {
    href: '/settings',
    label: 'تنظیمات',
    icon: '⚙',
    hint: 'کلید و مدلِ هوش مصنوعی',
    title: 'کلید OpenRouter، مدلِ هر نقش، و سقفِ بودجه — برای همهٔ پروژه‌ها.',
  };

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

<!--
  یک ردیفِ منو.

  `title` جملهٔ کامل است و `hint` سه چهار واژه — و هر دو لازم‌اند: اولی روی
  hover می‌آید و روی لمس هیچ‌وقت، دومی همیشه هست ولی جا برای توضیح ندارد.
-->
{#snippet row(item)}
  <a
    href={item.href}
    title={item.title}
    class={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive(item) ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'}`}
    aria-current={isActive(item) ? 'page' : undefined}
  >
    <span class="grid size-6 shrink-0 place-items-center text-base" aria-hidden="true">{item.icon}</span>
    <span class="min-w-0">
      {item.label}
      {#if item.hint}
        <span class="hidden truncate text-[11px] font-normal opacity-70 lg:block">{item.hint}</span>
      {/if}
    </span>
  </a>
{/snippet}

<svelte:head>
  <title>userbug · رابط آزمون کاربر</title>
  <meta name="description" content="رابط محلی اجرای سناریوها و تریاژ یافته‌های userbug" />
</svelte:head>

<div class="min-h-screen bg-background lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
  <!--
    ستون، تا منو بتواند اسکرول شود.

    با زیرنویسِ هر ردیف، منو بلندتر از یک صفحه می‌شود و بی این، کارتِ پایین
    از صفحه بیرون می‌زد.
  -->
  <aside class="z-20 border-b bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-l">
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

    <!--
      روی موبایل یک نوارِ افقی است و عنوانِ گروه جا نمی‌گیرد؛ آنجا گروه‌ها
      فقط با فاصله از هم جدا می‌شوند. عنوان از `lg` به بالا می‌آید.
    -->
    <nav class="scroll-thin flex gap-1 overflow-x-auto px-3 pb-3 lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-0 lg:overflow-y-auto lg:px-4">
      {#each nav as group (group.label)}
        {#if group.label}
          <p class="mt-3 mb-1 hidden px-3 text-[11px] font-medium tracking-wide text-muted-foreground/70 first:mt-0 lg:block">
            {group.label}
          </p>
        {/if}
        {#each group.items as item (item.href)}
          {@render row(item)}
        {/each}
      {/each}

      <div class="shrink-0 lg:mt-3 lg:border-t lg:pt-3">{@render row(settingsLink)}</div>
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
