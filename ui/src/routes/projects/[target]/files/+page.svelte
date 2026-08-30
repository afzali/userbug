<script>
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import ScenarioList from '$lib/components/ScenarioList.svelte';
  import CodeView from '$lib/components/CodeView.svelte';
  import ModelPicker from '$lib/components/ModelPicker.svelte';

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
  /**
   * «با هوش مصنوعی» یا «فایل خالی».
   *
   * پیش‌فرض روی AI است، چون همان چیزی است که این محصول رویش بنا شده؛ فایل
   * خالی راهِ فرار است نه راهِ اصلی.
   */
  let mode = $state('ai');
  /** پنل سناریوی تازه؛ از دکمهٔ بالای فهرست باز می‌شود. */
  let adding = $state(false);
  let creating = $state(false);
  let intent = $state('');
  let model = $state('');
  let drafting = $state(false);
  /**
   * خواندن سورس، خاموش به‌صورت پیش‌فرض.
   *
   * محتوای فایل‌ها به مدلِ بیرونی می‌رود، پس این تصمیم باید هر بار صریح باشد
   * نه یک تنظیمِ جامانده.
   */
  let useSource = $state(false);
  /** خروجی مدل، پیش از ذخیره. تا `null` است، هیچ فایلی نوشته نشده. */
  let draft = $state(null);
  let draftPath = $state('');

  // پروژه از لایهٔ فضای کاری می‌آید، پس کشویی انتخاب پروژه اینجا لازم نیست.
  let project = $derived(data.project);
  let dirty = $derived(content !== original);

  const base = $derived(`/projects/${encodeURIComponent(data.target)}/files`);
  const fileHref = (relative) => `${base}?kind=scenario&relative=${encodeURIComponent(relative)}`;

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
      location.href = fileHref(payload.relative);
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
        body: JSON.stringify({ target: data.target, text: intent, model, useSource }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'سناریو ساخته نشد');
      draft = payload;
      // پنل بسته می‌شود تا پیش‌نمایش زیرش دیده شود
      draftPath = payload.relative;
      adding = false;
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
      location.href = fileHref(payload.relative);
    } catch (cause) {
      feedback = cause.message;
      creating = false;
    }
  }
</script>

<PageHeader
  eyebrow="فایل، نه دیتابیس"
  title={data.kind === 'target' ? `تنظیمات ${project.name}` : `سناریوهای ${project.name}`}
  description={data.kind === 'target'
    ? 'آدرس فرانت و API، محیط، دستگاه، مسیر لاگ‌ها و پوشهٔ سورس — همه در همین فایل.'
    : 'ویرایش روی فایل واقعی انجام می‌شود؛ YAML و JavaScript پیش از rename اعتبارسنجی می‌شوند.'}>
  {#snippet actions()}<Button href={`/projects/${encodeURIComponent(data.target)}`} variant="outline">بازگشت به اجرا</Button>{/snippet}
</PageHeader>

<div class="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
  <div class="space-y-6 lg:sticky lg:top-20 lg:h-fit">
    <Card.Root class="gap-4">
      <Card.Header>
        <Card.Title>فایل‌های پروژه</Card.Title>
        <Card.Description>هر جنس، دستهٔ خودش. کلیک کنید تا در ویرایشگر باز شود.</Card.Description>
      </Card.Header>
      <Card.Content>
        <ScenarioList
          scenarios={project?.scenarios || []}
          target={data.target}
          activeKind={data.kind}
          activeRelative={data.relative}
          onAdd={() => (adding = true)}
        />
      </Card.Content>
    </Card.Root>

  </div>

  {#if draft}
    <!--
      پیش‌نمایش جای ویرایشگر را می‌گیرد، نه اینکه کنارش بنشیند: دو ویرایشگر
      باز یعنی کاربر نمی‌داند «ذخیره» کدام را می‌نویسد.
    -->
    <Card.Root class="min-w-0 gap-0 overflow-hidden py-0">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <strong class="block">{draft.name}</strong>
          <span class="text-xs text-muted-foreground">گام ۲ از ۳ — بازبینی · {formatCount(draft.steps)} قدم · {draft.model}</span>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="ghost" onclick={() => { draft = null; }}>دور بریز</Button>
          <Button onclick={saveDraft} disabled={creating || !draftPath}>{creating ? 'در حال ذخیره…' : 'گام ۳ — ذخیره'}</Button>
        </div>
      </div>
      <div class="space-y-3 border-b px-5 py-4">
        <label class="block space-y-1.5 text-sm font-medium"><span>مسیر فایل</span><Input bind:value={draftPath} dir="ltr" /></label>
        {#if draft.notes}
          <p class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6">مدل این‌ها را حدس زده و باید بازبینی شود: {draft.notes}</p>
        {/if}
        {#if draft.sourceFiles?.length}
          <div class="rounded-lg bg-muted p-3 text-xs leading-6 text-muted-foreground">
            <strong class="block text-foreground">سورس این فایل‌ها خوانده شد</strong>
            {#each draft.sourceFiles as file (file)}<span class="code-value block">{file}</span>{/each}
          </div>
        {/if}
      </div>
      <CodeView bind:value={draft.yaml} language="yaml" minHeight="55vh" />
      {#if feedback}<div class="border-t px-5 py-3 text-sm text-destructive">{feedback}</div>{/if}
    </Card.Root>
  {:else}
  <Card.Root class="min-w-0 gap-0 overflow-hidden py-0">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><strong class="code-value block">{data.file?.relative || 'فایلی انتخاب نشده'}</strong><span class="text-xs text-muted-foreground">{data.file?.kind === 'target' ? 'پیکربندی هدف' : 'سناریو'}</span></div><div class="flex items-center gap-2">{#if dirty}<span class="text-xs text-amber-600 dark:text-amber-300">ذخیره‌نشده</span>{/if}<Button onclick={save} disabled={!dirty || saving || !data.file}>{saving ? 'در حال بررسی…' : 'اعتبارسنجی و ذخیره'}</Button></div></div>
    {#if data.file}<CodeView bind:value={content} language={data.file.relative?.endsWith('.js') ? 'js' : 'yaml'} minHeight="70vh" />{:else}<div class="grid min-h-[60vh] place-items-center text-muted-foreground">{data.fileError || 'فایلی انتخاب نشده است'}</div>{/if}
    {#if feedback}<div class={`border-t px-5 py-3 text-sm ${feedback.includes('ذخیره شد') ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'}`}>{feedback}</div>{/if}
  </Card.Root>
  {/if}
</div>


{#if adding}
  <!--
    پاپ‌آور، نه کارتِ ته ستون.
    پیش‌تر «سناریوی تازه» زیر فهرستِ نوزده‌تایی می‌نشست و برای رسیدن به آن
    باید تا ته اسکرول می‌شد. حالا از دکمهٔ بالای فهرست باز می‌شود و روی
    همه‌چیز می‌آید.
  -->
  <div
    class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
    role="presentation"
    onclick={(event) => { if (event.target === event.currentTarget) adding = false; }}
  >
    <div
      class="scroll-thin max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-card p-6 shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="سناریوی تازه"
    >
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <strong class="block text-lg">سناریوی تازه</strong>
          <span class="text-xs text-muted-foreground">
            {mode === 'ai' ? 'گام ۱ از ۳ — بگویید کاربر چه می‌کند' : 'یک فایل خالی بسازید و خودتان بنویسید'}
          </span>
        </div>
        <Button variant="ghost" size="sm" onclick={() => (adding = false)} aria-label="بستن">✕</Button>
      </div>

      <div class="space-y-4">
        <div class="flex overflow-hidden rounded-lg border text-sm">
          <button type="button" class={`flex-1 px-3 py-2 ${mode === 'ai' ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/50'}`} onclick={() => (mode = 'ai')}>با هوش مصنوعی</button>
          <button type="button" class={`flex-1 px-3 py-2 ${mode === 'blank' ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/50'}`} onclick={() => (mode = 'blank')}>فایل خالی</button>
        </div>

        {#if mode === 'blank'}
          <label for="new-scenario-path" class="block space-y-1.5 text-sm font-medium">
            <span>نام فایل</span>
            <Input id="new-scenario-path" bind:value={newPath} dir="ltr" placeholder="my-test.yml" />
          </label>
          <Button class="w-full" onclick={createScenario} disabled={creating || !newPath}>
            {creating ? 'در حال ساخت…' : 'ساخت فایل YAML'}
          </Button>
        {:else}
          <label for="scenario-intent" class="block space-y-1.5 text-sm font-medium">
            <span>کاربر چه می‌کند و چه باید ببیند؟</span>
            <Textarea id="scenario-intent" bind:value={intent} rows={5} class="text-sm leading-6" placeholder="ثبت‌نام کن، کد بازیابی را دانلود کن، خارج شو و با همان کد برگرد" />
          </label>

          <ModelPicker bind:value={model} disabled={drafting} />

          <div class="rounded-lg border bg-muted/40 p-3">
            <p class="mb-1 text-xs font-semibold">سورس پروژه</p>
            {#if project?.sourceRoot}
              <p dir="ltr" class="mb-2 truncate font-mono text-[11px] text-muted-foreground">{project.sourceRoot}</p>
              <label class="flex items-start gap-2 text-xs leading-6">
                <input type="checkbox" bind:checked={useSource} class="mt-1.5" />
                <span>خوانده شود تا برچسب‌ها حدسی نباشند. <strong class="text-foreground">محتوای فایل‌های مرتبط به مدل می‌رود.</strong></span>
              </label>
            {:else}
              <p class="text-xs leading-6 text-muted-foreground">
                تعریف نشده. برای خواندن سورس، کلید <span class="code-value">source.root</span> را در پیکربندی پروژه بگذارید.
              </p>
            {/if}
          </div>

          <Button class="w-full" onclick={draftFromText} disabled={drafting || intent.trim().length < 10}>
            {drafting ? 'مدل مشغول است…' : 'ساخت پیش‌نویس'}
          </Button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<svelte:window onbeforeunload={(event) => { if (dirty) event.preventDefault(); }} />

<script module>
  const formatter = new Intl.NumberFormat('fa-IR');
  function formatCount(value) { return formatter.format(value); }
</script>
