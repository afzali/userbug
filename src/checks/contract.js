/**
 * قراردادِ صفحه — لایهٔ ۲ از سنجهٔ هوشمند.
 *
 *   لایهٔ ۱ (همگانی)  «صفحه سالم رندر شد»
 *   لایهٔ ۲ (قرارداد) «چیزی که بود، هنوز هست»   ← اینجا
 *   لایهٔ ۳ (ناوردا)  «قاعده نشکست»
 *
 * ── مسئله‌ای که کلِ طراحیِ این فایل حول آن است ──
 *
 * ساده‌ترین پیاده‌سازی این است: نخستین بار که صفحه را دیدیم، فهرست عناصرش را
 * ذخیره کن و دفعهٔ بعد بسنج. و این **کار نمی‌کند** — چون فهرستِ عناصرِ
 * `/library` شاملِ نامِ سندهای خودِ کاربر است. اجرای بعدی با دادهٔ دیگری
 * می‌آید و قرارداد می‌شکند، بی‌آنکه چیزی خراب باشد.
 *
 * تفکیکِ «چیزی که بخشی از اپ است» از «چیزی که دادهٔ کاربر است» را نمی‌شود از
 * یک عکس فهمید. ولی از **چند** عکس می‌شود: آنچه در هر بازدید هست، اپ است؛
 * آنچه عوض می‌شود، داده است.
 *
 * پس قرارداد **تقویت می‌شود، نه ضبط**:
 *
 *   بازدید ۱   نامزدها ثبت می‌شوند، هیچ‌کدام هنوز قاعده نیستند
 *   بازدید ۲،۳ آنچه دوباره دیده شد `seenIn` می‌گیرد؛ بقیه **بی‌صدا حذف**
 *   بازدید ۴+  آنچه به آستانه رسیده، اگر غایب شود یافته می‌سازد
 *
 * حذفِ بی‌صدا در مرحلهٔ یادگیری عمدی است: نبودنِ یک نامزد در بازدید دوم یعنی
 * «این داده بود»، نه «این خراب شد».
 */
import { descriptorFor } from '../steps/snapshot.js';
import { fingerprint, normalizeMessage } from '../observe/oracle.js';

/** پیش از این تعداد بازدید، غیبت یعنی «داده بود»، نه «شکست». */
export const LEARNING_VISITS = 3;
/** سقفِ بندهای یک قرارداد. بیشتر از این، سنجشِ هر قدم را کند می‌کند. */
const MAX_MUST = 12;

/**
 * نقش‌هایی که معمولاً بخشی از خودِ اپ‌اند.
 *
 * `link` عمداً نیست: در بیشتر اپ‌ها پیوندها همان دادهٔ کاربرند (فهرست اسناد،
 * نتایج جست‌وجو). دکمه و عنوان و تب، معمولاً چیدمانِ ثابت‌اند.
 */
const STRUCTURAL = new Set(['button', 'heading', 'tab', 'combobox', 'textbox', 'checkbox']);

/**
 * نامزدهای قرارداد از یک snapshot.
 *
 * ── چرا توصیف‌گرِ همیشگی و نه یک شکلِ تازه ──
 *
 * `descriptorFor` همان چیزی را می‌سازد که `do:` و ضبط‌کنندهٔ گشت می‌سازند، و
 * `resolveTarget` می‌فهمدش. شکلِ تازه یعنی مسیرِ دومِ حل کردن، و آن دو دیر یا
 * زود واگرا می‌شوند.
 */
export function contractFrom(snapshot) {
  const items = snapshot?.items || [];
  const out = [];
  const seen = new Set();

  for (const item of items) {
    if (!STRUCTURAL.has(item.role)) continue;
    // عنصرِ بی‌نام توصیفِ پایدار ندارد و سنجیدنش بی‌معناست
    if (!item.name && !item.label && !item.testid) continue;

    const target = descriptorFor(item, items);
    if (!target) continue;

    const key = JSON.stringify(target);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(target);
    if (out.length >= MAX_MUST) break;
  }

  return out;
}

/**
 * قراردادِ موجود + بازدیدِ تازه → قراردادِ تقویت‌شده.
 *
 * @param {object} contract قراردادِ ذخیره‌شده (`page.contract`)
 * @param {object[]} candidates خروجی `contractFrom` برای بازدیدِ فعلی
 * @returns {{contract: object, dropped: number}}
 */
export function reinforce(contract, candidates) {
  const now = new Set(candidates.map((item) => JSON.stringify(item)));
  const previous = contract?.must || [];
  const seenIn = (contract?.seenIn || 0) + 1;

  if (!previous.length) {
    return {
      contract: { ...contract, must: candidates, seenIn, lastSeen: new Date().toISOString() },
      dropped: 0,
    };
  }

  /**
   * تقاطع، نه اجتماع.
   *
   * افزودنِ نامزدهای تازه در هر بازدید یعنی قرارداد مدام بزرگ‌تر می‌شود و
   * هیچ‌وقت پایدار نمی‌شود. آنچه در بازدید اول نبود، بخشِ ثابتِ صفحه نیست.
   */
  const kept = previous.filter((item) => now.has(JSON.stringify(item)));

  return {
    contract: { ...contract, must: kept, seenIn, lastSeen: new Date().toISOString() },
    dropped: previous.length - kept.length,
  };
}

/**
 * قرارداد را روی صفحهٔ فعلی بسنج.
 *
 * ── چرا `count()` و نه `waitFor` ──
 *
 * این در پایانِ قدم اجرا می‌شود، جایی که صفحه از قبل نشسته. `waitFor` برای
 * هر بندِ غایب چند ثانیه صبر می‌کند و قراردادِ دوازده‌بندی می‌تواند یک دقیقه
 * به هر قدم اضافه کند.
 *
 * @returns {Promise<{missing: object[], present: number}>}
 */
export async function verifyContract(page, contract) {
  const { resolveTarget } = await import('../scenario/resolve.js');
  const missing = [];
  let present = 0;

  for (const target of contract?.must || []) {
    try {
      const { locator } = resolveTarget(page, target);
      const visible = (await locator.count()) > 0 && (await locator.first().isVisible().catch(() => false));
      if (visible) present++;
      else missing.push(target);
    } catch {
      // توصیفِ نامعتبر ایرادِ قرارداد است نه ایرادِ اپ؛ غایب شمرده می‌شود
      missing.push(target);
    }
  }

  return { missing, present };
}

/** نامِ خوانای یک بندِ قرارداد، برای پیامِ یافته. */
export function describeTarget(target) {
  if (target.testid) return `[${target.testid}]`;
  if (target.label) return `«${target.label}»`;
  if (target.role && target.name) return `${target.role} «${target.name}»`;
  if (target.placeholder) return `ورودیِ «${target.placeholder}»`;
  return JSON.stringify(target).slice(0, 60);
}

export function contractFinding({ path, missing, mode, step, device, synthetic }) {
  const list = missing.map(describeTarget).join('، ');
  const message = `چیزی که در ${path} همیشه بود، حالا نیست: ${list}`;

  return {
    fingerprint: fingerprint({ source: 'contract', message, route: path, step }),
    source: 'contract',
    checkId: `contract:${path}`,
    severity: 'error',
    message,
    normalized: normalizeMessage(message),
    step,
    route: path,
    device,
    at: new Date().toISOString(),
    detail: { missing, mode, path },
    synthetic,
  };
}
