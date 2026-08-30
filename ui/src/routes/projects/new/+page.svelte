<script>
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';

  /**
   * ساختِ پروژه، بیرون از فضای کاریِ هر پروژه.
   *
   * پیش‌تر این فرم داخل صفحهٔ فایل‌های یک پروژهٔ دیگر بود — یعنی برای ساختنِ
   * پروژهٔ «ب» باید اول وارد پروژهٔ «الف» می‌شدید.
   */
  let saving = $state(false);
  let error = $state('');

  /**
   * `environment` پیش‌فرضِ `local` دارد چون آدرسِ پیش‌فرض هم لوکال است، ولی سرور
   * اجازه نمی‌دهد میزبانِ عمومی را `local` اعلام کنید: این محیط قلاب مخرب و
   * درخواست POST و SQL نویسنده را باز می‌کند.
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

  async function create() {
    saving = true;
    error = '';
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
      location.href = `/projects/${encodeURIComponent(payload.key)}`;
    } catch (cause) {
      error = cause.message;
      saving = false;
    }
  }
</script>

<PageHeader
  eyebrow="پروژهٔ تازه"
  title="یک پروژه تعریف کنید"
  description="خروجی یک فایل در targets/ است که پیش از ذخیره در زیرپروسه اعتبارسنجی می‌شود. موارد پیشرفته کامنتِ همان فایل‌اند و بعداً از ویرایشگر اضافه می‌شوند."
>
  {#snippet actions()}<Button href="/" variant="outline">فهرست پروژه‌ها</Button>{/snippet}
</PageHeader>

<Card.Root class="mx-auto max-w-3xl">
  <Card.Content class="space-y-5 pt-6">
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
    <p class="text-xs leading-6 text-muted-foreground">با این کلید، هوش مصنوعی می‌تواند هنگام ساختِ سناریو برچسب‌های واقعی را از کد بخواند. بدون آن، حدس می‌زند.</p>

    {#if error}<p class="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm leading-6 whitespace-pre-line text-destructive">{error}</p>{/if}

    <div class="flex justify-end gap-2 border-t pt-4">
      <Button href="/" variant="ghost">انصراف</Button>
      <Button onclick={create} disabled={saving || !form.key || !form.baseURL}>{saving ? 'در حال ساخت…' : 'ساخت پروژه'}</Button>
    </div>
  </Card.Content>
</Card.Root>
