<script>
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { formatDate, formatNumber } from '$lib/format.js';

  let { data } = $props();

  const workspace = (key) => `/projects/${encodeURIComponent(key)}`;
</script>

<PageHeader
  eyebrow="فضای کاری"
  title="پروژه‌ها"
  description="هر پروژه فضای کاری خودش را دارد: اجرا، تریاژ، مقایسه و سناریوها همه محصور به همان پروژه‌اند."
>
  {#snippet actions()}
    <Button href="/projects/new" variant="outline">پروژهٔ تازه</Button>
  {/snippet}
</PageHeader>

{#if data.projects.length}
  <div class="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
    {#each data.projects as project (project.key)}
      <Card.Root class="gap-4">
        <Card.Header>
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <Card.Title>{project.name}</Card.Title>
              <Card.Description class="code-value">{project.baseURL || 'آدرس مشخص نیست'}</Card.Description>
            </div>
            <!-- محیط، مهم‌ترین برچسبِ این کارت است: قلاب مخرب فقط روی local و staging اجرا می‌شود. -->
            <Badge variant={project.environment === 'production' ? 'destructive' : 'secondary'}>{project.environment}</Badge>
          </div>
        </Card.Header>

        <Card.Content class="space-y-3 text-sm">
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            <span>{formatNumber(project.runnable)} سناریوی قابل اجرا</span>
            {#if project.drafts}<span>{formatNumber(project.drafts)} پیش‌نویس</span>{/if}
            {#if project.invalid}<span class="text-destructive">{formatNumber(project.invalid)} فایل خراب</span>{/if}
          </div>

          <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{project.device}</span>
            {#if project.sourceRoot}<span class="code-value">سورس دارد</span>{/if}
          </div>

          {#if project.lastRun}
            <div class="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
              <span class="flex items-center gap-2">
                <StatusBadge status={project.lastRun.status} />
                {formatNumber(project.lastRun.findings)} یافته
              </span>
              <span class="text-muted-foreground">{formatDate(project.lastRun.startedAt)}</span>
            </div>
          {:else}
            <p class="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">هنوز اجرایی نداشته</p>
          {/if}
        </Card.Content>

        <Card.Footer class="gap-2 px-5">
          <Button href={workspace(project.key)} class="flex-1">ورود به پروژه</Button>
          <Button href={`${workspace(project.key)}/files`} variant="outline">سناریوها</Button>
        </Card.Footer>
      </Card.Root>
    {/each}
  </div>
{:else}
  <div class="rounded-xl border border-dashed p-12 text-center">
    <p class="mb-4 text-muted-foreground">هیچ پروژه‌ای در <span class="code-value">targets/</span> نیست.</p>
    <Button href="/projects/new">ساخت نخستین پروژه</Button>
  </div>
{/if}
