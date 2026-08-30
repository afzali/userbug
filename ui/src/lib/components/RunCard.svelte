<script>
  import * as Card from '$lib/components/ui/card/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { formatDate, formatNumber } from '$lib/format.js';

  let { run } = $props();
</script>

<Card.Root class="gap-4 py-5 transition-shadow hover:shadow-md">
  <Card.Header class="px-5">
    <Card.Title class="flex min-w-0 items-center justify-between gap-3">
      <span class="code-value truncate text-sm" title={run.runId}>{run.runId}</span>
      <StatusBadge status={run.status} />
    </Card.Title>
    <Card.Description>{formatDate(run.startedAt)} · {run.target || '—'} · {run.device || '—'}</Card.Description>
  </Card.Header>
  <Card.Content class="grid grid-cols-3 gap-3 px-5 text-center">
    <div class="rounded-lg bg-muted/70 p-2"><strong class="block text-lg">{formatNumber(run.steps)}</strong><span class="text-xs text-muted-foreground">قدم</span></div>
    <div class="rounded-lg bg-muted/70 p-2"><strong class="block text-lg">{formatNumber(run.findings)}</strong><span class="text-xs text-muted-foreground">یافته</span></div>
    <div class="rounded-lg bg-muted/70 p-2"><strong class="block text-lg">{formatNumber(run.serverLines)}</strong><span class="text-xs text-muted-foreground">لاگ سرور</span></div>
  </Card.Content>
  <Card.Footer class="px-5">
    <Button href={`/runs/${encodeURIComponent(run.runId)}`} variant="outline" class="w-full">دیدن خط زمانی</Button>
  </Card.Footer>
</Card.Root>
