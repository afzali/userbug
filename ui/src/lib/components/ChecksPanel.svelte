<script>
  /**
   * «چه چیزی ایراد حساب می‌شود» — چک‌های همگانی.
   *
   * ── چرا از «پیکربندی» به «یافته‌ها» آمد ──
   *
   * کاربر پرسید: «چرا در صفحهٔ پیکربندی چکِ همگانی داریم و اصلاً بدرد
   * می‌خورد؟»
   *
   * بدرد می‌خورد — و بیشتر از آنچه به نظر می‌رسد: این ده چک **تنها انتظارِ
   * خودکاری** است که پیش از گام ۲ داشتیم. صفحهٔ خالی، `[object Object]`،
   * ردِ پشتهٔ خطا روی صفحه، `undefined` در متن — این‌ها همان «چیزی که نباید
   * اتفاق بیفتد»اند.
   *
   * ولی **جایش** غلط بود. لحظه‌ای که آدم سراغِ یک چک می‌رود، وقتی است که
   * همان چک یافته‌ای ساخته که قلابی است — یعنی وسطِ صفحهٔ یافته‌ها، نه در
   * صفحه‌ای که برای ثبتِ حساب باز می‌شود.
   */
  import { Button } from '$lib/components/ui/button/index.js';

  let { target, config = { checks: {} }, definitions = [] } = $props();

  let checks = $state(config);
  let busy = $state('');
  let error = $state('');

  const statOf = (id) => checks.checks?.[id] || {};
  const modeOf = (id) => statOf(id).mode || 'watch';

  /**
   * خاموش کردنِ چک دلیل می‌خواهد.
   *
   * همان قاعدهٔ `allowlist` که README نوشته: «فهرست بلند یعنی داریم مشکل را
   * زیر فرش می‌کنیم». چکی که بی‌دلیل خاموش شود، شش ماه بعد هیچ‌کس نمی‌داند
   * چرا ساکت است.
   */
  async function setMode(id, mode) {
    let why = '';
    if (mode === 'off') {
      why = prompt('چرا این چک خاموش می‌شود؟') || '';
      if (!why.trim()) return;
    }

    busy = id;
    error = '';
    try {
      const response = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target, action: 'check-mode', id, mode, why }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'انجام نشد');
      checks = payload.checks || { checks: {} };
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  /** چکی که بیشتر قلابی داده تا یافتهٔ واقعی — همان که آدم دنبالش آمده. */
  let noisy = $derived(
    definitions.filter((one) => (statOf(one.id).noise || 0) > (statOf(one.id).hits || 0) / 2)
  );
</script>

<div class="space-y-3">
  <p class="text-xs leading-6 text-muted-foreground">
    این‌ها به شناخت نیاز ندارند و روی هر اجرا اجرا می‌شوند — تنها سنجشی که
    بی نوشتنِ سناریو هم کار می‌کند.
    <strong>watch</strong> یافته ثبت می‌کند ·
    <strong>expect</strong> سخت می‌شکند ·
    <strong>off</strong> اصلاً اجرا نمی‌شود.
  </p>

  {#if noisy.length}
    <!--
      چکِ پرسروصدا خودش را معرفی می‌کند.

      بی این، آدم باید ستونِ «قلابی» را با «برخورد» مقایسه کند — و معمولاً
      نمی‌کند؛ فقط کلِ فهرستِ یافته‌ها را بی‌اعتبار می‌داند.
    -->
    <p class="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] leading-6">
      {noisy.map((one) => one.title).join('، ')} بیشتر قلابی داده تا یافتهٔ
      واقعی. اگر روی این پروژه همیشه قلابی است، خاموشش کنید — با دلیل.
    </p>
  {/if}

  {#if error}<p class="text-xs text-destructive">{error}</p>{/if}

  <div class="scroll-thin overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="text-xs text-muted-foreground">
        <tr class="border-b">
          <th class="p-2 text-right">چک</th>
          <th class="p-2 text-right">برخورد</th>
          <th class="p-2 text-right">قلابی</th>
          <th class="p-2 text-right">حالت</th>
        </tr>
      </thead>
      <tbody>
        {#each definitions as check (check.id)}
          <tr class="border-b last:border-0">
            <td class="p-2">
              {check.title}
              <span class="block font-mono text-xs text-muted-foreground">{check.id}</span>
              {#if statOf(check.id).why}
                <!-- «چرا خاموش شد» می‌ماند: شش ماه بعد همین جمله جوابِ یک سؤال است -->
                <span class="block text-xs text-muted-foreground">«{statOf(check.id).why}»</span>
              {/if}
            </td>
            <td class="p-2 text-xs">{statOf(check.id).hits ?? 0}</td>
            <td class="p-2 text-xs">{statOf(check.id).noise ?? 0}</td>
            <td class="p-2">
              <div class="flex gap-1">
                {#each ['off', 'watch', 'expect'] as mode (mode)}
                  <Button
                    size="sm"
                    variant={modeOf(check.id) === mode ? 'default' : 'outline'}
                    disabled={busy === check.id}
                    onclick={() => setMode(check.id, mode)}
                  >
                    {mode}
                  </Button>
                {/each}
              </div>
              {#if check.risky}
                <span class="mt-1 block text-xs text-muted-foreground">پرخطر — احتمال قلابی بیشتر</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
