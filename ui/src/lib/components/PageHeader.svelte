<script>
  let { eyebrow = '', title, description = '', actions } = $props();
</script>

<header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
  <div class="min-w-0">
    {#if eyebrow}<p class="mb-1 text-xs font-semibold tracking-wide text-primary">{eyebrow}</p>{/if}
    <h1 class="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
    {#if description}<p class="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{description}</p>{/if}
  </div>
  {#if actions}<div class="flex shrink-0 flex-wrap gap-2">{@render actions()}</div>{/if}
</header>
