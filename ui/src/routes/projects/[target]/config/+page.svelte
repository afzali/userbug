<script>
  /**
   * پیکربندیِ پروژه.
   *
   * ── چرا همان `/api/knowledge` را صدا می‌زند ──
   *
   * این سه بخش از صفحهٔ شناخت آمده‌اند و اندپوینتشان از اول همان بود. ساختنِ
   * اندپوینتِ دوم برای همان سه کار یعنی دو اعتبارسنجی که دیر یا زود از هم
   * عقب می‌افتند — همان اشتباهی که این مخزن جای دیگر با `POST /api/files`
   * از آن پرهیز کرده.
   */
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';

  let { data } = $props();

  // svelte-ignore state_referenced_locally
  let checksConfig = $state(data.checksConfig || { checks: {} });
  // svelte-ignore state_referenced_locally
  let fixtures = $state(data.fixtures || []);
  // svelte-ignore state_referenced_locally
  let accounts = $state(data.accounts || []);

  let newAccount = $state({ id: '', email: '', passwordEnv: '', password: '', note: '' });
  /** آپلودِ fixture از خودِ صفحه. */
  let newFixture = $state({ note: '' });
  let fileInput = $state(null);
  let busy = $state('');
  let feedback = $state('');
  let error = $state('');

  let base = $derived(`/projects/${encodeURIComponent(data.target)}`);

  async function send(body) {
    busy = body.action;
    error = '';
    feedback = '';
    try {
      const response = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target: data.target, ...body }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'انجام نشد');
      return payload;
    } catch (cause) {
      error = cause.message;
      return null;
    } finally {
      busy = '';
    }
  }

  /** هر پاسخِ موفق، کلِ وضعیت را تازه می‌کند تا صفحه با دیسک واگرا نشود. */
  function absorb(payload) {
    if (!payload || payload.dry) return;
    checksConfig = payload.checks || { checks: {} };
    fixtures = payload.fixtures || [];
    accounts = payload.accounts || [];
  }

  async function saveAccount() {
    /**
     * رمزِ متنی تأییدِ صریح می‌خواهد — و اینجا همان تأیید است.
     *
     * `saveAccount` بی `allowPlain` رمزِ متنی را رد می‌کند. کاربری که در
     * کادرِ رمز چیزی نوشته، همان کار را خواسته؛ ولی باید **بداند** چه شد،
     * نه اینکه بعداً در فایل کشفش کند.
     */
    const payload = await send({
      action: 'account-save',
      ...newAccount,
      allowPlain: Boolean(newAccount.password),
    });
    if (!payload) return;
    absorb(payload);
    const plain = Boolean(newAccount.password);
    newAccount = { id: '', email: '', passwordEnv: '', password: '', note: '' };
    feedback = plain
      ? 'حساب ثبت شد. رمز متنی روی دیسک نشست — در `.gitignore` است و به گیت نمی‌رود.'
      : 'حساب ثبت شد. رمز از متغیر محیطی خوانده می‌شود، نه از این فایل.';
  }

  /** آپلود از همین صفحه — نه «فایل را دستی در این مسیر بگذارید». */
  async function uploadFixture() {
    const file = fileInput?.files?.[0];
    if (!file) return;

    busy = 'fixture';
    error = '';
    feedback = '';
    try {
      const form = new FormData();
      form.set('target', data.target);
      form.set('file', file);
      form.set('note', newFixture.note);

      const response = await fetch('/api/fixtures', {
        method: 'POST',
        headers: { 'x-userbug-request': '1' },
        body: form,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'آپلود نشد');

      fixtures = payload.fixtures;
      feedback = `ذخیره شد: ${payload.saved.relative} — در سناریو با همین نام صدایش کنید.`;
      newFixture = { note: '' };
      if (fileInput) fileInput.value = '';
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  async function fixtureAction(action, relative, note = '') {
    busy = 'fixture';
    error = '';
    try {
      const form = new FormData();
      form.set('target', data.target);
      form.set('action', action);
      form.set('relative', relative);
      form.set('note', note);
      const response = await fetch('/api/fixtures', {
        method: 'POST',
        headers: { 'x-userbug-request': '1' },
        body: form,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'انجام نشد');
      fixtures = payload.fixtures;
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  const kb = (bytes) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);

  const statOf = (id) => checksConfig.checks?.[id] || {};
  const modeOf = (id) => statOf(id).mode || 'watch';

  /**
   * خاموش کردنِ چک دلیل می‌خواهد.
   *
   * همان قاعدهٔ `allowlist` که README نوشته «فهرست بلند یعنی داریم مشکل را
   * زیر فرش می‌کنیم». چکی که بی‌دلیل خاموش شود، شش ماه بعد هیچ‌کس نمی‌داند
   * چرا ساکت است.
   */
  async function setMode(id, mode) {
    let why = '';
    if (mode === 'off') {
      why = prompt('چرا این چک خاموش می‌شود؟') || '';
      if (!why.trim()) return;
    }
    absorb(await send({ action: 'check-mode', id, mode, why }));
  }
</script>

<PageHeader
  eyebrow="تنظیماتِ اجرا، نه شناخت"
  title="پیکربندی {data.project.name}"
  description="چیزی که خودتان تنظیم می‌کنید: حساب‌ها، فایل‌های آپلود، و چک‌هایی که روی هر اجرا اجرا می‌شوند."
>
  {#snippet actions()}
    <Button href={`${base}/files?kind=target`} variant="outline">فایل کانفیگ</Button>
    <Button href={`${base}/knowledge`} variant="ghost">شناخت</Button>
  {/snippet}
</PageHeader>

{#if feedback}<p class="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">{feedback}</p>{/if}
{#if error}<p class="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>{/if}

<section class="mb-6 rounded-xl border p-4">
  <h2 class="mb-1 text-sm font-bold">حساب‌های ذخیره‌شده</h2>
  <p class="mb-3 text-xs leading-6 text-muted-foreground">
    <code>{'{{identity}}'}</code> هر اجرا یک کاربرِ تازه می‌سازد. برای اپی که ثبت‌نامش باز نیست، یا
    برای حسابی که <strong>داده دارد</strong>، اینجا حساب ثبت کنید و در سناریو با
    <code>{'{{account.<شناسه>.email}}'}</code> استفاده‌اش کنید.
    <br />
    دو راه برای رمز: <strong>نامِ متغیر محیطی</strong> (پیشنهادی — رمز در
    <code>.env</code> می‌ماند و اینجا فقط نامش) یا <strong>خودِ رمز</strong>
    برای حسابِ آزمایشی. دومی متنی روی دیسک می‌نشیند؛ چون
    <code>credentials.json</code> در <code>.gitignore</code> است به گیت نمی‌رود،
    ولی هر کسی که به این ماشین دسترسی دارد می‌خواندش. برای حسابِ واقعی، اولی.
  </p>

  {#if accounts.length}
    <ul class="mb-4 flex flex-col gap-1 text-sm">
      {#each accounts as account (account.id)}
        <li class="flex items-center gap-2 rounded-lg border px-3 py-1.5">
          <code>{account.id}</code>
          <span class="min-w-0 flex-1 truncate text-muted-foreground">
            {account.email || account.username}
            {#if account.passwordEnv}<span class="text-xs"> · رمز از <code>{account.passwordEnv}</code></span>{/if}
            {#if account.source === 'plain'}<span class="text-xs text-amber-600"> · رمزِ متنی روی دیسک</span>{/if}
          </span>
          <Badge variant={account.hasPassword ? 'secondary' : 'outline'}>
            {account.hasPassword ? 'آماده' : 'رمز در دسترس نیست'}
          </Badge>
          <button
            class="text-xs text-muted-foreground hover:text-destructive"
            disabled={Boolean(busy)}
            onclick={() => send({ action: 'account-remove', id: account.id }).then(absorb)}>حذف</button
          >
        </li>
      {/each}
    </ul>
  {/if}

  <div class="grid gap-2 sm:grid-cols-3">
    <Input bind:value={newAccount.id} placeholder="شناسه (مثلاً admin)" disabled={Boolean(busy)} />
    <Input bind:value={newAccount.email} placeholder="ایمیل یا نام کاربری" disabled={Boolean(busy)} />
    <Input bind:value={newAccount.passwordEnv} placeholder="نام متغیر محیطی (پیشنهادی)" disabled={Boolean(busy)} />
    <Input
      type="password"
      bind:value={newAccount.password}
      placeholder="یا خودِ رمز — متنی روی دیسک"
      disabled={Boolean(busy) || Boolean(newAccount.passwordEnv)}
    />
    <Input bind:value={newAccount.note} placeholder="این حساب برای چیست؟" disabled={Boolean(busy)} />
    <Button variant="outline" disabled={Boolean(busy) || !newAccount.id.trim()} onclick={saveAccount}>افزودن</Button>
  </div>
</section>

<section class="mb-6 rounded-xl border p-4">
  <h2 class="mb-1 text-sm font-bold">فایل‌های آپلود</h2>
  <p class="mb-3 text-xs leading-6 text-muted-foreground">
    سناریو <strong>فقط</strong> از اینجا فایل آپلود می‌کند — چون آن رشته را ممکن است
    مدل نوشته باشد و مسیرِ آزاد یعنی هر فایلی از دیسک قابل فرستادن است. نامِ
    فایل همان شناسه است: در سناریو با <code>{'file: fixtures/<نام>'}</code>
    صدایش کنید. خزشِ نقشه هم همین را می‌فهمد، پس می‌شود دادهٔ اولیه را پیش از
    گشتن به اپ داد.
  </p>

  <div class="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
    <input
      bind:this={fileInput}
      type="file"
      disabled={Boolean(busy)}
      class="rounded-md border bg-background px-2 py-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
    />
    <Input bind:value={newFixture.note} placeholder="این فایل برای چیست؟ (اختیاری)" disabled={Boolean(busy)} />
    <Button variant="outline" disabled={busy === 'fixture'} onclick={uploadFixture}>
      {busy === 'fixture' ? 'در حال آپلود…' : 'آپلود'}
    </Button>
  </div>

  {#if fixtures.length}
    <ul class="flex flex-col gap-1 text-sm">
      {#each fixtures as item (item.relative)}
        <li class="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-1.5">
          <code class="text-xs">{item.relative}</code>
          <span class="text-xs text-muted-foreground">{kb(item.bytes)}</span>
          <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {item.note || '— توضیحی ندارد'}
          </span>
          <button
            class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            disabled={Boolean(busy)}
            onclick={() => {
              const note = prompt('این فایل برای چیست؟', item.note || '');
              if (note !== null) fixtureAction('note', item.relative, note);
            }}>توضیح</button
          >
          <button
            class="text-xs text-muted-foreground hover:text-destructive"
            disabled={Boolean(busy)}
            onclick={() => {
              if (confirm(`${item.relative} پاک شود؟`)) fixtureAction('remove', item.relative);
            }}>حذف</button
          >
        </li>
      {/each}
    </ul>
  {:else}
    <p class="text-sm text-muted-foreground">
      هنوز فایلی نیست. سناریوهای آپلود تا وقتی فایل نباشد اجرا نمی‌شوند.
    </p>
  {/if}
  <p class="mt-2 text-[11px] text-muted-foreground">
    روی دیسک: <code class="break-all">{data.fixturesPath}</code>
  </p>
</section>

<section class="mb-6 rounded-xl border p-4">
  <h2 class="mb-1 text-sm font-bold">چکِ همگانی</h2>
  <p class="mb-3 text-xs leading-6 text-muted-foreground">
    این‌ها به شناخت نیاز ندارند و روی هر پروژه‌ای اجرا می‌شوند.
    <strong>watch</strong> یافته ثبت می‌کند · <strong>expect</strong> سخت می‌شکند · <strong>off</strong> اصلاً اجرا نمی‌شود.
  </p>
  <div class="scroll-thin overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="text-xs text-muted-foreground">
        <tr class="border-b"><th class="p-2 text-right">چک</th><th class="p-2 text-right">برخورد</th><th class="p-2 text-right">قلابی</th><th class="p-2 text-right">حالت</th></tr>
      </thead>
      <tbody>
        {#each data.checkDefinitions as check (check.id)}
          <tr class="border-b last:border-0">
            <td class="p-2">
              {check.title}
              <span class="block font-mono text-xs text-muted-foreground">{check.id}</span>
              {#if statOf(check.id).why}<span class="block text-xs text-muted-foreground">«{statOf(check.id).why}»</span>{/if}
            </td>
            <td class="p-2 text-xs">{statOf(check.id).hits ?? 0}</td>
            <td class="p-2 text-xs">{statOf(check.id).noise ?? 0}</td>
            <td class="p-2">
              <div class="flex gap-1">
                {#each ['off', 'watch', 'expect'] as mode (mode)}
                  <Button
                    size="sm"
                    variant={modeOf(check.id) === mode ? 'default' : 'outline'}
                    disabled={Boolean(busy)}
                    onclick={() => setMode(check.id, mode)}>{mode}</Button
                  >
                {/each}
              </div>
              {#if check.risky}<span class="mt-1 block text-xs text-muted-foreground">پرخطر — احتمال قلابی بیشتر</span>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
