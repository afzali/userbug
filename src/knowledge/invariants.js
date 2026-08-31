/**
 * انبارِ ناوردا — `knowledge/<کلید>/invariants.json`.
 *
 * ── چرا فایلِ جدا و نه داخل `checks.json` ──
 *
 * `checks.json` فقط **حالت** نگه می‌دارد: چکِ همگانی از قبل در کد تعریف شده
 * و آنجا فقط `mode` و `why` و شمارنده‌اش می‌نشیند. ناوردا برعکس است — خودِ
 * تعریفش داده است: جمله، پرس‌وجو، و اینکه از کجای سورس آمده.
 *
 * ریختنِ هر دو در یک فایل یعنی یک فایل با دو شکلِ کاملاً متفاوت، و
 * اعتبارسنجی‌ای که باید بفهمد کدام ردیف کدام است.
 *
 * ── چرا `mode` دستِ آدم می‌ماند حتی وقتی سورس دوباره خوانده می‌شود ──
 *
 * `learn` را می‌شود ده بار زد. اگر هر بار حالت‌ها به پیش‌فرض برمی‌گشتند،
 * ناوردایی که کاربر عمداً خاموش کرده بود دوباره روشن می‌شد و همان یافتهٔ
 * قلابی برمی‌گشت — و بار دوم دیگر کسی خاموشش نمی‌کند، گزارش را می‌بندد.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CHECK_MODES } from './schema.js';
import { knowledgeDir } from './store.js';

function file(target) {
  return path.join(knowledgeDir(target), 'invariants.json');
}

function normalize(raw) {
  const id = String(raw?.id ?? '').trim();
  if (!id) return null;
  return {
    id,
    kind: String(raw?.kind ?? 'custom'),
    statement: String(raw?.statement ?? '').slice(0, 400),
    table: String(raw?.table ?? ''),
    columns: Array.isArray(raw?.columns) ? raw.columns.map(String) : [],
    from: String(raw?.from ?? ''),
    by: ['user', 'source', 'model'].includes(raw?.by) ? raw.by : 'source',
    mode: CHECK_MODES.includes(raw?.mode) ? raw.mode : 'watch',
    query: String(raw?.query ?? ''),
    expect: ['empty', 'zero', 'max'].includes(raw?.expect) ? raw.expect : 'empty',
    max: Number.isFinite(raw?.max) ? raw.max : undefined,
    why: String(raw?.why ?? '').slice(0, 300),
    noise: Math.max(0, Number(raw?.noise) || 0),
  };
}

export function listInvariants(target) {
  try {
    const raw = JSON.parse(fs.readFileSync(file(target), 'utf8'));
    return (Array.isArray(raw?.invariants) ? raw.invariants : []).map(normalize).filter(Boolean);
  } catch {
    return [];
  }
}

export function writeInvariants(target, invariants) {
  const dir = knowledgeDir(target);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    file(target),
    JSON.stringify({ version: 1, invariants: invariants.map(normalize).filter(Boolean) }, null, 2) + '\n',
    'utf8'
  );
}

/**
 * ناورداهای تازه را اضافه کن، بی‌آنکه تصمیمِ آدم را پاک کنی.
 *
 * @returns {{added: number, kept: number}}
 */
export function mergeInvariants(target, incoming) {
  const existing = listInvariants(target);
  const byId = new Map(existing.map((item) => [item.id, item]));
  let added = 0;
  let kept = 0;

  for (const raw of incoming) {
    const item = normalize(raw);
    if (!item) continue;
    const previous = byId.get(item.id);

    if (!previous) {
      byId.set(item.id, item);
      added++;
      continue;
    }

    /**
     * محتوا تازه می‌شود، تصمیم نه.
     *
     * جمله و پرس‌وجو از سورس می‌آیند و ممکن است عوض شده باشند. ولی `mode` و
     * `why` و شمارندهٔ سروصدا حاصلِ قضاوت‌اند و از سورس درنمی‌آیند.
     */
    byId.set(item.id, { ...item, mode: previous.mode, why: previous.why, noise: previous.noise });
    kept++;
  }

  writeInvariants(target, [...byId.values()]);
  return { added, kept };
}

/**
 * حالتِ یک ناوردا — همان قاعدهٔ `setCheckMode`: خاموشی دلیل می‌خواهد.
 */
export function setInvariantMode(target, id, mode, why = '') {
  if (!CHECK_MODES.includes(mode)) throw new Error(`حالتِ نامعتبر: «${mode}»`);
  if (mode === 'off' && !String(why).trim()) {
    throw new Error('خاموش کردنِ ناوردا بدون دلیل ممکن نیست؛ `why` را بنویسید');
  }

  const invariants = listInvariants(target);
  const found = invariants.find((item) => item.id === id);
  if (!found) throw new Error(`ناوردایی به نام «${id}» نیست`);

  found.mode = mode;
  found.why = String(why).trim();
  writeInvariants(target, invariants);
  return found;
}

/**
 * ناوردایی که خودِ کاربر نوشته.
 *
 * ── چرا پرس‌وجو اجباری است ──
 *
 * جمله‌ای مثل «سبد خرید نباید منفی شود» بدون پرس‌وجو، فقط یک یادداشت است.
 * ثبتش به‌عنوان ناوردا یعنی فهرستی که نصفش اجرا نمی‌شود و کسی نمی‌داند
 * کدام نیمه.
 */
export function addUserInvariant(target, { id, statement, query, expect = 'empty', max, why = '' }) {
  const key = String(id ?? '').trim();
  if (!/^[\p{L}\p{N}_-]+$/u.test(key)) throw new Error(`شناسهٔ ناوردا نامعتبر است: «${id}»`);
  if (!String(statement ?? '').trim()) throw new Error('ناوردا باید یک جملهٔ روشن داشته باشد');
  if (!String(query ?? '').trim()) throw new Error('ناوردا بدون پرس‌وجو اجرا نمی‌شود');

  const invariants = listInvariants(target).filter((item) => item.id !== key);
  invariants.push(
    normalize({ id: key, kind: 'custom', statement, query, expect, max, why, by: 'user', mode: 'watch' })
  );
  writeInvariants(target, invariants);
  return invariants.find((item) => item.id === key);
}
