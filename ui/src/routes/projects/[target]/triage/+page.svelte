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
  /**
   * فیلتر منبع و سناریو.
   *
   * «مزاحم» و «خطای کلاینت» و «لاگ سرور» جنس کاملاً متفاوتی‌اند و معمولاً
   * آدم دنبال یکی‌شان است، نه همه با هم. همین‌طور وقتی یک سناریو را اصلاح
   * می‌کنید، بقیه فقط نویزند.
   */
  let source = $state('all');
  let scenario = $state('all');

  const SOURCE_LABELS = {
    blocker: 'مزاحم',
    scenario: 'سنجش سناریو',
    server: 'لاگ سرور',
    console: 'کنسول مرورگر',
    pageerror: 'خطای جاوااسکریپت',
    http: 'پاسخ ۴xx/۵xx',
    network: 'شبکه',
    dialog: 'پنجرهٔ مرورگر',
  };
  const sourceLabelOf = (key) => SOURCE_LABELS[key] || key;

  const sources = $derived([...new Set(items.map((item) => item.source))].sort());
  const scenarios = $derived([...new Set(items.flatMap((item) => item.steps || []))].sort());

  let filtered = $derived.by(() => items.filter((item) => {
    const matchesText = !search || `${item.normalized} ${item.source} ${item.fingerprint}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = status === 'all' || (status === 'active' ? !['resolved', 'ignored'].includes(item.triage.status) : item.triage.status === status);
    const matchesSource = source === 'all' || item.source === source;
    const matchesScenario = scenario === 'all' || (item.steps || []).includes(scenario);
    return matchesText && matchesStatus && matchesSource && matchesScenario;
  }));

  /**
   * خروجی CSV از همان چیزی که روی صفحه دیده می‌شود، نه از کل داده.
   *
   * اگر فیلتر را نادیده می‌گرفت، کاربر فیلتر می‌کرد، خروجی می‌گرفت، و فایل
   * چیز دیگری بود — بی‌آنکه بفهمد.
   *
   * BOM لازم است: اکسل بدون آن UTF-8 را نمی‌شناسد و فارسی را درهم نشان
   * می‌دهد.
   */
  function exportCsv() {
    const cell = (raw) => {
      const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
      return `"${text.replace(/"/g, '""')}"`;
    };

    const header = ['اثرانگشت', 'منبع', 'وضعیت', 'یادداشت', 'پیام', 'قدم‌ها', 'دستگاه‌ها', 'تعداد رخداد', 'تعداد اجرا', 'اولین بار', 'آخرین بار'];
    const rows = filtered.map((item) => [
      item.fingerprint,
      sourceLabelOf(item.source),
      item.triage.status,
      item.triage.note,
      item.message || item.normalized,
      (item.steps || []).join(' · '),
      (item.devices || []).join(' · '),
      item.count,
      item.runs.length,
      item.firstSeen,
      item.lastSeen,
    ].map(cell).join(','));

    const body = [header.map(cell).join(','), ...rows].join('\r\n');
    const blob = new Blob(['\uFEFF' + body], {

      type: 'text/csv;charset=utf-8',
    });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `triage-${data.target}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

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

<div class="mb-5 space-y-3 rounded-xl border bg-card p-4">
  <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
    <Input bind:value={search} placeholder="جست‌وجوی پیام، منبع یا اثرانگشت…" />
    <select class="app-select" bind:value={status}><option value="active">نیازمند رسیدگی</option><option value="open">باز</option><option value="acknowledged">بررسی‌شده</option><option value="resolved">رفع‌شده</option><option value="ignored">نادیده‌گرفته</option><option value="all">همه</option></select>
  </div>

  <div class="grid gap-3 sm:grid-cols-[13rem_minmax(0,1fr)_auto]">
    <select class="app-select" bind:value={source}>
      <option value="all">همهٔ منبع‌ها</option>
      {#each sources as key (key)}<option value={key}>{sourceLabelOf(key)}</option>{/each}
    </select>

    <select class="app-select" bind:value={scenario}>
      <option value="all">همهٔ قدم‌ها و سناریوها</option>
      {#each scenarios as name (name)}<option value={name}>{name}</option>{/each}
    </select>

    <div class="flex items-center gap-2">
      <Badge variant="outline" class="h-9 px-3">{formatNumber(filtered.length)} از {formatNumber(items.length)}</Badge>
      <Button variant="outline" size="sm" class="h-9" onclick={exportCsv} disabled={!filtered.length}>خروجی CSV</Button>
    </div>
  </div>

  {#if source !== 'all' || scenario !== 'all' || status !== 'active' || search}
    <button type="button" class="text-xs text-muted-foreground underline underline-offset-4" onclick={() => { search = ''; status = 'active'; source = 'all'; scenario = 'all'; }}>
      پاک کردن فیلترها
    </button>
  {/if}
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
