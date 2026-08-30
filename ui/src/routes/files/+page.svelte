<script>
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { onMount } from 'svelte';
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
  let intent = $state('');
  let model = $state('');
  let models = $state([]);
  let drafting = $state(false);
  /** خروجی مدل، پیش از ذخیره. تا `null` است، هیچ فایلی نوشته نشده. */
  let draft = $state(null);
  let draftPath = $state('');
  let showProjectForm = $state(false);
  let savingProject = $state(false);
  /**
   * فیلدهای پروژهٔ تازه.
   *
   * `environment` پیش‌فرضِ `local` دارد چون آدرسِ پیش‌فرض هم لوکال است، ولی
   * سرور اجازه نمی‌دهد میزبانِ عمومی را `local` اعلام کنید — این محیط قلاب
   * مخرب و نوشتن را باز می‌کند.
   */
  let form = $state({
    key: '',
    name: '',
    baseURL: 'http://localhost:3000',
    apiURL: '',
    environment: 'local',
    device: 'desktop',
    dir: 'rtl',
    frontLog: '',
    backLog: '',
    sourceRoot: '',
  });
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

  /**
   * متن → YAML.
   *
   * چیزی روی دیسک نمی‌نویسد؛ خروجی در پیش‌نمایش می‌نشیند تا دیده و در صورت
   * لزوم دست‌کاری شود. ذخیره از همان مسیرِ `createScenario` می‌گذرد.
   */
  async function draftFromText() {
    drafting = true;
    feedback = '';
    try {
      const response = await fetch('/api/scenarios/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target: data.target, text: intent, model }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'سناریو ساخته نشد');
      draft = payload;
      draftPath = payload.relative;
    } catch (cause) {
      feedback = cause.message;
    } finally {
      drafting = false;
    }
  }

  async function saveDraft() {
    creating = true;
    feedback = '';
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ kind: 'scenario', target: data.target, relative: draftPath, content: draft.yaml, createOnly: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'سناریو ذخیره نشد');
      location.href = `/files?target=${encodeURIComponent(data.target)}&kind=scenario&relative=${encodeURIComponent(payload.relative)}`;
    } catch (cause) {
      feedback = cause.message;
      creating = false;
    }
  }

  async function createProject() {
    savingProject = true;
    feedback = '';
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({
          ...form,
          // دو فیلدِ فرم به یک فهرست تبدیل می‌شوند. نامشان در گزارش می‌آید، پس
          // «front» و «back» بهتر از log1 و log2 است.
          logs: [
            { name: 'front', path: form.frontLog },
            { name: 'back', path: form.backLog },
          ],
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'پروژه ساخته نشد');
      location.href = `/files?target=${encodeURIComponent(payload.key)}`;
    } catch (cause) {
      feedback = cause.message;
      savingProject = false;
    }
  }

  // فهرست مدل‌ها بی‌صدا می‌آید: نیامدنش یعنی «پیش‌فرض کانفیگ» که همیشه کار می‌کند.
  onMount(async () => {
    try {
      const response = await fetch('/api/models?free=1&limit=60');
      if (response.ok) models = (await response.json()).models || [];
    } catch {
      models = [];
    }
  });
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

      <div class="space-y-2 border-t pt-4">
        <span class="block text-sm font-medium">پروژهٔ تازه</span>
        <p class="text-xs leading-6 text-muted-foreground">فرم فیلدهای پایه را می‌سازد. موارد پیشرفته — قلاب‌ها، داورِ وضعیت، هویت — کامنتِ همان فایل‌اند و از این ویرایشگر اضافه می‌شوند.</p>
        <Button variant="outline" class="w-full" onclick={() => { showProjectForm = !showProjectForm; }}>{showProjectForm ? 'بستن فرم' : 'ساخت پروژهٔ تازه'}</Button>
      </div>

      <div class="space-y-2 border-t pt-4">
        <label for="scenario-intent" class="block text-sm font-medium">یا با متن بنویسید</label>
        <p class="text-xs leading-6 text-muted-foreground">بگویید کاربر چه می‌کند و چه باید ببیند. هوش مصنوعی آن را به YAML تبدیل می‌کند و پیش از ذخیره نشانتان می‌دهد.</p>
        <Textarea id="scenario-intent" bind:value={intent} rows={5} class="text-sm leading-6" placeholder="ثبت‌نام کن، کد بازیابی را دانلود کن، خارج شو و با همان کد برگرد" />
        <Input bind:value={model} list="draft-model-options" dir="ltr" spellcheck="false" placeholder="پیش‌فرض کانفیگ" />
        <datalist id="draft-model-options">{#each models as item (item.id)}<option value={item.id}>{item.name}</option>{/each}</datalist>
        <Button variant="outline" class="w-full" onclick={draftFromText} disabled={drafting || intent.trim().length < 10}>{drafting ? 'مدل مشغول است…' : 'ساخت با هوش مصنوعی'}</Button>
      </div>
    </Card.Content>
  </Card.Root>

  {#if showProjectForm}
    <Card.Root class="min-w-0">
      <Card.Header>
        <Card.Title>پروژهٔ تازه</Card.Title>
        <Card.Description>خروجی یک فایل در <span class="code-value">targets/</span> است که پیش از ذخیره در زیرپروسه اعتبارسنجی می‌شود.</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block space-y-1.5 text-sm font-medium"><span>کلید (نام فایل)</span><Input bind:value={form.key} dir="ltr" placeholder="my-app" /></label>
          <label class="block space-y-1.5 text-sm font-medium"><span>نام خوانا</span><Input bind:value={form.name} placeholder="اپ من" /></label>
          <label class="block space-y-1.5 text-sm font-medium"><span>آدرس فرانت</span><Input bind:value={form.baseURL} dir="ltr" placeholder="http://localhost:3000" /></label>
          <label class="block space-y-1.5 text-sm font-medium"><span>آدرس API</span><Input bind:value={form.apiURL} dir="ltr" placeholder="http://127.0.0.1:8080" /></label>
        </div>

        <div class="grid gap-3 sm:grid-cols-3">
          <label class="block space-y-1.5 text-sm font-medium">
            <span>محیط</span>
            <select class="app-select" bind:value={form.environment}>
              <option value="local">local</option><option value="staging">staging</option><option value="production">production</option>
            </select>
          </label>
          <label class="block space-y-1.5 text-sm font-medium"><span>دستگاه</span><Input bind:value={form.device} dir="ltr" placeholder="desktop" /></label>
          <label class="block space-y-1.5 text-sm font-medium">
            <span>جهت</span>
            <select class="app-select" bind:value={form.dir}><option value="rtl">rtl</option><option value="ltr">ltr</option></select>
          </label>
        </div>

        <p class="rounded-lg bg-muted p-3 text-xs leading-6 text-muted-foreground">محیط <span class="code-value">local</span> قلاب مخرب و درخواست POST و SQL نویسنده را باز می‌کند. برای همین فقط روی میزبان محلی پذیرفته می‌شود.</p>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block space-y-1.5 text-sm font-medium"><span>لاگ فرانت (فایل)</span><Input bind:value={form.frontLog} dir="ltr" placeholder="D:/app/logs/vite.log" /></label>
          <label class="block space-y-1.5 text-sm font-medium"><span>لاگ بک (فایل)</span><Input bind:value={form.backLog} dir="ltr" placeholder="D:/app/logs/error.log" /></label>
        </div>
        <p class="text-xs leading-6 text-muted-foreground">خطاهای کنسول مرورگر خودکار گرفته می‌شوند و مسیر نمی‌خواهند؛ این دو برای لاگ‌هایی است که سرور روی دیسک می‌نویسد. خالی بگذارید اگر ندارید.</p>

        <label class="block space-y-1.5 text-sm font-medium"><span>پوشهٔ سورس</span><Input bind:value={form.sourceRoot} dir="ltr" placeholder="D:/Projects/my-app" /></label>

        {#if feedback}<p class="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm leading-6 whitespace-pre-line text-destructive">{feedback}</p>{/if}

        <div class="flex justify-end gap-2">
          <Button variant="ghost" onclick={() => { showProjectForm = false; feedback = ''; }}>انصراف</Button>
          <Button onclick={createProject} disabled={savingProject || !form.key || !form.baseURL}>{savingProject ? 'در حال ساخت…' : 'ساخت پروژه'}</Button>
        </div>
      </Card.Content>
    </Card.Root>
  {:else if draft}
    <!--
      پیش‌نمایش جای ویرایشگر را می‌گیرد، نه اینکه کنارش بنشیند: دو ویرایشگر
      باز یعنی کاربر نمی‌داند «ذخیره» کدام را می‌نویسد.
    -->
    <Card.Root class="min-w-0 gap-0 overflow-hidden py-0">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <strong class="block">{draft.name}</strong>
          <span class="text-xs text-muted-foreground">{formatCount(draft.steps)} قدم · پیش‌نویس · {draft.model}</span>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="ghost" onclick={() => { draft = null; }}>دور بریز</Button>
          <Button onclick={saveDraft} disabled={creating || !draftPath}>{creating ? 'در حال ذخیره…' : 'ذخیره به‌عنوان سناریو'}</Button>
        </div>
      </div>
      <div class="space-y-3 border-b px-5 py-4">
        <label class="block space-y-1.5 text-sm font-medium"><span>مسیر فایل</span><Input bind:value={draftPath} dir="ltr" /></label>
        {#if draft.notes}
          <p class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6">مدل این‌ها را حدس زده و باید بازبینی شود: {draft.notes}</p>
        {/if}
      </div>
      <Textarea bind:value={draft.yaml} spellcheck="false" class="scroll-thin min-h-[55vh] resize-y rounded-none border-0 p-5 font-mono text-sm leading-7 focus-visible:ring-0" dir="ltr" />
      {#if feedback}<div class="border-t px-5 py-3 text-sm text-destructive">{feedback}</div>{/if}
    </Card.Root>
  {:else}
  <Card.Root class="min-w-0 gap-0 overflow-hidden py-0">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><strong class="code-value block">{data.file?.relative || 'فایلی انتخاب نشده'}</strong><span class="text-xs text-muted-foreground">{data.file?.kind === 'target' ? 'پیکربندی هدف' : 'سناریو'}</span></div><div class="flex items-center gap-2">{#if dirty}<span class="text-xs text-amber-600 dark:text-amber-300">ذخیره‌نشده</span>{/if}<Button onclick={save} disabled={!dirty || saving || !data.file}>{saving ? 'در حال بررسی…' : 'اعتبارسنجی و ذخیره'}</Button></div></div>
    {#if data.file}<Textarea bind:value={content} spellcheck="false" class="scroll-thin min-h-[70vh] resize-y rounded-none border-0 p-5 font-mono text-sm leading-7 focus-visible:ring-0" dir="ltr" />{:else}<div class="grid min-h-[60vh] place-items-center text-muted-foreground">{data.fileError || 'فایلی انتخاب نشده است'}</div>{/if}
    {#if feedback}<div class={`border-t px-5 py-3 text-sm ${feedback.includes('ذخیره شد') ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'}`}>{feedback}</div>{/if}
  </Card.Root>
  {/if}
</div>

<svelte:window onbeforeunload={(event) => { if (dirty) event.preventDefault(); }} />

<script module>
  const formatter = new Intl.NumberFormat('fa-IR');
  function formatCount(value) { return formatter.format(value); }
</script>
