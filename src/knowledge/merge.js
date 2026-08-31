/**
 * ادغامِ شناختِ تازه در پروندهٔ موجود.
 *
 * ── تنها قاعده‌ای که این فایل دارد ──
 *
 * **تازگی برنده نیست، اعتماد برنده است.** بدون این، `userbug learn` که دو بار
 * زده شود جملهٔ کاربر را با حدسِ مدل جایگزین می‌کرد — و کاربر هیچ‌وقت
 * نمی‌فهمید، چون خروجی هر دو بار «موفق» بود.
 *
 * ── تعارض حذف نمی‌شود، ثبت می‌شود ──
 *
 * وقتی مدل چیزی می‌گوید که با بندِ کاربر نمی‌خواند، دو کارِ غلط ممکن است:
 * بازنویسیِ حرفِ کاربر (خطرناک)، یا دور ریختنِ حرفِ مدل (اطلاعات از دست
 * می‌رود — شاید کاربر اشتباه کرده یا اپ عوض شده).
 *
 * پس هیچ‌کدام: بندِ کاربر می‌ماند و حرفِ مدل کنارش در `conflict` می‌نشیند تا
 * رابط نشانش بدهد. این تنها شکلی است که به کاربر اجازهٔ تصمیم می‌دهد.
 */
import { TRUST, normalizeBy, normalizeDossier } from './schema.js';

/** فهرست‌های کلیددار و کلیدشان — همان فهرستِ `history.js`، به یک دلیل مشترک. */
const KEYED = [
  ['routes', 'path'],
  ['glossary', 'term'],
  ['entities', 'name'],
  ['flows', 'name'],
  ['risks', 'label'],
];

/** فیلدهایی که خودشان یک شیءِ واحدند، نه فهرست. */
const SINGLE = ['stack', 'auth'];

function trustOf(item) {
  return TRUST[normalizeBy(item?.by)] ?? 0;
}

/** آیا محتوای دو بند (بی‌توجه به منبعشان) فرق دارد؟ */
function differs(a, b) {
  const strip = (value) => {
    const copy = { ...(value || {}) };
    for (const key of ['by', 'confidence', 'conflict', 'at', 'detector']) delete copy[key];
    for (const key of Object.keys(copy)) if (copy[key] === '' || copy[key] === null) delete copy[key];
    return JSON.stringify(copy, Object.keys(copy).sort());
  };
  return strip(a) !== strip(b);
}

function noteConflict(kept, incoming) {
  const note = summarize(incoming);
  if (!note) return kept;

  const conflict = [...(kept.conflict || [])];
  // تعارضِ تکراری اضافه نمی‌شود، وگرنه هر بار `learn` فهرست را بلندتر می‌کرد
  if (conflict.some((item) => item.note === note && item.by === incoming.by)) return kept;

  conflict.push({ by: normalizeBy(incoming.by), note, at: new Date().toISOString() });
  return { ...kept, conflict: conflict.slice(-10) };
}

function summarize(item) {
  const parts = Object.entries(item || {})
    .filter(([key, value]) => !['by', 'confidence', 'conflict', 'at', 'detector'].includes(key) && value)
    .map(([key, value]) => `${key}: ${String(value).slice(0, 120)}`);
  return parts.join(' · ').slice(0, 400);
}

/**
 * یک بند: نگه‌داشتن، جایگزینی، یا ثبتِ تعارض.
 *
 * برابری اعتماد یعنی تازه‌تر برنده است — دو بار خواندنِ سورس باید سورسِ
 * امروز را بدهد، نه سورسِ هفتهٔ پیش.
 */
function mergeItem(existing, incoming) {
  if (!existing) return incoming;
  if (!differs(existing, incoming)) {
    // محتوا یکی است؛ فقط اعتماد ممکن است بالا رفته باشد
    return trustOf(incoming) > trustOf(existing) ? { ...existing, ...incoming } : existing;
  }
  if (trustOf(incoming) >= trustOf(existing)) return { ...incoming, conflict: existing.conflict };
  return noteConflict(existing, incoming);
}

/**
 * پرسش‌ها قاعدهٔ خودشان را دارند.
 *
 * پرسشی که **جواب گرفته** دوباره باز نمی‌شود؛ فقط شمارندهٔ `asked` بالا
 * می‌رود تا معلوم باشد باز هم پیش آمده. بازکردنِ دوبارهٔ پرسشِ جواب‌گرفته
 * یعنی از کاربر خواستن که یک چیز را دو بار بگوید — و بار سوم دیگر نمی‌گوید.
 */
function mergeQuestions(existing = [], incoming = []) {
  const byText = new Map(existing.map((item) => [item.q, { ...item }]));

  for (const item of incoming) {
    const q = String(item?.q ?? '').trim();
    if (!q) continue;
    const previous = byText.get(q);
    if (previous) {
      previous.asked = (previous.asked || 1) + 1;
      continue;
    }
    byText.set(q, { ...item, q, asked: 1 });
  }
  return [...byText.values()];
}

/**
 * پرونده + تکهٔ تازه → پروندهٔ تازه.
 *
 * ورودی نرمال می‌شود، پس تکه‌ای که مستقیم از خروجی مدل آمده هم بی‌خطر است.
 *
 * @param {object} current پروندهٔ فعلی
 * @param {object} partial تکهٔ تازه — فقط کلیدهایی که دارد لمس می‌شوند
 * @returns {{dossier: object, kept: number, replaced: number, conflicts: number}}
 */
export function mergeIntoDossier(current, partial) {
  const base = normalizeDossier(current, { target: current?.target });
  const patch = normalizeDossier({ ...partial, target: base.target }, { target: base.target });

  const next = { ...base };
  const stats = { kept: 0, replaced: 0, conflicts: 0 };

  if (partial?.summary !== undefined) {
    /**
     * خلاصه منبعِ خودش را ندارد و از `stack.by` هم نمی‌شود فهمید.
     * پس محافظه‌کارانه: خلاصهٔ موجود فقط وقتی عوض می‌شود که خالی باشد یا
     * تکهٔ تازه صریحاً از کاربر آمده باشد.
     */
    const incomingBy = normalizeBy(partial.summaryBy ?? partial.stack?.by ?? 'model');
    if (!base.summary || incomingBy === 'user') {
      if (patch.summary && patch.summary !== base.summary) stats.replaced++;
      next.summary = patch.summary || base.summary;
    } else if (patch.summary && patch.summary !== base.summary) {
      stats.kept++;
    }
  }

  for (const field of SINGLE) {
    if (partial?.[field] === undefined) continue;
    const merged = mergeItem(base[field], patch[field]);
    if (merged.conflict?.length > (base[field].conflict?.length || 0)) stats.conflicts++;
    else if (merged !== base[field]) stats.replaced++;
    next[field] = merged;
  }

  for (const [field, key] of KEYED) {
    if (partial?.[field] === undefined) continue;

    const byKey = new Map(base[field].map((item) => [item[key], item]));
    for (const item of patch[field]) {
      const existing = byKey.get(item[key]);
      const merged = mergeItem(existing, item);

      if (!existing) stats.replaced++;
      else if ((merged.conflict?.length || 0) > (existing.conflict?.length || 0)) stats.conflicts++;
      else if (merged === existing) stats.kept++;
      else stats.replaced++;

      byKey.set(item[key], merged);
    }
    next[field] = [...byKey.values()];
  }

  if (partial?.openQuestions !== undefined) {
    next.openQuestions = mergeQuestions(base.openQuestions, patch.openQuestions);
  }

  if (partial?.files !== undefined) {
    next.files = {
      uploads: mergeFileList(base.files.uploads, patch.files.uploads),
      downloads: mergeFileList(base.files.downloads, patch.files.downloads),
    };
  }

  if (partial?.sources !== undefined) {
    next.sources = [...base.sources, ...patch.sources].slice(-50);
  }

  return { dossier: normalizeDossier(next, { target: base.target }), ...stats };
}

function mergeFileList(existing = [], incoming = []) {
  const byKey = new Map(existing.map((item) => [item.what, item]));
  for (const item of incoming) byKey.set(item.what, mergeItem(byKey.get(item.what), item));
  return [...byKey.values()];
}

/**
 * جوابِ یک پرسش — همیشه `by: user`.
 *
 * ── چرا اینجا و نه در رابط ──
 *
 * جوابِ کاربر پراعتمادترین چیزی است که این سیستم می‌گیرد. اگر نوشتنش در
 * کامپوننت Svelte می‌ماند، CLI راهی برای همان کار نداشت و قاعدهٔ «هر کاری از
 * هر دو» می‌شکست.
 *
 * `field` اختیاری است: پرسشی که بگوید جوابش کجا می‌نشیند، مستقیم همان‌جا هم
 * نوشته می‌شود. پرسشی که نگوید، جوابش فقط در فهرست می‌ماند و آدم بعداً
 * جاگذاری‌اش می‌کند.
 */
export function answerQuestion(dossier, question, answer) {
  const base = normalizeDossier(dossier, { target: dossier?.target });
  const text = String(answer ?? '').trim();
  if (!text) throw new Error('جوابِ خالی ثبت نمی‌شود');

  const target = base.openQuestions.find((item) => item.q === question);
  if (!target) throw new Error(`چنین پرسشی در پرونده نیست: «${question}»`);

  target.answer = text;
  target.answeredAt = new Date().toISOString();

  if (target.field === 'summary') base.summary = text;
  else if (target.field === 'risks') {
    base.risks.push({ label: text.slice(0, 120), why: `پاسخ به: ${question}`, by: 'user' });
  } else if (target.field === 'glossary') {
    const [term, ...rest] = text.split(/[:：\-—]/);
    if (rest.length) base.glossary.push({ term: term.trim(), meaning: rest.join('-').trim(), by: 'user' });
  }

  return normalizeDossier(base, { target: base.target });
}
