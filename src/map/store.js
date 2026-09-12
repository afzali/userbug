/**
 * انبارِ نقشه — `knowledge/<کلید>/map.json`.
 *
 * ── چرا کنارِ پروندهٔ شناخت و نه داخلش ──
 *
 * `dossier.json` را آدم می‌خواند و رابط ویرایش می‌کند؛ هر بندش قرار است
 * کوچک و معنادار بماند. نقشه برعکس است: ماشین می‌نویسدش، دهها گره و صدها یال
 * دارد، و هر خزش بزرگ‌ترش می‌کند. ریختنش داخل پرونده یعنی همان فایلی که
 * جملهٔ آدم در آن است، با زبالهٔ ساختاری پر شود.
 *
 * نقشه به پرونده **خبر می‌دهد** (روتِ تازه → `routes` با `by: run`) ولی
 * جایش آنجا نیست.
 *
 * ── چرا هر قدم نوشته می‌شود، نه در پایان ──
 *
 * خزشِ چهل‌دقیقه‌ای که در دقیقهٔ ۳۹ بشکند باید از همان‌جا ادامه بدهد. همان
 * درسی که `explore.js` بعد از سوختنِ هشت قدم گرفت: چیزی که فقط در مسیرِ
 * خوش‌فرجام نوشته شود، دقیقاً وقتی لازم است که نیست.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { assertKnowledgeKey, knowledgeDir } from '../knowledge/store.js';
import { mergeActions } from './state.js';

export const MAP_VERSION = 1;

/** سقف‌های پیش‌فرض. عدد، نه نامی مثل «کم/متوسط» — چون عدد همان هزینه است. */
export const DEFAULT_CAPS = { states: 60, actionsPerState: 25, minutes: 20 };

export function mapFile(target) {
  return path.join(knowledgeDir(target), 'map.json');
}

export function emptyMap(target, { baseURL = '', caps = {} } = {}) {
  return {
    version: MAP_VERSION,
    target: assertKnowledgeKey(target),
    baseURL,
    updatedAt: '',
    caps: { ...DEFAULT_CAPS, ...caps },
    entry: null,
    states: [],
    edges: [],
    frontier: [],
    stats: { states: 0, edges: 0, tried: 0, skipped: 0, findings: 0, runs: [] },
  };
}

/**
 * نقشهٔ موجود، یا خالی.
 *
 * فایلِ خراب هم «نداریم» است نه خطا: نقشه دوباره ساختنی است و شکستنِ خزش
 * به‌خاطر یک JSONِ نیمه‌نوشته، بدترین معاملهٔ ممکن است.
 */
export function readMap(target) {
  const key = assertKnowledgeKey(target);
  try {
    const raw = JSON.parse(fs.readFileSync(mapFile(key), 'utf8'));
    if (!raw || raw.version !== MAP_VERSION) return emptyMap(key);
    return { ...emptyMap(key), ...raw, caps: { ...DEFAULT_CAPS, ...(raw.caps || {}) } };
  } catch {
    return emptyMap(key);
  }
}

export function hasMap(target) {
  return fs.existsSync(mapFile(assertKnowledgeKey(target)));
}

/**
 * نوشتنِ اتمیک — همان قاعدهٔ `knowledge/store.js`.
 *
 * چند نویسنده ندارد ولی **مکرر** نوشته می‌شود: یک کرشِ وسطِ `writeFile` کلِ
 * نقشهٔ جمع‌شده را می‌برد.
 */
export async function writeMap(target, map) {
  const key = assertKnowledgeKey(target);
  const next = { ...map, target: key, version: MAP_VERSION, updatedAt: new Date().toISOString() };
  next.stats = {
    ...next.stats,
    states: next.states.length,
    edges: next.edges.length,
    frontier: next.frontier.length,
  };

  const file = mapFile(key);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(temporary, JSON.stringify(next, null, 2) + '\n', 'utf8');
  await fsp.rename(temporary, file);
  return next;
}

/**
 * گره را بگذار یا تقویت کن.
 *
 * `path` فقط وقتی عوض می‌شود که مسیرِ تازه **کوتاه‌تر** باشد: کوتاه‌ترین مسیر
 * همان چیزی است که بعداً مقدمهٔ سناریو می‌شود، و مقدمهٔ کوتاه‌تر یعنی سناویی
 * که کمتر می‌شکند.
 */
export function upsertState(map, incoming) {
  const existing = map.states.find((state) => state.id === incoming.id);
  if (!existing) {
    map.states.push({
      ...incoming,
      visits: 1,
      firstSeen: incoming.firstSeen || new Date().toISOString(),
      lastSeen: incoming.lastSeen || new Date().toISOString(),
      actions: (incoming.actions || []).map((action) => ({ ...action, seenIn: 1 })),
    });
    return { state: map.states[map.states.length - 1], created: true };
  }

  existing.visits = (existing.visits || 1) + 1;
  existing.lastSeen = new Date().toISOString();
  existing.title = incoming.title || existing.title;
  existing.sample = existing.sample || incoming.sample;
  existing.actions = mergeActions(existing.actions, incoming.actions || []);
  if (Array.isArray(incoming.path) && incoming.path.length < (existing.path?.length ?? Infinity)) {
    existing.path = incoming.path;
  }
  return { state: existing, created: false };
}

export function findState(map, id) {
  return map.states.find((state) => state.id === id) || null;
}

/** یالِ تکراری ثبت نمی‌شود: «از این حالت با این کنش به آن حالت» یک فکت است. */
export function addEdge(map, { from, action, to }) {
  if (!from || !action || !to) return null;
  const existing = map.edges.find(
    (edge) => edge.from === from && edge.action === action && edge.to === to
  );
  if (existing) {
    existing.seenIn = (existing.seenIn || 1) + 1;
    return existing;
  }
  const edge = { from, action, to, seenIn: 1, at: new Date().toISOString() };
  map.edges.push(edge);
  return edge;
}

/**
 * صف — سطحی‌ترین اول (BFS).
 *
 * ── چرا BFS و نه DFS ──
 *
 * عمق‌اول دیر یا زود در یک شاخهٔ داده‌ای گم می‌شود (یادداشت → ویرایش →
 * پاراگراف → …) و وقتی سقف تمام شود، نیمی از **پوستهٔ** اپ هنوز دیده نشده.
 * سطح‌اول تضمین می‌کند هر چیزی که نزدیک است، قبل از هر چیزی که دور است دیده
 * شود — و پوستهٔ اپ همیشه نزدیک است.
 */
export function pushFrontier(map, items) {
  for (const item of items) {
    const exists = map.frontier.some(
      (queued) => queued.state === item.state && queued.action === item.action
    );
    if (!exists) map.frontier.push({ ...item, depth: item.depth ?? 0 });
  }
  map.frontier.sort((a, b) => (a.depth || 0) - (b.depth || 0));
}

export function takeFrontier(map) {
  return map.frontier.shift() || null;
}

export function dropFrontierFor(map, stateId) {
  map.frontier = map.frontier.filter((item) => item.state !== stateId);
}
