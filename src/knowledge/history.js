/**
 * تاریخچهٔ شناخت — «چطور به اینجا رسیدیم».
 *
 * ── چرا پرونده به‌تنهایی کافی نیست ──
 *
 * `dossier.json` می‌گوید **الان** چه می‌دانیم. ولی این ساختار قرار است
 * به‌مرور خودش را پر کند، و سیستمی که خودش را پر می‌کند دیر یا زود چیزی
 * اضافه می‌کند که غلط است. آن لحظه دو سؤال پیش می‌آید که پرونده جوابشان را
 * ندارد: «این از کجا آمد؟» و «کِی عوض شد؟»
 *
 * `by` روی هر بند به سؤال اول جواب می‌دهد. این فایل به دومی.
 *
 * ── چرا ndjson و نه یک آرایه در JSON ──
 *
 * همان دلیلِ `events.ndjson` و `findings.ndjson`: افزودن یک خط، کلِ فایل را
 * نمی‌خواند و بازنویسی نمی‌کند. تاریخچه فقط رشد می‌کند و هرگز ویرایش نمی‌شود.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { TRUST, normalizeBy } from './schema.js';

/** سقفِ خطی که خوانده می‌شود. تاریخچهٔ کهنه در فایل می‌ماند، در حافظه نه. */
const MAX_READ = 2000;

export function historyFile(dir) {
  return path.join(dir, 'history.ndjson');
}

/**
 * یک تغییر را ثبت کن.
 *
 * خطای نوشتن قورت داده می‌شود: تاریخچه دفترِ حساب است، نه خودِ حساب. اجرایی
 * که به‌خاطر پرنشدنِ دفتر بشکند، چیزی را که ثبت می‌کرد هم از دست می‌دهد.
 */
export async function appendHistory(dir, entries) {
  const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
  if (!list.length) return 0;

  const at = new Date().toISOString();
  const lines = list.map((entry) =>
    JSON.stringify({
      at,
      op: String(entry.op || 'set'),
      path: String(entry.path || ''),
      by: normalizeBy(entry.by),
      why: entry.why ? String(entry.why).slice(0, 400) : undefined,
      ref: entry.ref ? String(entry.ref).slice(0, 120) : undefined,
    })
  );

  try {
    await fsp.mkdir(dir, { recursive: true });
    await fsp.appendFile(historyFile(dir), lines.join('\n') + '\n', 'utf8');
    return lines.length;
  } catch {
    return 0;
  }
}

/** آخرین تغییرها، تازه‌ترین اول. خطِ خراب رد می‌شود، نه اینکه بشکند. */
export function readHistory(dir, { limit = 200 } = {}) {
  const file = historyFile(dir);
  if (!fs.existsSync(file)) return [];

  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-MAX_READ);
  const rows = [];
  for (const line of lines.reverse()) {
    if (rows.length >= limit) break;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // خطِ نیمه‌نوشته از یک کرش. بقیهٔ دفتر هنوز خواندنی است.
    }
  }
  return rows;
}

/**
 * فهرست‌هایی که با یک کلید یکتا می‌شوند: نام، کلید، و منبعِ هر عضو.
 *
 * ── چرا پرسش‌ها تابعِ خودشان را دارند ──
 *
 * پرسش کلیدِ `by` ندارد و نباید داشته باشد: خودِ پرسش را مدل ساخته، ولی
 * **جوابش** را آدم داده. با قاعدهٔ عمومی، ثبتِ یک پاسخ در تاریخچه
 * `by: model` می‌خورد — یعنی دقیقاً همان اشتباهِ منبعی که این دفتر برای
 * جلوگیری از آن نوشته شده. یک بار در آزمونِ رابط دیده شد و همان‌جا اصلاح شد.
 */
const KEYED_LISTS = [
  ['routes', 'path'],
  ['glossary', 'term'],
  ['entities', 'name'],
  ['flows', 'name'],
  ['risks', 'label'],
  ['openQuestions', 'q', (item) => (item.answer ? 'user' : 'model')],
];

const SCALAR_FIELDS = ['summary'];
const OBJECT_FIELDS = ['stack', 'auth'];

/**
 * دو پرونده → فهرست تغییرها.
 *
 * ── چرا تفاوتِ ساختاری و نه متنی ──
 *
 * `diff`ِ متنی روی JSON، جابه‌جا شدنِ ترتیبِ یک آرایه را هم «تغییر» می‌خواند.
 * چیزی که ما می‌خواهیم بدانیم این است که **کدام بند** اضافه، حذف یا عوض شد —
 * تا بعداً بشود پرسید «چه کسی `/settings` را اضافه کرد».
 */
export function diffDossier(before, after) {
  const changes = [];
  const old = before || {};
  const now = after || {};

  for (const field of SCALAR_FIELDS) {
    if ((old[field] || '') !== (now[field] || '')) {
      changes.push({ op: old[field] ? 'update' : 'add', path: field, by: now.by || 'model' });
    }
  }

  for (const field of OBJECT_FIELDS) {
    // کلیدهای منبع کنار گذاشته می‌شوند: تغییرِ `confidence` به‌تنهایی خبر
    // نیست و تاریخچه را از سطرهای بی‌معنا پر می‌کند.
    const strip = (value) => {
      const copy = { ...(value || {}) };
      for (const key of ['by', 'confidence', 'conflict', 'at']) delete copy[key];
      return JSON.stringify(copy);
    };
    if (strip(old[field]) !== strip(now[field])) {
      changes.push({ op: 'update', path: field, by: now[field]?.by || 'model' });
    }
  }

  for (const [field, key, byOf] of KEYED_LISTS) {
    const sourceOf = byOf || ((item) => item.by);
    const oldMap = new Map((old[field] || []).map((item) => [item[key], item]));
    const newMap = new Map((now[field] || []).map((item) => [item[key], item]));

    for (const [id, item] of newMap) {
      const previous = oldMap.get(id);
      if (!previous) {
        changes.push({ op: 'add', path: `${field}[${id}]`, by: sourceOf(item) });
      } else if (JSON.stringify(previous) !== JSON.stringify(item)) {
        /**
         * ترفیع، جدا از ویرایش.
         *
         * بندی که از `model` به `user` می‌رود اتفاقِ مهمی است — یعنی آدم
         * تأییدش کرده. زیر برچسبِ عمومیِ «update» گم می‌شد.
         */
        const [was, is] = [sourceOf(previous), sourceOf(item)];
        const op = TRUST[is] > TRUST[was] ? 'promote' : 'update';
        changes.push({ op, path: `${field}[${id}]`, by: is });
      }
    }

    for (const id of oldMap.keys()) {
      if (!newMap.has(id)) changes.push({ op: 'remove', path: `${field}[${id}]`, by: 'user' });
    }
  }

  return changes;
}
