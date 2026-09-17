<script>
  /**
   * «اپ بالاست یا نه» — فرانت و بک، جدا.
   *
   * ── چرا لازم شد ──
   *
   * تا امروز کاربر **بعد از** شروعِ یک کار می‌فهمید اپ بالا نیست: خزش
   * شروع می‌شد، مرورگر باز می‌شد، و بعد «اپِ هدف بالا نیست» می‌آمد. یک
   * دقیقه وقت، برای چیزی که یک درخواستِ نیم‌ثانیه‌ای جوابش را می‌داد.
   *
   * ── چرا «همیشه ناظر» یعنی هر ۳۰ ثانیه، نه هر ۲ ثانیه ──
   *
   * کاربر گفت نشانگری باشد که همیشه ناظر است. ولی چیزی که سریع‌تر از
   * تغییرِ واقعیت سر بزند، فقط لاگِ سرورِ خودِ کاربر را پر می‌کند.
   *
   * سرورِ توسعه در چند ثانیه بالا و پایین می‌شود و آدم معمولاً همان لحظه
   * می‌داند چه کرده. پس: یک بار موقعِ باز شدن، هر ۳۰ ثانیه تا وقتی تب
   * **فعال** است، و یک دکمه برای وقتی که همین الان می‌خواهی بدانی.
   *
   * تبِ پنهان اصلاً سر نمی‌زند — مرورگرِ بازِ شبانه نباید هر نیم‌دقیقه به
   * اپِ کسی درخواست بزند.
   */
  import { onMount } from 'svelte';

  let { target } = $props();

  let state = $state(null);
  let busy = $state(false);

  async function check() {
    if (busy || !target) return;
    busy = true;
    try {
      const response = await fetch(`/api/health?target=${encodeURIComponent(target)}`);
      state = response.ok ? await response.json() : null;
    } catch {
      /** خودِ رابط در دسترس نیست؛ نشانگر ساکت می‌ماند تا دروغ نگوید. */
      state = null;
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    check();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') check();
    }, 30_000);
    /** برگشتن به تب یعنی «همین الان بگو»، نه «تا نیم‌دقیقهٔ بعد صبر کن». */
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });

  /**
   * سه حالت، نه دو.
   *
   * «تنظیم نشده» با «بالا نیست» فرق دارد: پروژه‌ای که `apiURL` ندارد خراب
   * نیست، فقط API ندارد. نشان دادنِ قرمز برایش یعنی هشداری که هرگز رفع
   * نمی‌شود — و هشداری که رفع نشود، خوانده نمی‌شود.
   */
  function toneOf(one) {
    if (!one?.configured) return { dot: 'bg-muted-foreground/30', text: 'تنظیم نشده' };
    if (one.ok) return { dot: 'bg-emerald-500', text: `بالاست · ${one.status}` };
    return { dot: 'bg-destructive', text: one.why || 'بالا نیست' };
  }
</script>

{#if state}
  {@const front = toneOf(state.front)}
  {@const back = toneOf(state.back)}
  <button
    type="button"
    class="flex shrink-0 items-center gap-2.5 rounded-lg border px-2.5 py-1 text-[11px] transition-colors hover:bg-accent/50 disabled:opacity-60"
    disabled={busy}
    onclick={check}
    title={`فرانت ${state.front.url || '—'}: ${front.text}\nبک ${state.back.url || '—'}: ${back.text}\n\nبرای بررسی دوباره کلیک کنید`}
  >
    <span class="flex items-center gap-1">
      <span class={`size-2 rounded-full ${front.dot}`}></span>
      <span class="text-muted-foreground">فرانت</span>
    </span>
    {#if state.back.configured}
      <span class="flex items-center gap-1">
        <span class={`size-2 rounded-full ${back.dot}`}></span>
        <span class="text-muted-foreground">بک</span>
      </span>
    {/if}
  </button>
{/if}
