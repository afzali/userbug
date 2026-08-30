<script>
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import FindingCard from '$lib/components/FindingCard.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { formatDate, formatNumber } from '$lib/format.js';

  let { data } = $props();
  // وضعیت هر ردیف در فرم تریاژ محلی و قابل‌ویرایش است.
  // svelte-ignore state_referenced_locally
  let items = $state(data.findings.map((item) => ({ ...item, triage: { ...item.triage }, saving: false, feedback: '' })));
  let search = $state('');
  let status = $state('active');
  let filtered = $derived.by(() => items.filter((item) => {
    const matchesText = !search || `${item.normalized} ${item.source} ${item.fingerprint}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = status === 'all' || (status === 'active' ? !['resolved', 'ignored'].includes(item.triage.status) : item.triage.status === status);
    return matchesText && matchesStatus;
  }));

  async function save(item) {
    item.saving = true;
    item.feedback = '';
    try {
      const response = await fetch(`/api/triage/${encodeURIComponent(data.target)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ fingerprint: item.fingerprint, status: item.triage.status, note: item.triage.note }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'ذخیره نشد');
      item.triage = payload.triage;
      item.feedback = 'ذخیره شد';
    } catch (cause) {
      item.feedback = cause.message;
    } finally {
      item.saving = false;
    }
  }
</script>

<PageHeader eyebrow="ادغام بر پایهٔ اثرانگشت" title="تریاژ {data.project.name}" description="هر نقص در تمام اجراها یک ردیف می‌شود؛ وضعیت و یادداشت در فایل triage پروژه ذخیره می‌شود، نه دیتابیس.">
  {#snippet actions()}<Button href={`/projects/${encodeURIComponent(data.target)}`} variant="outline">بازگشت به اجرا</Button>{/snippet}
</PageHeader>

<div class="mb-5 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_13rem_auto]">
  <Input bind:value={search} placeholder="جست‌وجوی پیام، منبع یا اثرانگشت…" />
  <select class="app-select" bind:value={status}><option value="active">نیازمند رسیدگی</option><option value="open">باز</option><option value="acknowledged">بررسی‌شده</option><option value="resolved">رفع‌شده</option><option value="ignored">نادیده‌گرفته</option><option value="all">همه</option></select>
  <Badge variant="outline" class="h-9 px-3">{formatNumber(filtered.length)} از {formatNumber(items.length)}</Badge>
</div>

<div class="grid gap-4 xl:grid-cols-2">
  {#each filtered as item (item.fingerprint)}
    <FindingCard finding={item}>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{formatNumber(item.runs.length)} اجرا · {formatNumber(item.count)} رخداد</span><span>آخرین: {formatDate(item.lastSeen)}</span></div>
      <div class="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
        <select class="app-select" bind:value={item.triage.status}><option value="open">باز</option><option value="acknowledged">بررسی‌شده</option><option value="resolved">رفع‌شده</option><option value="ignored">نادیده‌گرفته</option></select>
        <Input bind:value={item.triage.note} placeholder="یادداشت تریاژ…" />
        <Button size="sm" onclick={() => save(item)} disabled={item.saving}>{item.saving ? '…' : 'ذخیره'}</Button>
      </div>
      {#if item.feedback}<p class="mt-2 text-xs text-muted-foreground">{item.feedback}</p>{/if}
      <details class="mt-3 text-xs"><summary class="cursor-pointer text-muted-foreground">اجراهای دیده‌شده</summary><div class="mt-2 flex flex-wrap gap-2">{#each item.runs.slice().reverse() as runId}<a class="code-value rounded border px-2 py-1 hover:bg-accent" href={`/runs/${encodeURIComponent(runId)}`}>{runId}</a>{/each}</div></details>
    </FindingCard>
  {:else}<p class="rounded-xl border border-dashed p-12 text-center text-muted-foreground xl:col-span-2">یافته‌ای با این فیلتر نیست.</p>{/each}
</div>
