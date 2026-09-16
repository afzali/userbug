<script>
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { latinFromPersianLayout } from '../../../../../src/target-template.js';

  /**
   * ساختِ پروژه، بیرون از فضای کاریِ هر پروژه.
   *
   * پیش‌تر این فرم داخل صفحهٔ فایل‌های یک پروژهٔ دیگر بود — یعنی برای ساختنِ
   * پروژهٔ «ب» باید اول وارد پروژهٔ «الف» می‌شدید.
   */
  let saving = $state(false);
  let error = $state('');

  /**
   * هشدارِ کلید، همان لحظه که تایپ می‌شود.
   *
   * ── چرا سرور تنها کافی نبود ──
   *
   * سرور از دیروز کلیدِ بد را رد می‌کند، ولی کاربر آن را **بعد از** پر کردنِ
   * کلِ فرم و زدنِ «ساخت پروژه» می‌بیند. اعتبارسنجی باید نزدیک‌ترین جا به
   * اشتباه بایستد، نه دورترین.
   *
   * و مهم‌تر: «نامعتبر است» هیچ کمکی نمی‌کند وقتی کاربر اصلاً نمی‌داند چه
   * اتفاقی افتاده. «دثحه» بی‌معنا نیست — «nepi» است با صفحه‌کلید فارسی.
   * پس همان را می‌گوییم و یک دکمه می‌گذاریم که درستش کند.
   */
  const keyHint = $derived.by(() => {
    const key = form.key.trim();
    if (!key) return null;
    if (/^[a-z0-9][a-z0-9_-]*$/.test(key)) return null;

    const suggestion = latinFromPersianLayout(key);
    if (suggestion) {
      return { fix: suggestion, message: 'انگار صفحه‌کلید فارسی بوده. منظورتان این بود؟' };
    }
    if (/[A-Z]/.test(key) && /^[A-Za-z0-9_-]+$/.test(key)) {
      return { fix: key.toLowerCase(), message: 'کلید با حرف کوچک نوشته می‌شود.' };
    }
    return { fix: '', message: 'کلید باید لاتینِ کوچک باشد: حرف، عدد، خط تیره و زیرخط.' };
  });

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
    backRoot: '',
    frontName: 'front',
    backName: 'back',
  });

  /**
   * «یک پوشه» یا «دو پوشه».
   *
   * پیش‌فرض یکی است چون حالتِ رایج‌تر همان است و پرسیدنِ چیزی که اکثراً
   * جوابش «یکی» است، فرم را بی‌دلیل شلوغ می‌کند. ولی وقتی فرانت و بک دو
   * مخزنِ جدا باشند، با یک ریشه نیمی از اپ برای مدل نامرئی می‌ماند.
   */
  let splitSource = $state(false);


  /**
   * پنجرهٔ واقعیِ انتخاب پوشه.
   *
   * مرورگر مسیرِ مطلق نمی‌دهد (عمداً)، پس این کار از سرورِ محلی می‌گذرد.
   * اگر پنجره‌ای باز نشد — سرورِ بی‌دسکتاپ، یا انصرافِ کاربر — ورودی متنی
   * سرِ جایش می‌ماند و چیزی خراب نمی‌شود.
   */
  /**
   * انتخابِ پوشه نباید فرم را گروگان بگیرد.
   *
   * ── چرا این را اضافه کردیم ──
   *
   * یک بار واقعاً خوردیم: دکمه زده شد، پنجرهٔ ویندوز جایی پشتِ مرورگر (یا
   * روی یک نشستِ بی‌دسکتاپ اصلاً هیچ‌جا) باز شد، و دکمه تا **سه دقیقه** روی
   * «…» ماند. راهِ بیرون آمدن فقط رفرش بود — که کلِ فرمِ نیمه‌پرشده را هم
   * می‌برد.
   *
   * حالا دو چیز عوض شده: بعد از یک ثانیه می‌گوید پنجره شاید پشتِ مرورگر
   * باشد، و همان دکمه تبدیل به «بی‌خیال» می‌شود که انتظار را قطع می‌کند.
   * پنجرهٔ سیستم سرِ جایش می‌ماند (دستِ ما نیست)، ولی فرم آزاد می‌شود و
   * ورودی متنی همیشه بوده و هست.
   */
  let picking = $state('');
  let pickHint = $state('');
  let pickAbort = null;

  function stopPicking() {
    pickAbort?.abort();
    pickAbort = null;
    picking = '';
    pickHint = 'انتظار رها شد. اگر پنجره باز است می‌توانید ببندیدش — یا مسیر را همین‌جا بنویسید.';
  }

  async function pickFolder(field) {
    if (picking) return stopPicking();

    picking = field;
    pickHint = '';
    pickAbort = new AbortController();

    // پنجره‌ای که پشتِ مرورگر باز شود، از «دکمه کار نمی‌کند» قابلِ تشخیص نیست
    const late = setTimeout(() => {
      if (picking === field) pickHint = 'پنجرهٔ انتخاب پوشه باز شده — شاید پشتِ مرورگر باشد.';
    }, 1000);

    try {
      const response = await fetch('/api/fs/pick', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({}),
        signal: pickAbort.signal,
      });
      const payload = await response.json();
      if (payload.ok && payload.path) {
        form[field] = payload.path;
        pickHint = '';
      } else if (payload.reason === 'no-dialog') {
        pickHint = 'پنجرهٔ انتخاب پوشه روی این سیستم باز نشد؛ مسیر را دستی بنویسید.';
      } else {
        pickHint = '';
      }
    } catch (cause) {
      // رها کردنِ عمدی خطا نیست؛ پیامش را همان `stopPicking` گذاشته
      if (cause.name !== 'AbortError') error = cause.message;
    } finally {
      clearTimeout(late);
      if (picking === field) picking = '';
      pickAbort = null;
    }
  }

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
      <label class="block space-y-1.5 text-sm font-medium">
        <span>کلید (نام فایل)</span>
        <Input bind:value={form.key} dir="ltr" placeholder="my-app" />
        {#if keyHint}
          <span class="flex flex-wrap items-center gap-2 pt-1 text-xs font-normal text-muted-foreground">
            <span>{keyHint.message}</span>
            {#if keyHint.fix}
              <button
                type="button"
                dir="ltr"
                class="rounded-md border px-2 py-0.5 font-mono text-xs hover:bg-accent"
                onclick={() => (form.key = keyHint.fix)}
              >{keyHint.fix}</button>
            {/if}
          </span>
        {/if}
      </label>
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
    <!--
      اینجا باید صریح گفته شود که چه چیزی گرفته **نمی‌شود**.

      متنِ قبلی فقط می‌گفت «لاگ‌هایی که سرور روی دیسک می‌نویسد» و کاربر
      منطقاً فکر می‌کرد خروجی ترمینال هم گرفته می‌شود. نمی‌شود — و ندانستنش
      یعنی کاربر منتظرِ خطایی می‌ماند که هیچ‌وقت نمی‌آید.
    -->
          <!--
        ── چرا این متن عوض شد ──

        تا گام ۶ فقط `type: 'file'` وجود داشت و اینجا نوشته بود «خروجیِ
        ترمینالِ اپ گرفته نمی‌شود». حالا `type: 'command'` هست و همان جمله
        کاربر را از کاری که می‌تواند بکند منصرف می‌کرد — بدترین نوعِ متنِ
        کهنه، چون دربارهٔ خودِ ابزار دروغ می‌گفت.
      -->
      <p class="text-xs leading-6 text-muted-foreground">
        خطاهای کنسول مرورگر خودکار گرفته می‌شوند و مسیر نمی‌خواهند. این دو
        فقط <strong>فایل</strong> می‌خوانند. اگر لاگتان فقط روی ترمینال است دو
        راه دارید: یا به فایل بریزیدش
        (<code class="code-value">npm run dev &gt; dev.log 2&gt;&amp;1</code>) و همان
        را اینجا بدهید، یا در فایلِ پیکربندیِ پروژه یک لاگِ
        <code class="code-value">type: 'command'</code> بگذارید تا userbug خودش
        دستور را اجرا کند و خروجی‌اش را بخواند.
      </p>

    <div class="space-y-3 rounded-lg border p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span class="text-sm font-medium">پوشهٔ سورس</span>
        <div class="flex overflow-hidden rounded-md border text-xs">
          <button type="button" class={`px-3 py-1.5 ${!splitSource ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}`} onclick={() => (splitSource = false)}>فرانت و بک یک‌جا</button>
          <button type="button" class={`px-3 py-1.5 ${splitSource ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}`} onclick={() => (splitSource = true)}>دو پوشهٔ جدا</button>
        </div>
      </div>

      <label class="block space-y-1.5 text-sm">
        <span class="font-medium">{splitSource ? 'پوشهٔ فرانت' : 'پوشهٔ پروژه'}</span>
        <span class="flex gap-2">
          <Input bind:value={form.sourceRoot} dir="ltr" placeholder="D:/Projects/my-app" />
          <Button variant="outline" class="shrink-0" onclick={() => pickFolder('sourceRoot')}>
            {picking === 'sourceRoot' ? 'بی‌خیال' : 'انتخاب…'}
          </Button>
        </span>
      </label>

      <!-- پنجره‌ای که پشتِ مرورگر باز شود، از «دکمه کار نمی‌کند» قابلِ تشخیص نیست -->
      {#if pickHint}
        <p class="text-[11px] leading-5 text-muted-foreground">{pickHint}</p>
      {/if}

      {#if splitSource}
        <label class="block space-y-1.5 text-sm">
          <span class="font-medium">پوشهٔ بک</span>
          <span class="flex gap-2">
            <Input bind:value={form.backRoot} dir="ltr" placeholder="D:/Projects/my-api" />
            <Button variant="outline" class="shrink-0" onclick={() => pickFolder('backRoot')}>
              {picking === 'backRoot' ? 'بی‌خیال' : 'انتخاب…'}
            </Button>
          </span>
        </label>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block space-y-1.5 text-xs"><span class="text-muted-foreground">نامِ ریشهٔ فرانت</span><Input bind:value={form.frontName} dir="ltr" placeholder="front" /></label>
          <label class="block space-y-1.5 text-xs"><span class="text-muted-foreground">نامِ ریشهٔ بک</span><Input bind:value={form.backName} dir="ltr" placeholder="back" /></label>
        </div>

        <!--
          نام‌ها تزئین نیستند و همین را باید گفت، وگرنه کاربر رهایشان می‌کند
          روی پیش‌فرض و بعد در گزارش نمی‌فهمد `front/` یعنی چه.
        -->
        <p class="text-xs leading-6 text-muted-foreground">مسیرها با این نام‌ها پیشوند می‌گیرند — <span class="code-value">front/src/app.js</span> — تا فایلِ هم‌نام در دو پوشه قاطی نشود و گزارش بگوید مشکل کدام طرف است.</p>
      {/if}

      <p class="text-xs leading-6 text-muted-foreground">با این، هوش مصنوعی هنگام ساختِ سناریو برچسب‌های واقعی را از کد می‌خواند؛ بدون آن حدس می‌زند. <span class="code-value">.env</span> و کلیدها هیچ‌وقت خوانده نمی‌شوند.</p>
    </div>

    {#if error}<p class="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm leading-6 whitespace-pre-line text-destructive">{error}</p>{/if}

    <div class="flex justify-end gap-2 border-t pt-4">
      <Button href="/" variant="ghost">انصراف</Button>
      <Button onclick={create} disabled={saving || !form.key || !form.baseURL}>{saving ? 'در حال ساخت…' : 'ساخت پروژه'}</Button>
    </div>
  </Card.Content>
</Card.Root>
