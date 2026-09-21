/**
 * «کد عوض شد — کدام تست‌ها باید دوباره فکر شوند؟»
 *
 * ── چرا این فایل ارزشمندترین اتصالِ پروژه است ──
 *
 * سه چیز از قبل بود و هیچ‌وقت به هم وصل نشده بودند:
 *
 *   git      می‌گوید کدام فایل‌ها عوض شدند
 *   پرونده   می‌گوید هر فایل کدام صفحه را می‌سازد (`route.sourceFile`)
 *   propose  می‌گوید کدام سناریو کدام صفحه را لمس می‌کند
 *
 * زنجیره کامل بود و فقط بسته نشده بود. با بستنش، «توسعه‌دهنده کد را عوض
 * کرد» تبدیل می‌شود به فهرستی کوتاه و دقیق، به‌جای «همه را از نو اجرا کن».
 *
 * ── چرا مهم‌ترین خروجی این فایل، چیزی است که *پیدا نشد* ──
 *
 * فایلی که به هیچ صفحه‌ای نگاشت نشود (`src/lib/db/database.js`) خطرناک‌ترین
 * حالت است: عوض شده، به همه‌جا اثر دارد، و اگر بی‌صدا رد شود گزارش می‌گوید
 * «چیزی لازم نیست» — که دروغِ آرام است.
 *
 * پس `unmapped` هم‌ارزِ `scenarios` برگردانده می‌شود، نه به‌عنوان زیرنویس.
 * همان قاعدهٔ «عددی که راست می‌گوید ولی معنایش غلط است، از عددِ غلط
 * خطرناک‌تر است».
 *
 * ── چرا تست را بازنویسی نمی‌کند ──
 *
 * وسوسه‌اش هست: مدل می‌تواند سناریو را با کدِ تازه هماهنگ کند. ولی آن یعنی
 * مدل می‌تواند انتظارِ درست را با **باگِ امروز** جایگزین کند — تست سبز
 * می‌شود و باگ می‌ماند. این فایل فهرست می‌دهد؛ تصمیم با آدم است.
 */
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { readDossier } from './store.js';

const run = promisify(execFile);

/**
 * مرجعِ مقایسه، اعتبارسنجی‌شده.
 *
 * این رشته به `git` می‌رود. با اینکه `execFile` است و پوسته‌ای در کار نیست،
 * یک `--upload-pack=...` هم می‌تواند دستور را به چیز دیگری تبدیل کند. پس
 * هرچه با `-` شروع شود رد می‌شود.
 */
function assertRef(value) {
  const ref = String(value ?? 'HEAD').trim() || 'HEAD';
  if (!/^[\w][\w./~^@{}-]*$/.test(ref) || ref.includes('..')) {
    throw new Error(`مرجع گیت نامعتبر است: ${ref}`);
  }
  return ref;
}

/**
 * فایل‌های عوض‌شده نسبت به یک مرجع.
 *
 * پیش‌فرض `HEAD` است، یعنی «هرچه از آخرین کامیت دست خورده» — شاملِ ذخیره‌نشده
 * در ایندکس. این همان حالتی است که توسعه‌دهنده در آن می‌پرسد «حالا چه چیزی را
 * باید تست کنم؟»
 *
 * `--` هم گذاشته می‌شود تا مرجعی که اتفاقاً نامِ فایل هم هست، ابهام نسازد.
 */
/**
 * `core.quotepath=false` — وگرنه نامِ فارسی اوکتالِ فرارشده می‌شود.
 *
 * ── چه چیزی بی این می‌شکست ──
 *
 * گیت پیش‌فرض هر بایتِ غیرِ اسکی را `\331\210` می‌نویسد و کلِ نام را در
 * گیومه می‌گذارد. نتیجه دو خرابی هم‌زمان بود: گزارش ناخوانا می‌شد، و آن
 * رشته با `route.sourceFile` هرگز جور درنمی‌آمد — پس فایلی که واقعاً عوض
 * شده بود، «به هیچ صفحه‌ای نگاشت نشد» خوانده می‌شد.
 *
 * دومی بدتر است: گزارش عددِ درست می‌داد با معنای غلط.
 */
const GIT = (root, args) => ['-c', 'core.quotepath=false', '-C', root, ...args];

export async function changedFiles({ root, base = 'HEAD' } = {}) {
  const ref = assertRef(base);
  try {
    const { stdout } = await run('git', GIT(root, ['diff', '--name-only', ref, '--']), {
      maxBuffer: 8 * 1024 * 1024,
    });
    const tracked = stdout.split('\n').map((line) => line.trim()).filter(Boolean);

    /**
     * فایلِ تازه‌ساخته‌شده هم تغییر است.
     *
     * `git diff` فایلِ untracked را نمی‌بیند. مسیرِ تازه‌ای که هنوز
     * `git add` نشده، دقیقاً همان چیزی است که هیچ سناریویی ندارد — یعنی
     * جا انداختنش بدترین جا انداختن است.
     */
    const { stdout: untracked } = await run(
      'git',
      GIT(root, ['ls-files', '--others', '--exclude-standard']),
      { maxBuffer: 8 * 1024 * 1024 }
    );

    return [...new Set([...tracked, ...untracked.split('\n').map((l) => l.trim()).filter(Boolean)])].sort();
  } catch (cause) {
    const message = String(cause?.stderr || cause?.message || cause);
    if (/not a git repository/i.test(message)) {
      throw Object.assign(new Error(`سورسِ این پروژه مخزن گیت نیست: ${root}`), { code: 'ENOGIT' });
    }
    if (/unknown revision|bad revision/i.test(message)) {
      throw Object.assign(new Error(`این مرجع در مخزن نیست: ${base}`), { code: 'EBADREF' });
    }
    throw cause;
  }
}

const norm = (value) => String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');

/**
 * فایل → صفحه‌ها.
 *
 * دو قاعده، به ترتیبِ اطمینان:
 *
 *   ۱. **همان فایل.** `route.sourceFile` دقیقاً همین است. قطعی.
 *   ۲. **همان پوشه.** در چارچوب‌های مسیر‌محور (SvelteKit، Next، Nuxt) صفحه
 *      از چند فایلِ هم‌پوشه ساخته می‌شود: `+page.svelte` و `+page.server.js`
 *      و `+layout.js`. پرونده فقط یکی‌شان را ثبت کرده، ولی عوض شدنِ هرکدام
 *      همان صفحه را عوض می‌کند.
 *
 * قاعدهٔ دوم حدس است، پس در خروجی `by: 'directory'` می‌خورد. حدسی که خودش را
 * حدس ننامد، بعداً قطعی خوانده می‌شود.
 */
function routesForFile(file, routes) {
  const target = norm(file);
  const dir = path.posix.dirname(target);

  const exact = [];
  const nearby = [];

  for (const route of routes) {
    const source = norm(route.sourceFile);
    if (!source) continue;
    if (source === target) exact.push({ path: route.path, by: 'file' });
    else if (path.posix.dirname(source) === dir) nearby.push({ path: route.path, by: 'directory' });
  }

  return exact.length ? exact : nearby;
}

/**
 * گزارشِ اثر.
 *
 * @param {string} target کلید پروژه
 * @param {{root: string, base?: string}} options ریشهٔ سورس و مرجع مقایسه
 */
export async function impactOf(target, { root, roots, base = 'HEAD', specs = [] } = {}) {
  /**
   * هر ریشه مخزنِ خودش را دارد.
   *
   * فرانت و بک می‌توانند دو مخزنِ مستقل باشند با تاریخچه‌های جدا. یک
   * `git diff` روی یکی، تغییرِ آن یکی را اصلاً نمی‌بیند — و گزارش می‌گفت
   * «چیزی عوض نشده» در حالی که نیمی از اپ بازنویسی شده بود.
   *
   * پس گیت به‌ازای هر ریشه اجرا می‌شود و مسیرها همان پیشوندی را می‌گیرند
   * که `listAllSourceFiles` می‌دهد، تا با `route.sourceFile` جور دربیایند.
   */
  const all = roots?.length ? roots : root ? [{ name: '', root }] : [];
  if (!all.length) {
    throw Object.assign(new Error('این پروژه سورسی اعلام نکرده؛ بدون سورس، اثرِ تغییر معلوم نیست.'), {
      code: 'ENOSOURCE',
    });
  }

  const files = [];
  for (const entry of all) {
    const found = await changedFiles({ root: entry.root, base });
    for (const file of found) files.push(entry.name ? `${entry.name}/${file}` : file);
  }
  files.sort();
  const dossier = readDossier(target);
  const routes = dossier.routes || [];

  /**
   * تست‌ها از پوشهٔ خودِ پروژه می‌آیند، نه از YAMLِ این مخزن.
   *
   * تا دیروز `loadScenarios` بود و هر سناریو ساختاری داشت که
   * `routesTouchedBy` در آن دنبالِ فعلِ `go` می‌گشت. حالا `listSpecs`
   * مسیرها را از `page.goto(…)` درمی‌آورد و همان شکل را می‌دهد، پس منطقِ
   * زیر دست نخورد.
   */
  const scenarios = Array.isArray(specs) ? specs : [];
  const touchedBy = new Map(scenarios.map((item) => [item.id, item.routes ?? new Set()]));

  const mapped = [];
  const unmapped = [];
  const hitRoutes = new Map();

  for (const file of files) {
    const found = routesForFile(file, routes);
    if (!found.length) {
      unmapped.push(file);
      continue;
    }
    mapped.push({ file, routes: found });
    for (const item of found) {
      if (!hitRoutes.has(item.path)) hitRoutes.set(item.path, { path: item.path, by: item.by, files: [] });
      hitRoutes.get(item.path).files.push(file);
    }
  }

  /**
   * صفحهٔ گذرگاه — صفحه‌ای که تقریباً هر سناریویی از آن رد می‌شود.
   *
   * ── چرا لازم شد ──
   *
   * نخستین اجرای واقعی، ۵۹ فایلِ عوض‌شدهٔ نپی را به سه صفحه نگاشت و از آن سه،
   * `/` هر نوزده سناریو را کشید تو. جوابی که همه‌چیز را برمی‌گرداند، همان
   * «همه را از نو اجرا کن» است با ظاهرِ گزارش — و دقیقاً چیزی که این فایل
   * برای نبودنش نوشته شد.
   *
   * `/` واقعاً در آن سناریوها هست؛ عدد دروغ نمی‌گوید. ولی به‌عنوان **شاهد**
   * بی‌ارزش است، چون همه‌جا هست. پس علامت می‌خورد و رتبه‌بندی کنارش
   * می‌گذارد، نه اینکه حذف شود — حذفش یعنی تغییرِ واقعیِ صفحهٔ اصلی هم گم
   * شود.
   */
  const HUB_RATIO = 0.6;
  const hubs = new Set();
  if (scenarios.length >= 4) {
    for (const routePath of hitRoutes.keys()) {
      const users = scenarios.filter((item) => (touchedBy.get(item.id) || new Set()).has(routePath)).length;
      if (users / scenarios.length >= HUB_RATIO) hubs.add(routePath);
    }
  }
  for (const item of hitRoutes.values()) if (hubs.has(item.path)) item.hub = true;

  /* سناریوهایی که یکی از این صفحه‌ها را لمس می‌کنند. */
  const affected = [];
  const covered = new Set();
  for (const scenario of scenarios) {
    const touched = touchedBy.get(scenario.id) || new Set();
    const because = [...hitRoutes.keys()].filter((routePath) => touched.has(routePath));
    if (!because.length) continue;
    for (const routePath of because) covered.add(routePath);

    const specific = because.filter((routePath) => !hubs.has(routePath));
    affected.push({
      id: scenario.id,
      name: scenario.name,
      file: path.basename(scenario.file),
      because,
      /** فقط از راهِ صفحهٔ گذرگاه رسیده — شاهدِ ضعیف. */
      weak: specific.length === 0,
      specific,
    });
  }

  // شاهدِ قوی بالا. مرتب‌سازی بخشی از جواب است، نه آرایش.
  affected.sort((a, b) => b.specific.length - a.specific.length || a.name.localeCompare(b.name, 'fa'));

  /**
   * صفحه‌ای که کدش عوض شده و هیچ سناریویی ندارد.
   *
   * این خطرناک‌ترین ردیفِ گزارش است: تغییر هست، آزمونش نیست، و اجرای «همهٔ
   * تست‌ها» هم پیدایش نمی‌کند چون تستی برایش وجود ندارد.
   */
  const uncovered = [...hitRoutes.values()].filter((item) => !covered.has(item.path));

  return {
    base,
    root: all[0].root,
    roots: all.map((item) => item.name).filter(Boolean),
    changed: files.length,
    mapped,
    unmapped,
    routes: [...hitRoutes.values()],
    scenarios: affected,
    uncovered,
  };
}
