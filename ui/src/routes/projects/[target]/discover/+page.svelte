<script>
  /**
   * «کشف» — سه راه، یک هدف.
   *
   * ── چرا سه صفحه یکی شد ──
   *
   * کاربر پرسید «آیا گشت خودش یک نوع نقشه نیست؟» و بعد گفت «اگر لازم است
   * ادغامشان کن، چون UX مهم است که ساده و بدردبخور باشد».
   *
   * جملهٔ خودش بهترین توضیح بود: «بگرد و سورس را ببین و کشف کن و بخز طبق
   * دستور من». این یک کار است با سه راه، نه سه کارِ جدا — و خروجیِ هر سه یک
   * چیز: «این اپ چه دارد و چقدرش را لمس کرده‌ایم».
   *
   * ── چرا این فایل نازک است ──
   *
   * سه صفحهٔ قبلی روی هم ۲۵۰۰ خط بودند. ریختنشان در یک فایل یعنی همان
   * هیولایی که داشتیم تمیزش می‌کردیم. پس هر راه یک کامپوننت است و این صفحه
   * فقط انتخابگر — و **چه پیدا شد** که همیشه پایین می‌ماند، چون جوابِ
   * مشترکِ هر سه است.
   */
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import CrawlPanel from '$lib/components/CrawlPanel.svelte';
  import FoundPanel from '$lib/components/FoundPanel.svelte';
  import TourPanel from '$lib/components/TourPanel.svelte';
  import { formatNumber } from '$lib/format.js';

  let { data } = $props();

  let target = $derived(data.target);
  let base = $derived(`/projects/${encodeURIComponent(target)}`);

  /**
   * کدام راه — و پیش‌فرض از **وضعیتِ پروژه** می‌آید، نه از یک ثابت.
   *
   * پروژه‌ای که هنوز گشت نرفته باید گشت را باز ببیند؛ پروژه‌ای که گشته و
   * نقشه دارد، سراغِ خزش می‌رود. فرمی که همیشه روی گزینهٔ اول باز شود، به
   * کسی که کارش را بلد است هر بار یک کلیکِ اضافه می‌دهد.
   */
  let how = $state(
    data.tour.live?.running ? 'tour' : data.found.pages.length ? 'crawl' : 'tour'
  );

  const WAYS = [
    {
      key: 'tour',
      title: 'خودم نشانت می‌دهم',
      hint: 'گشتِ زنده — مرورگر باز می‌شود و تو مثل کاربر کار می‌کنی. هرچه کردی ضبط می‌شود.',
    },
    {
      key: 'crawl',
      title: 'خودت بگرد',
      hint: 'خزش — هر دکمهٔ امنی را می‌زند. همه‌جا، یا فقط جایی که می‌گویی.',
    },
    {
      key: 'source',
      title: 'سورس را بخوان',
      hint: 'بی مرورگر و بی مدل: روت، endpoint و قاعده‌های schema از خودِ کد.',
    },
  ];
</script>

<svelte:head><title>کشف — {data.target}</title></svelte:head>

<PageHeader
  eyebrow="پروژهٔ {data.project?.name || data.target}"
  title="کشف"
  description="بگرد، سورس را ببین، یا بگو کجا را بخزد — و پایینِ همین صفحه ببین چه پیدا شد."
/>

<div class="space-y-6">
  <!--
    یک پرسش، سه جواب.

    همان الگویی که در صفحهٔ نقشه جواب داد: کاربر اول می‌گوید **چه کار کنم**،
    بعد فرمِ همان کار را می‌بیند — نه اینکه از میانِ هشت کنترل حدس بزند کدام
    مالِ کدام است.
  -->
  <Card.Root>
    <Card.Header class="pb-3">
      <Card.Title class="text-sm">چطور کشفش کنم؟</Card.Title>
    </Card.Header>
    <Card.Content class="space-y-2">
      {#each WAYS as way (way.key)}
        <label
          class="flex items-start gap-2 rounded-lg border p-2.5 text-xs {how === way.key
            ? 'border-primary bg-accent/40'
            : ''}"
        >
          <input type="radio" bind:group={how} value={way.key} class="mt-0.5" />
          <span>
            <strong>{way.title}</strong>
            <span class="block text-[11px] leading-5 text-muted-foreground">{way.hint}</span>
          </span>
        </label>
      {/each}

      <div class="border-t pt-3">
        {#if how === 'tour'}
          <TourPanel {data} {target} />
        {:else if how === 'crawl'}
          <CrawlPanel {data} {target} />
        {:else}
          <!--
            سورس دکمهٔ خودش را در «چه پیدا شد» دارد، چون نتیجه‌اش همان‌جاست
            و اینجا فقط باید بگوییم کجا را نگاه کند.
          -->
          <div class="space-y-2 text-xs leading-6">
            {#if data.found.hasSource}
              <p>
                سورسِ این پروژه: <code dir="ltr" class="font-mono">{data.found.sourceRoot}</code>
              </p>
              <p class="text-muted-foreground">
                خواندنش نه مرورگر می‌خواهد نه مدل: مسیرِ فایل، رشتهٔ
                <code>case 'GET /x'</code> و <code>UNIQUE(...)</code> در schema.
                دکمه‌اش پایین، کنارِ نتیجه‌اش است.
              </p>
            {:else}
              <p class="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 leading-6">
                این پروژه <code>source.root</code> ندارد، پس هیچ‌چیز از کد خوانده
                نمی‌شود. در پیکربندی پروژه بگذاریدش.
              </p>
              <Button href={`${base}/files?kind=target`} variant="outline" size="sm">پیکربندی پروژه</Button>
            {/if}
          </div>
        {/if}
      </div>
    </Card.Content>
  </Card.Root>

  <!--
    قدمِ بعد از کشف.

    کشف در خودش تمام نمی‌شود: هر جایی که پیدا شد و هیچ سفری سراغش نمی‌رود،
    یک پیشنهاد است. عدد می‌گوید واقعاً چه تولید شده — و صفر هم یک خبر است.
  -->
  <div class="flex flex-wrap items-center gap-2">
    <Button href={`${base}/missions`} size="sm">
      {data.found.proposals
        ? `${formatNumber(data.found.proposals)} سفرِ پیشنهادی از همین کشف`
        : 'مأموریت‌ها'}
    </Button>
    <span class="text-[11px] text-muted-foreground">
      آنچه کشف شد، آنجا به سفر و انتظار تبدیل می‌شود.
    </span>
  </div>

  <FoundPanel {data} {target} />
</div>
