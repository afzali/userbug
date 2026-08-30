<script>
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { sourceLabel, formatNumber } from '$lib/format.js';

  let { finding, tone = 'neutral', children } = $props();
  let toneClass = $derived(tone === 'added' ? 'border-rose-500/35 bg-rose-500/5' : tone === 'gone' ? 'border-emerald-500/35 bg-emerald-500/5' : 'border-border bg-card');
  // `devices` از dedupe و تریاژ می‌آید؛ `device` تک‌مقداریِ یافتهٔ خام است.
  let devices = $derived((finding.devices?.length ? finding.devices : [finding.device]).filter(Boolean));
</script>

<article class={`rounded-xl border p-4 ${toneClass}`}>
  <div class="mb-3 flex flex-wrap items-center gap-2">
    <Badge variant={finding.source === 'server' ? 'destructive' : 'secondary'}>{sourceLabel(finding.source)}</Badge>
    {#if finding.count > 1}<Badge variant="outline">{formatNumber(finding.count)} بار</Badge>{/if}
    {#if finding.fingerprint}<code class="code-value me-auto text-muted-foreground">{finding.fingerprint}</code>{/if}
  </div>
  <p class="break-words text-sm font-semibold leading-7">{finding.normalized || finding.message}</p>
  {#if finding.steps?.length}<p class="mt-2 text-xs text-muted-foreground">قدم‌ها: {finding.steps.filter(Boolean).join(' · ') || '—'}</p>{/if}
  <!-- «فقط موبایل» با «همه‌جا» یک باگ نیست؛ داخل یک اجرا دستگاه ثابت است، پس
       این خط عملاً در تریاژ معنا پیدا می‌کند که بین اجراها ادغام می‌کند. -->
  {#if devices.length}<p class="mt-1 text-xs text-muted-foreground">دستگاه: {devices.join(' · ')}</p>{/if}
  {#if finding.detail}<pre class="scroll-thin mt-3 max-h-40 overflow-auto rounded-lg bg-muted p-3 text-xs leading-6" dir="ltr">{typeof finding.detail === 'string' ? finding.detail : JSON.stringify(finding.detail, null, 2)}</pre>{/if}
  {#if children}<div class="mt-4 border-t pt-4">{@render children()}</div>{/if}
</article>
