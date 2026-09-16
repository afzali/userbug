<script>
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import ScenarioList from '$lib/components/ScenarioList.svelte';
  import CodeView from '$lib/components/CodeView.svelte';
  import ExpectPanel from '$lib/components/ExpectPanel.svelte';
  import ModelPicker from '$lib/components/ModelPicker.svelte';

  let { data } = $props();
  // editor باید نسخهٔ قابل‌ویرایش snapshot اولیه را نگه دارد.
  // svelte-ignore state_referenced_locally
  let content = $state(data.file?.content || '');
  // svelte-ignore state_referenced_locally
  let original = $state(data.file?.content || '');

  /**
   * با تعویض فایل، متنِ ویرایشگر هم عوض شود.
   *
   * فهرست فایل‌ها پیوند است، پس SvelteKit ناوبری سمت کلاینت می‌کند و همین
   * کامپوننت را نگه می‌دارد. مقدارِ اولیهٔ `$state` فقط یک بار خوانده می‌شود،
   * پس با کلیک روی فایل بعدی، `data` عوض می‌شد و ویرایشگر همان متنِ قبلی را
   * نشان می‌داد — و بدتر: «ذخیره» محتوای فایل قبلی را روی فایل تازه می‌نوشت.
   *
   * شرطِ تغییرِ مسیر لازم است: بدون آن، هر تایپِ کاربر دوباره از `data`
   * بازنویسی می‌شد.
   */
  let loadedKey = $state(`${data.kind}:${data.relative}`);
  $effect(() => {
    const key = `${data.kind}:${data.relative}`;
    if (key === loadedKey) return;
    loadedKey = key;
    content = data.file?.content || "";
    original = data.file?.content || "";
    feedback = data.fileError || "";
    draft = null;
    // بازنویسیِ فایلِ قبلی نباید روی فایلِ تازه بنشیند — همان اشتباهی که
    // یک بار با خودِ `content` رخ داد و متنِ فایلِ قبلی را جای دیگری نوشت
    revision = null;
    wish = '';
    showRevise = false;
  });
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
  // svelte-ignore state_referenced_locally
  let adding = $state(Boolean(data.compose));
  let creating = $state(false);
  // svelte-ignore state_referenced_locally
  let intent = $state(data.compose || '');
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

  /**
   * بازنویسیِ فایلِ باز.
   *
   * ── چرا اینجا و نه در «سناریوی تازه» ──
   *
   * آنجا از هیچ می‌سازد؛ اینجا روی چیزی کار می‌کند که جلوی چشم است. رایج‌ترین
   * خواسته هم همان است: «ساخته شد، ولی اصلاً وارد نمی‌شود.»
   */
  let revising = $state(false);
  let revision = $state(null);
  let wish = $state('');
  let entryPick = $state('');
  let showRevise = $state(false);
  /**
   * «انتظار» جدا از «بازنویسی».
   *
   * هر دو سناریو را عوض می‌کنند ولی دو پرسشِ متفاوت‌اند: آن یکی «این را
   * طورِ دیگری بنویس»، این یکی «بگو چه باید دیده شود». یکی کردنشان یعنی
   * کسی که فقط انتظار می‌خواهد، مجبور شود جمله‌ای برای مدل بنویسد.
   */
  let showExpect = $state(Boolean(data.openExpect));

  // پروژه از لایهٔ فضای کاری می‌آید، پس کشویی انتخاب پروژه اینجا لازم نیست.
  let project = $derived(data.project);
  let dirty = $derived(content !== original);

  /**
   * سناریوهایی که می‌شود مقدمهٔ ورود از آن‌ها برداشت.
   *
   * خودِ فایلِ باز بیرون است — سناریویی که جلوی خودش بنشیند بی‌معناست و
   * بی‌صدا دوبرابر می‌شود.
   */
  let entryCandidates = $derived(
    (project?.scenarios || []).filter((item) => item.kind === 'yaml' && item.steps && item.path !== data.relative)
  );
  let promoting = $state(false);

  /**
   * فایلِ باز پیش‌نویس است؟
   *
   * دو نشانه دارد و هر کدام کافی است: کلید `status: draft` در متن، یا
   * نشستن در پوشهٔ `_drafts/`. دومی مهم‌تر است — موتور فقط سطح بالا را
   * می‌خواند، پس فایلِ آنجا حتی با وضعیت approved هم اجرا نمی‌شود.
   */
  const isDraft = $derived(
    data.kind === 'scenario' &&
      Boolean(data.file) &&
      (/^status:s*drafts*$/m.test(content) || String(data.relative || '').startsWith('_drafts/'))
  );

  async function promote() {
    if (dirty && !confirm('تغییرات ذخیره‌نشده کنار گذاشته می‌شود. ادامه؟')) return;
    promoting = true;
    feedback = '';
    try {
      const response = await fetch('/api/scenarios/promote', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({ target: data.target, relative: data.relative }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'رسمی نشد');
      location.href = fileHref(payload.relative);
    } catch (cause) {
      feedback = cause.message;
      promoting = false;
    }
  }

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
        body: JSON.stringify({ target: data.target, text: intent, model, useSource, proposalId: data.proposalId }),
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

  /**
   * بازنویسی — با مدل، یا رایگان با مقدمهٔ ورود.
   *
   * چیزی ذخیره نمی‌کند: تفاوت برمی‌گردد و تا کسی «جایگزین کن» نزند،
   * ویرایشگر دست‌نخورده می‌ماند.
   */
  async function revise(mode) {
    revising = true;
    feedback = '';
    try {
      const response = await fetch('/api/scenarios/revise', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
        body: JSON.stringify({
          target: data.target,
          yaml: content,
          mode,
          instruction: wish,
          entry: entryPick,
          model,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'بازنویسی نشد');
      revision = payload;
    } catch (cause) {
      feedback = cause.message;
    } finally {
      revising = false;
    }
  }

  /**
   * جایگزینی فقط در ویرایشگر، نه روی دیسک.
   *
   * ذخیره همان دکمهٔ همیشگی است. اینجا یعنی «قبول دارم» و آنجا یعنی «بنویس»؛
   * یکی کردنشان یعنی تفاوتی که تازه دیده شد، بی یک قدمِ دیگر روی فایل بنشیند.
   */
  function applyRevision() {
    content = revision.yaml;
    feedback = 'در ویرایشگر جایگزین شد — هنوز ذخیره نشده.';
    revision = null;
    showRevise = false;
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
  <!--
    سناریو که نوشته شد، قدمِ بعد اجرای آن است — نه «بازگشت».

    «بازگشت به اجرا» همان مقصد را داشت ولی اسمش کار را نمی‌گفت. و قاعدهٔ
    خودِ پروژه این است: پیش‌نویسی که یک بار اجرا نشده، سناریو نیست.
  -->
  {#snippet actions()}
    <Button href={`/projects/${encodeURIComponent(data.target)}/run`}>اجرایش کن</Button>
    <Button href={`/projects/${encodeURIComponent(data.target)}/missions`} variant="ghost">چه باید آزمود</Button>
    <!--
      «حساب و چک» از منو برداشته شد و اینجا نشست: حساب و فایلِ آپلودی چیزی
      نیستند که آدم سراغشان برود، چیزی‌اند که **وسطِ نوشتنِ سناریو** لازم
      می‌شوند — همان‌جا که `{{account.…}}` یا `fixtures/…` می‌نویسد.
    -->
    <Button href={`/projects/${encodeURIComponent(data.target)}/config`} variant="ghost">حساب و فایل</Button>
  {/snippet}
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
    <div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><strong class="code-value block">{data.file?.relative || 'فایلی انتخاب نشده'}</strong><span class="text-xs text-muted-foreground">{data.file?.kind === 'target' ? 'پیکربندی هدف' : isDraft ? 'پیش‌نویس — تا رسمی نشود اجرا نمی‌شود' : 'سناریو'}</span></div><div class="flex items-center gap-2">
        {#if dirty}<span class="text-xs text-amber-600 dark:text-amber-300">ذخیره‌نشده</span>{/if}
        {#if isDraft}
          <!--
            رسمی کردن، یک دکمه.
            پیش‌تر باید هم `status` را دستی عوض می‌کردید هم فایل را از
            `_drafts/` بیرون می‌آوردید؛ و اگر دومی را فراموش می‌کردید، سناریو
            رسمی به نظر می‌رسید و هرگز اجرا نمی‌شد.
          -->
          <Button variant="secondary" onclick={promote} disabled={promoting}>
            {promoting ? 'در حال رسمی کردن…' : 'تأیید و رسمی کردن'}
          </Button>
        {/if}
        <!--
          بازنویسی فقط روی سناریو، نه روی کانفیگ هدف: آن یکی جاوااسکریپت است
          و مفسرِ سناریو نمی‌شناسدش.
        -->
        {#if data.kind === 'scenario' && data.file}
          <Button variant="outline" onclick={() => { showRevise = !showRevise; showExpect = false; }}>
            {showRevise ? 'بستنِ بازنویسی' : 'بازنویسی با هوش مصنوعی'}
          </Button>
          <!--
            سناریویی که انتظار ندارد، فقط می‌گوید «چیزی نشکست».
            این دکمه همان‌جایی است که آدم فایل را باز کرده و می‌بیند چه ندارد.
          -->
          <Button variant="outline" onclick={() => { showExpect = !showExpect; showRevise = false; }}>
            {showExpect ? 'بستنِ انتظارها' : 'انتظار اضافه کن'}
          </Button>
        {/if}
        <Button onclick={save} disabled={!dirty || saving || !data.file}>{saving ? 'در حال بررسی…' : 'اعتبارسنجی و ذخیره'}</Button>
      </div></div>

    {#if showExpect && data.kind === 'scenario' && data.file}
      <div class="border-b bg-muted/30 px-5 py-4">
        <ExpectPanel
          target={data.target}
          relative={data.file.relative}
          yaml={content}
          onapplied={(payload) => { revision = payload; showExpect = false; }}
        />
      </div>
    {/if}

    {#if showRevise && data.kind === 'scenario' && data.file}
      <div class="space-y-4 border-b bg-muted/30 px-5 py-4">
        <!--
          میان‌بُرِ رایگان اول می‌آید، عمداً.

          در بیشتر موردهای واقعی خواسته یکی است: «اصلاً وارد نمی‌شود». جوابش
          از قبل روی دیسک هست — سناریوی ورودی که خودتان دارید. گذاشتنِ مدل
          جلوی این یعنی پول دادن برای چیزی که یک copy است.
        -->
        {#if entryCandidates.length}
          <div class="space-y-1.5">
            <p class="text-sm font-medium">مقدمهٔ ورود را جلویش بگذار <span class="font-normal text-muted-foreground">— بی هوش مصنوعی</span></p>
            <div class="flex flex-wrap gap-2">
              <select bind:value={entryPick} class="h-9 min-w-52 flex-1 rounded-md border bg-background px-2 text-sm">
                <option value="">— سناریوی ورود را انتخاب کنید —</option>
                {#each entryCandidates as item (item.path)}
                  <option value={item.path}>{item.name}</option>
                {/each}
              </select>
              <Button variant="secondary" disabled={!entryPick || revising} onclick={() => revise('entry')}>
                گذاشتنِ مقدمه
              </Button>
            </div>
            <p class="text-[11px] leading-5 text-muted-foreground">
              قدم‌های آن سناریو عیناً جلوی این یکی می‌نشینند. رایگان و قطعی، و
              وضعیتِ سناریو دست‌نخورده می‌ماند.
            </p>
          </div>

          <div class="border-t"></div>
        {/if}

        <div class="space-y-1.5">
          <p class="text-sm font-medium">یا بگویید چه چیزش را عوض کنم</p>
          <Textarea
            bind:value={wish}
            rows="2"
            placeholder="مثلاً: اول با حساب crawler وارد شود، بعد سراغ آپلود برود"
          />
          <div class="flex flex-wrap items-end gap-2">
            <ModelPicker bind:value={model} disabled={revising} />
            <Button disabled={wish.trim().length < 4 || revising} onclick={() => revise('model')}>
              {revising ? 'در حال بازنویسی…' : 'بازنویسی کن'}
            </Button>
          </div>
          <p class="text-[11px] leading-5 text-muted-foreground">
            سناریوی فعلی و شناختِ پروژه به مدل می‌رود. سناریوی
            <code>approved</code> پس از بازنویسی به <code>draft</code> برمی‌گردد.
          </p>
        </div>

      </div>
    {/if}

    <!--
      تفاوت، بیرون از پنلِ بازنویسی.

      دو کار به آن می‌رسند — بازنویسی و افزودنِ انتظار — و پیش‌تر داخلِ یکی
      از آن دو نشسته بود. یعنی انتظارها که اضافه می‌شد، تفاوتش زیر پنلی
      پنهان می‌ماند که اصلاً باز نبود.
    -->
    {#if revision}
      <div class="border-b bg-muted/30 px-5 py-4">
          <!--
            تفاوت، نه متنِ تازه.

            اگر فقط نتیجه دیده شود، `expect`ی که خودتان نوشته‌اید می‌تواند
            بی‌صدا برود: فایلِ تازه هم معتبر است، هم اجرا می‌شود، و هم سبز
            تمام می‌شود — چون همان سنجشی که می‌شکست دیگر آنجا نیست.
          -->
          <div class="space-y-2 rounded-lg border bg-background p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-sm font-medium">
                <span class="text-emerald-600 dark:text-emerald-400">+{revision.added}</span>
                ·
                <span class="text-destructive">−{revision.removed}</span>
                خط
              </span>
              <div class="flex items-center gap-2">
                <Button size="sm" variant="ghost" onclick={() => { revision = null; }}>بی‌خیال</Button>
                <Button size="sm" onclick={applyRevision}>جایگزین کن</Button>
              </div>
            </div>

            {#if revision.changed}
              <p class="text-xs leading-6 text-muted-foreground">{revision.changed}</p>
            {/if}
            <!-- چه انتظارهایی اضافه شد — به جمله، نه به YAML -->
            {#if revision.expectationsAdded?.length}
              <ul class="space-y-0.5 text-xs leading-6">
                {#each revision.expectationsAdded as line (line)}<li>· {line}</li>{/each}
              </ul>
            {/if}
            {#if revision.notes}
              <p class="rounded-md bg-amber-500/10 p-2 text-xs leading-6">باید بازبینی شود: {revision.notes}</p>
            {/if}
            <!--
              افتادنِ توضیح‌ها باید **گفته** شود، نه فقط در تفاوت دیده شود.

              نخستین آزمایشِ واقعی روی `ورود.yml` نُه خطِ «چرا» را برداشت. آن
              خط‌ها در تفاوت قرمز بودند، ولی میانِ شصت خطِ دیگر گم می‌شدند.
            -->
            {#if revision.lostComments}
              <p class="rounded-md bg-amber-500/10 p-2 text-xs leading-6">
                {revision.lostComments} خطِ توضیح که میانِ قدم‌ها بود نمی‌ماند —
                YAML از نو ساخته می‌شود. سرصفحهٔ فایل نگه داشته شده؛ بقیه را
                اگر لازم‌اند از تفاوت بردارید.
              </p>
            {/if}
            {#if revision.demoted}
              <p class="text-xs leading-6 text-muted-foreground">
                این سناریو <code>approved</code> بود و در نسخهٔ تازه <code>draft</code> است.
              </p>
            {/if}

            <div dir="ltr" class="max-h-80 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-5">
              {#each revision.diff as row, index (index)}
                {#if row.kind === 'added'}
                  <div class="whitespace-pre-wrap bg-emerald-500/15 text-emerald-800 dark:text-emerald-200">+ {row.text}</div>
                {:else if row.kind === 'removed'}
                  <div class="whitespace-pre-wrap bg-destructive/15 text-destructive">− {row.text}</div>
                {:else}
                  <div class="whitespace-pre-wrap text-muted-foreground">&nbsp; {row.text}</div>
                {/if}
              {/each}
            </div>

            <p class="text-[11px] text-muted-foreground">
              «جایگزین کن» فقط ویرایشگر را عوض می‌کند؛ نوشتن روی دیسک با همان
              دکمهٔ «اعتبارسنجی و ذخیره» است.
            </p>
          </div>
      </div>
    {/if}
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
