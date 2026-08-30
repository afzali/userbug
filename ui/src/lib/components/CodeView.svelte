<script>
  /**
   * ویرایشگرِ فایل، با دو چیزی که برای متن فارسی لازم است.
   *
   * ── چرا سوئیچ جهت ──
   *
   * سناریوهای ما YAML‌ای با کلیدهای لاتین و مقدارهای فارسی‌اند. با `dir=ltr`
   * جمله‌های فارسی وارونه‌چین می‌شوند و خواندنشان سخت است؛ با `dir=rtl`
   * ساختارِ YAML به هم می‌ریزد. هیچ‌کدام همیشه درست نیست، پس انتخابش با
   * کسی است که دارد می‌خواند.
   *
   * ── چرا رنگ در نمای جدا و نه روی خودِ ویرایشگر ──
   *
   * راهِ رایجِ رنگ‌آمیزی، گذاشتن یک لایهٔ رنگی زیرِ textarea شفاف است. آن روش
   * وقتی متن دوجهته باشد — فارسی و لاتین در یک خط — کاراکتربه‌کاراکتر
   * جابه‌جا می‌شود و مکان‌نما روی حرفِ اشتباه می‌نشیند.
   *
   * پس رنگ در نمای فقط‌خواندنی است، جایی که مکان‌نمایی وجود ندارد که جا
   * بیفتد. ویرایش ساده می‌ماند و خواندن رنگی.
   */
  import { Button } from '$lib/components/ui/button/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';

  let {
    value = $bindable(''),
    language = 'yaml',
    readOnly = false,
    minHeight = '70vh',
  } = $props();

  /** فارسی‌بودنِ بیشترِ متن، پیش‌فرضِ جهت را تعیین می‌کند. */
  function guessDirection(text) {
    const persian = (String(text).match(/[؀-ۿ]/g) || []).length;
    const latin = (String(text).match(/[A-Za-z]/g) || []).length;
    return persian > latin ? 'rtl' : 'ltr';
  }

  // svelte-ignore state_referenced_locally
  let dir = $state(guessDirection(value));
  let colored = $state(false);

  const escapeHtml = (text) =>
    String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /**
   * رنگ‌آمیزی خط‌به‌خط.
   *
   * عمداً ساده است: کامنت، کلید، رشتهٔ داخل کوتیشن، متغیرِ `{{…}}`، و عدد.
   * یک تحلیلگرِ کاملِ YAML اینجا هزینه‌ای است که خوانایی‌اش را برنمی‌گرداند.
   */
  function highlightYaml(line) {
    const comment = line.indexOf('#');
    if (comment === 0 || /^\s*#/.test(line)) {
      return `<span class="tok-comment">${escapeHtml(line)}</span>`;
    }

    let out = escapeHtml(line);
    out = out.replace(/^(\s*-?\s*)([\w$][\w\-.$]*)(\s*:)/, '$1<span class="tok-key">$2</span><span class="tok-punct">$3</span>');
    out = out.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, '<span class="tok-string">$1</span>');
    out = out.replace(/(\{\{[^}]+\}\})/g, '<span class="tok-var">$1</span>');
    out = out.replace(/\b(true|false|null)\b/g, '<span class="tok-bool">$1</span>');
    out = out.replace(/(?<![\w-])(\d+)(?![\w-])/g, '<span class="tok-number">$1</span>');
    return out;
  }

  function highlightJs(line) {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return `<span class="tok-comment">${escapeHtml(line)}</span>`;
    let out = escapeHtml(line);
    out = out.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|`[^`]*`)/g, '<span class="tok-string">$1</span>');
    out = out.replace(/\b(import|export|from|const|let|async|await|return|function|default|if|else|try|catch|new)\b/g, '<span class="tok-keyword">$1</span>');
    out = out.replace(/\b(true|false|null|undefined)\b/g, '<span class="tok-bool">$1</span>');
    return out;
  }

  const lines = $derived(String(value).split(/\r?\n/));
  const highlight = $derived(language === 'js' ? highlightJs : highlightYaml);
</script>

<div class="flex flex-wrap items-center gap-2 border-b px-5 py-2 text-xs">
  <span class="text-muted-foreground">جهت متن</span>
  <div class="flex overflow-hidden rounded-md border">
    <button
      type="button"
      class={`px-2.5 py-1 ${dir === 'rtl' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
      onclick={() => (dir = 'rtl')}
    >راست‌چین</button>
    <button
      type="button"
      class={`px-2.5 py-1 ${dir === 'ltr' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
      onclick={() => (dir = 'ltr')}
    >چپ‌چین</button>
  </div>

  <span class="mx-1 h-4 w-px bg-border"></span>

  <Button variant="ghost" size="sm" class="h-7 px-2 text-xs" onclick={() => (colored = !colored)}>
    {colored ? 'ویرایش' : 'نمای رنگی'}
  </Button>

  {#if colored}
    <span class="text-muted-foreground">— فقط خواندنی؛ برای ویرایش برگردید</span>
  {/if}

  <span class="ms-auto text-muted-foreground">{lines.length} خط</span>
</div>

{#if colored}
  <div class="scroll-thin overflow-auto p-5 font-mono text-sm leading-7" style={`min-height:${minHeight}`} {dir}>
    {#each lines as line, index}
      <div class="flex gap-3">
        <span class="w-10 shrink-0 select-none text-left text-xs text-muted-foreground/60" dir="ltr">{index + 1}</span>
        <span class="min-w-0 flex-1 whitespace-pre-wrap break-words">{@html highlight(line) || '&nbsp;'}</span>
      </div>
    {/each}
  </div>
{:else}
  <Textarea
    bind:value
    spellcheck="false"
    readonly={readOnly}
    {dir}
    class="scroll-thin resize-y rounded-none border-0 p-5 font-mono text-sm leading-7 focus-visible:ring-0"
    style={`min-height:${minHeight}`}
  />
{/if}

<style>
  :global(.tok-comment) { color: color-mix(in oklab, currentColor 45%, transparent); font-style: italic; }
  :global(.tok-key) { color: #4aa3df; }
  :global(.tok-string) { color: #3f9f6f; }
  :global(.tok-var) { color: #c07a2c; font-weight: 600; }
  :global(.tok-bool) { color: #a56ad4; }
  :global(.tok-number) { color: #a56ad4; }
  :global(.tok-keyword) { color: #c25b7c; }
  :global(.tok-punct) { color: color-mix(in oklab, currentColor 50%, transparent); }
</style>
