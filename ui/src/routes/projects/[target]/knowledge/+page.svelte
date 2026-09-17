<script>
  /**
   * «دانسته‌ها» — چه می‌دانیم، و از کجا.
   *
   * ── چرا این صفحه ساخته شد ──
   *
   * سیزده بخش از صفحهٔ کشف اینجا آمدند: توضیحِ پروژه، استک و ورود،
   * واژه‌نامه، خطرها، تعارض‌ها، پرسش‌ها، مستنداتِ بیرونی، تاریخچهٔ شناخت،
   * endpointها و ناورداها.
   *
   * هیچ‌کدام ربطی به «الان دارم می‌گردم» نداشتند. وقتی پنجرهٔ گشت باز است
   * و داری اپ را نشان می‌دهی، واژه‌نامه فقط فاصله است تا چیزی که دنبالش
   * هستی.
   *
   * ── چرا این فایل نازک است ──
   *
   * `FoundPanel` همان ۱۰۳۹ خط است و دست نخورد: محتوایش درست بود، جایش
   * غلط. جابه‌جا کردن با بازنویسی فرق دارد — و هر تکه‌اش دلیلِ نوشته‌شدهٔ
   * خودش را بالای سرش دارد.
   */
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import FoundPanel from '$lib/components/FoundPanel.svelte';

  let { data } = $props();

  let target = $derived(data.target);
  let base = $derived(`/projects/${encodeURIComponent(target)}`);
</script>

<svelte:head><title>دانسته‌ها — {data.project?.name || target}</title></svelte:head>

{#snippet actions()}
  <Button variant="outline" size="sm" href={base}>اپِ من</Button>
{/snippet}

<PageHeader
  eyebrow={data.project?.name || target}
  title="دانسته‌ها"
  description="هرچه دربارهٔ این پروژه می‌دانیم و از کجا آمده — نوشتهٔ خودتان، گشت، سورس، یا حدسِ مدل. «چه بخش‌هایی دارد» را اپِ من جواب می‌دهد."
  {actions}
/>

<FoundPanel {data} {target} />
