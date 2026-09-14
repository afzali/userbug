/**
 * «چه چیزی در سورس هست که به آن نرسیده‌ایم» — برای بک‌اند.
 *
 * ── چرا این حفره بزرگ بود ──
 *
 * روی نپی اندازه گرفتیم: از ۷۸۸ فایلِ سورس، **۱۱ روت** درمی‌آمد و هر یازده
 * تا از فرانت. آشکارسازِ php صفر چیز پیدا کرده بود — با اینکه خودِ اسکنر
 * می‌گفت `backend: php`. یعنی کلِ API بیرونِ نقشهٔ پوشش بود.
 *
 * ── و چرا سمتِ دیگرِ تفریق هم نبود ──
 *
 * `observe/client.js` از کنارِ **هر** فراخوانیِ API رد می‌شد و این خط را
 * داشت:
 *
 *     if (status < 400) return;
 *
 * یعنی هر تماسِ موفق دور ریخته می‌شد — دقیقاً همان‌هایی که ثابت می‌کنند
 * کجا را آزموده‌ایم. پوشش یک تفریق است و هر دو طرفش گم بود.
 *
 * ── چرا اینجا هیچ مدلی نیست ──
 *
 * هر دو طرف حقیقتِ نحوی‌اند: مسیرِ فایل و رشتهٔ URL. حدس لازم ندارند، و
 * همان قاعدهٔ همیشگی است — پول ندهیم برای چیزی که `readdir` جواب می‌دهد.
 */

/** پارامترِ مسیر → جای‌نگهدار، تا `/books/12` و `/books/13` یکی شوند. */
export function normalizePath(input) {
  let text = String(input ?? '').trim();
  if (!text) return '';

  // آدرسِ کامل → فقط مسیر؛ کوئری و لنگر بیرون
  try {
    if (/^https?:\/\//i.test(text)) text = new URL(text).pathname;
  } catch {
    // آدرسِ خراب؛ همان رشته را ادامه می‌دهیم
  }
  text = text.split('?')[0].split('#')[0];
  if (!text.startsWith('/')) text = '/' + text;

  return (
    text
      .replace(/\/+$/, '')
      .split('/')
      .map((part) => {
        if (!part) return part;
        // عدد، uuid، یا هشِ بلند: شناسه‌اند نه بخشی از مسیر
        if (/^\d+$/.test(part)) return ':id';
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part)) return ':id';
        if (/^[0-9a-f]{16,}$/i.test(part)) return ':id';
        // `[id]` و `{id}` و `:id` همه یک چیزند
        if (/^[[{:].+[\]}]?$/.test(part)) return ':id';
        return part;
      })
      .join('/') || '/'
  );
}

/**
 * endpointهای بک‌اند، از سورس.
 *
 * سه شکلِ رایج، و هر سه نحوی‌اند:
 *
 *   ۱. **مسیرِ فایل** — PHP و بسیاری از فریم‌ورک‌های ساده: هر فایلِ `.php`
 *      زیرِ ریشهٔ عمومی، خودش یک endpoint است.
 *   ۲. **ثبتِ صریح** — `$app->get('/x')`, `Route::post('/x')`,
 *      `router.put('/x')`, `@app.route('/x')`.
 *   ۳. **هندلرِ مسیرمحور** — `+server.js` در SvelteKit، `route.ts` در Next.
 *
 * @param {object} o
 * @param {string[]} o.files مسیرهای نسبی، خروجی `listAllSourceFiles`
 * @param {(relative: string) => Promise<string>} o.read
 * @returns {Promise<{endpoints: object[], byDetector: Record<string, number>}>}
 */
export async function discoverEndpoints({ files = [], read }) {
  const found = new Map();
  const byDetector = {};

  const add = (detector, path, sourceFile, methods = []) => {
    const key = normalizePath(path);
    if (!key || key === '/') return;
    const previous = found.get(key);
    if (previous) {
      for (const method of methods) if (!previous.methods.includes(method)) previous.methods.push(method);
      return;
    }
    found.set(key, { path: key, sourceFile, methods: [...new Set(methods)], by: detector });
    byDetector[detector] = (byDetector[detector] || 0) + 1;
  };

  /* ── ۱. فایل‌محور ── */
  for (const file of files) {
    const match = file.match(/(?:^|\/)(?:public|www|htdocs|api)\/(.+\.php)$/i);
    if (!match) continue;
    // `index.php` خودش مسیرِ پوشه است، نه یک مسیرِ جدا
    const relative = match[1].replace(/(?:^|\/)index\.php$/i, '');
    add('php-file', '/' + relative, file, []);
  }

  /* ── ۲ و ۳. محتوایی ── */
  for (const file of files) {
    if (!/\.(php|js|mjs|ts|py|rb)$/i.test(file)) continue;
    /**
     * فایلِ آزمون، اپ نیست.
     *
     * نخستین اجرای واقعی روی نپی نُه «endpoint» داد و هر نُه تا از فایل‌های
     * تستِ خودِ نپی آمده بودند: `/p1`، `/books/b1`، `/old-book-1`. یعنی
     * گزارشِ پوششی که کاملاً دربارهٔ چیزی بود که اصلاً سرو نمی‌شود.
     */
    if (/(?:^|\/)(?:tests?|__tests__|spec|e2e|fixtures?)\//i.test(file)) continue;
    if (/\.(?:test|spec)\.[jt]s$/i.test(file)) continue;

    /**
     * `+server.js` و `route.ts` مسیرشان از پوشه می‌آید، نه از متن.
     *
     * و فعل‌ها از خودِ فایل: `export async function POST` یعنی این مسیر
     * POST می‌پذیرد. همین یک خط، «کدام فعل را نیازموده‌ایم» را ممکن می‌کند.
     */
    const handler = file.match(/^(?:.*?\/)?(?:src\/)?routes\/(.*)\/\+server\.[jt]s$/) ||
      file.match(/^(?:.*?\/)?app\/(.*)\/route\.[jt]s$/);
    if (handler) {
      const body = (await read(file)) || '';
      const methods = [...body.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)/g)].map(
        (one) => one[1]
      );
      add('http-handler', '/' + handler[1], file, methods);
      continue;
    }

    const body = (await read(file)) || '';
    if (!body) continue;

    for (const one of body.matchAll(
      /\b(?:\$?\w+)\s*(?:->|::|\.)\s*(get|post|put|patch|delete|any)\s*\(\s*['"]([^'"]{1,160})['"]/gi
    )) {
      add('registered', one[2], file, [one[1].toUpperCase()]);
    }

    for (const one of body.matchAll(/@\w+\.(?:route|get|post|put|delete)\s*\(\s*['"]([^'"]{1,160})['"]/g)) {
      add('registered', one[1], file, []);
    }

    /**
     * ۴. `switch` روی «فعل و مسیر».
     *
     * ── چرا این شکل جدا لازم بود ──
     *
     * رایج‌ترین شکلِ APIِ بی‌فریم‌ورک است و نپی هم همین است:
     *
     *     switch ("$method $path") { case 'GET /health': ...
     *
     * هیچ‌کدام از سه آشکارسازِ دیگر نمی‌دیدش. نتیجه‌اش این بود که کلِ بک‌اند
     * — بیست‌ویک endpoint — نامرئی بماند، در حالی که اسکنر می‌گفت
     * `backend: php`. یعنی ابزار می‌دانست بک‌اندی هست و هیچ‌چیزش را نمی‌دید.
     */
    for (const one of body.matchAll(
      /case\s*['"](GET|POST|PUT|PATCH|DELETE)\s+(\/[^'"]{0,160})['"]\s*:/gi
    )) {
      add('switch-case', one[2], file, [one[1].toUpperCase()]);
    }
  }

  return { endpoints: [...found.values()], byDetector };
}

/**
 * تفریق: چه چیزی هست و صدایش نزده‌ایم.
 *
 * ── چرا «نزده‌ایم» را از تماس‌های واقعی می‌گیریم، نه از سناریوها ──
 *
 * سناریو می‌گوید چه قصد داشتیم؛ تماس می‌گوید چه شد. صفحه‌ای که پنج endpoint
 * صدا می‌زند، با یک سناریو پوشانده می‌شود ولی پوششش پنج تاست — و برعکس،
 * سناریویی که وسط بشکند هیچ‌کدام را نزده.
 *
 * @param {object[]} endpoints خروجی `discoverEndpoints`
 * @param {{method?: string, path: string}[]} calls تماس‌های ثبت‌شدهٔ اجراها
 */
export function endpointCoverage(endpoints = [], calls = []) {
  const hit = new Map();
  for (const call of calls) {
    const key = normalizePath(call?.path ?? call?.url ?? '');
    if (!key) continue;
    const methods = hit.get(key) || new Set();
    if (call?.method) methods.add(String(call.method).toUpperCase());
    hit.set(key, methods);
  }

  const rows = endpoints.map((endpoint) => {
    const methods = hit.get(endpoint.path);
    const touched = Boolean(methods);
    /**
     * فعلِ نیازموده، حتی وقتی مسیر آزموده شده.
     *
     * `GET /api/books` را هزار بار زده‌ایم و `DELETE` همان مسیر را هرگز —
     * و دومی دقیقاً همان‌جاست که باگ می‌نشیند. با شمارشِ مسیر، این تفاوت
     * دیده نمی‌شد.
     */
    const untried = (endpoint.methods || []).filter((method) => !methods?.has(method));
    return { ...endpoint, touched, untried, seenMethods: [...(methods || [])] };
  });

  return {
    endpoints: rows,
    untouched: rows.filter((row) => !row.touched),
    partial: rows.filter((row) => row.touched && row.untried.length),
    /** مسیرهایی که اپ صدا زده و در سورس نبودند — یا اسکنر کور است، یا مسیر بیرونی است */
    unknown: [...hit.keys()].filter((key) => !rows.some((row) => row.path === key)),
  };
}

/**
 * ثبتِ تماس‌ها، یک بار به‌ازای هر «فعل و مسیر».
 *
 * ── چرا یکتاسازی در حافظه ──
 *
 * یک اجرا ممکن است `GET /sync/pull` را صد بار بزند. برای پوشش، صد بار و یک
 * بار یک معنا دارند: «آزموده شد». نوشتنِ همه، فایل را بی‌دلیل بزرگ می‌کند و
 * چیزی به جواب اضافه نمی‌کند.
 */
export function callRecorder(store) {
  const seen = new Set();
  return ({ method, url, status }) => {
    const path = normalizePath(url);
    const key = `${method} ${path}`;
    if (!path || seen.has(key)) return;
    seen.add(key);
    // شکستِ نوشتن نباید اجرا را بکشد: این داده کمکی است، نه روایتِ اجرا
    store?.appendCall?.({ method, path, status, at: new Date().toISOString() }).catch(() => {});
  };
}

/**
 * همهٔ تماس‌های ثبت‌شدهٔ یک هدف، از همهٔ اجراها.
 *
 * ── چرا روی همهٔ اجراها و نه آخرین ──
 *
 * پوشش انباشته است: اگر گشتِ هفتهٔ پیش `/keys/mine` را زده، آن endpoint
 * آزموده شده — حتی اگر اجرای امروز سراغش نرفته باشد. شمردنِ فقط آخرین
 * اجرا، هر بار نیمی از پوشش را دور می‌ریخت.
 */
export async function callsOf(runDirs, readNdjson) {
  const calls = [];
  for (const dir of runDirs) {
    for (const row of await readNdjson(dir, 'calls.ndjson').catch(() => [])) {
      if (row?.path) calls.push(row);
    }
  }
  return calls;
}
