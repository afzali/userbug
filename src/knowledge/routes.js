/**
 * کشفِ روت از روی سورس — با قاعده، نه با مدل.
 *
 * ── چرا مدل اینجا کاری ندارد ──
 *
 * فهرست روت یک **فکتِ ساختاری** است: در بیشترِ فریم‌ورک‌های امروزی مستقیم از
 * نامِ پوشه درمی‌آید. سپردنش به مدل یعنی پول دادن برای چیزی که `readdir`
 * جواب می‌دهد، و جوابی گرفتن که گاهی غلط است و هیچ‌وقت معلوم نیست کِی.
 *
 * مدل کارِ خودش را دارد و آن **معنا**ست: این صفحه برای چیست، این اپ چه
 * می‌کند. آن را در `digest.js` می‌پرسیم، روی همین فهرستِ قطعی.
 *
 * ── چرا همهٔ آشکارسازها اجرا می‌شوند، نه اولین موفق ──
 *
 * پروژهٔ واقعی مخلوط است: فرانتِ SvelteKit با بکِ Laravel، یا Next که هم
 * `app/` دارد هم `pages/`. انتخابِ «اولین آشکارسازی که چیزی پیدا کرد» یعنی
 * نیمی از اپ نادیده بماند، و آن نیمه دقیقاً همان‌جایی است که کسی تست ننوشته.
 *
 * تکراری‌ها بعداً در `normalizeDossier` با اعتماد حل می‌شوند، نه اینجا.
 */

/** فایل‌هایی که روت نیستند حتی وقتی سرِ جای روت می‌نشینند. */
const NEXT_SPECIAL = /^_(app|document|error|middleware)\./;

/**
 * قطعهٔ مسیر → قطعهٔ URL.
 *
 * `(group)` در SvelteKit و Next فقط برای چیدمان است و در آدرس نمی‌آید.
 * `[param]` می‌ماند: مسیرِ پویا را نمی‌شود حدس زد، و نوشتنِ یک مقدارِ ساختگی
 * به‌جایش یعنی پرونده آدرسی را ادعا کند که وجود ندارد.
 */
function segment(name) {
  if (/^\(.+\)$/.test(name)) return null;
  if (name === '@' || name.startsWith('@')) return null;
  return name;
}

function joinSegments(parts) {
  const kept = parts.map(segment).filter((part) => part !== null && part !== '');
  return '/' + kept.join('/');
}

/** آیا این مسیرِ نسبی زیرِ آن پوشه است؟ (با اسلشِ رو به جلو، مثل خروجی پیمایش) */
function under(relative, dir) {
  return relative === dir || relative.startsWith(dir + '/');
}

function withoutExtension(name) {
  return name.replace(/\.[^./]+$/, '');
}

/* ───────────────────────── آشکارسازها ───────────────────────── */

/**
 * SvelteKit — `src/routes/**\/+page.svelte`.
 *
 * فقط `+page.*` می‌آید، نه `+server.js`. «روت» در این پرونده یعنی صفحه‌ای که
 * کاربر می‌بیند؛ نقطهٔ API صفحه نیست و کاربرِ شبیه‌سازی‌شده رویش کلیک نمی‌کند.
 */
function sveltekit(files) {
  const routes = [];
  for (const file of files) {
    const match = file.match(/^(?:.*\/)?src\/routes\/(.*)\+page\.(svelte|js|ts)$/);
    if (!match) continue;
    const dirs = match[1].split('/').filter(Boolean);
    routes.push({ path: joinSegments(dirs), sourceFile: file });
  }
  return routes;
}

/** Next.js — روتر `app/`: هر `page.*` یک صفحه است. */
function nextApp(files) {
  const routes = [];
  for (const file of files) {
    const match = file.match(/^(?:.*\/)?app\/(.*)page\.(jsx?|tsx?|mjs)$/);
    if (!match) continue;
    const dirs = match[1].split('/').filter(Boolean);
    routes.push({ path: joinSegments(dirs), sourceFile: file });
  }
  return routes;
}

/** Next.js و Nuxt — روتر `pages/`: نامِ خودِ فایل هم بخشی از مسیر است. */
function pagesDirectory(files) {
  const routes = [];
  for (const file of files) {
    const match = file.match(/^(?:.*\/)?pages\/(.+)\.(jsx?|tsx?|vue)$/);
    if (!match) continue;

    const parts = match[1].split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (NEXT_SPECIAL.test(`${last}.`)) continue;
    // `pages/api/**` نقطهٔ API است نه صفحه
    if (parts[0] === 'api') continue;

    // `index` خودِ پوشه است، نه یک صفحهٔ زیرِ آن
    const dirs = last === 'index' ? parts.slice(0, -1) : parts;
    routes.push({ path: joinSegments(dirs), sourceFile: file });
  }
  return routes;
}

/**
 * روترِ اعلامی — React Router، Vue Router، و هر چیزی با `path: '...'`.
 *
 * ── چرا این یکی محتوای فایل را می‌خواند ──
 *
 * سه آشکارسازِ بالا از **نامِ فایل** می‌فهمند. اینجا مسیرها داده‌اند نه
 * ساختار، پس چاره‌ای جز خواندن نیست. برای همین فقط فایل‌هایی خوانده می‌شوند
 * که نامشان بوی روتر می‌دهد — وگرنه هر شیئی با کلیدِ `path` در کلِ پروژه
 * روتِ قلابی می‌ساخت.
 */
async function declarativeRouter(files, read) {
  const candidates = files.filter((file) =>
    /(^|\/)(routes?|router)(\.[jt]sx?|\/index\.[jt]sx?|\/[^/]+\.[jt]sx?)$/i.test(file)
  );

  const routes = [];
  for (const file of candidates.slice(0, 20)) {
    const content = await read(file);
    if (!content) continue;
    // بدون یکی از این نشانه‌ها، شیءِ `path` احتمالاً روت نیست
    if (!/createBrowserRouter|createRouter|RouterProvider|<Route|routes\s*[:=]/.test(content)) continue;

    for (const match of content.matchAll(/\bpath\s*:\s*['"`]([^'"`]{0,120})['"`]/g)) {
      const value = match[1].trim();
      if (!value || value === '*') continue;
      routes.push({ path: value.startsWith('/') ? value : `/${value}`, sourceFile: file });
    }
  }
  return routes;
}

/** Laravel و اسلیم — `Route::get('/x', …)` در `routes/*.php`. */
async function phpRoutes(files, read) {
  const candidates = files.filter((file) => /\.php$/.test(file) && (under(file, 'routes') || /\/routes\//.test(file)));

  const routes = [];
  for (const file of candidates.slice(0, 20)) {
    const content = await read(file);
    if (!content) continue;
    for (const match of content.matchAll(/Route::(get|any|match)\s*\(\s*['"]([^'"]{0,120})['"]/g)) {
      routes.push({ path: match[2], sourceFile: file });
    }
  }
  return routes;
}

/** پایتون — `path('x/', …)` جنگو و `@app.get('/x')` فلسک و FastAPI. */
async function pythonRoutes(files, read) {
  const candidates = files.filter((file) => /(urls|routes|views|main|app)\.py$/.test(file));

  const routes = [];
  for (const file of candidates.slice(0, 20)) {
    const content = await read(file);
    if (!content) continue;
    for (const match of content.matchAll(/\bpath\s*\(\s*['"]([^'"]{0,120})['"]/g)) {
      routes.push({ path: match[1], sourceFile: file });
    }
    for (const match of content.matchAll(/@\w+\.(?:route|get)\s*\(\s*['"]([^'"]{0,120})['"]/g)) {
      routes.push({ path: match[1], sourceFile: file });
    }
  }
  return routes;
}

export const DETECTORS = [
  { name: 'sveltekit', run: (files) => sveltekit(files) },
  { name: 'next-app', run: (files) => nextApp(files) },
  { name: 'pages-dir', run: (files) => pagesDirectory(files) },
  { name: 'declarative-router', run: declarativeRouter },
  { name: 'php', run: phpRoutes },
  { name: 'python', run: pythonRoutes },
];

/**
 * همهٔ روت‌هایی که از سورس درمی‌آیند.
 *
 * @param {object} o
 * @param {string[]} o.files مسیرهای نسبی، خروجی `listSourceFiles`
 * @param {(relative: string) => Promise<string>} o.read محتوای یک فایل، یا رشتهٔ خالی
 * @returns {Promise<{routes: object[], byDetector: Record<string, number>}>}
 */
export async function discoverRoutes({ files, read }) {
  const seen = new Map();
  const byDetector = {};

  for (const detector of DETECTORS) {
    let found = [];
    try {
      found = (await detector.run(files, read)) || [];
    } catch {
      // آشکارسازی که روی یک پروژهٔ عجیب بشکند نباید بقیه را ببرد
      found = [];
    }

    byDetector[detector.name] = found.length;
    for (const route of found) {
      const path = normalize(route.path);
      if (!path) continue;
      // نخستین آشکارسازی که مسیر را دید، منبعش می‌ماند: ترتیبِ DETECTORS از
      // مطمئن‌ترین (نامِ فایل) به حدسی‌ترین (grep) است.
      if (!seen.has(path)) seen.set(path, { path, sourceFile: route.sourceFile, by: 'source', detector: detector.name });
    }
  }

  return { routes: [...seen.values()], byDetector };
}

/** همان نرمال‌سازیِ schema، ولی بدون وابستگی حلقوی. */
function normalize(value) {
  let raw = String(value ?? '').trim();
  if (!raw) return '';
  raw = raw.split('#')[0].split('?')[0];
  if (!raw.startsWith('/')) raw = '/' + raw;
  if (raw.length > 1) raw = raw.replace(/\/+$/, '') || '/';
  return raw.replace(/\/{2,}/g, '/');
}

/* ───────────────────────── استک ───────────────────────── */

const FRAMEWORK_HINTS = [
  ['@sveltejs/kit', 'sveltekit'],
  ['next', 'next'],
  ['nuxt', 'nuxt'],
  ['@angular/core', 'angular'],
  ['react-router-dom', 'react'],
  ['react', 'react'],
  ['vue', 'vue'],
  ['svelte', 'svelte'],
];

const DB_HINTS = [
  [/sqlite|better-sqlite3|sql\.js/i, 'sqlite'],
  [/\bpg\b|postgres/i, 'postgres'],
  [/mysql|mariadb/i, 'mysql'],
  [/mongodb|mongoose/i, 'mongodb'],
];

/**
 * استک، از فایل‌های اعلامِ وابستگی.
 *
 * حدس نمی‌زند: چیزی که در `package.json` نباشد گزارش نمی‌شود. استکِ خالی از
 * استکِ غلط بهتر است، چون خالی بودنش یک پرسش می‌سازد و غلط بودنش یک فرض.
 */
export async function detectStack({ files, read }) {
  const stack = { framework: '', language: '', backend: '', db: '' };

  const packageFile = files.find((file) => file === 'package.json') || files.find((file) => /(^|\/)package\.json$/.test(file));
  if (packageFile) {
    let manifest = null;
    try {
      manifest = JSON.parse(await read(packageFile));
    } catch {
      manifest = null;
    }
    const deps = { ...(manifest?.dependencies || {}), ...(manifest?.devDependencies || {}) };
    const names = Object.keys(deps);

    for (const [key, name] of FRAMEWORK_HINTS) {
      if (names.includes(key)) {
        stack.framework = name;
        break;
      }
    }

    stack.language = names.includes('typescript') ? 'ts' : 'js';

    const blob = names.join(' ');
    for (const [pattern, name] of DB_HINTS) {
      if (pattern.test(blob)) {
        stack.db = name;
        break;
      }
    }
  }

  if (files.some((file) => file === 'composer.json' || /\.php$/.test(file))) stack.backend ||= 'php';
  if (files.some((file) => file === 'requirements.txt' || file === 'pyproject.toml')) stack.backend ||= 'python';
  if (files.some((file) => file === 'go.mod')) stack.backend ||= 'go';
  if (files.some((file) => file === 'Gemfile')) stack.backend ||= 'ruby';

  // فایل schema هم دربارهٔ دیتابیس حرف می‌زند، وقتی وابستگی‌ها ساکت‌اند
  if (!stack.db && files.some((file) => /\.sql$/.test(file))) stack.db = 'sql';

  return stack;
}
