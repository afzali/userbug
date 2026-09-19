<script>
  /**
   * «از کجا شروع کنم» — راهنمای بارِ اول.
   *
   * ── چرا دوباره نوشته شد ──
   *
   * نسخهٔ قبلی وجود داشت، ۲۱۶ خط بود، و **هیچ‌جا صدا زده نمی‌شد**. یعنی
   * دقیقاً همان چیزی که برایش ساخته شده بود — اینکه کاربرِ تازه بداند چه
   * کند — در عمل نبود. و متنش هم به رابطِ امروز نمی‌خورد: پنج قدمی که
   * می‌شمرد («گشت»، «نقشه»، «چه باید آزمود») هر سه صفحه‌هایی بودند که
   * دیگر وجود ندارند. راهنمایی که به صفحهٔ ناموجود لینک بدهد، از نبودنش
   * بدتر است.
   *
   * ── چرا چهار قدم و نه پنج ──
   *
   * چهار قدم همان حلقهٔ واقعیِ ابزار است و نه فهرستِ صفحه‌ها: بفهم اپ چه
   * دارد، سناریو بساز، بگیرش، یافته‌ها را قضاوت کن. هرچه قدم نباشد در
   * اسلایدِ آخر جمع می‌شود — نه به‌عنوان قدم.
   *
   * ── چرا تیکِ «انجام شده» از داده می‌آید و نه از کلیک ──
   *
   * «این قدم را دیدم» چیزی را ثابت نمی‌کند. آنچه ثابت می‌کند وجودِ خروجیِ
   * همان قدم است: درختی که پر شده، سناریویی که روی دیسک است، اجرایی که
   * افتاده. پس تیک از همان عددهایی می‌آید که صفحه خودش نشان می‌دهد.
   */
  import { Button } from '$lib/components/ui/button/index.js';

  let { target, progress = {}, open = $bindable(false), onDismiss } = $props();

  let at = $state(0);
  let never = $state(false);

  const base = $derived(`/projects/${encodeURIComponent(target)}`);

  /**
   * متنِ هر قدم: **چرا**، بعد **چه کار کن**.
   *
   * «چرا» اول می‌آید چون همان چیزی است که ترتیب را توجیه می‌کند؛ بی آن،
   * چهار قدم فقط چهار دکمه‌اند.
   */
  const SLIDES = $derived([
    {
      key: 'discover',
      index: '۱',
      title: 'کشف',
      done: Boolean(progress.caps),
      why: 'ابزار از اپِ شما هیچ نمی‌داند. اول باید ببیند چه دارد.',
      what: [
        'دکمهٔ <strong>«＋ کشف»</strong> بالای همین صفحه. سه راه دارد و هر سه به یک جا می‌ریزند: <strong>گشت</strong> (شما کار می‌کنید و ابزار تماشا می‌کند)، <strong>خزش</strong> (خودش هر دکمهٔ امن را می‌زند)، و <strong>سورس</strong> (کد را بی مرورگر می‌خواند).',
        'اگر اپتان ورود دارد، از <strong>گشت</strong> شروع کنید و تیکِ «نشست بماند» را بزنید — بی آن، خزش پشتِ صفحهٔ ورود می‌ماند.',
        'نتیجه همین درختِ وسطِ صفحه است: هر صفحه، هر مودال، هر قابلیت.',
      ],
      href: base,
      cta: 'رفتن به کشف',
    },
    {
      key: 'scenario',
      index: '۲',
      title: 'سناریو',
      done: Boolean(progress.scenarios),
      why: 'کشف می‌گوید چه هست. سناریو می‌گوید چه باید درست کار کند.',
      what: [
        'فیلترِ <strong>«بی‌سناریو»</strong> بالای درخت، همان بخش‌هایی را نشان می‌دهد که هیچ آزمونی سراغشان نمی‌رود — یعنی نقاطِ کورِ شما.',
        'روی هر ردیف بزنید: پنلِ کناری <strong>زاویه‌های آزمون</strong> را می‌دهد و با «بساز» هر کدام یک سناریو می‌شود.',
        'هرچه ماشین بنویسد <strong>پیش‌نویس</strong> است. بازبینی کنید، انتظار اضافه کنید، بعد رسمی‌اش کنید — سناریوی بی‌انتظار اجرا می‌شود و سبز تمام می‌شود بی آنکه چیزی را سنجیده باشد.',
      ],
      href: `${base}?filter=blind`,
      cta: 'بخش‌های بی‌سناریو',
    },
    {
      key: 'review',
      index: '۳',
      title: 'بررسی',
      done: Boolean(progress.runs),
      why: 'از اینجا به بعد تکرارشدنی است — و رایگان.',
      what: [
        'دکمهٔ <strong>«▶ بررسی»</strong> سناریوهای یک دامنه را می‌گیرد. دامنه یا کلِ اپ است، یا بخش‌هایی که در درخت تیک زده‌اید، یا همان یک ردیف.',
        'اجرا <strong>هیچ فراخوانی مدلی ندارد</strong>. هزینه فقط در کشف و ساختِ سناریو خرج می‌شود، پس بررسی را هر چند بار که خواستید بگیرید.',
        'به بررسی یک <strong>نام</strong> بدهید. بارِ بعد با همان نام، رابط می‌گوید چه چیزی نسبت به دفعهٔ قبل تازه است.',
      ],
      href: base,
      cta: 'رفتن به بررسی',
    },
    {
      key: 'triage',
      index: '۴',
      title: 'یافته‌ها',
      done: Boolean(progress.judged),
      why: 'حلقه اینجا بسته می‌شود — و بسته نشدنش یعنی دفعهٔ بعد همان نویز.',
      what: [
        'هر ایراد یک ردیف است، ادغام‌شده در همهٔ بررسی‌ها. بگویید <strong>باگ واقعی</strong> است یا <strong>قلابی</strong>؛ قضاوتتان به شناخت برمی‌گردد و چکِ پرسروصدا خاموش می‌شود.',
        'زیرِ هر ردیف دو دکمه هست: <strong>«دوباره بگیر»</strong> برای وقتی که فکر می‌کنید درستش کرده‌اید، و <strong>«بروزرسانی سناریو»</strong> برای وقتی که خودِ سناریو اشتباه بوده.',
        'ایرادی که یک بار «رفع‌شده» اعلام شود و برگردد، خودش را با برچسبِ <strong>«برگشته»</strong> نشان می‌دهد.',
      ],
      href: `${base}/triage`,
      cta: 'رفتن به یافته‌ها',
    },
    {
      /**
       * قدم نیست، پس شماره و تیک ندارد.
       *
       * هرچه در منو نیست ولی روزی لازم می‌شود، اینجا جمع است — وگرنه
       * کاربر باید حدس بزند که اصلاً وجود دارد.
       */
      key: 'rest',
      index: '◈',
      title: 'و بقیه',
      done: false,
      why: 'لازم نیست ترتیب را حفظ کنید؛ اینها هر وقت لازم شدند سرِ جایشان هستند.',
      what: [
        '<strong>نوارِ بالای هر صفحه</strong>: به زبانِ خودتان بنویسید «برو بگرد ببین باگی هست» یا «تست‌ها را بگیر». پیش از اجرا نشان می‌دهد چه می‌خواهد بزند.',
        '<strong>دکمهٔ ⚙ همین صفحه</strong>: دادهٔ آزمون (یوزر و رمزِ تست، فایلِ نمونه برای آپلود)، دانسته‌ها، و فایل‌های پروژه.',
        '<strong>تنظیمات</strong> (پایینِ منو): کلید OpenRouter، مدلِ هر نقش، و سقفِ بودجه — مشترک بینِ همهٔ پروژه‌ها.',
        '<strong>اجراها</strong>: هر بار که چیزی اجرا شد، با دکمهٔ «↻ دوباره» روی هر دور.',
      ],
      href: `${base}/runs`,
      cta: 'اجراها',
    },
  ]);

  const current = $derived(SLIDES[at]);

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
          <h2 class="text-lg font-bold">از کجا شروع کنم</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            چهار قدم، به همین ترتیب. هر کدام قدمِ بعدی را ممکن می‌کند.
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
              <span
                class={`grid size-5 place-items-center rounded-full border text-[10px] ${
                  slide.done ? 'border-emerald-500/60 text-emerald-600 dark:text-emerald-400' : ''
                }`}
              >
                {slide.done ? '✓' : slide.index}
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
        <!--
          «دیگر نشان نده» هست، ولی راهِ برگشت هم هست.

          بستنِ همیشگیِ چیزی که یک بار لازم می‌شود، همان‌قدر بد است که
          تکرارش — و این بار دکمهٔ «راهنما» واقعاً در سرصفحه هست، نه فقط
          در کامنتِ این فایل.
        -->
        <label class="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" bind:checked={never} />
          دیگر خودش باز نشود
          <span class="text-[11px]">— هر وقت خواستید، دکمهٔ «؟ راهنما» بالای همین صفحه</span>
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
