<script>
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';

  let { data } = $props();

  // svelte-ignore state_referenced_locally
  let settings = $state(data.settings);
  let checks = $state(null);
  let available = $state(null);

  let key = $state('');
  // این دو هم snapshot اولیه‌اند: کاربر در همین صفحه ویرایششان می‌کند
  // svelte-ignore state_referenced_locally
  let roles = $state(Object.fromEntries(data.settings.roles.map((item) => [item.role, item.slug])));
  // svelte-ignore state_referenced_locally
  let budget = $state(String(data.settings.budgetPerRun));

  let busy = $state('');
  let feedback = $state('');
  let error = $state('');

  const LABEL = {
    resolve: 'حل قدم (پرتکرارترین)',
    author: 'نوشتن سناریو',
    analyze: 'تحلیل و شناخت',
  };

  const FROM = { settings: 'تنظیمات', config: 'userbug.config.js', default: 'پیش‌فرضِ ابزار' };

  function statusOf(role) {
    return checks?.find((item) => item.role === role);
  }

  async function save() {
    busy = 'save';
    error = '';
    feedback = '';
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ key: key || undefined, roles, budget }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'ذخیره نشد');
      settings = payload.settings;
      key = '';
      feedback = 'ذخیره شد.';
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  async function check() {
    busy = 'check';
    error = '';
    try {
      const response = await fetch('/api/ai?check=1');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'سنجش نشد');
      settings = payload.settings;
      checks = payload.checks;
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  async function loadModels() {
    busy = 'models';
    error = '';
    try {
      const response = await fetch('/api/ai?models=1');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'فهرست نیامد');
      available = payload.available || [];
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  /** پیشنهادِ خودِ ارائه‌دهنده، با یک کلیک. */
  function applySuggestion(role, slug) {
    roles = { ...roles, [role]: slug };
  }
</script>

<PageHeader title="تنظیمات" subtitle="کلید و مدلِ هوش مصنوعی — برای همهٔ پروژه‌ها" />

<div class="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
  <div class="space-y-4">
    <Card.Root>
      <Card.Header>
        <Card.Title class="text-sm">کلید OpenRouter</Card.Title>
        <Card.Description>
          {#if settings.key.present}
            کلیدی هست (…{settings.key.tail}، از {settings.key.from}).
          {:else}
            هنوز کلیدی نیست. مسیرهای کش‌شده بی‌کلید هم اجرا می‌شوند؛ کلید فقط
            برای قدم‌هایی لازم است که هنوز یاد گرفته نشده‌اند.
          {/if}
        </Card.Description>
      </Card.Header>
      <Card.Content class="space-y-2">
        <Input type="password" bind:value={key} placeholder={settings.key.present ? 'برای تعویض، کلید تازه' : 'sk-or-…'} />
        <p class="text-[11px] leading-5 text-muted-foreground">
          در فایل <code>.env</code> ذخیره می‌شود و هرگز به این صفحه برنمی‌گردد.
        </p>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title class="text-sm">بودجه</Card.Title></Card.Header>
      <Card.Content class="space-y-2">
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">سقفِ هزینهٔ هر اجرا (دلار)</span>
          <Input bind:value={budget} />
        </label>
        <p class="text-[11px] leading-5 text-muted-foreground">
          رد شدن از سقف، اجرا را متوقف و علامت‌دار می‌کند — نه اینکه بی‌صدا
          ادامه بدهد. الان: {settings.budgetPerRun}$ ({FROM[settings.budgetFrom]})
        </p>
      </Card.Content>
    </Card.Root>

    <div class="flex flex-wrap gap-2">
      <Button onclick={save} disabled={Boolean(busy)}>{busy === 'save' ? 'در حال ذخیره…' : 'ذخیره'}</Button>
      <Button variant="outline" onclick={check} disabled={Boolean(busy)}>
        {busy === 'check' ? 'در حال سنجش…' : 'سنجشِ زنده'}
      </Button>
    </div>
    {#if feedback}<p class="text-xs text-emerald-600 dark:text-emerald-400">{feedback}</p>{/if}
    {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
  </div>

  <div class="space-y-4">
    <Card.Root>
      <Card.Header>
        <Card.Title class="text-sm">مدلِ هر نقش</Card.Title>
        <Card.Description>
          نقش‌ها جدا هستند تا بشود ارزان اجرا کرد و گران فکر کرد. اسلاگِ خالی
          یعنی برگرد به لایهٔ زیرین.
        </Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4">
        {#each settings.roles as item (item.role)}
          {@const status = statusOf(item.role)}
          <div class="space-y-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium">{LABEL[item.role] || item.role}</span>
              <Badge variant="secondary" class="text-[10px]">{FROM[item.from]}</Badge>
              {#if status}
                <Badge variant={status.ok ? 'outline' : 'destructive'} class="text-[10px]">
                  {status.ok ? 'جواب داد' : 'جواب نداد'}
                </Badge>
              {/if}
            </div>

            <Input bind:value={roles[item.role]} list="ub-models" spellcheck="false" />

            {#each item.shadowed as hidden (hidden.from)}
              <p class="text-[11px] text-muted-foreground">
                «{hidden.slug}» از {FROM[hidden.from]} پوشانده شد.
              </p>
            {/each}

            {#if status && !status.ok}
              <p class="text-[11px] leading-5 text-destructive">{status.error}</p>
              {#if status.suggestion}
                <button
                  type="button"
                  class="text-[11px] underline underline-offset-2"
                  onclick={() => applySuggestion(item.role, status.suggestion)}
                >
                  پیشنهادِ ارائه‌دهنده: {status.suggestion} — بگذار اینجا
                </button>
              {/if}
            {/if}
          </div>
        {/each}

        <!--
          فهرست با کلیک می‌آید، نه با باز شدنِ صفحه: یک درخواست به ارائه‌دهنده
          است و هر بار لازمش نیست.
        -->
        <div class="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onclick={loadModels} disabled={Boolean(busy)}>
            {busy === 'models' ? 'در حال گرفتن…' : 'فهرست مدل‌های موجود'}
          </Button>
          {#if available}
            <span class="text-[11px] text-muted-foreground">
              {available.length} مدل ({available.filter((m) => m.free).length} رایگان) — در کادرها پیشنهاد می‌شوند
            </span>
          {/if}
        </div>

        <datalist id="ub-models">
          {#each available || [] as model (model.id)}
            <option value={model.id}>{model.free ? 'رایگان · ' : ''}{model.name}</option>
          {/each}
        </datalist>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title class="text-sm">چرا این صفحه هست</Card.Title></Card.Header>
      <Card.Content class="space-y-2 text-xs leading-6 text-muted-foreground">
        <p>
          هیچ اسلاگی برای همیشه رایگان نمی‌ماند. مدلی که تا دیروز پیش‌فرضِ
          «تحلیل و شناخت» بود، با ۴۰۴ برگشت و پیامِ خامِ ارائه‌دهنده وسطِ صفحهٔ
          شناخت به کاربر رسید — یعنی وقتی معلوم شد که کار شکسته بود.
        </p>
        <p>
          «سنجشِ زنده» همان را پیش از کار می‌پرسد، با ارزان‌ترین درخواستِ ممکن.
          همه‌اش از خط فرمان هم هست: <code>userbug ai --check</code>.
        </p>
        <p>فایل تنظیمات: <code>{settings.file}</code></p>
      </Card.Content>
    </Card.Root>
  </div>
</div>
