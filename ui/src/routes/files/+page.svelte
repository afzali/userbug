<script>
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';

  let { data } = $props();
  // editor باید نسخهٔ قابل‌ویرایش snapshot اولیه را نگه دارد.
  // svelte-ignore state_referenced_locally
  let content = $state(data.file?.content || '');
  // svelte-ignore state_referenced_locally
  let original = $state(data.file?.content || '');
  let saving = $state(false);
  // svelte-ignore state_referenced_locally
  let feedback = $state(data.fileError || '');
  let newPath = $state('my-test.yml');
  let creating = $state(false);
  let project = $derived(data.projects.find((item) => item.key === data.target));
  let dirty = $derived(content !== original);

  function goTarget(event) {
    if (dirty && !confirm('تغییرات ذخیره‌نشده کنار گذاشته شود؟')) return;
    location.href = `/files?target=${encodeURIComponent(event.currentTarget.value)}`;
  }

  function goFile(event) {
    if (dirty && !confirm('تغییرات ذخیره‌نشده کنار گذاشته شود؟')) return;
    const value = event.currentTarget.value;
    if (value === 'target') location.href = `/files?target=${encodeURIComponent(data.target)}`;
    else location.href = `/files?target=${encodeURIComponent(data.target)}&kind=scenario&relative=${encodeURIComponent(value)}`;
  }

  async function save() {
    if (!data.file) return;
    saving = true;
    feedback = '';
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ kind: data.file.kind, target: data.target, relative: data.file.relative, content }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'فایل ذخیره نشد');
      original = content;
      feedback = `ذخیره شد: ${payload.relative}`;
    } catch (cause) {
      feedback = cause.message;
    } finally {
      saving = false;
    }
  }

  async function createScenario() {
    creating = true;
    feedback = '';
    const template = `name: عنوان سناریوی تازه\npersona: novice\nstatus: approved\n\nsteps:\n  - as: پاکسازی و باز کردن اپ\n    clearState: true\n  - go: /\n  - expect: { url: "/login" }\n`;
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ kind: 'scenario', target: data.target, relative: newPath, content: template, createOnly: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'سناریو ساخته نشد');
      location.href = `/files?target=${encodeURIComponent(data.target)}&kind=scenario&relative=${encodeURIComponent(payload.relative)}`;
    } catch (cause) {
      feedback = cause.message;
      creating = false;
    }
  }
</script>

<PageHeader eyebrow="فایل، نه دیتابیس" title="پروژه‌ها و سناریوها" description="ویرایش روی فایل واقعی انجام می‌شود؛ YAML و JavaScript پیش از rename اعتبارسنجی می‌شوند.">
  {#snippet actions()}<Button href="/" variant="outline">بازگشت به اجرا</Button>{/snippet}
</PageHeader>

<div class="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
  <Card.Root class="h-fit gap-5 lg:sticky lg:top-20">
    <Card.Header><Card.Title>فایل‌ها</Card.Title><Card.Description>{project?.baseURL || 'آدرس هدف مشخص نیست'}</Card.Description></Card.Header>
    <Card.Content class="space-y-4">
      <label class="block space-y-1.5 text-sm font-medium"><span>پروژه</span><select class="app-select" value={data.target} onchange={goTarget}>{#each data.projects as item}<option value={item.key}>{item.name}</option>{/each}</select></label>
      <label class="block space-y-1.5 text-sm font-medium"><span>فایل</span><select class="app-select" value={data.kind === 'target' ? 'target' : data.relative} onchange={goFile}><option value="target">{data.target}.config.js</option>{#each project?.scenarios || [] as scenario}<option value={scenario.path}>{scenario.path}{scenario.status === 'invalid' ? ' ⚠' : ''}</option>{/each}</select></label>
      <div class="rounded-lg bg-muted p-3 text-xs leading-6 text-muted-foreground"><strong class="block text-foreground">{project?.environment || '—'} · {project?.device || '—'}</strong>{formatCount(project?.scenarios?.length || 0)} سناریو در پوشهٔ پروژه</div>
      <div class="space-y-2 border-t pt-4"><label for="new-scenario-path" class="block text-sm font-medium">سناریوی تازه</label><Input id="new-scenario-path" bind:value={newPath} dir="ltr" placeholder="my-test.yml" /><Button variant="outline" class="w-full" onclick={createScenario} disabled={creating || !newPath}>{creating ? 'در حال ساخت…' : 'ساخت فایل YAML'}</Button></div>
    </Card.Content>
  </Card.Root>

  <Card.Root class="min-w-0 gap-0 overflow-hidden py-0">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><strong class="code-value block">{data.file?.relative || 'فایلی انتخاب نشده'}</strong><span class="text-xs text-muted-foreground">{data.file?.kind === 'target' ? 'پیکربندی هدف' : 'سناریو'}</span></div><div class="flex items-center gap-2">{#if dirty}<span class="text-xs text-amber-600 dark:text-amber-300">ذخیره‌نشده</span>{/if}<Button onclick={save} disabled={!dirty || saving || !data.file}>{saving ? 'در حال بررسی…' : 'اعتبارسنجی و ذخیره'}</Button></div></div>
    {#if data.file}<Textarea bind:value={content} spellcheck="false" class="scroll-thin min-h-[70vh] resize-y rounded-none border-0 p-5 font-mono text-sm leading-7 focus-visible:ring-0" dir="ltr" />{:else}<div class="grid min-h-[60vh] place-items-center text-muted-foreground">{data.fileError || 'فایلی انتخاب نشده است'}</div>{/if}
    {#if feedback}<div class={`border-t px-5 py-3 text-sm ${feedback.includes('ذخیره شد') ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'}`}>{feedback}</div>{/if}
  </Card.Root>
</div>

<svelte:window onbeforeunload={(event) => { if (dirty) event.preventDefault(); }} />

<script module>
  const formatter = new Intl.NumberFormat('fa-IR');
  function formatCount(value) { return formatter.format(value); }
</script>
