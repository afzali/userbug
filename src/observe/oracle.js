/**
 * داور.
 *
 * تصمیم می‌گیرد کدام رخداد یک یافتهٔ واقعی است و کدام نویز. این تنها چیزی است
 * که کاوشِ بی‌سناریو را از سرگرمی به ابزار تبدیل می‌کند: عامل فقط می‌گردد،
 * قضاوت اینجا انجام می‌شود.
 */
import crypto from 'node:crypto';

/**
 * پیام را برای اثرانگشت‌گیری بی‌اثر از جزئیات متغیر کن.
 *
 * بدون این، یک باگ در ۲۰۰ اجرا می‌شود ۲۰۰ یافتهٔ متفاوت — چون هر بار شناسه و
 * پورت و زمانِ دیگری در متن است. همین یک تابع است که فهرست یافته‌ها را
 * تا هفتهٔ دوم قابل‌استفاده نگه می‌دارد.
 */
export function normalizeMessage(message) {
  return String(message)
    .replace(/\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b[0-9a-f]{32,}\b/gi, '<hash>')
    .replace(/https?:\/\/[^\s"')]+/g, '<url>')
    .replace(/:\d+:\d+/g, ':<pos>')
    .replace(/\b\d{4}-\d{2}-\d{2}[T ][\d:.]+/g, '<time>')
    .replace(/\b\d+\b/g, '<n>')
    .trim()
    .slice(0, 300);
}

/**
 * اثرانگشت = هویتِ نقص، نه محلِ دیدنش.
 *
 * اولین پیاده‌سازی، قدم را هم در اثرانگشت آورده بود و نتیجه‌اش این شد که یک
 * پنجرهٔ مزاحم در نُه قدم مختلف، نُه «یافتهٔ یکتا» شمرده شد. قدم و مسیر
 * زمینه‌اند و کنار یافته نگه داشته می‌شوند، ولی هویتش را نمی‌سازند —
 * وگرنه فهرست یافته‌ها با همان نویزی پر می‌شود که قرار بود حذفش کند.
 */
export function fingerprint({ source, message }) {
  const basis = [source, normalizeMessage(message)].join('|');
  return crypto.createHash('sha1').update(basis).digest('hex').slice(0, 12);
}

function isAllowed(message, allowlist) {
  return allowlist.some((rx) => rx.test(message));
}

/**
 * رخدادهای یک قدم را قضاوت کن.
 *
 * @returns {{findings: object[], suppressed: number}}
 */
export function judge(events, { allowlist = [], step, route } = {}) {
  const findings = [];
  let suppressed = 0;

  for (const e of events) {
    if (e.severity !== 'error') continue;
    if (isAllowed(e.message, allowlist)) {
      suppressed++;
      continue;
    }
    findings.push({
      fingerprint: fingerprint({ source: e.source, message: e.message, route, step }),
      source: e.source,
      severity: e.severity,
      message: e.message,
      normalized: normalizeMessage(e.message),
      step,
      route,
      at: e.at,
      detail: e.stack || e.location || e.url || null,
    });
  }

  return { findings, suppressed };
}

/**
 * یافته‌های هم‌اثرانگشت را یکی کن.
 *
 * قدم‌هایی که در آن‌ها دیده شده جمع می‌شوند، چون «این باگ در پنج قدم مختلف
 * ظاهر می‌شود» خودش اطلاعات است — ولی پنج ردیف در فهرست، نویز.
 */
export function dedupe(findings) {
  const byPrint = new Map();
  for (const f of findings) {
    const seen = byPrint.get(f.fingerprint);
    if (seen) {
      seen.count++;
      if (!seen.steps.includes(f.step)) seen.steps.push(f.step);
      continue;
    }
    byPrint.set(f.fingerprint, { ...f, count: 1, steps: [f.step] });
  }
  return [...byPrint.values()];
}
