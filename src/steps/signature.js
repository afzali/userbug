/**
 * امضای ساختاریِ یک عنصر.
 *
 * ── چرا selector به‌تنهایی کافی نیست ──
 *
 * حالت بی‌خطر این است که selectorِ کش‌شده پیدا نشود: برمی‌گردیم به مدل و
 * مشکلی نیست. حالت خطرناک این است که selector هنوز **کار کند ولی معنایش عوض
 * شده باشد** — دکمه سر جایش است و حالا کار دیگری می‌کند. آن‌وقت تست سبز
 * می‌شود و باگ رد می‌شود.
 *
 * امضا همین را می‌گیرد: اگر محیطِ ساختاریِ عنصر عوض شده باشد، کش باطل است
 * حتی وقتی selector هنوز چیزی پیدا می‌کند.
 *
 * ── چه چیزی در امضا هست و چه چیزی نیست ──
 *
 * هست: تگ، نقش، متنِ کوتاه‌شده، نوع ورودی، و زنجیرهٔ سه جدِ بالادست با
 * جایگاهِ عنصر بین هم‌نیاها.
 *
 * نیست: کلاس‌ها و شناسه‌های تولیدی. در نپی کلاس‌ها از تیلویند می‌آیند و
 * شناسه‌ها `bits-c105`اند که با هر رندر عوض می‌شوند — امضایی که به آن‌ها
 * وابسته باشد، هر بار باطل می‌شود و کل کش بی‌فایده.
 */

/** در مرورگر اجرا می‌شود. ورودی: عنصر. خروجی: رشتهٔ امضا. */
export const SIGNATURE_FN = (el) => {
  if (!el) return '';

  const describe = (node, withText) => {
    const role = node.getAttribute?.('role') || '';
    const type = node.getAttribute?.('type') || '';
    const text = withText ? (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) : '';
    const siblings = node.parentElement ? [...node.parentElement.children] : [];
    const index = siblings.indexOf(node);
    return [node.tagName, role, type, text, index].join(':');
  };

  const parts = [describe(el, true)];
  let parent = el.parentElement;
  for (let depth = 0; depth < 3 && parent; depth++) {
    parts.push(describe(parent, false));
    parent = parent.parentElement;
  }

  return parts.join('|');
};

/** هش کوتاه، تا در فایل کش خوانا بماند. */
export function hashSignature(raw) {
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** امضای عنصری که یک locator به آن رسیده. */
export async function signatureOf(locator) {
  const raw = await locator.evaluate(SIGNATURE_FN);
  return hashSignature(raw);
}
