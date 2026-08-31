/**
 * چکِ همگانی — چیزی که برای **هر** اپی درست است.
 *
 * ── شکافی که این فایل پر می‌کند ──
 *
 * `oracle.js` فقط **رخداد** را داوری می‌کند: خطای کنسول، `pageerror`، درخواستِ
 * شکست‌خورده، ۵۰۰، خطِ لاگ سرور. یعنی ابزار می‌بیند، ولی **انتظار ندارد**. سه
 * چیز از همان‌جا رد می‌شوند:
 *
 *   - صفحه‌ای که کاملاً سفید رندر شود و هیچ خطایی ندهد → سبز
 *   - `[object Object]` وسط متن، بی‌هیچ استثنایی → سبز
 *   - روترِ سمتِ کلاینت که «۴۰۴» نشان بدهد با پاسخ HTTP ۲۰۰ → سبز
 *
 * ── چرا این‌ها و نه بیشتر ──
 *
 * هر چکِ همگانی روی **همهٔ** پروژه‌ها اجرا می‌شود، پس یک چکِ پرسروصدا کلِ
 * گزارش را بی‌ارزش می‌کند. فهرست کوتاه می‌ماند و هر افزوده باید روی چند
 * پروژهٔ واقعی ساکت باشد.
 *
 * ── چرا وضعیت HTTP اینجا نیست ──
 *
 * `observe/client.js` همین حالا پاسخ‌های ۴xx/۵xx را رخداد می‌کند و داور
 * یافته‌شان می‌کند. تکرارش اینجا یعنی هر ۵۰۰ دو یافته بسازد — و دو یافته برای
 * یک چیز، شمارشِ گزارش را دروغ می‌کند.
 *
 * ── چرا `code` و `pre` نادیده گرفته می‌شوند ──
 *
 * سایتی که دربارهٔ برنامه‌نویسی است، `undefined` و `[object Object]` را
 * عمداً نشان می‌دهد. بهایش این است که اگر اپی واقعاً `[object Object]` را
 * داخل `<pre>` رندر کند، از دست می‌رود. یافتهٔ اشتباه گران‌تر از نبودِ یافته
 * است.
 */

/**
 * یک `evaluate` برای همهٔ چک‌ها.
 *
 * جدا کردنِ هر چک به `evaluate` خودش، برای شش چک یعنی شش رفت‌وبرگشت به مرورگر
 * در پایانِ **هر قدم**. روی سناریوی چهل‌قدمی این می‌شود دویست‌وچهل.
 */
const PROBE = () => {
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP']);

  const PATTERNS = [
    ['object-literal', /\[object [A-Z]\w*\]/],
    ['unrendered-template', /\{\{\s*[\w.$[\]]+\s*\}\}/],
    ['stack-trace', /\bat\s+\S+\s*\(?\S+:\d+:\d+\)?/],
    ['runtime-error', /\b(TypeError|ReferenceError|SyntaxError|RangeError|Uncaught)\s*:/],
    // این سه پرخطرترند: اپِ واقعی هم ممکن است عمداً نشانشان بدهد
    ['undefined-text', /(?:^|[\s>「(,:،؛=])undefined(?:[\s<」),.:،؛!?]|$)/],
    ['null-text', /(?:^|[\s>「(,:،؛=])null(?:[\s<」),.:،؛!?]|$)/],
    ['nan-text', /(?:^|[\s>「(,:،؛=])NaN(?:[\s<」),.:،؛!?]|$)/],
  ];

  function inSkipped(node) {
    for (let el = node.parentElement; el; el = el.parentElement) {
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.hasAttribute && el.hasAttribute('data-ub-ignore')) return true;
    }
    return false;
  }

  /** متنی که شکلِ داده دارد، نه شکلِ جمله. رد می‌شود تا نمایشگرِ JSON نویز نسازد. */
  function looksLikeData(text) {
    const trimmed = text.trim();
    if (trimmed.length > 3000) return true;
    return /^[[{]/.test(trimmed) && /["']\s*:/.test(trimmed);
  }

  const suspicious = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);

  let scanned = 0;
  for (let node = walker.nextNode(); node && scanned < 6000; node = walker.nextNode()) {
    scanned++;
    const raw = node.nodeValue;
    if (!raw || !raw.trim()) continue;
    if (inSkipped(node)) continue;
    if (looksLikeData(raw)) continue;

    for (const [id, pattern] of PATTERNS) {
      const match = raw.match(pattern);
      if (!match) continue;
      // یک نمونه به ازای هر الگو کافی است؛ صفحه‌ای با صد `undefined` هنوز
      // یک مسئله دارد، نه صد تا
      if (seen.has(id)) continue;
      seen.add(id);

      const at = Math.max(0, raw.indexOf(match[0]) - 50);
      const parent = node.parentElement;
      suspicious.push({
        id,
        token: match[0].trim(),
        sample: raw.slice(at, at + 140).replace(/\s+/g, ' ').trim(),
        where: parent ? `${parent.tagName.toLowerCase()}${parent.id ? '#' + parent.id : ''}` : 'text',
      });
    }
  }

  const interactiveSelector =
    'a[href],button,input,select,textarea,[role=button],[role=link],[role=textbox],' +
    '[contenteditable=true],[tabindex]:not([tabindex="-1"])';

  let interactive = 0;
  for (const el of document.querySelectorAll(interactiveSelector)) {
    if (el.getClientRects().length) interactive++;
    if (interactive > 200) break;
  }

  const root = document.documentElement;
  const viewport = root.clientWidth;
  const overflow = [];
  if (root.scrollWidth > viewport + 8) {
    let checked = 0;
    for (const el of document.querySelectorAll('body *')) {
      if (checked++ > 2500 || overflow.length >= 3) break;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.right > viewport + 8) {
        overflow.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || '').slice(0, 60),
          right: Math.round(rect.right),
        });
      }
    }
  }

  const text = (document.body?.innerText || '').trim();

  return {
    url: location.href,
    path: location.pathname,
    title: document.title || '',
    textLength: text.length,
    textSample: text.slice(0, 200),
    interactive,
    headings: document.querySelectorAll('h1,h2,h3,[role=heading]').length,
    forms: document.querySelectorAll('form').length,
    suspicious,
    scrollWidth: root.scrollWidth,
    clientWidth: viewport,
    overflow,
  };
};

/** وضعیتِ صفحه در یک رفت‌وبرگشت. */
export async function probePage(page) {
  return await page.evaluate(PROBE);
}

/**
 * عنوان‌هایی که «این صفحه خطاست» را فریاد می‌زنند.
 *
 * لنگر به ابتدا خورده و فهرست کوتاه است، چون اپی که صفحه‌ای به نام «خطاها»
 * دارد (مثل یک داشبورد لاگ) نباید هر بار یافته بگیرد.
 */
const ERROR_TITLES = [
  /^\s*(404|500|502|503)\b/,
  /^\s*(not found|page not found|error|internal server error)\b/i,
  /^\s*(صفحه پیدا نشد|یافت نشد|خطای سرور)\b/,
];

/**
 * فهرست چک‌ها.
 *
 * هر چک: شناسه، عنوان فارسی، و تابعی که `null` می‌دهد (سالم) یا یافته.
 * `risky` یعنی احتمال یافتهٔ قلابی‌اش بیشتر است — رابط آن‌ها را جدا نشان
 * می‌دهد تا کسی که خاموششان می‌کند بداند چه می‌کند.
 */
export const UNIVERSAL = [
  {
    id: 'empty-page',
    title: 'صفحه چیزی رندر نکرد',
    /**
     * شرطِ «و»، نه «یا».
     *
     * صفحه‌ای با سه نویسه متن و یک دکمه، صفحهٔ سالمِ کوچکی است. آنچه هرگز
     * درست نیست، صفحه‌ای است که **نه متن دارد نه چیزی برای کلیک** — یعنی
     * کاربر به بن‌بستِ سفید رسیده.
     */
    run(probe) {
      if (probe.textLength >= 10 || probe.interactive > 0) return null;
      return {
        message: `صفحهٔ ${probe.path} چیزی برای دیدن یا کلیک کردن ندارد`,
        detail: { textLength: probe.textLength, interactive: probe.interactive, title: probe.title },
      };
    },
  },

  {
    id: 'error-title',
    title: 'عنوان صفحه خطا را اعلام می‌کند',
    /**
     * چرا با وجود داورِ HTTP لازم است: روترِ سمتِ کلاینت صفحهٔ «۴۰۴» را با
     * پاسخِ ۲۰۰ رندر می‌کند. برای سرور هیچ اتفاقی نیفتاده و برای کاربر
     * همه‌چیز خراب است.
     */
    run(probe) {
      const title = String(probe.title || '').trim();
      if (!title || !ERROR_TITLES.some((pattern) => pattern.test(title))) return null;
      return {
        message: `عنوان صفحه خطاست: «${title}» در ${probe.path}`,
        detail: { title, path: probe.path },
      };
    },
  },

  {
    id: 'object-literal',
    title: '[object Object] روی صفحه',
    run: fromSuspicious('object-literal', 'یک شیء به‌جای متن رندر شده'),
  },
  {
    id: 'unrendered-template',
    title: 'جای‌گذاریِ انجام‌نشده روی صفحه',
    run: fromSuspicious('unrendered-template', 'قالب رندر نشده و خامش دیده می‌شود'),
  },
  {
    id: 'stack-trace',
    title: 'ردِ پشتهٔ خطا روی صفحه',
    run: fromSuspicious('stack-trace', 'ردِ پشته به کاربر نشان داده شده'),
  },
  {
    id: 'runtime-error',
    title: 'نام خطای جاوااسکریپت روی صفحه',
    run: fromSuspicious('runtime-error', 'پیام خطای فنی به کاربر نشان داده شده'),
  },

  {
    id: 'undefined-text',
    title: '«undefined» روی صفحه',
    risky: true,
    run: fromSuspicious('undefined-text', 'مقدارِ تعریف‌نشده به‌شکل متن رندر شده'),
  },
  {
    id: 'null-text',
    title: '«null» روی صفحه',
    risky: true,
    run: fromSuspicious('null-text', 'مقدارِ تهی به‌شکل متن رندر شده'),
  },
  {
    id: 'nan-text',
    title: '«NaN» روی صفحه',
    risky: true,
    run: fromSuspicious('nan-text', 'محاسبه‌ای عدد نداد و نتیجه‌اش رندر شده'),
  },

  {
    id: 'horizontal-overflow',
    title: 'صفحه اسکرول افقی ناخواسته دارد',
    risky: true,
    /**
     * در RTL این زیاد می‌شکند و کمتر دیده می‌شود، چون توسعه‌دهنده در LTR
     * آزموده. ولی `risky` است: اپی که عمداً جدولِ پهن یا بومِ افقی دارد،
     * سالم است.
     */
    run(probe) {
      if (!probe.overflow?.length) return null;
      const worst = probe.overflow[0];
      return {
        message: `صفحهٔ ${probe.path} ${probe.scrollWidth - probe.clientWidth} پیکسل از پهنای دید بیرون می‌زند`,
        detail: { scrollWidth: probe.scrollWidth, clientWidth: probe.clientWidth, offenders: probe.overflow, worst },
      };
    },
  },
];

function fromSuspicious(id, why) {
  return (probe) => {
    const hit = probe.suspicious?.find((item) => item.id === id);
    if (!hit) return null;
    return {
      message: `${why}: «${hit.token}» در ${probe.path}`,
      detail: { token: hit.token, sample: hit.sample, where: hit.where, path: probe.path },
    };
  };
}

export const UNIVERSAL_IDS = UNIVERSAL.map((check) => check.id);
