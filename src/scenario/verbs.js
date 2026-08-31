/**
 * فعل‌های زبانِ سناریو — یک منبع، سه مصرف‌کننده.
 *
 * مفسر (`run.js`) با `switch` کار می‌کند، پس این فهرست *دومینِ* جای نگه‌داری
 * فعل‌هاست. درست است که تکرار بد است، ولی دو مصرف‌کنندهٔ دیگر بدون فهرستِ
 * داده‌ای نمی‌توانند کار کنند:
 *
 *   ۱. `normalizeStep` — تا فعلِ ناشناس در **بارگذاری** بشکند نه وقتی نوبتِ
 *      اجرای همان قدم برسد. پیش‌تر سناریوی چهل‌قدمی با غلط املایی در قدم ۳۸،
 *      ۳۷ قدم را اجرا می‌کرد و بعد می‌شکست.
 *   ۲. ساختِ سناریو از متن با مدل — خروجی مدل باید پیش از ذخیره سنجیده شود.
 *
 * برای اینکه این فهرست از `switch` عقب نماند، `scenarios/_selftest/verbs.spec.js`
 * هر دو را از روی سورس مقایسه می‌کند و اختلاف را می‌شکند.
 */

/** فعل‌هایی که مفسر می‌شناسد. */
export const KNOWN_VERBS = new Set([
  // ناوبری
  'go',
  'back',
  'forward',
  'reload',
  // تعامل
  'click',
  'dblclick',
  'clickIfPresent',
  'hover',
  'check',
  'fill',
  'type',
  'press',
  'paste',
  // انتظار و شرط
  'wait',
  'when',
  'expect',
  'assert',
  // وضعیت و داده
  'clearState',
  'set',
  'download',
  'upload',
  'query',
  'request',
  'offline',
  // ساختار
  'forEach',
  'note',
  'answerDialog',
  'dismissBlockers',
  // مدل
  'do',
  'explore',
]);

/**
 * کلیدهایی که فعل نیستند، بلکه به فعلِ همان قدم وصل‌اند.
 *
 * `normalizeStep` هم همین فهرست را رد می‌کند تا `{fill: …, value: …}` دو فعل
 * شمرده نشود.
 */
export const MODIFIER_KEYS = ['detail', 'finding', 'else', 'then', 'value', 'timeout', 'delay'];

/**
 * فعلِ یک قدم، یا `null` اگر نداشته باشد.
 *
 * جدا شده تا اعتبارسنجیِ خروجی مدل بتواند بدون بارگذاریِ موتور، همان قاعده را
 * اعمال کند.
 */
export function stepVerb(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const keys = Object.keys(raw).filter((key) => key !== 'as');
  return keys.find((key) => !MODIFIER_KEYS.includes(key)) ?? null;
}
