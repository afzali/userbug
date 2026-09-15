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

/**
 * نگاشتِ صفحه‌کلید فارسی به همان کلیدها روی QWERTY.
 *
 * ── چرا این جدول اینجاست ──
 *
 * نخستین کاربر پروژه‌ای با کلیدِ «دثحهNEPI» ساخت. آن رشته بی‌معنا نیست:
 * دقیقاً «nepi» است که با چیدمانِ فارسی تایپ شده و کاربر متوجه نشده
 * صفحه‌کلید عوض نشده — بعد نیمه‌راه فهمیده و «NEPI» را لاتین ادامه داده.
 *
 * جدول از روی همان رشتهٔ واقعی سنجیده شد: «دثحه» → «nepi».
 *
 * پس به‌جای اینکه فقط «نامعتبر است» بگوییم، می‌شود گفت چه چیزی منظور بوده.
 */
const PERSIAN_LAYOUT = Object.fromEntries(
  [...'ضصثقفغعهخحشسیبلاتنمظطزرذدپ'].map((char, index) => [
    char,
    'qwertyuiopasdfghjklzxcvbnm'[index],
  ])
);

/**
 * اگر رشته با چیدمانِ فارسی تایپ شده باشد، معادلِ لاتینش.
 *
 * وقتی هیچ نویسهٔ فارسی‌ای نباشد یا نگاشت ناقص بماند، رشتهٔ خالی برمی‌گردد —
 * پیشنهادِ نصفه‌نیمه از نبودِ پیشنهاد بدتر است.
 */
export function latinFromPersianLayout(value) {
  const text = String(value ?? '').trim();
  if (!text || !/[؀-ۿ]/.test(text)) return '';

  let out = '';
  for (const char of text) {
    if (PERSIAN_LAYOUT[char]) out += PERSIAN_LAYOUT[char];
    else if (/[A-Za-z0-9_-]/.test(char)) out += char;
    else return '';
  }
  out = out.toLowerCase();

  /**
   * رشتهٔ دوباره‌نوشته‌شده، یک بار حساب می‌شود.
   *
   * ── چرا لازم شد ──
   *
   * ورودیِ واقعی «دثحهNEPI» بود. ترجمه‌اش می‌شود «nepinepi» — که **درست**
   * است ولی به‌عنوان پیشنهاد بی‌فایده. چون کاربر «nepi» را با چیدمان فارسی
   * زده، وسط کار فهمیده، و بدون پاک کردنِ قبلی دوباره «NEPI» را زده.
   *
   * این الگوی رایجی است، نه یک حالتِ خاص. و پیشنهادی که آشکارا غلط باشد،
   * از نبودِ پیشنهاد بدتر است: کاربر یک بار رویش کلیک می‌کند، نتیجه را
   * می‌بیند، و دیگر به هیچ پیشنهادی اعتماد نمی‌کند.
   */
  const half = out.length / 2;
  if (out.length % 2 === 0 && out.slice(0, half) === out.slice(half)) {
    return out.slice(0, half);
  }
  return out;
}

/**
 * کلیدِ پروژهٔ **تازه** — سخت‌گیرانه‌تر از خواندن.
 *
 * ── چرا دو تابع و نه یکی ──
 *
 * کلید نامِ فایل و بخشی از URL و آرگومانِ خط فرمان می‌شود
 * (`userbug run <کلید>`). با نویسهٔ فارسی هر سه ممکن‌اند ولی هیچ‌کدام
 * راحت نیستند، و در ترمینال و لاگ راست‌به‌چپ به‌هم می‌ریزند.
 *
 * ولی سخت‌گیری روی **خواندن** یعنی پروژه‌ای که دیروز ساخته شده امروز
 * ناپیدا شود. داده‌ای که با نسخهٔ قبلی نوشته شده باید خوانده شود؛ فقط
 * ساختنِ تازه محدود می‌شود.
 */
export function assertNewProjectKey(value) {
  const key = assertProjectKey(value);
  if (/^[a-z0-9][a-z0-9_-]*$/.test(key)) return key;

  const suggestion = latinFromPersianLayout(key);
  throw new Error(
    `کلید پروژه باید لاتین و کوچک باشد: «${key}»\n` +
      (suggestion ? `  انگار صفحه‌کلید فارسی بوده — منظورتان «${suggestion}» بود؟\n` : '') +
      '  کلید نامِ فایل و بخشی از آدرس و آرگومانِ خط فرمان می‌شود.\n' +
      '  نامِ خوانا هرچه بخواهید باشد؛ همان است که در رابط دیده می‌شود.'
  );
}

function normalizeLogs(input) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];

  return list
    .map((entry) => {
      const name = String(entry?.name ?? '').trim();

      /**
       * دو جنسِ لاگ، یک فهرست.
       *
       * `file` سروری است که روی دیسک می‌نویسد؛ `command` سروری که روی
       * stdout می‌نویسد (`npm run dev`، `docker logs -f`، `journalctl -f`).
       * دومی لازم شد چون اپِ امروزی معمولاً فایلِ لاگ ندارد، و نتیجه‌اش این
       * بود که نیمی از رصدِ این ابزار عملاً خاموش بماند.
       */
      const command = String(entry?.command ?? '').trim();
      if (command) {
        return {
          type: 'command',
          name,
          command,
          /**
           * آرگومان‌ها آرایه می‌مانند، نه یک رشته.
           *
           * همان درسی که `schedule.js` نوشت: رشتهٔ فرمان یعنی هر مقداری که
           * از کانفیگ بیاید می‌تواند فرمانِ دیگری اجرا کند. هیچ shellی وسط
           * نیست و نباید باشد.
           */
          args: (Array.isArray(entry?.args) ? entry.args : []).map((one) => String(one)),
          cwd: String(entry?.cwd ?? '').trim().replace(/\\/g, '/'),
        };
      }

      return {
        type: 'file',
        name,
        // مسیر با اسلش رو به جلو نوشته می‌شود تا در سورس جاوااسکریپت نیازی به
        // فرار دادنِ بک‌اسلشِ ویندوز نباشد.
        path: String(entry?.path ?? '')
          .trim()
          .replace(/\\/g, '/'),
      };
    })
    .filter((entry) => entry.path || entry.command)
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
 *   logs: {type: string, name: string, path?: string, command?: string, args?: string[]}[], sourceRoot: string}}
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
    sourceRoot: cleanPath(input.sourceRoot),
    /**
     * ریشهٔ دومِ سورس — وقتی فرانت و بک دو پوشهٔ جدا باشند.
     *
     * خالی ماندنش حالتِ رایج است و چیزی را عوض نمی‌کند: کانفیگ همان
     * `source: { root }` تک‌ریشه را می‌گیرد و مسیرها بدون پیشوند می‌مانند.
     */
    backRoot: cleanPath(input.backRoot),
    frontName: String(input.frontName ?? '').trim() || 'front',
    backName: String(input.backName ?? '').trim() || 'back',
  };
}

/** مسیر با بک‌اسلشِ ویندوزی، به اسلشِ رو به جلو. */
function cleanPath(value) {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/');
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
  lines.push('   * برای لاگِ خودِ سرور است — چه روی دیسک بنویسد، چه روی stdout.');
  lines.push('   *');
  lines.push('   * بی این، خطایی که سرور می‌دهد و UI فقط یک پیام عمومی از آن نشان');
  lines.push('   * می‌دهد، هرگز دیده نمی‌شود.');
  lines.push('   */');
  if (fields.logs.length) {
    lines.push('  logs: [');
    for (const log of fields.logs) {
      if (log.type === 'command') {
        const args = log.args.map((one) => quote(one)).join(', ');
        lines.push(`    { type: 'command', name: ${quote(log.name)}, command: ${quote(log.command)}, args: [${args}] },`);
      } else {
        lines.push(`    { type: 'file', name: ${quote(log.name)}, path: ${quote(log.path)} },`);
      }
    }
    lines.push('  ],');
  } else {
    lines.push("  logs: [");
    lines.push("    // { type: 'file', name: 'php', path: 'D:/path/to/error.log' },");
    lines.push("    // { type: 'command', name: 'docker', command: 'docker', args: ['logs', '-f', 'app'] },");
    lines.push("  ],");
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

  if (fields.sourceRoot && fields.backRoot) {
    /**
     * دو ریشه، دو نام.
     *
     * نام‌ها تزئین نیستند: مسیرهای نسبی با آنها پیشوند می‌گیرند
     * (`front/src/app.js`) تا فایلِ هم‌نام در دو پوشه با هم قاطی نشود، و
     * گزارش بتواند بگوید مشکل کدام طرف است.
     */
    lines.push('');
    lines.push('  // سورس در دو پوشه — مسیرها با نامِ ریشه پیشوند می‌گیرند.');
    lines.push('  source: {');
    lines.push('    roots: [');
    lines.push(`      { name: ${quote(fields.frontName)}, path: ${quote(fields.sourceRoot)} },`);
    lines.push(`      { name: ${quote(fields.backName)}, path: ${quote(fields.backRoot)} },`);
    lines.push('    ],');
    lines.push('  },');
  } else if (fields.sourceRoot || fields.backRoot) {
    lines.push('');
    lines.push('  // پوشهٔ سورس پروژه — برای وقتی که مدل باید کد را بخواند.');
    lines.push(`  source: { root: ${quote(fields.sourceRoot || fields.backRoot)} },`);
  }

  lines.push('};');
  lines.push('');

  return lines.join('\n');
}
