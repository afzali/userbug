<script>
  /**
   * «اپِ من» — خانهٔ تازهٔ پروژه.
   *
   * ── چه چیزی عوض شد و چرا ──
   *
   * خانهٔ قبلی «اجرا» بود: نوارِ فرمان، یک فرمِ بیست‌کنترلی، و فهرستِ
   * اجراها. هر سه لازم‌اند و هیچ‌کدام جوابِ پرسشی نبودند که آدم صبح با آن
   * می‌آید — «سایتم چه دارد، کدامش را فراموش کرده‌ام، کجا شکست؟»
   *
   * آن فرم به «بررسی» رفت و نوارِ فرمان به هدر؛ اینجا حالا خودِ اپ است.
   *
   * ── چرا این صفحه نازک است ──
   *
   * درس گرفته از `FoundPanel` که ۱۰۳۹ خط شد: درخت یک کامپوننت است، پنل
   * یکی دیگر، و این فایل فقط حالت و اتصال.
   */
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import CapabilityTree from '$lib/components/CapabilityTree.svelte';
  import CapabilityPanel from '$lib/components/CapabilityPanel.svelte';
  import NewDiscovery from '$lib/components/NewDiscovery.svelte';
  import Onboarding from '$lib/components/Onboarding.svelte';
  import ReviewDialog from '$lib/components/ReviewDialog.svelte';
  import { goto } from '$app/navigation';
  import { formatNumber } from '$lib/format.js';
  import { onFinished, run, startJob } from '$lib/run-store.svelte.js';

  let { data } = $props();

  let target = $derived(data.target);
  let base = $derived(`/projects/${encodeURIComponent(target)}`);

  /**
   * درخت در حالتِ محلی زندگی می‌کند، چون ویرایش بلافاصله برش می‌گرداند.
   *
   * `invalidateAll` هم می‌شد، ولی آن کلِ صفحه را دوباره می‌خواند —
   * یعنی هر بار که یک عنوان عوض شود، `aggregateTriage` روی همهٔ اجراها
   * دوباره اجرا می‌شود.
   */
  // svelte-ignore state_referenced_locally
  let tree = $state(data.tree);
  $effect(() => {
    tree = data.tree;
  });

  let selected = $state('');
  let picked = $state(new Set());
  /**
   * کدام شاخه‌ها بازند.
   *
   * ── چرا پیش‌فرض «سطحِ اول باز» است و نه «همه» ──
   *
   * درختی که همه‌اش باز باشد، همان فهرستِ تختی است که از آن فرار کردیم.
   * و درختی که همه‌اش بسته باشد، از کاربر می‌خواهد قبل از دیدن، حدس بزند.
   * ریشه‌ها باز، بقیه بسته.
   */
  let open = $state(new Set());
  let seeded = false;
  $effect(() => {
    if (seeded || !tree.roots.length) return;
    seeded = true;
    open = new Set(tree.roots.flatMap((one) => [one.id, ...one.children.map((two) => two.id)]));
  });

  let busy = $state('');
  let error = $state('');

  /** فیلترها — همه روی یک محور: «چه چیزی نیاز به کار دارد». */
  let filter = $state('all');
  let search = $state('');

  /**
   * عددها **همان** فیلترند — نه یک ردیفِ دیگر کنارشان.
   *
   * ── چرا یکی شدند ──
   *
   * صفحه دو ردیفِ پشتِ سر هم داشت با همان چهار عدد: بالایی کارت‌های
   * درشتِ خوانا که **هیچ کاری نمی‌کردند**، پایینی دکمه‌های ریز که کار
   * می‌کردند. یعنی چشم اول به چیزی می‌رفت که کلیک‌پذیر نبود، و کاری که
   * لازم بود یک ردیف پایین‌تر با فونتِ کوچک‌تر تکرار می‌شد.
   *
   * «۸ بی‌سناریو» یک عدد است و یک کار. دو بار نوشتنش دو چیز نمی‌سازد.
   *
   * ── چرا صفر پنهان می‌شود ──
   *
   * فیلتری که همیشه صفر نتیجه بدهد فقط ردیف را بلند می‌کند — همان قاعده‌ای
   * که کشویی «مکان» در یافته‌ها رویش بنا شده. «همه» استثناست: همیشه هست،
   * چون راهِ برگشت است.
   */
  const FILTERS = [
    {
      key: 'all',
      label: 'قابلیت',
      count: () => data.total,
      note: () => `${formatNumber(data.pages)} صفحه`,
      always: true,
    },
    { key: 'blind', label: 'بی‌سناریو', count: () => data.blind, tone: 'amber' },
    { key: 'untried', label: 'هرگز باز نشده', count: () => data.untried, tone: 'amber' },
    /** فیچرِ حدسی سوالِ خودش را دارد: «واقعاً هست؟» — نه «چرا سناریو ندارد». */
    {
      key: 'guessed',
      label: 'فیچرِ حدسی',
      count: () => guessed,
      note: () => 'تأیید می‌کنید؟',
      tone: 'dashed',
    },
    { key: 'red', label: 'ایرادِ باز', count: () => data.open, tone: 'red' },
    { key: 'edited', label: 'ویرایش‌شده', count: () => edited },
  ];

  /** رنگِ هر کارت — و «انتخاب‌شده» همیشه پررنگ‌تر از رنگِ هشدار است. */
  const TONES = {
    amber: { box: 'border-amber-500/40', value: 'text-amber-600 dark:text-amber-400' },
    red: { box: 'border-destructive/40', value: 'text-destructive' },
    dashed: { box: 'border-dashed', value: '' },
  };

  /**
   * فیلتر و جستجو از آدرس هم می‌آیند.
   *
   * ── چرا لازم شد ──
   *
   * حکمِ پایانِ یک کشف می‌گوید «۶ جا دیدیم و هیچ آزمونی ندارند» و به
   * همین‌جا لینک می‌دهد. لینکی که صفحه را باز کند و کاربر دوباره باید
   * خودش فیلتر را بزند، همان کنترلِ بی‌اثری است که هیچ خطایی نمی‌دهد.
   *
   * و یک بار: بعدش دستِ کاربر است. `$effect`ی که هر بار از آدرس
   * بازنویسی کند، فیلترِ عوض‌شده را پس می‌گیرد.
   */
  let fromUrl = $state(false);
  $effect(() => {
    if (fromUrl) return;
    fromUrl = true;
    const wanted = page.url.searchParams.get('filter') || '';
    if (FILTERS.some((one) => one.key === wanted)) filter = wanted;
    search = page.url.searchParams.get('q') || '';

    /**
     * `?discover=tour` مودالِ کشف را باز می‌کند، روی همان راه.
     *
     * ── چرا لازم شد ──
     *
     * «گشت» تا دیروز صفحهٔ خودش را داشت و جاهای مختلفِ رابط به آن لینک
     * می‌دادند. صفحه رفت و کشف به مودالِ همین صفحه آمد، ولی لینک‌ها ماندند:
     * نوارِ فرمان به `/projects/<t>/tour` می‌رفت که **وجود ندارد** (۴۰۴)،
     * و سه جای `CrawlPanel` واژهٔ «گشت» را به خودِ همین صفحه لینک می‌دادند
     * — که یعنی «رسیدی، حالا خودت دکمه را پیدا کن».
     *
     * لینکی که کاربر را به صفحهٔ درست ببرد ولی کار را شروع نکند، نصفِ
     * وعده است. این پارامتر همان نصفِ دیگر را می‌دهد.
     */
    const way = page.url.searchParams.get('discover') || '';
    if (way) discovering = { kind: 'all', how: way };

    /**
     * `?review=1` همان دکمهٔ «▶ بررسی» را از بیرون می‌زند.
     *
     * کارتِ هر پروژه در فهرستِ اصلی دکمه‌ای به نامِ «بررسی» داشت که به
     * فهرستِ **اجراهای گذشته** می‌رفت — و کامنتِ خودش می‌گفت میان‌بر باید
     * «بیازمایدش» باشد. یعنی نیت درست نوشته شده بود و آدرس نمی‌رساندش.
     */
    if (page.url.searchParams.get('review') === '1') reviewing = { kind: 'all', nodes: tree.flat };
  });

  function matches(node) {
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      const hay = `${node.title} ${node.route} ${node.view} ${node.desc}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (filter === 'blind')
      return (
        !node.view &&
        !node.shelf &&
        /** فیچر سطلِ خودش را دارد؛ اینجا شمردنش عددِ «کارِ عقب‌افتاده» را باد می‌کند. */
        !node.feature &&
        !node.counts.scenarios.length &&
        !node.counts.planned?.length
      );
    if (filter === 'guessed') return Boolean(node.feature && node.confidence === 'suspected');
    if (filter === 'untried') return Boolean(node.view && node.actions && !node.tried);
    if (filter === 'red') return node.counts.openFindings > 0;
    if (filter === 'edited') return Boolean(node.edited);
    return true;
  }

  /**
   * فیلتر، بی شکستنِ درخت.
   *
   * ── چرا گرهِ ناهم‌خوان با فرزندِ هم‌خوان می‌ماند ──
   *
   * اگر فقط ردیف‌های هم‌خوان بمانند، «افزودن کتاب جدید» بی پدرش در ریشه
   * می‌نشیند و معلوم نیست کجای اپ است — یعنی همان تختیِ بی‌بافتار که این
   * صفحه برای رفعش ساخته شد. پس والد می‌ماند، کم‌رنگ.
   */
  function prune(nodes) {
    const out = [];
    for (const node of nodes) {
      const children = prune(node.children);
      const self = matches(node);
      if (!self && !children.length) continue;
      out.push({ ...node, children, dim: !self });
    }
    return out;
  }

  let filtering = $derived(filter !== 'all' || Boolean(search.trim()));
  let roots = $derived(filtering ? prune(tree.roots) : tree.roots);

  /** وقتی فیلتر هست، همه‌چیز باز است — وگرنه نتیجه زیرِ شاخهٔ بسته پنهان می‌ماند. */
  let openIds = $derived(
    filtering ? new Set(tree.flat.map((one) => one.id)) : open
  );

  let node = $derived(tree.flat.find((one) => one.id === selected) || null);

  /**
   * فیلتر که عوض شود، انتخابِ نامرئی هم می‌رود.
   *
   * ── چرا ──
   *
   * روی کارتِ «بی‌سناریو» می‌زدی، درخت به هشت ردیف می‌رسید، و پنلِ کناری
   * هنوز «خانه» را نشان می‌داد — گره‌ای که همان لحظه در فهرست نبود. یعنی
   * صفحه دو چیزِ ناهم‌خوان می‌گفت و هیچ‌کدام غلط نبود.
   */
  $effect(() => {
    if (!selected || !filtering) return;
    const visible = new Set(tree.flat.filter((one) => matches(one)).map((one) => one.id));
    if (!visible.has(selected)) selected = '';
  });

  /** گرهِ انتخاب‌شده و همهٔ فرزندانش — «کتاب‌ها» یعنی هرچه زیرش هست. */
  function withChildren(one, out = []) {
    out.push(one.id);
    for (const child of one.children || []) withChildren(child, out);
    return out;
  }

  function togglePick(one) {
    const ids = withChildren(one);
    const next = new Set(picked);
    if (ids.every((id) => next.has(id))) for (const id of ids) next.delete(id);
    else for (const id of ids) next.add(id);
    picked = next;
  }

  function toggleOpen(id) {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    open = next;
  }

  async function send(body) {
    const response = await fetch('/api/capabilities', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-userbug-request': '1' },
      body: JSON.stringify({ target, ...body }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'انجام نشد');
    tree = { roots: payload.roots, flat: payload.flat };
    return payload;
  }

  /**
   * چند بخش هنوز نامِ خوانا ندارد.
   *
   * فقط صفحه‌ها، نه نماها: نمای خزش نامش را از خودِ اپ دارد («افزودن کتاب
   * جدید») که بهتر از هرچیزی است که مدل بسازد — و رایگان.
   */
  let unnamed = $derived(
    tree.flat.filter((one) => !one.view && !one.shelf && one.titleBy === 'derived').length
  );
  let nameNote = $state('');


  /**
   * نام‌گذاری — و چرا نتیجه‌اش با عدد گزارش می‌شود.
   *
   * این تنها دکمهٔ این صفحه است که پول خرج می‌کند. کاربری که بزندش باید
   * ببیند چه خرید: چند نام ساخته شد، چند تا را مدل نتوانست، و با کدام
   * مدل. «انجام شد» برای کارِ پولی جوابِ کافی نیست.
   */
  async function nameThem(force) {
    busy = 'name';
    error = '';
    nameNote = '';
    try {
      const payload = await send({ action: 'name', force });
      const stats = payload.stats || {};
      nameNote = stats.pending
        ? `${formatNumber(stats.named)} نام ساخته شد از ${formatNumber(stats.pending)} بخش` +
          (stats.skipped ? ` · ${formatNumber(stats.skipped)} را مدل نتوانست` : '') +
          ` · ${formatNumber(stats.calls)} فراخوانی · ${payload.model || ''}`
        : 'همه از قبل نام داشتند — هیچ فراخوانی‌ای نشد.';
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  let featNote = $state('');

  /**
   * عددِ فیچرِ حدسی از درخت می‌آید، نه از لودر.
   *
   * ── چرا این یکی فرق دارد ──
   *
   * بقیهٔ عددهای بالای صفحه با هر تأیید تکان نمی‌خورند، ولی این یکی
   * دقیقاً کاری است که کاربر همین حالا دارد می‌کند: شش فیچرِ حدسی را
   * یکی‌یکی تأیید یا حذف می‌کند. اگر عدد سرِ جایش بماند، کاربر بعد از
   * تأییدِ آخری هم «۶ تأیید می‌کنید؟» می‌بیند — همان بی‌بازخوردی که با
   * پیش‌نویس‌ها یک بار دیدیم.
   *
   * و `send` درختِ تازه را برمی‌گرداند، پس این عدد همیشه درست است.
   */
  /**
   * چند بخش واقعاً آزموده شده — پایهٔ هر ادعای «سالم است».
   *
   * «اجرا شده» است، نه «سناریو دارد»: سناریویی که هنوز اجرا نشده هیچ
   * شهادتی دربارهٔ سلامت نمی‌دهد.
   */
  let tested = $derived(
    tree.flat.filter((one) => !one.view && !one.shelf && !one.feature && one.counts?.runs).length
  );

  let guessed = $derived(
    tree.flat.filter((one) => one.feature && one.confidence === 'suspected').length
  );

  /** نامی که خودِ آدم گذاشته — تا فیلترش هم عددی داشته باشد مثل بقیه. */
  let edited = $derived(tree.flat.filter((one) => one.edited).length);

  /**
   * همان گره‌هایی که فیلترِ «بی‌سناریو» نشان می‌دهد.
   *
   * تعریفش عمداً کپیِ شرطِ `matches` است و نه فراخوانی‌اش: آن تابع
   * جست‌وجوی متنی را هم اعمال می‌کند، و دکمهٔ بنر نباید به این بستگی داشته
   * باشد که کاربر همان لحظه چه در کادرِ جست‌وجو نوشته.
   */
  let blindNodes = $derived(
    tree.flat.filter(
      (one) =>
        !one.view &&
        !one.shelf &&
        !one.feature &&
        !one.counts.scenarios.length &&
        !one.counts.planned?.length
    )
  );

  /**
   * «این صفحه چه کارهایی دارد؟» — دومین و آخرین دکمهٔ پول‌خرج‌کنِ این صفحه.
   *
   * ── چرا برای هر صفحه جدا، و نه یک دکمه برای کلِ اپ ──
   *
   * نام‌گذاری یک فراخوانی برای کلِ درخت است چون هم‌خوانی می‌خواهد. اینجا
   * برعکس: ورودی فهرستِ کاملِ کنش‌های یک صفحه است و کلِ اپ یک‌جا یعنی
   * prompt‌ای که یا بریده می‌شود یا مدل در آن گم می‌شود.
   *
   * و هزینه‌اش این‌طور هم منصفانه‌تر است: کاربر روی صفحه‌ای می‌زند که
   * می‌داند فیچرِ پنهان دارد، نه روی صد صفحه‌ای که ندارد.
   */
  async function findFeats(one, force = false) {
    busy = 'feats';
    error = '';
    featNote = '';
    try {
      const payload = await send({ action: 'feats', id: one.id, force });
      const stats = payload.stats || {};
      featNote = stats.cached
        ? `این صفحه از قبل ${formatNumber(stats.kept)} فیچر داشت — هیچ فراخوانی‌ای نشد.`
        : stats.actions
          ? `${formatNumber(stats.kept)} فیچر از ${formatNumber(stats.actions)} کنش` +
            (stats.skipped ? ` · ${formatNumber(stats.skipped)} دور ریخته شد` : '') +
            ` · ${formatNumber(stats.calls)} فراخوانی · ${payload.model || ''}`
          : 'این صفحه هیچ کنشی در نقشه ندارد — اول یک کشف رویش لازم است.';
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  async function refresh() {
    busy = 'rebuild';
    error = '';
    try {
      await send({ action: 'rebuild' });
      /** عددهای بالای صفحه از لودر می‌آیند، پس آن هم باید تازه شود. */
      await invalidateAll();
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  /**
   * «بگرد اینجا» — کاوشِ هدف‌دار با دامنهٔ از پیش پر.
   *
   * ── چرا این دکمه روی گره ارزش دارد ──
   *
   * همین کار امروز هم ممکن است: صفحهٔ کشف، حالتِ محدود، و نوشتنِ دستیِ
   * مسیر. ولی کسی که در درخت روی «افزودن کتاب جدید» ایستاده، همین حالا
   * می‌داند کجا را می‌خواهد — و دوباره تایپ کردنش فقط جایی است که اشتباه
   * تایپی وارد می‌شود.
   */
  async function quest(one) {
    busy = 'quest';
    error = '';
    try {
      const goal = one.view
        ? `در ${one.route} نمای «${one.view}» را باز کن و همه‌اش را بررسی کن`
        : `${one.route} را بررسی کن`;
      const job = await startJob(target, { kind: 'quest', goal, from: '' });
      if (!job) throw new Error(run.error || 'شروع نشد');
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  async function runScenarios(names) {
    busy = 'run';
    error = '';
    try {
      const job = await startJob(target, { kind: 'run', only: names });
      if (!job) throw new Error(run.error || 'اجرا شروع نشد');
    } catch (cause) {
      error = cause.message;
    } finally {
      busy = '';
    }
  }

  /**
   * سناریوهای همهٔ گره‌های انتخاب‌شده، بی تکرار.
   *
   * ── چرا از درخت و نه از فهرستِ فایل‌ها ──
   *
   * تا امروز انتخابِ سناریو بر اساسِ **فایل** بود: تیکِ چند نام از یک
   * فهرستِ الفبایی. ولی چیزی که آدم در ذهن دارد بخشی از اپ است، نه
   * فایل — «کتاب‌ها را بررسی کن». این خط همان ترجمه است.
   */
  let pickedScenarios = $derived([
    ...new Set(
      picked.size
        ? tree.flat.filter((one) => picked.has(one.id)).flatMap((one) => one.counts.scenarios || [])
        : /** دامنهٔ خالی یعنی کلِ اپ — پس همهٔ سناریوهای شناخته‌شده. */
          tree.flat.flatMap((one) => one.counts.scenarios || [])
    ),
  ]);

  /* ─────────────────── دورِ بررسی — دکمهٔ مادر ─────────────────── */

  /**
   * دو دیالوگ، با دامنه به‌عنوان ورودی.
   *
   * `null` یعنی بسته. هر جایی که دامنه دارد — دکمهٔ بالا، تیک‌های درخت،
   * آیکونِ یک ردیف — فقط همین را پر می‌کند و دیالوگ خودش بقیه را می‌فهمد.
   */
  let reviewing = $state(null);
  let discovering = $state(null);

  /* ─────────────────── راهنمای بارِ اول ─────────────────── */

  /**
   * راهنما — و چرا حالا واقعاً صدا زده می‌شود.
   *
   * ── چه بود ──
   *
   * `Onboarding.svelte` ساخته شده بود، ۲۱۶ خط، و هیچ‌کجا `import` نشده
   * بود. کامنتِ خودش می‌گفت «دکمهٔ راهنما در سرصفحه می‌ماند» و چنین دکمه‌ای
   * در کلِ رابط وجود نداشت. یعنی تنها چیزی که کاربرِ بارِ اول می‌دید، یک
   * پاراگرافِ حالتِ خالی بود.
   *
   * ── چرا خودکار فقط روی درختِ خالی ──
   *
   * مودالی که روی پروژهٔ جاافتاده باز شود، چیزی است که آدم بی‌خواندن
   * می‌بندد — و دفعهٔ بعد هم می‌بندد. درختِ خالی تنها حالتی است که آدم
   * واقعاً نمی‌داند قدمِ بعدی چیست.
   *
   * ── چرا localStorage و نه فایل ──
   *
   * «این را خوانده‌ام» تصمیمِ همین مرورگر است، نه واقعیتی دربارهٔ پروژه.
   * نوشتنش در `knowledge/` یعنی پروندهٔ پروژه با چیزی که مالِ پروژه نیست
   * شلوغ شود. و خواندنش محصور است: مرورگری که `localStorage` را بسته
   * باشد باید صفحه را ببیند، نه خطا.
   */
  const HELP_KEY = $derived(`userbug-help-${target}`);
  let helping = $state(false);

  /**
   * تیک‌های راهنما از همان داده‌ای می‌آیند که صفحه نشان می‌دهد.
   *
   * «قضاوت‌شده» یعنی یافته‌ای هست و هیچ‌کدام باز نمانده — چون قدمِ چهارم
   * بستنِ حلقه است، نه دیدنِ فهرست. پروژه‌ای که هنوز هیچ یافته‌ای ندارد
   * این قدم را انجام نداده، فقط هنوز به آن نرسیده.
   */
  let progress = $derived({
    caps: tree.flat.length,
    scenarios: data.scenarios.length,
    runs: tested,
    judged: data.open === 0 && tested > 0,
  });

  $effect(() => {
    if (!target) return;
    let hidden = false;
    try {
      hidden = localStorage.getItem(HELP_KEY) === 'off';
    } catch {
      /** حالتِ ناشناس یا دادهٔ سایت بسته — راهنما را نشان بده، خطا نده. */
    }
    if (!hidden && !tree.flat.length) helping = true;
  });

  function rememberHelp(never) {
    if (!never) return;
    try {
      localStorage.setItem(HELP_KEY, 'off');
    } catch {
      /** ذخیره نشد؛ بدترین حالت این است که دفعهٔ بعد دوباره باز شود. */
    }
  }

</script>

<svelte:head><title>اپِ من — {data.project?.name || target}</title></svelte:head>

<!--
  دو فعل، دو دکمه — و هیچ‌کدام دیگر یک صفحه نیستند.

  ── چرا ──

  «کشف» و «بررسی» تا امروز ردیفِ منو بودند، پس کاربر باید اول به یک صفحه
  می‌رفت و بعد تازه کار را شروع می‌کرد. ولی هیچ‌کدام مقصد نیستند: کارند، و
  کار جایش کنارِ چیزی است که رویش انجام می‌شود.

  ترتیبشان هم عمدی است: اول باید بدانی اپ چه دارد، بعد بیازمایی‌اش.
-->
{#snippet actions()}
  <!--
    ⚙ — هرچه مرجع است، پشتِ یک دکمه.

    ── چرا سه ردیفِ منو اینجا جمع شدند ──

    «دانسته‌ها»، «دادهٔ آزمون» و «پیکربندی» هیچ‌کدام کارِ روزانه نیستند:
    سراغشان می‌روی با یک سؤالِ مشخص، شاید ماهی یک بار. ردیفِ منو بودنشان
    منو را به همان فهرستِ امکانات برمی‌گرداند که سه بار از آن فرار کردیم.
  -->
  <details class="relative">
    <summary class="flex h-8 cursor-pointer items-center rounded-md border px-2.5 text-sm hover:bg-accent">⚙</summary>
    <div class="absolute end-0 z-40 mt-1 w-56 rounded-lg border bg-card p-1 shadow-lg">
      <!--
        زیرنویسِ آخری «سناریوها و کانفیگِ اپ» بود، و «سناریوها» نامِ ردیفِ
        دیگری در منوست. دو نام برای دو چیز، یعنی کاربر باید حدس بزند کدام
        فهرست است و کدام ویرایشگر.
      -->
      {#each [['دانسته‌ها', `${base}/knowledge`, 'چه می‌دانیم و از کجا'], ['دادهٔ آزمون', `${base}/config`, 'حساب و فایلِ نمونه'], ['ویرایشگر و پیکربندی', `${base}/files`, 'متنِ یک سناریو، یا کانفیگِ اپ']] as [label, href, hint] (href)}
        <a {href} class="block rounded-md px-2.5 py-1.5 text-sm hover:bg-accent">
          {label}
          <span class="block text-[11px] text-muted-foreground">{hint}</span>
        </a>
      {/each}
    </div>
  </details>
  <Button variant="ghost" size="sm" disabled={!!busy} onclick={refresh} title="درخت را از شناختِ روی دیسک دوباره بساز">
    {busy === 'rebuild' ? 'در حال ساختن…' : '↻'}
  </Button>
  <!--
    «؟» کنارِ ⚙ می‌نشیند و نه در منو.

    راهنما مقصد نیست؛ چیزی است که وسطِ کار لازم می‌شود — همان استدلالی که
    «کشف» و «بررسی» را از منو به همین ردیف آورد.
  -->
  <Button variant="ghost" size="sm" onclick={() => { helping = true; }} title="چهار قدمِ کار با این ابزار، از صفر">؟ راهنما</Button>
  <Button variant="outline" size="sm" onclick={() => { discovering = { kind: 'all' }; }}>＋ کشف</Button>
  <Button size="sm" onclick={() => { reviewing = { kind: 'all', nodes: tree.flat }; }}>▶ بررسی</Button>
{/snippet}

<PageHeader
  eyebrow={`${data.project?.environment || ''} · ${data.project?.baseURL || ''}`}
  title="اپِ من"
  description="هر بخش و قابلیتی که از این اپ می‌شناسیم — و اینکه هر کدام چند سناریو دارد، چند بار آزموده شده، و چه ایرادی داشته."
  {actions}
/>

<Onboarding {target} {progress} bind:open={helping} onDismiss={rememberHelp} />

{#if discovering}
  <NewDiscovery
    {target}
    project={data.project}
    scope={discovering}
    scenarios={data.scenarios.map((one) => one.name)}
    accounts={data.accounts}
    hasProfile={data.hasProfile}
    mapEntry={data.mapEntry}
    onClose={() => { discovering = null; }}
    onStarted={(id) => goto(`${base}/discover/${encodeURIComponent(id)}`)}
  />
{/if}

{#if reviewing}
  <!--
    یک دیالوگ، سه در.

    دکمهٔ بالای صفحه، تیک‌های درخت، و آیکونِ هر ردیف — هر سه همین را باز
    می‌کنند و فقط `scope` را عوض می‌کنند. کاربر یک شکل یاد می‌گیرد.
  -->
  <ReviewDialog
    {target}
    scope={reviewing}
    onClose={() => { reviewing = null; }}
    onStarted={() => { reviewing = null; }}
    onDiscover={(scope) => { reviewing = null; discovering = scope; }}
  />
{/if}

{#if error}<p class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>{/if}

{#if !tree.flat.length}
  <!--
    حالتِ خالی، با راهِ بیرون.

    صفحه‌ای که تا داده نداری فقط بگوید «چیزی نیست»، راهِ ساختنِ آن داده را
    هم می‌بندد — همان ایرادی که صفحهٔ مأموریت‌ها یک بار گرفت.
  -->
  <section class="rounded-xl border bg-muted/30 p-6">
    <h2 class="text-base font-semibold">هنوز نمی‌دانیم این اپ چه دارد</h2>
    <p class="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
      این درخت از سه جا پر می‌شود و هر سه همین حالا در دسترس‌اند: گشتی که
      خودتان می‌روید، خزشی که ابزار می‌کند، و سورس که بی مرورگر خوانده
      می‌شود. هر کدام را که بروید، بخش‌ها و قابلیت‌ها همین‌جا ظاهر می‌شوند.
    </p>
    <div class="mt-4 flex flex-wrap gap-2">
      <Button size="sm" onclick={() => { discovering = { kind: 'all' }; }}>＋ کشف — گشت، خزش، یا سورس</Button>
    </div>
  </section>
{:else}
  <!--
    عددها بالای درخت — و هر کدام خودش فیلتر است.

    «چند بی‌سناریو» مهم‌ترینشان است و چیزی است که کاربر هنوز نمی‌داند باید
    بپرسد — همان نقشی که «بی‌انتظار» در صفحهٔ مأموریت‌ها داشت. تا دیروز
    این کارت‌ها فقط عدد نشان می‌دادند و ردیفِ دکمه‌های زیرشان همان عددها را
    دوباره می‌گفت؛ حالا یکی‌اند.
  -->
  <div class="mb-5 flex flex-wrap gap-2 text-sm">
    {#each FILTERS as item (item.key)}
      {@const count = item.count?.() ?? 0}
      {#if item.always || count}
        {@const tone = TONES[item.tone] || { box: '', value: '' }}
        {@const on = filter === item.key}
        <button
          type="button"
          class={`rounded-xl border px-4 py-2 text-start transition-colors ${
            on ? 'border-primary bg-accent' : `${tone.box} hover:bg-accent/50`
          }`}
          aria-pressed={on}
          onclick={() => { filter = on ? 'all' : item.key; }}
        >
          <span class="block text-[11px] text-muted-foreground">{item.label}</span>
          <span class={`text-lg font-bold ${on ? '' : tone.value}`}>
            {formatNumber(count)}{#if item.note}<span class="text-sm font-normal text-muted-foreground"> · {item.note()}</span>{/if}
          </span>
        </button>
      {/if}
    {/each}
  </div>

  <!--
    «سالم است» — و چرا باید صریح گفته شود.

    ── چه چیزی کم بود ──

    عددهای بالای صفحه فقط وقتی دیده می‌شوند که صفر نباشند. یعنی روی
    پروژه‌ای که همه‌چیزش درست است، این صفحه دربارهٔ سلامت **هیچ نمی‌گفت**
    — و سکوت را آدم «چیزی بررسی نشده» می‌خواند، نه «چیزی خراب نیست».
    کاربر صریح خواستش: «اگر نیست، چیزی بگه سالمه».

    ── و چرا کنارش می‌گوید چقدر آزموده نشده ──

    «سالم است» به‌تنهایی دروغِ خطرناکی است: روی پروژه‌ای با ۱۱ بخشِ
    بی‌سناریو، نبودِ ایراد یعنی چیزی را ندیده‌ایم، نه اینکه چیزی نیست.
    پس ادعا هرگز از شاهدش بزرگ‌تر نمی‌شود.
  -->
  {#if tested && !data.open}
    <p class="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm leading-7">
      <strong class="text-emerald-700 dark:text-emerald-400">
        هیچ ایرادِ بازی نیست
      </strong>
      — {formatNumber(tested)} بخش آزموده شده و آخرین بررسی‌شان سالم بود.
      {#if data.blind}
        <span class="block text-muted-foreground">
          ولی این فقط دربارهٔ همان‌هاست: {formatNumber(data.blind)} بخش هنوز
          هیچ سناریویی ندارد، پس دربارهٔ سلامتشان چیزی نمی‌دانیم.
        </span>
      {/if}
    </p>
  {/if}

  {#if data.blind}
    <!--
      بنرِ زرد، حالا با دکمه.

      ── چرا ──

      می‌گفت «روی هر کدام بزنید تا … سناریو بسازید یا بگویید ابزار برود
      بگردد» — یعنی کارِ درست را توضیح می‌داد و هیچ راهی به آن نمی‌داد.
      متنی که کاری را شرح بدهد و دکمه‌اش را نداشته باشد، کاربر را وادار
      می‌کند خودش دنبالش بگردد؛ و همان بخش‌ها هم که هشت‌تایند، یکی‌یکی
      گشتن حوصله می‌خواهد.

      دو دکمه، چون دو کارِ متفاوت‌اند: دیدنشان، و کشفِ همه‌شان با هم.
    -->
    <div class="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm leading-7">
      <p>
        <strong>{formatNumber(data.blind)} بخش هیچ سناریویی ندارد</strong> — نه
        نوشته‌شده، نه اجراشده. تا سناریو نداشته باشند، «سالم بودن»شان هیچ
        شاهدی ندارد.
        {#if data.planned}
          <span class="block text-sky-600 dark:text-sky-400">
            و {formatNumber(data.planned)} بخش سناریو دارد ولی هنوز یک بار هم
            اجرا نشده.
          </span>
        {/if}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        {#if filter !== 'blind'}
          <Button size="sm" variant="outline" onclick={() => { filter = 'blind'; }}>
            نشانم بده کدام‌ها
          </Button>
        {/if}
        <Button
          size="sm"
          disabled={!!busy || !blindNodes.length}
          onclick={() => { discovering = { kind: 'some', nodes: blindNodes }; }}
        >
          ＋ کشفِ هر {formatNumber(data.blind)} تا با هم
        </Button>
      </div>
    </div>
  {/if}

  <!--
    جست‌وجو تنها چیزی است که از ردیفِ فیلترها ماند.

    بقیه‌اش همان عددهای بالا بود، با فونتِ کوچک‌تر و بارِ دوم.
  -->
  <div class="mb-4 flex flex-wrap items-center gap-2">
    <Input bind:value={search} class="h-8 w-56" placeholder="جست‌وجوی نام یا مسیر…" />
    {#if filtering}
      <button
        type="button"
        class="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        onclick={() => { filter = 'all'; search = ''; }}
      >
        پاک کردن فیلتر
      </button>
    {/if}
  </div>

  <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <section class="min-w-0">
      <div class="rounded-xl border bg-card">
        {#if !roots.length}
          <p class="p-6 text-center text-sm text-muted-foreground">
            هیچ قابلیتی با این فیلتر نیست.
          </p>
        {:else}
          <CapabilityTree
            {roots}
            {selected}
            {picked}
            open={openIds}
            onPick={togglePick}
            onOpen={(one) => { selected = one.id; }}
            onToggle={toggleOpen}
            onReview={(one) => { reviewing = { kind: 'one', nodes: [one] }; }}
            onDiscover={(one) => { selected = one.id; discovering = { kind: 'some', nodes: [one] }; }}
          />
        {/if}
      </div>

      <!--
        نوارِ انتخاب — فقط دامنه، نه فرم.

        ── چرا فرمِ داخلی رفت ──

        اینجا یک فرمِ چهارتکه بود: اسم، توضیح، دو تیکِ روش. یعنی سومین
        جایی که «بررسی» شروع می‌شد، با شکلی متفاوت از دو تای دیگر.

        حالا همان دیالوگی باز می‌شود که دکمهٔ بالای صفحه و آیکونِ هر ردیف
        باز می‌کنند. یک شکل، سه در — نه سه شکل.
      -->
      <!--
        معنیِ نشان‌ها، یک بار زیرِ درخت.

        ── چرا لازم شد ──

        هر ردیف با `✓` یا `✗` یا `?` یا `◔` شروع می‌شود و معنی‌شان فقط
        در `title` است — یعنی روی لمس هیچ‌وقت دیده نمی‌شود، و روی دسکتاپ
        هم باید حدس بزنی که اصلاً چیزی برای hover کردن هست.
      -->
      <p class="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
        <span><span class="text-emerald-600 dark:text-emerald-400">✓</span> آخرین بررسی سالم بود</span>
        <span><span class="text-destructive">✗</span> ایرادِ باز دارد</span>
        <span><span class="text-sky-600 dark:text-sky-400">◔</span> سناریو دارد، هنوز اجرا نشده</span>
        <span><span class="text-amber-600 dark:text-amber-400">?</span> هنوز بررسی نشده</span>
        <span><span class="font-mono">＋</span> کشفِ همان‌جا · <span class="font-mono">▶</span> اجرای سناریوهایش</span>
      </p>

      {#if picked.size}
        <div class="sticky bottom-4 mt-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-lg">
          <span class="text-sm font-medium">{formatNumber(picked.size)} بخش انتخاب شده</span>
          <span class="text-[11px] text-muted-foreground">
            {pickedScenarios.length
              ? `${formatNumber(pickedScenarios.length)} سناریو رویشان`
              : 'هیچ سناریویی رویشان نیست'}
          </span>
          <div class="ms-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onclick={() => { discovering = { kind: 'some', nodes: tree.flat.filter((one) => picked.has(one.id)) }; }}
            >
              ＋ کشفِ این‌ها
            </Button>
            <Button
              size="sm"
              disabled={!!busy}
              onclick={() => { reviewing = { kind: 'some', nodes: tree.flat.filter((one) => picked.has(one.id)) }; }}
            >
              ▶ بررسیِ این‌ها
            </Button>
            <Button size="sm" variant="ghost" onclick={() => { picked = new Set(); }}>برداشتنِ تیک‌ها</Button>
          </div>
        </div>
      {/if}
    </section>

    <div class="min-w-0">
      {#if node}
        <CapabilityPanel
          {node}
          {target}
          busy={Boolean(busy) || run.submitting}
          onEdit={(patch) => send({ action: node.feature ? 'feature-edit' : 'edit', ...patch })}
          onReset={(id) =>
            node.feature ? send({ action: 'feature-edit', id, remove: true }) : send({ action: 'reset', id })}
          onFeats={findFeats}
          featNote={featNote}
          hasFeats={tree.flat.some((one) => one.feature && one.parent === node.id)}
          onClose={() => { selected = ''; }}
          onRun={runScenarios}
          onQuest={quest}
        />
      {:else}
        <!--
          جای خالیِ پنل، حالا می‌گوید میان‌برها کدام‌اند.

          متنِ قبلی فقط «روی هر ردیف بزنید» بود، در حالی که دو کارِ رایج
          یک کلیک فاصله دارند و کاربر باید کشفشان می‌کرد.
        -->
        <aside class="sticky top-20 rounded-xl border border-dashed p-6 text-xs leading-6 text-muted-foreground">
          <p class="text-center">
            روی هر ردیف بزنید تا ببینید چیست، چند سناریو دارد، چند بار آزموده
            شده، و چه ایرادی داشته.
          </p>
          <ul class="mt-3 space-y-1.5 border-t pt-3">
            <li><span class="font-mono text-foreground">＋</span> کنارِ ردیف — یا خودِ واژهٔ <span class="text-amber-600 dark:text-amber-400">بی‌سناریو</span> — کشف را روی همان‌جا باز می‌کند.</li>
            <li><span class="font-mono text-foreground">▶</span> سناریوهای همان ردیف را اجرا می‌کند.</li>
            <li>تیکِ چند ردیف، و بعد یک کشف یا بررسی روی همه‌شان با هم.</li>
          </ul>
        </aside>
      {/if}
    </div>
  </div>

  <!--
    نام‌های خوانا — تنها جای این صفحه که پول خرج می‌کند.

    ── چرا این نوار پایین است و نه بالا ──

    درخت بی آن کار می‌کند: ساختار، شمارش، و زاویه‌های آزمون همه رایگان‌اند.
    گذاشتنش بالای صفحه یعنی اولین چیزی که کاربر می‌بیند یک دکمهٔ پولی
    باشد — در حالی که شاید اصلاً لازمش نداشته باشد.

    ── و چرا وقتی همه نام دارند ناپدید نمی‌شود ──

    `--force` راهِ اصلاحِ نام‌های بدِ مدل است. دکمه‌ای که بعد از نخستین
    استفاده ناپدید شود، آن راه را هم می‌بندد.
  -->
  <div class="mt-6 rounded-xl border bg-muted/20 p-3">
    <div class="flex flex-wrap items-center gap-2">
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium">
          نام‌ها خام‌اند؟
          {#if unnamed}
            <span class="text-muted-foreground">
              ({formatNumber(unnamed)} بخش هنوز نامِ خوانا ندارد)
            </span>
          {/if}
        </p>
        <p class="text-[11px] leading-5 text-muted-foreground">
          کلِ درخت — ساختار، شمارش، و زاویه‌های آزمون — بی هیچ فراخوانی مدل
          ساخته شده. فقط <strong>نام</strong> است که رایگان درنمی‌آید:
          <code class="font-mono">contents</code> درست است ولی چیزی نمی‌گوید.
          این دکمه <strong>یک</strong> فراخوانی می‌زند و نتیجه کش می‌شود.
        </p>
      </div>
      <!--
        ── چرا وقتی همه نام دارند `force` می‌رود ──

        دکمه در آن حالت «دوباره نام‌گذاری کن» می‌گوید، و بی `force` هیچ
        گرهی نامزد نیست: صفر فراخوانی، و پیامِ «همه از قبل نام داشتند».
        یعنی دکمه‌ای که دقیقاً وقتی خوانده می‌شود که کاربر از نام‌ها راضی
        نیست، هیچ کاری نمی‌کند — و او فکر می‌کند خراب است.
      -->
      <Button size="sm" variant="outline" disabled={!!busy} onclick={() => nameThem(!unnamed)}>
        {busy === 'name' ? 'در حال نام‌گذاری…' : unnamed ? 'نام‌های خوانا بساز' : 'دوباره نام‌گذاری کن'}
      </Button>
    </div>

    {#if nameNote}<p class="mt-2 text-[11px] text-muted-foreground">{nameNote}</p>{/if}

    <p class="mt-2 border-t pt-2 text-[11px] leading-5 text-muted-foreground">
      نامی که مدل می‌سازد <Badge variant="outline" class="text-[10px]">by: model</Badge>
      است و با نام‌گذاریِ دوباره عوض می‌شود. نامی که <strong>خودتان</strong> بگذارید
      <Badge variant="secondary" class="text-[10px]">by: user</Badge>
      است و هیچ‌چیز — نه تازه‌سازی، نه مدل — عوضش نمی‌کند.
    </p>
  </div>
{/if}
