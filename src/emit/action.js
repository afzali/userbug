/**
 * قدمِ سناریو → **کدِ** کنش.
 *
 * ── مرجعِ این فایل ──
 *
 * `src/map/replay.js` همین افعال را اجرا می‌کند و اکنون تنها مفسرِ
 * باقی‌مانده است. این ماژول آینهٔ آن است، همان‌طور که `emit/locator.js`
 * آینهٔ `scenario/resolve.js` است — و به همان دلیل: دو تبدیل برای یک معنا
 * دیر یا زود واگرا می‌شوند، و آن‌وقت خزش مسیری را می‌رود که تستِ
 * تولیدشده نمی‌رود.
 *
 * ── متغیرها: رشته نمی‌مانند، متغیر می‌شوند ──
 *
 * `{{identity.email}}` در YAML رشته‌ای بود که مفسر جای‌گذاری‌اش می‌کرد. در
 * کد، `identity` یک fixtureِ واقعیِ پلی‌رایت است، پس همان جای‌گذاری به یک
 * ارجاعِ ساده تبدیل می‌شود: `identity.email`.
 *
 * و `{{account.*}}`، `{{nasty.*}}`، `{{vars.*}}` fixture ندارند — آن‌ها
 * متنِ اجرای YAML بودند که رفت. تولیدِ کدی که به متغیرِ تعریف‌نشده اشاره
 * کند یعنی فایلی که در نگاهِ اول درست است و در اجرا می‌شکند؛ پس بلند
 * می‌شکنیم.
 */
import { emitLocator, quote } from './locator.js';

/** فیلترهای `interpolate.js` — همان پنج‌تا، نه بیشتر. */
const FILTERS = {
  upper: (expr) => `${expr}.toUpperCase()`,
  lower: (expr) => `${expr}.toLowerCase()`,
  trim: (expr) => `${expr}.trim()`,
  upperFirst: (expr) => `(${expr}.charAt(0).toUpperCase() + ${expr}.slice(1))`,
  localPart: (expr) => `${expr}.split('@')[0]`,
};

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*(?:\|\s*(\w+)\s*)?\}\}/g;

/** یک `{{…}}` → عبارتِ جاوااسکریپت. */
function expression(dotted, filter) {
  if (!dotted.startsWith('identity.')) {
    const namespace = dotted.split('.')[0];
    throw new Error(
      `«{{${dotted}}}» در کد fixture ندارد.\n` +
        `  تنها «identity» fixtureِ واقعی است؛ «${namespace}» متنِ اجرای YAML بود که برداشته شد.\n` +
        '  مقدار را مستقیم بنویسید، یا fixtureای برایش بسازید.',
    );
  }

  if (filter && !FILTERS[filter]) throw new Error(`فیلترِ ناشناس: «${filter}»`);
  return filter ? FILTERS[filter](dotted) : dotted;
}

/**
 * مقدار → کد.
 *
 * رشتهٔ بی‌متغیر، رشته می‌ماند. رشته‌ای که **تماماً** یک متغیر است، خودِ
 * عبارت می‌شود. آمیخته، template می‌شود.
 *
 * @param {*} value
 * @returns {string}
 */
export function emitValue(value) {
  if (typeof value !== 'string') return JSON.stringify(value ?? '');

  const matches = [...value.matchAll(PLACEHOLDER)];

  /**
   * `{{` که جای‌نگهدار نشد، تایپی است نه متن.
   *
   * بی این بررسی، `{{identity.email | فیلترِ اشتباه}}` بی‌صدا رشتهٔ
   * تحت‌اللفظی می‌ماند و همان متنِ خام در فرم تایپ می‌شود. شکستش دربارهٔ
   * اپ هیچ نمی‌گوید، و پیدا کردنِ علتش ساعت‌ها طول می‌کشد — دقیقاً همان
   * سکوتی که این ابزار قرار است پیدا کند.
   */
  if (!matches.length) {
    if (value.includes('{{')) {
      throw new Error(
        `«${value.slice(0, 60)}» شبیهِ جای‌نگهدار است ولی خوانده نشد.\n` +
          '  شکلِ درست: {{identity.<کلید>}} یا {{identity.<کلید> | <فیلتر>}}\n' +
          `  فیلترها: ${Object.keys(FILTERS).join('، ')}`,
      );
    }
    return quote(value);
  }

  const only = matches[0];
  if (matches.length === 1 && only[0] === value) return expression(only[1], only[2]);

  // آمیخته: template literal. بک‌تیک و `${` در متنِ اصلی باید فرار داده شوند.
  const body = value
    .replace(/[\\`]/g, (char) => `\\${char}`)
    .replace(/\$\{/g, '\\${')
    .replace(PLACEHOLDER, (_, dotted, filter) => `\${${expression(dotted, filter)}}`);
  return `\`${body}\``;
}

/** فعلِ یک قدم — همان قاعدهٔ `verbOf` در بازپخش. */
const IGNORED = new Set(['value', 'detail', 'finding', 'timeout', 'as', 'then', 'else']);
export function verbOf(step) {
  if (!step || typeof step !== 'object') return '';
  return Object.keys(step).find((key) => !IGNORED.has(key)) || '';
}

/**
 * یک قدم → خط‌های کد.
 *
 * @param {object} step
 * @returns {string[]}
 */
export function emitAction(step) {
  const verb = verbOf(step);
  if (!verb) return [];

  const body = step[verb];
  const value = step.value;

  switch (verb) {
    case 'go':
      return [`await page.goto(${emitValue(String(body ?? '/'))});`];

    case 'press':
      return [`await page.keyboard.press(${emitValue(String(body || 'Enter'))});`];

    case 'clearState':
      // همان دو کارِ بازپخش: کوکی و انبارِ صفحه.
      return [
        'await page.context().clearCookies();',
        'await page.evaluate(() => {',
        '  try {',
        '    localStorage.clear();',
        '    sessionStorage.clear();',
        '  } catch {',
        '    // انبار در دسترس نیست؛ بقیهٔ پاکسازی انجام شده',
        '  }',
        '});',
      ];

    case 'dismissBlockers': {
      const wait = Number(body?.wait) || 0;
      return [`await ub.dismissBlockers(${wait ? `{ wait: ${wait} }` : ''});`];
    }

    case 'wait': {
      if (body && typeof body === 'object') {
        const { timeout, ...condition } = body;
        const [kind, target] = Object.entries(condition)[0] ?? [];
        if (!kind) throw new Error('`wait` شرطی بدون شرط');
        const state = kind === 'hidden' ? 'hidden' : 'visible';
        const options = timeout ? `{ state: '${state}', timeout: ${Number(timeout)} }` : `{ state: '${state}' }`;
        return [`await ${emitLocator(target)}.waitFor(${options});`];
      }
      return [`await page.waitForTimeout(${Math.min(Number(body) || 0, 10_000)});`];
    }

    case 'fill':
    case 'type': {
      /**
       * شکلِ کوتاه: `{fill: {«ایمیل»: «a@b.c»}}`.
       *
       * همان شکلی که ضبط‌کنندهٔ گشت و مدل هر دو می‌سازند، پس شکلِ غالبِ
       * سناریوهای واقعی است. بازپخش هم دقیقاً همین را جدا می‌کند.
       */
      if (value === undefined && body && typeof body === 'object' && !isTargetShape(body)) {
        return Object.entries(body).flatMap(([label, text]) =>
          typing(verb, emitLocator({ label }), text),
        );
      }
      return typing(verb, emitLocator(body), value);
    }

    case 'click':
    case 'dblclick':
    case 'hover':
    case 'check':
      return [`await ${emitLocator(body)}.${verb}();`];

    default:
      throw new Error(
        `فعلِ «${verb}» تولیدکنندهٔ کد ندارد.\n` +
          '  یا در پلی‌رایت مستقیم بنویسیدش، یا به `src/emit/action.js` اضافه شود.',
      );
  }
}

/** `fill` مستقیم می‌نویسد؛ `type` کلیک می‌کند و با تأخیر تایپ. */
function typing(verb, locator, text) {
  if (verb === 'fill') return [`await ${locator}.fill(${emitValue(text ?? '')});`];
  return [`await ${locator}.click();`, `await page.keyboard.type(${emitValue(text ?? '')}, { delay: 20 });`];
}

/** آیا این شیء توصیفِ هدف است یا نگاشتِ «برچسب → متن»؟ */
const TARGET_KEYS = new Set(['testid', 'role', 'name', 'label', 'text', 'placeholder', 'selector', 'exact', 'nth', 'visible']);
function isTargetShape(body) {
  return Object.keys(body).some((key) => TARGET_KEYS.has(key));
}
