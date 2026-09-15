<script>
  /**
   * «راهِ درست» — یک بار، در نخستین ورود به یک پروژه.
   *
   * ── چرا لازم شد ──
   *
   * ترتیبِ این پنج قدم در ذهنِ سازنده روشن بود و هیچ‌جا نوشته نشده بود. نتیجه
   * را روی یک پروژهٔ واقعی دیدیم: کاربر حساب و فایل و کلید را درست گذاشت،
   * خزش را زد، و خزنده روی صفحهٔ ورود ماند — چون نمی‌دانست «گشت» باید اول
   * برود و «مسیرِ ورود» از آنجا ساخته می‌شود.
   *
   * نوارِ پیشرفتِ بالای صفحه **وضعیت** را می‌گوید («۲۷٪ · ۱۱ پیشنهاد»)، نه
   * ترتیب را و نه دلیل را. این یکی همان جملهٔ گم‌شده است.
   *
   * ── چرا مرحله‌به‌مرحله، نه یک صفحهٔ بلند ──
   *
   * پنج قدم پشت سر هم، خودش شکلِ کار را نشان می‌دهد. متنِ بلندِ یک‌جا،
   * ترتیب را همان‌قدر پنهان می‌کند که منوی یازده‌ردیفه می‌کرد.
   *
   * ── چرا «دیگر نشان نده» هست ولی راهِ برگشت هم هست ──
   *
   * بستنِ همیشگیِ چیزی که یک بار لازم می‌شود، همان‌قدر بد است که تکرارش. پس
   * دکمهٔ «راهنما» در سرصفحه می‌ماند.
   */
  import { Button } from '$lib/components/ui/button/index.js';

  let { target, steps = [], open = $bindable(false), onDismiss } = $props();

  let at = $state(0);
  let never = $state(false);

  const base = $derived(`/projects/${encodeURIComponent(target)}`);

  /**
   * متنِ هر قدم: **چرا**، بعد **چه کار کن**.
   *
   * «چرا» اول می‌آید چون همان چیزی است که ترتیب را توجیه می‌کند؛ بی آن،
   * پنج قدم فقط پنج دکمه‌اند.
   */
  const SLIDES = $derived([
    {
      key: 'tour',
      index: '۱',
      title: 'گشت زنده',
      why: 'ابزار هیچ نمی‌داند. شما بهترین معلمش هستید.',
      what: [
        'مرورگری باز می‌شود و <strong>شما</strong> در اپ کار می‌کنید؛ ابزار تماشا می‌کند و قدم‌ها را ضبط می‌کند.',
        'تیکِ <strong>«نشست بماند»</strong> را بزنید و همان‌جا حساب بسازید و تنظیماتِ خودِ اپ را انجام بدهید — به قدم‌های بعدی می‌رسد.',
      ],
      href: `${base}/tour`,
      cta: 'رفتن به گشت',
    },
    {
      key: 'map',
      index: '۲',
      title: 'نقشهٔ اپ',
      why: 'گشت آن‌جایی را می‌شناسد که شما بردید. نقشه بقیه را پیدا می‌کند.',
      what: [
        'مرورگر خودش هر دکمهٔ امن را می‌زند و می‌نویسد از کجا به کجا می‌رسد — مودال‌ها و منوهایی که آدرس ندارند هم. <strong>بی یک فراخوانی مدل.</strong>',
        'دو چیز لازم دارد: <strong>مسیرِ ورود</strong> (از روی گشتِ قدم ۱ برایتان می‌سازد) و <strong>دادهٔ اولیه</strong> (فایلِ نمونه، یک بار). بی مسیرِ ورود، پشتِ صفحهٔ ورود می‌ماند.',
      ],
      href: `${base}/map`,
      cta: 'رفتن به نقشه',
    },
    {
      key: 'app',
      index: '۳',
      title: 'اپ',
      why: 'این اپ چه دارد، و چقدرش را لمس کرده‌ایم.',
      what: [
        'صفحه‌ها و مودال‌ها از گشت و خزش، endpointها و قاعده‌ها از سورس — و کنارِ هر کدام نوشته از کجا می‌دانیمش.',
        'به <strong>پرسش‌های بی‌جواب</strong> جواب بدهید؛ همان‌ها هستند که سناریوی بعدی را دقیق‌تر می‌کنند.',
      ],
      href: `${base}/app`,
      cta: 'رفتن به «اپ»',
    },
    {
      key: 'scenario',
      index: '۴',
      title: 'سناریو',
      why: 'تا اینجا فقط شناختیم. حالا معلوم می‌شود چه باید آزمود.',
      what: [
        'در <strong>«چه باید آزمود»</strong> هر نمایی که هیچ سناریویی سراغش نمی‌رود یک پیشنهاد است؛ با «بساز» به سناریو تبدیل می‌شود.',
        'هرچه ماشین بنویسد <strong>پیش‌نویس</strong> است و اجرا نمی‌شود. بازبینی کنید، <code>expect</code> اضافه کنید، بعد «تأیید و رسمی کردن».',
      ],
      href: `${base}/proposals`,
      cta: 'چه باید آزمود',
    },
    {
      key: 'run',
      index: '۵',
      title: 'اجرا',
      why: 'از اینجا به بعد تکرارشدنی است — و رایگان.',
      what: [
        'سناریوهای رسمی را بارها بگیرید؛ اجرا <strong>هیچ فراخوانی مدلی ندارد</strong>. هزینه فقط در چهار قدمِ بالا خرج می‌شود.',
        'یافته‌ها به <strong>تریاژ</strong> می‌روند و قضاوتِ شما به شناخت برمی‌گردد — حلقه بسته می‌شود.',
        'در <strong>مأموریت‌ها</strong> می‌بینید هر سفر (ثبت‌نام، ورود، …) آخرین بار سالم بود یا نه.',
      ],
      href: base,
      cta: 'همین صفحه',
    },
    {
      key: 'rest',
      index: '◈',
      title: 'و بقیهٔ چیزها',
      why: 'لازم نیست ترتیب را حفظ کنید.',
      what: [
        '<strong>بالای همین صفحه</strong> بنویسید «برو بگرد ببین باگی هست» یا «تست‌ها را بگیر». پیش از اجرا نشان می‌دهد چه می‌خواهد بزند.',
        '<strong>تنظیمات</strong> (پایینِ منو): کلید OpenRouter، مدلِ هر نقش، سقفِ بودجه — برای همهٔ پروژه‌ها.',
        '<strong>دادهٔ آزمون</strong>: یوزر و رمزِ تست، و فایل‌هایی که سناریو آپلود می‌کند.',
      ],
      href: `${base}/missions`,
      cta: 'مأموریت‌ها',
    },
  ]);

  const current = $derived(SLIDES[at]);

  /**
   * تیکِ «انجام شده» از **جای قدم** می‌آید، نه از آدرسش.
   *
   * نخستین نسخه با `href.endsWith(key)` تطبیق می‌داد و «اجرا» و «سناریو»
   * هرگز تیک نمی‌خوردند: آدرسِ اجرا خودِ ریشه است و آدرسِ سناریو بسته به
   * حالت `/files` یا `/proposals`. تطبیقِ رشته‌ای روی آدرس، همیشه همین‌طور
   * بی‌صدا می‌شکند.
   *
   * پنج اسلاید اول همان پنج قدمِ نوارِ پیشرفت‌اند، به همان ترتیب. اسلایدِ
   * ششم قدم نیست و تیک نمی‌گیرد.
   */
  const doneAt = $derived((index) => steps[index]?.done ?? false);

  function close() {
    open = false;
    onDismiss?.(never);
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
    role="presentation"
    onclick={(event) => { if (event.target === event.currentTarget) close(); }}
  >
    <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-background shadow-lg">
      <div class="flex items-start justify-between gap-3 border-b px-6 py-4">
        <div>
          <h2 class="text-lg font-bold">راهِ درستِ بررسی یک پروژه</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            پنج قدم، به همین ترتیب. هر کدام کارِ بعدی را ممکن می‌کند.
          </p>
        </div>
        <button type="button" class="text-muted-foreground hover:text-foreground" onclick={close} aria-label="بستن">✕</button>
      </div>

      <!-- نوارِ قدم‌ها: هم فهرست است هم ناوبری -->
      <ol class="flex flex-wrap gap-1 border-b px-6 py-3">
        {#each SLIDES as slide, index (slide.key)}
          <li>
            <button
              type="button"
              class={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
                index === at ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/50'
              }`}
              onclick={() => { at = index; }}
            >
              <span class="grid size-5 place-items-center rounded-full border text-[10px]">
                {index < steps.length && doneAt(index) ? '✓' : slide.index}
              </span>
              {slide.title}
            </button>
          </li>
        {/each}
      </ol>

      <div class="px-6 py-5">
        <p class="text-sm font-medium">{current.why}</p>
        <ul class="mt-3 space-y-2.5">
          {#each current.what as line (line)}
            <li class="flex gap-2 text-sm leading-7 text-muted-foreground">
              <span aria-hidden="true" class="text-muted-foreground/60">•</span>
              <span>{@html line}</span>
            </li>
          {/each}
        </ul>

        <Button href={current.href} variant="outline" size="sm" class="mt-4" onclick={close}>
          {current.cta}
        </Button>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
        <label class="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" bind:checked={never} />
          دیگر نشان نده
          <span class="text-[11px]">— هر وقت خواستی، دکمهٔ «راهنما» بالای صفحه</span>
        </label>

        <div class="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={at === 0} onclick={() => { at -= 1; }}>قبلی</Button>
          {#if at < SLIDES.length - 1}
            <Button size="sm" onclick={() => { at += 1; }}>بعدی</Button>
          {:else}
            <Button size="sm" onclick={close}>فهمیدم</Button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
