/**
 * تنظیمِ چک‌ها — `knowledge/<کلید>/checks.json`.
 *
 * ── چرا خاموش کردن ممکن است، ولی آسان نیست ──
 *
 * چکی که روی یک پروژهٔ خاص همیشه قلابی است باید بشود خاموشش کرد؛ وگرنه کاربر
 * کلِ گزارش را نادیده می‌گیرد و آن بدتر است. ولی خاموشیِ بی‌دلیل، همان
 * `allowlist`ِ بلندی می‌شود که README دربارهٔ آن نوشته «یعنی داریم مشکل را زیر
 * فرش می‌کنیم».
 *
 * پس `why` اجباری است. یک جمله، ولی همان یک جمله شش ماه بعد فرقِ «آگاهانه
 * خاموش شد» و «کسی حوصله نداشت» را می‌سازد.
 *
 * ── چرا سروصدا از همین امروز شمرده می‌شود ──
 *
 * حلقهٔ یادگیری (بخش ۹) قرار است چکِ پرسروصدا را خودش خاموش کند. آن حلقه
 * بدونِ شمارنده هیچ‌کاری نمی‌تواند بکند، و شمارنده‌ای که بعداً اضافه شود از
 * صفر شروع می‌کند — یعنی سه ماه دادهٔ تریاژ از دست می‌رود. پس ساختارش از
 * روزِ اولِ نخستین چک اینجاست، حتی وقتی هنوز کسی نمی‌خواندش.
 */
import fs from 'node:fs';
import path from 'node:path';
import { knowledgeDir } from '../knowledge/store.js';
import { CHECK_MODES } from '../knowledge/schema.js';
import { UNIVERSAL_IDS } from './universal.js';

export const DEFAULT_MODE = 'watch';

function file(target) {
  return path.join(knowledgeDir(target), 'checks.json');
}

/**
 * تنظیمِ چک‌ها. نبودِ فایل یعنی «همه در حالت پیش‌فرض».
 *
 * پیش‌فرض `watch` است نه `expect`: چکِ همگانی روی پروژه‌ای اجرا می‌شود که
 * هیچ‌کس تنظیمش نکرده، و شکستنِ سناریو با قاعده‌ای که کاربر ندیده، بدترین
 * آشناییِ ممکن با این قابلیت است.
 */
export function readChecksConfig(target) {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(file(target), 'utf8')) || {};
  } catch {
    raw = {};
  }

  const checks = {};
  for (const [id, value] of Object.entries(raw.checks || {})) {
    const mode = CHECK_MODES.includes(value?.mode) ? value.mode : DEFAULT_MODE;
    checks[id] = {
      mode,
      why: String(value?.why || '').slice(0, 400),
      noise: Math.max(0, Number(value?.noise) || 0),
      hits: Math.max(0, Number(value?.hits) || 0),
    };
  }

  return { version: 1, checks };
}

export function writeChecksConfig(target, config) {
  const dir = knowledgeDir(target);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(target), JSON.stringify({ version: 1, checks: config.checks || {} }, null, 2) + '\n', 'utf8');
}

export function modeOf(config, id) {
  return config?.checks?.[id]?.mode ?? DEFAULT_MODE;
}

/**
 * خاموش کردنِ یک چک — همیشه با دلیل.
 *
 * @param {string} target کلید پروژه
 * @param {string} id شناسهٔ چک
 * @param {'off'|'watch'|'expect'} mode
 * @param {string} why چرا. برای `off` اجباری است.
 */
export function setCheckMode(target, id, mode, why = '') {
  if (!CHECK_MODES.includes(mode)) throw new Error(`حالتِ نامعتبر: «${mode}». یکی از ${CHECK_MODES.join('، ')}`);
  if (mode === 'off' && !String(why).trim()) {
    throw new Error('خاموش کردنِ چک بدون دلیل ممکن نیست؛ `why` را بنویسید');
  }

  const config = readChecksConfig(target);
  const previous = config.checks[id] || { noise: 0, hits: 0 };
  config.checks[id] = { ...previous, mode, why: String(why).trim() };
  writeChecksConfig(target, config);
  return config.checks[id];
}

/**
 * شمارشِ برخورد و سروصدا.
 *
 * `hits` یعنی چند بار یافته ساخت. `noise` یعنی چند بارِ آن‌ها در تریاژ
 * «قلابی» خورد. نسبتشان همان چیزی است که بخش ۹ برای خاموشیِ خودکار لازم
 * دارد.
 *
 * شکستِ نوشتن قورت داده می‌شود: آمارِ چک، خودِ چک نیست.
 */
export function countHits(target, ids) {
  if (!ids?.length) return;
  try {
    const config = readChecksConfig(target);
    for (const id of ids) {
      const entry = (config.checks[id] ??= { mode: DEFAULT_MODE, why: '', noise: 0, hits: 0 });
      entry.hits++;
    }
    writeChecksConfig(target, config);
  } catch {
    // آمار نباید اجرا را بخواباند
  }
}
