/**
 * حل قدمِ زبان‌طبیعی — `do:`.
 *
 * ── مسیرِ ارزان و مسیرِ گران ──
 *
 *   کش دارد؟  →  امضا می‌خورد؟  →  اجرا، بدون هیچ تماسی با مدل
 *        نه              نه
 *         ↓               ↓
 *        مدل حل می‌کند، کش تازه می‌شود، بعد اجرا
 *
 * نودوپنج درصد اجراها از مسیر بالا رد می‌شوند. این تنها دلیلی است که این لایه
 * از نظر اقتصادی ممکن است.
 */
import { resolveTarget } from '../scenario/resolve.js';
import { signatureOf } from './signature.js';
import { snapshotPage, descriptorFor } from './snapshot.js';
import { redactDeep, secretsOf } from '../models/redact.js';
import { askJson } from '../models/provider.js';

const SYSTEM = `تو یک دستیارِ تستِ رابط کاربری هستی.

ورودی: فهرست عناصرِ صفحه (هر کدام با یک شمارهٔ «ref») و یک نیت به زبان فارسی.
کارِ تو فقط انتخاب است: کدام عنصر و چه کنشی.

خروجی: فقط JSON، بدون توضیح و بدون حصار markdown.

قالب:
{"action":"click"|"fill"|"check"|"press","ref":<شماره>}

قواعد:
- «ref» باید یکی از شماره‌های همان فهرست باشد. عنصر تازه نساز.
- برای پر کردن یک ورودی، action برابر fill.
- اگر هیچ عنصری با نیت نمی‌خواند: {"action":"none","reason":"..."}`;

/**
 * @returns {{source: 'cache'|'model'|'healed', entry: object}}
 */
export async function resolveDo({ page, intent, cache, models, budget, identity, getEntry, putEntry, forceModel }) {
  const cached = getEntry(cache, intent);

  if (cached && !forceModel) {
    const check = await tryCached(page, cached);
    if (check.ok) {
      // ورودیِ دست‌نویس یا مهاجرت‌شده امضا ندارد؛ نخستین استفادهٔ موفق ثبتش
      // می‌کند. از آن به بعد، محافظتِ امضا برقرار است.
      const learnedSignature = !cached.domSignature;
      if (learnedSignature) cached.domSignature = check.signature;
      return { source: 'cache', entry: cached, locator: check.locator, learnedSignature };
    }
    // selector نبود، یا بود ولی محیطش عوض شده — هر دو یعنی کش باطل است
  }

  const entry = await askModel({ page, intent, models, budget, identity });
  const check = await tryCached(page, entry);
  if (!check.ok) {
    throw new Error(`مدل برای «${intent}» عنصری داد که پیدا نشد: ${JSON.stringify(entry.target)}`);
  }
  entry.domSignature = check.signature;

  /**
   * «دوباره حل شد» با «عوض شده بود» یکی نیست.
   *
   * بازبینیِ نمونه‌ای (یک از هر N اجرا) همهٔ قدم‌ها را دوباره از مدل می‌پرسد.
   * اگر همان را heal بشماریم، `healCount` هر بار باد می‌کند و سیگنالِ
   * «این گوشهٔ رابط ناپایدار است» به نویز تبدیل می‌شود.
   *
   * پس فقط وقتی heal است که نتیجه واقعاً فرق کرده باشد.
   */
  const unchanged =
    cached &&
    cached.domSignature === entry.domSignature &&
    JSON.stringify(cached.target) === JSON.stringify(entry.target);

  const stored = putEntry(cache, intent, entry, { changed: !unchanged });
  const source = !cached ? 'model' : unchanged ? 'verified' : 'healed';
  return { source, entry: stored, locator: check.locator };
}

/** آیا این ورودیِ کش هنوز به عنصری با همان امضا می‌رسد؟ */
async function tryCached(page, entry) {
  let locator;
  try {
    ({ locator } = resolveTarget(page, entry.target));
  } catch {
    return { ok: false };
  }

  if ((await locator.count()) !== 1) return { ok: false };
  if (!(await locator.isVisible().catch(() => false))) return { ok: false };

  const signature = await signatureOf(locator).catch(() => null);
  if (!signature) return { ok: false };

  // امضای نداشته یعنی ورودیِ تازه از مدل — پذیرفته می‌شود و ثبت می‌گردد
  if (entry.domSignature && entry.domSignature !== signature) return { ok: false };

  return { ok: true, locator, signature };
}

async function askModel({ page, intent, models, budget, identity }) {
  const snapshot = await snapshotPage(page);
  const safe = redactDeep(snapshot, secretsOf(identity));

  const { json } = await askJson(
    models,
    {
      system: SYSTEM,
      user: `نیت: ${intent}\n\nصفحه:\n${JSON.stringify(safe, null, 1)}`,
    },
    budget
  );

  if (!json.action || json.action === 'none') {
    throw new Error(`مدل نتوانست «${intent}» را به عنصری نگاشت کند: ${json.reason || 'بدون دلیل'}`);
  }

  const item = snapshot.items.find((i) => i.ref === Number(json.ref));
  if (!item) {
    throw new Error(`مدل ref نامعتبر داد: ${json.ref} (فهرست ${snapshot.items.length} عنصر داشت)`);
  }

  // ساختنِ توصیفِ پایدار کارِ ماست، نه مدل. مدل فقط انتخاب می‌کند.
  const target = descriptorFor(item);
  if (!target) throw new Error(`عنصر ref=${json.ref} توصیفِ پایداری ندارد`);

  return {
    intent,
    action: json.action,
    target,
    resolvedBy: `${models.provider}:${models.model}`,
  };
}

/** اجرای کاری که حل شد. */
export async function performAction(locator, entry, page) {
  switch (entry.action) {
    case 'click':
      return locator.click();
    case 'fill':
      return locator.fill(String(entry.value ?? ''));
    case 'check':
      return locator.check();
    case 'press':
      return page.keyboard.press(String(entry.value ?? 'Enter'));
    default:
      throw new Error(`کنشِ ناشناخته از مدل: ${entry.action}`);
  }
}
