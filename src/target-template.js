/**
 * ساختِ کانفیگ یک هدفِ تازه، از چند فیلد ساده.
 *
 * ── چرا اینجا و نه در رابط ──
 *
 * قاعدهٔ پروژه این است که هر کاری از رابط می‌شود، از CLI هم بشود. اگر قالب در
 * کامپوننت Svelte می‌نشست، `userbug init` باید همان متن را دوباره می‌نوشت و
 * دو قالب دیر یا زود واگرا می‌شدند.
 *
 * ── چرا فقط فیلدهای ساده ──
 *
 * کانفیگ هدف فایل جاوااسکریپت است و داخلش تابع هم می‌نشیند (`state.sql` در
 * مرورگر اجرا می‌شود) و قلاب shell. فرم چیزی می‌سازد که هر پروژهٔ تازه برای
 * شروع لازم دارد؛ موارد پیشرفته به‌شکل کامنت در همان فایل توضیح داده می‌شوند و
 * از ویرایشگرِ رابط اضافه می‌شوند. «همه‌چیز از وب» بله؛ «همه‌چیز با فرم» نه.
 */

/** محیط‌هایی که موتور می‌شناسد. `local` و `staging` کارِ نویسنده را باز می‌کنند. */
export const ENVIRONMENTS = ['local', 'staging', 'production'];

/**
 * میزبان‌هایی که «قطعاً تولیدی نیستند».
 *
 * loopback، دامنه‌های رزروشدهٔ توسعه، و بازه‌های IP خصوصی.
 */
function isClearlyLocalHost(hostname) {
  const host = String(hostname).toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return true;
  if (/\.(test|local|localhost|internal|invalid|example)$/.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^127\./.test(host)) return true;
  return false;
}

function assertUrl(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} لازم است`);

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${label} آدرس معتبر نیست: «${text}»`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} باید http یا https باشد`);
  }

  // بدون این، `http://localhost:5173` و `http://localhost:5173/` دو مقدار
  // مختلف می‌شدند و آدرس‌های نسبیِ سناریو یک اسلش اضافه می‌گرفتند.
  return text.replace(/\/+$/, '');
}

/** نامِ فایل. همان قاعدهٔ `assertSafeSegment` رابط، تا هر دو یک چیز بپذیرند. */
export function assertProjectKey(value) {
  const key = String(value ?? '').trim();
  if (!/^[\p{L}\p{N}_.-]+$/u.test(key) || key === '.' || key === '..' || key.length > 60) {
    throw new Error(`کلید پروژه نامعتبر است: «${value}». حرف، عدد، خط تیره و زیرخط مجاز است`);
  }
  if (key.endsWith('.config') || key.endsWith('.js')) {
    throw new Error('کلید پروژه بدون پسوند نوشته می‌شود؛ `.config.js` خودکار اضافه می‌شود');
  }
  return key;
}

function normalizeLogs(input) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];

  return list
    .map((entry) => ({
      name: String(entry?.name ?? '').trim(),
      // مسیر با اسلش رو به جلو نوشته می‌شود تا در سورس جاوااسکریپت نیازی به
      // فرار دادنِ بک‌اسلشِ ویندوز نباشد.
      path: String(entry?.path ?? '')
        .trim()
        .replace(/\\/g, '/'),
    }))
    .filter((entry) => entry.path)
    .map((entry, index) => {
      if (!entry.name) entry.name = `log${index + 1}`;
      if (!/^[\w.-]+$/.test(entry.name)) {
        throw new Error(`نام لاگ نامعتبر است: «${entry.name}»`);
      }
      return entry;
    });
}

/**
 * فیلدهای ورودی را بسنج و نرمال کن.
 *
 * @returns {{key: string, name: string, baseURL: string, apiURL: string,
 *   environment: string, device: string, locale: string, dir: string,
 *   logs: {name: string, path: string}[], sourceRoot: string}}
 */
export function assertProjectFields(input = {}) {
  const key = assertProjectKey(input.key);
  const baseURL = assertUrl(input.baseURL, 'آدرس فرانت');
  const apiURL = input.apiURL ? assertUrl(input.apiURL, 'آدرس API') : '';

  const environment = String(input.environment ?? '').trim();
  if (!ENVIRONMENTS.includes(environment)) {
    throw new Error(`محیط باید یکی از ${ENVIRONMENTS.join('، ')} باشد`);
  }

  /**
   * چرا فرم اجازه نمی‌دهد میزبانِ عمومی را `local` اعلام کنید.
   *
   * `local` قلاب shell، درخواستِ نویسنده و SQL نویسنده را باز می‌کند. در فایلی
   * که آدم دستی می‌نویسد، کامنت‌های کنارش هست و می‌خواند. در یک فرم، فقط یک
   * کشویی است — و یک انتخابِ بی‌دقت روی آدرس واقعی یعنی نوشتن روی دادهٔ
   * کاربران. اگر واقعاً لازم شد، همان فایل از ویرایشگر قابل تغییر است.
   */
  for (const [label, url] of [
    ['آدرس فرانت', baseURL],
    ['آدرس API', apiURL],
  ]) {
    if (environment === 'local' && url && !isClearlyLocalHost(new URL(url).hostname)) {
      throw new Error(
        `${label} میزبان محلی نیست، پس محیط «local» پذیرفته نمی‌شود: ${url}\n` +
          '  محیط local کارِ نویسنده (قلاب shell، درخواست POST، SQL نویسنده) را باز می‌کند.\n' +
          '  برای میزبان بیرونی staging یا production را انتخاب کنید.'
      );
    }
  }

  return {
    key,
    name: String(input.name ?? '').trim() || key,
    baseURL,
    apiURL,
    environment,
    device: String(input.device ?? '').trim() || 'desktop',
    locale: String(input.locale ?? '').trim() || 'fa',
    dir: String(input.dir ?? '').trim() === 'ltr' ? 'ltr' : 'rtl',
    logs: normalizeLogs(input.logs),
    sourceRoot: String(input.sourceRoot ?? '')
      .trim()
      .replace(/\\/g, '/'),
  };
}

/** رشته برای گذاشتن در سورس، با نقل‌قول تک. */
function quote(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * سورس کانفیگ.
 *
 * خروجی عمداً کامنت دارد: فایلی که فرم می‌سازد، جایی است که کاربر بعداً دستی
 * کاملش می‌کند. کانفیگِ بی‌کامنت یعنی کاربر باید مستندات را جای دیگری بخواند.
 */
export function renderTargetConfig(input) {
  const fields = assertProjectFields(input);
  const lines = [];

  lines.push('/**');
  lines.push(` * هدف: ${fields.name}`);
  lines.push(' *');
  lines.push(' * از فرمِ «پروژهٔ تازه» ساخته شده. هیچ دستور بالاآوردنی اینجا نیست: ابزار');
  lines.push(' * فقط آدرس و دسترسی می‌گیرد، و اینکه سرورها چطور بالا می‌آیند مسئلهٔ خودِ');
  lines.push(' * پروژه است.');
  lines.push(' */');
  lines.push('export default {');
  lines.push(`  name: ${quote(fields.name)},`);
  lines.push(`  baseURL: ${quote(fields.baseURL)},`);
  lines.push('');

  if (fields.apiURL) {
    lines.push('  // فعل `request` سناریو به این آدرس می‌خورد.');
    lines.push(`  apiURL: ${quote(fields.apiURL)},`);
  } else {
    lines.push('  // آدرس API. تا وقتی نباشد، فعل `request` در سناریوها معنا ندارد.');
    lines.push('  // apiURL: \'http://127.0.0.1:8080\',');
  }
  lines.push('');

  lines.push('  /**');
  lines.push('   * دروازهٔ ایمنی (قانون ۸).');
  lines.push('   *');
  lines.push('   * قلاب مخرب، درخواستِ نویسنده و SQL نویسنده فقط روی local و staging');
  lines.push('   * اجرا می‌شوند. نبودِ این کلید یعنی production فرض می‌شود.');
  lines.push('   */');
  lines.push(`  environment: ${quote(fields.environment)},`);
  lines.push('');
  lines.push('  // از فهرست دستگاه‌های Playwright. \'desktop\' یعنی بدون emulation.');
  lines.push(`  device: ${quote(fields.device)},`);
  lines.push('');
  lines.push(`  locale: ${quote(fields.locale)},`);
  lines.push(`  dir: ${quote(fields.dir)},`);
  lines.push('');

  lines.push('  /**');
  lines.push('   * لاگ سرور.');
  lines.push('   *');
  lines.push('   * خطاهای کنسول مرورگر خودکار گرفته می‌شوند و مسیر نمی‌خواهند؛ این فهرست');
  lines.push('   * برای لاگ‌هایی است که سرور روی دیسک می‌نویسد. فقط `type: \'file\'`');
  lines.push('   * پشتیبانی می‌شود.');
  lines.push('   */');
  if (fields.logs.length) {
    lines.push('  logs: [');
    for (const log of fields.logs) {
      lines.push(`    { type: 'file', name: ${quote(log.name)}, path: ${quote(log.path)} },`);
    }
    lines.push('  ],');
  } else {
    lines.push('  logs: [');
    lines.push("    // { type: 'file', name: 'php', path: 'D:/path/to/error.log' },");
    lines.push('  ],');
  }
  lines.push('');

  lines.push('  /**');
  lines.push('   * فضای شخصی هر اجرا.');
  lines.push('   *');
  lines.push('   * `mode: \'browser\'` یعنی پیش از هر سناریو، حالتِ مرورگر پاک می‌شود ولی');
  lines.push('   * دادهٔ سرور دست نمی‌خورد. اگر ثبت‌نام پروژه باز است، `identity` را روشن');
  lines.push('   * کنید تا هر اجرا کاربر تازهٔ خودش را بسازد و اجراها به هم کار نداشته');
  lines.push('   * باشند.');
  lines.push('   */');
  lines.push('  isolation: {');
  lines.push("    mode: 'browser',");
  lines.push('    reset: {');
  lines.push('      beforeScenario: [');
  lines.push("        { type: 'browser', clear: ['cookies', 'localStorage', 'indexedDB', 'cache'] },");
  lines.push('      ],');
  lines.push('    },');
  lines.push('    // identity: { strategy: \'fresh-signup\' },');
  lines.push('  },');
  lines.push('');

  lines.push('  /**');
  lines.push('   * خطاهایی که نباید قدم را قرمز کنند.');
  lines.push('   *');
  lines.push('   * کوتاه بماند و هر خطش دلیل داشته باشد. allowlist بلند یعنی داریم مشکل');
  lines.push('   * را زیر فرش می‌کنیم.');
  lines.push('   */');
  lines.push('  allowlist: [');
  lines.push('    /favicon/i,');
  lines.push('  ],');

  if (fields.sourceRoot) {
    lines.push('');
    lines.push('  // پوشهٔ سورس پروژه — برای وقتی که مدل باید کد را بخواند.');
    lines.push(`  source: { root: ${quote(fields.sourceRoot)} },`);
  }

  lines.push('};');
  lines.push('');

  return lines.join('\n');
}
