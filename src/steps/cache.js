/**
 * کش قدم‌ها — هستهٔ اقتصادیِ فاز ۲.
 *
 * مدل فقط وقتی صدا زده می‌شود که مسیر را بلد نباشیم. هر قدمِ زبان‌طبیعی که یک
 * بار حل شد، دفعه‌های بعد بدون هیچ تماسی اجرا می‌شود.
 *
 * ── چرا کش در گیت می‌ماند و در .gitignore نیست ──
 *
 * کش «فایل موقت» نیست؛ مسیرِ یادگرفته‌شده است. اگر محلی بماند، هر نفر و هر
 * اجرای CI دوباره از اول پول می‌دهد — یعنی همان چیزی که این لایه قرار بود
 * حذفش کند. پس کنار سناریو می‌نشیند و با پروژه سفر می‌کند.
 *
 * ── نرخ heal یک سیگنال است، نه یک عدد بی‌مصرف ──
 *
 * قدمی که مدام heal می‌خورد یعنی آن گوشهٔ رابط ناپایدار است. این خودش
 * اطلاعاتی است دربارهٔ اپ، نه فقط دربارهٔ کش.
 */
import fs from 'node:fs';
import path from 'node:path';
import { scenarioDir } from '../scenario/load.js';

function cacheFile(targetName, scenarioId) {
  return path.join(scenarioDir(targetName), '_learned', `${scenarioId}.json`);
}

export function loadCache(targetName, scenarioId) {
  const file = cacheFile(targetName, scenarioId);
  if (!fs.existsSync(file)) return { version: 1, steps: {} };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // کشِ خراب نباید اجرا را بخواباند؛ از نو یاد می‌گیریم
    return { version: 1, steps: {} };
  }
}

export function saveCache(targetName, scenarioId, cache) {
  const file = cacheFile(targetName, scenarioId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cache, null, 2), 'utf8');
}

/**
 * کلیدِ یک قدم.
 *
 * از خودِ نیت ساخته می‌شود نه از شمارهٔ قدم — وگرنه افزودن یک قدم به وسط
 * سناریو، کلِ کش را جابه‌جا و بی‌اعتبار می‌کرد.
 */
export function stepKey(intent) {
  return String(intent).trim().replace(/\s+/g, ' ');
}

export function getEntry(cache, intent) {
  return cache.steps[stepKey(intent)] || null;
}

export function putEntry(cache, intent, entry, { changed = true } = {}) {
  const key = stepKey(intent);
  const previous = cache.steps[key];
  cache.steps[key] = {
    ...entry,
    // فقط تغییرِ واقعی heal است. بازبینیِ نمونه‌ای که همان نتیجه را بدهد،
    // شمارنده را بالا نمی‌برد — وگرنه سیگنالِ ناپایداری بی‌معنا می‌شود.
    healCount: previous ? (previous.healCount || 0) + (changed ? 1 : 0) : 0,
    firstLearned: previous?.firstLearned || new Date().toISOString(),
    lastVerified: new Date().toISOString(),
  };
  return cache.steps[key];
}

export function markVerified(cache, intent) {
  const entry = getEntry(cache, intent);
  if (entry) entry.lastVerified = new Date().toISOString();
}

/**
 * آیا این اجرا باید نمونه‌ای بازبینی شود؟
 *
 * حتی وقتی همه‌چیز کش دارد، از هر N اجرا یکی کامل با مدل حل می‌شود. بدون این،
 * انحرافِ خاموش — کشی که هنوز اجرا می‌شود ولی معنایش عوض شده — هرگز پیدا
 * نمی‌شود.
 */
export function shouldReverify(runId, every) {
  if (!every || every < 2) return false;
  let h = 0;
  for (const ch of String(runId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % every === 0;
}
