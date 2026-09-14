<script>
  import { invalidateAll } from '$app/navigation';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { formatDate, formatNumber } from '$lib/format.js';

  let { data } = $props();

  const workspace = (key) => `/projects/${encodeURIComponent(key)}`;

  /**
   * برگرداندنِ بستهٔ پروژه.
   *
   * ── چرا اینجا و نه در صفحهٔ خودِ پروژه ──
   *
   * وارد کردنِ بسته **پروژه می‌سازد**؛ پس جایش همان‌جاست که پروژهٔ تازه
   * ساخته می‌شود، نه داخلِ پروژه‌ای که هنوز وجود ندارد.
   *
   * ── و چرا اول پیش‌نمایش ──
   *
   * بسته فایلی است که از جای دیگری آمده. نوشتنِ بی‌دیدن روی دیسک، همان
   * کارِ برگشت‌ناپذیری است که این ابزار همه‌جا پیش از انجامش می‌پرسد.
   */
  let bundle = $state(null);
  let preview = $state(null);
  let importAs = $state('');
  let force = $state(false);
  let importing = $state(false);
  let importError = $state('');
  let importDone = $state(null);

  async function pickBundle(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    importError = '';
    importDone = null;
    try {
      bundle = JSON.parse(await file.text());
      const response = await fetch('/api/bundle', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ bundle, preview: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'بسته خوانده نشد');
      preview = payload.preview;
      importAs = payload.preview.target;
    } catch (cause) {
      bundle = null;
      preview = null;
      importError = `بسته خوانده نشد: ${cause.message}`;
    }
  }

  async function runImport() {
    importing = true;
    importError = '';
    try {
      const response = await fetch('/api/bundle', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ bundle, as: importAs, force }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'وارد نشد');
      importDone = payload;
      // فهرستِ پروژه‌ها از سرور می‌آید، پس باید تازه شود
      await invalidateAll();
    } catch (cause) {
      importError = cause.message;
    } finally {
      importing = false;
    }
  }

  /**
   * حذف پروژه — با نشان دادنِ آنچه از بین می‌رود.
   *
   * ── چرا «مطمئنید؟» کافی نبود ──
   *
   * این تنها جای رابط است که چیزی را برای همیشه پاک می‌کند. پرسشِ خالی هیچ
   * نمی‌گوید و آدم روی «بله» می‌زند چون همیشه می‌زند. ولی «۱۹ سناریو،
   * ۲۲۱۲ فایلِ اجرا، پروندهٔ شناخت» جمله‌ای است که یا متوقف می‌کند یا مطمئن.
   *
   * و نوشتنِ کلید لازم است چون کارت‌ها کنار هم‌اند و کلیک روی ردیفِ اشتباه
   * ساده‌ترین اشتباهِ ممکن است.
   */
  let removing = $state(null);
  let footprint = $state(null);
  let confirmText = $state('');
  let keepHistory = $state(false);
  let busy = $state(false);
  let error = $state('');

  async function askRemove(project) {
    removing = project;
    footprint = null;
    confirmText = '';
    keepHistory = false;
    error = '';
    try {
      const response = await fetch(`/api/projects?footprint=${encodeURIComponent(project.key)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'خوانده نشد');
      footprint = payload;
    } catch (cause) {
      error = cause.message;
    }
  }

  async function confirmRemove() {
    busy = true;
    error = '';
    try {
      const response = await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ key: removing.key, confirm: confirmText, keepHistory }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'حذف نشد');
      location.reload();
    } catch (cause) {
      error = cause.message;
      busy = false;
    }
  }
</script>

<PageHeader
  eyebrow="فضای کاری"
  title="پروژه‌ها"
  description="هر پروژه فضای کاری خودش را دارد: اجرا، تریاژ، مقایسه و سناریوها همه محصور به همان پروژه‌اند."
>
  {#snippet actions()}
    <Button href="/projects/new" variant="outline">پروژهٔ تازه</Button>
    <label class="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm hover:bg-accent">
      واردکردنِ بسته
      <input type="file" accept="application/json,.json" class="hidden" onchange={pickBundle} />
    </label>
  {/snippet}
</PageHeader>

{#if importError}
  <p class="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{importError}</p>
{/if}

{#if importDone}
  <p class="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm leading-6">
    پروژهٔ «{importDone.target}» ساخته شد — {formatNumber(importDone.written.length)} فایل نوشته شد.
    {#if importDone.skipped.length}
      <span class="block text-muted-foreground">
        {formatNumber(importDone.skipped.length)} فایل رد شد چون از قبل بود؛ برای بازنویسی «بازنویسی کن» را تیک بزنید.
      </span>
    {/if}
    {#each importDone.omitted as note (note)}
      <span class="block text-muted-foreground">! در بسته نبود: {note}</span>
    {/each}
    <a class="underline underline-offset-2" href={workspace(importDone.target)}>برویم سراغش</a>
  </p>
{/if}

{#if preview && !importDone}
  <!--
    پیش‌نمایش پیش از نوشتن.

    بسته از جای دیگری آمده و `force` می‌تواند نقشه و سناریوهای تازه‌تر را
    ببرد. پس اول می‌گوییم چه دارد، بعد می‌پرسیم.
  -->
  <section class="mb-6 rounded-xl border bg-card p-4">
    <h2 class="text-sm font-bold">بستهٔ «{preview.target}»</h2>
    <p class="mt-1 text-xs leading-6 text-muted-foreground">
      ساخته‌شده در {preview.at.slice(0, 16).replace('T', ' ')} ·
      {formatNumber(preview.knowledge)} فایلِ شناخت ·
      {formatNumber(preview.scenarios)} سناریو ·
      {formatNumber(preview.fixtures)} فایلِ نمونه
      {#if preview.states} · نقشه با {formatNumber(preview.states)} حالت{/if}
    </p>
    {#each preview.omitted as note (note)}
      <p class="mt-1 text-xs text-amber-700 dark:text-amber-300">! داخلش نیست: {note}</p>
    {/each}

    <div class="mt-3 flex flex-wrap items-end gap-3">
      <label class="space-y-1 text-xs">
        <span class="block text-muted-foreground">با چه نامی ساخته شود</span>
        <Input bind:value={importAs} class="h-9 w-56" />
      </label>
      <label class="flex items-center gap-2 pb-2 text-xs">
        <input type="checkbox" bind:checked={force} />
        بازنویسی کن اگر از قبل هست
      </label>
      <Button class="mb-1" disabled={importing || !importAs.trim()} onclick={runImport}>
        {importing ? 'در حال نوشتن…' : 'وارد کن'}
      </Button>
      <Button class="mb-1" variant="ghost" onclick={() => { preview = null; bundle = null; }}>انصراف</Button>
    </div>
  </section>
{/if}

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
          <!--
            حذف کم‌رنگ و آخر از همه. کارِ روزمره نیست و نباید هم‌وزنِ
            «ورود به پروژه» دیده شود.
          -->
          <Button
            variant="ghost"
            class="px-2 text-muted-foreground hover:text-destructive"
            aria-label={`حذف ${project.name}`}
            onclick={() => askRemove(project)}
          >حذف</Button>
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

{#if removing}
  <!--
    پنل تأیید حذف.

    عمداً فهرستِ عددی نشان می‌دهد نه یک جملهٔ کلی: «۱۹ سناریو» و «۲۲۱۲ فایل
    اجرا» با «همهٔ داده‌های پروژه» یک چیز نیستند — دومی را کسی نمی‌خواند.
  -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="حذف پروژه"
    tabindex="-1"
    onclick={(event) => { if (event.target === event.currentTarget && !busy) removing = null; }}
    onkeydown={(event) => { if (event.key === 'Escape' && !busy) removing = null; }}
  >
    <Card.Root class="w-full max-w-lg">
      <Card.Header>
        <Card.Title>حذف «{removing.name}»</Card.Title>
        <Card.Description>این کار برگشت ندارد.</Card.Description>
      </Card.Header>

      <Card.Content class="space-y-4 text-sm">
        {#if !footprint && !error}
          <p class="text-muted-foreground">در حال شمردن…</p>
        {:else if footprint}
          <div class="space-y-1.5 rounded-lg border p-3">
            <p class="text-xs font-semibold text-muted-foreground">پاک می‌شود</p>
            <ul class="space-y-1">
              <li>کانفیگ پروژه — <span class="code-value">{footprint.target}.config.js</span></li>
              {#if footprint.scenarios}<li>{formatNumber(footprint.scenarios)} فایل سناریو (شاملِ کشِ آموخته)</li>{/if}
              {#if footprint.knowledge}<li>{formatNumber(footprint.knowledge)} فایل شناخت</li>{/if}
              {#if footprint.schedule}<li>زمان‌بندی</li>{/if}
              {#if !keepHistory && footprint.runs}<li>{formatNumber(footprint.runs)} اجرا با همهٔ عکس‌ها و traceها</li>{/if}
              {#if !keepHistory && footprint.triage}<li>وضعیت تریاژ</li>{/if}
              {#if !keepHistory && footprint.findings}<li>فهرست یافته‌ها</li>{/if}
            </ul>
          </div>

          {#if footprint.runs || footprint.triage || footprint.findings}
            <!--
              تاریخچه ساعت‌ها کارِ آدم و مدل است. گاهی فقط تعریفِ پروژه غلط
              بوده و کسی نمی‌خواهد یافته‌هایش را از دست بدهد.
            -->
            <label class="flex items-start gap-2 text-sm">
              <input type="checkbox" bind:checked={keepHistory} class="mt-1" />
              <span>
                تاریخچه بماند
                <span class="block text-xs text-muted-foreground">اجراها، تریاژ و یافته‌ها دست‌نخورده می‌مانند؛ فقط تعریفِ پروژه و سناریوها می‌روند.</span>
              </span>
            </label>
          {/if}

          <label class="block space-y-1.5">
            <span>برای تأیید، کلیدِ پروژه را بنویسید: <span class="code-value">{removing.key}</span></span>
            <input
              bind:value={confirmText}
              dir="ltr"
              class="h-9 w-full rounded-md border bg-background px-3 font-mono text-sm"
              placeholder={removing.key}
            />
          </label>
        {/if}

        {#if error}<p class="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">{error}</p>{/if}
      </Card.Content>

      <Card.Footer class="justify-end gap-2">
        <Button variant="ghost" disabled={busy} onclick={() => (removing = null)}>انصراف</Button>
        <Button
          variant="destructive"
          disabled={busy || confirmText !== removing.key}
          onclick={confirmRemove}
        >{busy ? 'در حال حذف…' : 'حذف کن'}</Button>
      </Card.Footer>
    </Card.Root>
  </div>
{/if}
