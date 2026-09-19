/**
 * انتظارِ انتخاب‌شده → **کدِ** ادعا.
 *
 * ── تمایزی که از قبل داشتیم و پلی‌رایت هم دارد ──
 *
 * `scenario/expect.js` دو جور بند می‌ساخت:
 *
 *   `expect` سخت می‌شکند و اجرا را همان‌جا تمام می‌کند — حرفِ آدم
 *   `assert` یافته ثبت می‌کند و ادامه می‌دهد — پیشنهادِ نیازمودهٔ مدل
 *
 * دلیلش این بود که «حرفِ نیازموده نباید بتواند بقیهٔ سناریو را از اجرا
 * بیندازد». همان تمایز در پلی‌رایت بومی است:
 *
 *   `expect(...)`        سخت
 *   `expect.soft(...)`   نرم؛ شکست را ثبت می‌کند و تست ادامه می‌دهد
 *
 * پس این نگاشت چیزی را از دست نمی‌دهد. `src/fixtures.js` هم از قبل
 * `expect.soft` را برای همین کار به‌کار می‌برد.
 *
 * ── چرا پیام روی ادعای نرم می‌نشیند ──
 *
 * شکستِ نرم در گزارش کنار بقیه می‌نشیند و اگر فقط بنویسد «توقع داشتیم دیده
 * شود» کسی نمی‌فهمد چرا. `why` همان جمله‌ای است که مدل یا آدم نوشته، و
 * پلی‌رایت آرگومانِ دومِ `expect.soft` را همان‌جا چاپ می‌کند.
 */
import { emitLocator, quote } from './locator.js';

/**
 * @typedef {object} Expectation
 * @property {string|object} target توصیفِ عنصر
 * @property {'visible'|'hidden'} [kind] پیش‌فرض `visible`
 * @property {boolean} [hard] آدم تأیید کرده؟ آن‌وقت سخت می‌شکند
 * @property {string} [why] جمله‌ای که در گزارش دیده می‌شود
 * @property {string} [label] توصیفِ خوانا، برای وقتی `why` نیست
 */

/**
 * یک انتظار → یک خط کد.
 *
 * @param {Expectation} item
 * @returns {string}
 */
export function emitAssertion(item) {
  if (!item || item.target == null) throw new Error('انتظارِ بی‌هدف');

  const locator = emitLocator(item.target);
  const matcher = item.kind === 'hidden' ? 'toBeHidden' : 'toBeVisible';

  // locatorِ چندخطی (نردبانِ رشتهٔ ساده) باید تورفتگی بگیرد وگرنه خطِ دومش
  // به حاشیه می‌چسبد و فایلِ تولیدشده بدخوان می‌شود.
  const inline = locator.includes('\n') ? locator.replace(/\n/g, '\n  ') : locator;

  if (item.hard) return `await expect(${inline}).${matcher}();`;

  const why = item.why || (item.label ? `انتظار نخورد: ${item.label}` : 'انتظار نخورد');
  return `await expect.soft(${inline}, ${quote(why)}).${matcher}();`;
}

/**
 * چند انتظار → چند خط، با تورفتگی.
 *
 * ترتیب دست نمی‌خورد: `applyExpectations` از آخر به اول درج می‌کرد چون
 * اندیسِ آرایه با هر درج جابه‌جا می‌شد. اینجا آن مسئله نیست — هر انتظار
 * جایش را با **نامِ قدم** می‌گیرد نه با شماره — پس ترتیبِ خواندن همان
 * ترتیبِ نوشتن است.
 *
 * @param {Expectation[]} items
 * @param {string} [indent]
 * @returns {string}
 */
export function emitAssertions(items = [], indent = '  ') {
  return items
    .map((item) => indent + emitAssertion(item).replace(/\n/g, '\n' + indent))
    .join('\n');
}
