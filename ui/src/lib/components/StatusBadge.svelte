<script>
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { statusLabel } from '$lib/format.js';

  let { status } = $props();
  let active = $derived(['starting', 'running', 'cancelling'].includes(status));
  let variant = $derived(['failed', 'findings', 'error'].includes(status) ? 'destructive' : active ? 'secondary' : 'outline');
  let tone = $derived(
    status === 'passed'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : status === 'cancelling'
        ? 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300'
        : active
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
          : ''
  );
</script>

<Badge {variant} class={tone}>
  {#if active}<span class="size-1.5 animate-pulse rounded-full bg-current"></span>{/if}
  {statusLabel(status)}
</Badge>
