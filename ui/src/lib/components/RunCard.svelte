<script>
  import * as Card from '$lib/components/ui/card/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { formatDate, formatNumber } from '$lib/format.js';

  let { run, onRemoved } = $props();

  let busy = $state(false);
  let error = $state('');

  /**
   * حذفِ یک اجرا — با تأییدِ صریح.
   *
   * ── چرا تأیید ──
   *
   * پوشهٔ اجرا شاملِ عکس، trace و لاگِ سرور است و برگشتی ندارد. بقیهٔ کارهای
   * این رابط برگشت‌پذیرند؛ این یکی نیست، پس مثل بقیه رفتار نمی‌کند.
   *
   * نوعِ اجرا در متنِ تأیید می‌آید چون «گشت» ساعت‌ها کارِ آدم است و «اجرا»
   * چند دقیقه ماشین — و این دو نباید یک‌جور پرسیده شوند.
   */
  async function remove() {
    const what = run.kind === 'tour' ? 'گشت' : run.kind === 'map' ? 'خزشِ نقشه' : run.kind === 'quest' ? 'کاوشِ هدف‌دار' : 'اجرا';
    if (!confirm(`این ${what} با همهٔ عکس‌ها و traceهایش پاک شود؟\n${run.runId}`)) return;

    busy = true;
    error = '';
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(run.runId)}`, {
        method: 'DELETE',
        headers: { 'x-userbug-request': '1' },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'حذف نشد');
      onRemoved?.(run.runId);
    } catch (cause) {
      error = cause.message;
      busy = false;
    }
  }
</script>

<Card.Root class="gap-4 py-5 transition-shadow hover:shadow-md">
  <Card.Header class="px-5">
    <Card.Title class="flex min-w-0 items-center justify-between gap-3">
      <span class="code-value truncate text-sm" title={run.runId}>{run.runId}</span>
      <StatusBadge status={run.status} />
    </Card.Title>
    <Card.Description class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span>{formatDate(run.startedAt)} · {run.target || '—'} · {run.device || '—'}</span>
      <!--
        بنچ پررنگ‌تر از بقیهٔ فراداده است، چون تنها چیزی است که **آدم**
        نوشته. بقیه را ماشین ثبت کرده.
      -->
      {#if run.bench}
        <span class="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">{run.bench}</span>
      {/if}
    </Card.Description>
  </Card.Header>
  <Card.Content class="grid grid-cols-3 gap-3 px-5 text-center">
    <div class="rounded-lg bg-muted/70 p-2"><strong class="block text-lg">{formatNumber(run.steps)}</strong><span class="text-xs text-muted-foreground">قدم</span></div>
    <div class="rounded-lg bg-muted/70 p-2"><strong class="block text-lg">{formatNumber(run.findings)}</strong><span class="text-xs text-muted-foreground">یافته</span></div>
    <div class="rounded-lg bg-muted/70 p-2"><strong class="block text-lg">{formatNumber(run.serverLines)}</strong><span class="text-xs text-muted-foreground">لاگ سرور</span></div>
  </Card.Content>
  <!--
    چرا این اجرا مرد — روی خودِ کارت.

    اجرایی که وسطِ کار بشکند، تا امروز فقط «صفر قدم» نشان می‌داد و علتش
    در ترمینالی می‌ماند که بسته شده بود.
  -->
  {#if run.error}
    <Card.Content class="px-5 pt-0">
      <p class="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs leading-6 text-destructive">
        {run.error.split('\n')[0]}
      </p>
    </Card.Content>
  {/if}

  <Card.Footer class="flex-col items-stretch gap-2 px-5">
    <div class="flex gap-2">
      <Button href={`/runs/${encodeURIComponent(run.runId)}`} variant="outline" class="flex-1">عکس‌ها و خطِ زمانی</Button>
      <Button variant="ghost" size="icon" disabled={busy} onclick={remove} title="حذفِ این اجرا" aria-label="حذفِ این اجرا">
        ✕
      </Button>
    </div>
    {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
  </Card.Footer>
</Card.Root>
