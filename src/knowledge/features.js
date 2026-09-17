/**
 * فیچر — لایهٔ سومِ درخت، و تنها لایه‌ای که خودِ اپ اسمش را نمی‌گوید.
 *
 * ── چرا دو لایهٔ قبلی کافی نبودند ──
 *
 * درخت تا امروز دو چیز می‌شناخت و هر دو را رایگان از نقشه می‌گرفت:
 *
 *   روت   `/content/:id`        آدرس دارد
 *   نما   «افزودن کتاب جدید»   مودال است و خودِ اپ اسمش را گذاشته
 *
 * ولی کاربر گفت در `/content/:id` می‌خواهد **هایلایت، جستجو، سوال کردن**
 * را ببیند. هیچ‌کدام مودال نیستند: کنش‌اند روی متنِ انتخاب‌شده. خزنده
 * آن‌ها را یک دکمه می‌بیند، کنارِ ۱۱۵ دکمهٔ دیگر.
 *
 * پس لایهٔ سوم لازم شد — و این تنها جای درخت است که **واقعاً** مدل لازم
 * دارد. ساختار و شمارش و سلسله‌مراتب همه رایگان‌اند؛ «این ۲۸ دکمه در عمل
 * ۶ کار انجام می‌دهند» را هیچ قاعده‌ای نمی‌گوید.
 *
 * ── چرا یک فایل برای هر دو منبع ──
 *
 * فیچر از دو جا می‌آید: حدسِ مدل، و ثبتِ خودِ کاربر وسطِ گشت. وسوسه این
 * بود که مثلِ نام‌ها دو جا بنشینند (مشتق و ویرایش). ولی فیچر **گره** است
 * نه ویرایشِ یک گره: چیزی که در فایلِ مشتق نیست تا بشود رویش ویرایش
 * گذاشت.
 *
 * پس یک انبار، و `by` مرز را نگه می‌دارد — همان `TRUST` که کلِ این مخزن
 * رویش بنا شده: `user` را هیچ استخراجی دست نمی‌زند، `model` با
 * نام‌گذاریِ دوباره عوض می‌شود.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { knowledgeDir } from './store.js';
import { normalizeCapabilityRoute } from './capabilities.js';

export const FEATURES_VERSION = 1;

function featuresFile(target) {
  return path.join(knowledgeDir(target), 'features.json');
}

function empty(target) {
  return { version: FEATURES_VERSION, target, updatedAt: '', features: {} };
}

export function readFeatures(target) {
  try {
    const raw = JSON.parse(fs.readFileSync(featuresFile(target), 'utf8'));
    if (raw?.version !== FEATURES_VERSION) return empty(target);
    return { ...empty(target), ...raw };
  } catch {
    return empty(target);
  }
}

function write(target, store) {
  const file = featuresFile(target);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  store.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(store, null, 2) + '\n', 'utf8');
  return store;
}

/**
 * شناسهٔ پایدارِ یک فیچر.
 *
 * از **جا و نام** ساخته می‌شود، نه از ترتیب یا زمان — همان قاعدهٔ
 * `capabilityId`. یعنی اگر مدل دوباره همان فیچر را پیدا کند، همان شناسه
 * را می‌گیرد و جای قبلی‌اش را می‌نشیند، نه اینکه ردیفِ دومی بسازد.
 */
export function featureId(where, title) {
  const key = [
    normalizeCapabilityRoute(where?.route),
    String(where?.view || '').trim(),
    String(where?.hash || '').trim(),
    String(title || '').trim(),
  ].join('|');
  return `f${crypto.createHash('sha1').update(key).digest('hex').slice(0, 9)}`;
}

/**
 * «کجا» برای یک فیچر، سه‌تایی است.
 *
 * ── چرا هش هم لازم است ──
 *
 * کاربر گفت: «حتی آدرس‌هایی که با `#` تغییر کرده‌اند». اپ‌های تک‌صفحه‌ای
 * مسیرشان را با هش عوض می‌کنند — `/content/42#notes` با
 * `/content/42#search` دو جای متفاوت‌اند و تا امروز هر دو یک چیز ثبت
 * می‌شدند.
 *
 * `normalizeCapabilityRoute` عمداً هش را دور می‌ریزد (روت باید یکی باشد)،
 * پس هش جداگانه نگه داشته می‌شود: گره همان است، فیچر جای دقیق‌ترش را
 * می‌داند.
 */
export function placeOf(raw) {
  const url = String(raw?.url || raw?.route || '');
  const hash = raw?.hash !== undefined ? String(raw.hash || '') : (url.split('#')[1] || '');
  return {
    route: normalizeCapabilityRoute(url),
    view: String(raw?.view || '').trim(),
    hash: hash.replace(/^#/, '').trim(),
  };
}

/**
 * ثبتِ یک فیچر.
 *
 * @param {object} o
 * @param {object} o.where  `{ route, view, hash }`
 * @param {string} o.title
 * @param {string} [o.expected]  «کارِ درستش چیست» — جملهٔ کاربر
 * @param {'user'|'model'} [o.by]
 */
export function addFeature(target, { where, title, desc = '', expected = '', by = 'user', model = '', actions = [] }) {
  const clean = String(title || '').trim().slice(0, 80);
  if (!clean) throw new Error('نامِ فیچر لازم است');

  const place = placeOf(where);
  if (!place.route) throw new Error('جای فیچر لازم است');

  const store = readFeatures(target);
  const id = featureId(place, clean);
  const before = store.features[id];

  /**
   * حرفِ مدل روی حرفِ آدم نمی‌نشیند.
   *
   * اگر همان فیچر را کاربر ثبت کرده و بعد مدل هم پیدایش کند، نسخهٔ
   * کاربر می‌ماند — همان قاعده‌ای که `merge.js` با `TRUST` دارد و
   * نام‌های قابلیت هم رویش بنا شده‌اند.
   */
  if (before?.by === 'user' && by === 'model') return before;

  store.features[id] = {
    id,
    where: place,
    title: clean,
    desc: String(desc || '').trim().slice(0, 300),
    /** «کارِ درستش چیست» — تنها جایی که می‌شود انتظار را به زبانِ آدم نوشت. */
    expected: String(expected || before?.expected || '').trim().slice(0, 500),
    by,
    model: by === 'model' ? model : '',
    /** برچسبِ کنش‌هایی که مدل می‌گوید این فیچر را می‌سازند. */
    actions: (Array.isArray(actions) ? actions : []).map((one) => String(one).slice(0, 80)).slice(0, 20),
    at: new Date().toISOString(),
    firstAt: before?.firstAt || new Date().toISOString(),
  };

  return write(target, store).features[id];
}

/** ویرایش یا حذفِ یک فیچر. `patch: null` یعنی حذف. */
export function setFeature(target, id, patch) {
  const store = readFeatures(target);
  const key = String(id || '').trim();
  if (!store.features[key]) throw new Error('چنین فیچری نیست');

  if (patch === null) {
    delete store.features[key];
    return write(target, store).features;
  }

  const one = store.features[key];
  if ('title' in patch) one.title = String(patch.title ?? '').trim().slice(0, 80);
  if ('desc' in patch) one.desc = String(patch.desc ?? '').trim().slice(0, 300);
  if ('expected' in patch) one.expected = String(patch.expected ?? '').trim().slice(0, 500);
  /**
   * تأییدِ آدم روی حدسِ مدل.
   *
   * فیچری که مدل ساخته `by: model` است و با نام‌گذاریِ دوباره عوض می‌شود.
   * لحظه‌ای که کاربر دستش می‌زند، `by: user` می‌شود و دیگر هیچ حلقه‌ای
   * نمی‌بردش — حتی همان مدلی که خودش ساخته بودش.
   */
  one.by = 'user';
  one.at = new Date().toISOString();

  return write(target, store).features[key];
}

/**
 * فیچرهای یک هدف، گروه‌شده بر اساسِ گرهِ میزبان.
 *
 * کلید همان `route|view` است که `capabilityId` می‌سازد، تا `buildTree`
 * بتواند مستقیم بچسباندشان — بی هیچ تطبیقِ دوباره‌ای که روزی از آن یکی
 * عقب بیفتد.
 */
export function featuresByPlace(target) {
  const out = new Map();
  for (const one of Object.values(readFeatures(target).features || {})) {
    const key = `${one.where.route}|${one.where.view || ''}`;
    const list = out.get(key) || [];
    list.push(one);
    out.set(key, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.title.localeCompare(b.title, 'fa'));
  return out;
}

/** شمارشِ ساده، برای منو و حالتِ خالی. */
export function summarizeFeatures(target) {
  const all = Object.values(readFeatures(target).features || {});
  return {
    total: all.length,
    byUser: all.filter((one) => one.by === 'user').length,
    byModel: all.filter((one) => one.by === 'model').length,
    withExpected: all.filter((one) => one.expected).length,
  };
}
