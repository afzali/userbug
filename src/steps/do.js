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
import { snapshotPage } from './snapshot.js';
import { redactDeep, secretsOf } from '../models/redact.js';
import { askJson } from '../models/provider.js';

const SYSTEM = `تو یک دستیارِ تستِ رابط کاربری هستی.
ورودی: نمای فشردهٔ صفحه و یک نیت به زبان فارسی.
خروجی: فقط JSON، بدون توضیح.

قالب:
{"action":"click"|"fill"|"check"|"press","target":{"role":"...","name":"...","exact":true},"value":"..."}

قواعد:
- «target» باید دقیقاً به یکی از عناصر فهرست اشاره کند.
- اگر عنصر «testid» دارد، از {"testid":"..."} استفاده کن؛ پایدارتر است.
- «value» فقط برای fill و press.
- اگر هیچ عنصری با نیت نمی‌خواند، برگردان {"action":"none","reason":"..."}.`;

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

  const stored = putEntry(cache, intent, entry);
  return { source: cached ? 'healed' : 'model', entry: stored, locator: check.locator };
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

  return {
    intent,
    action: json.action,
    target: json.target,
    // مقدارِ پیشنهادیِ مدل فقط وقتی می‌ماند که سناریو خودش مقداری نداده باشد
    value: json.value,
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
