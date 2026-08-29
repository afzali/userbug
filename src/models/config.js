/**
 * تنظیمات مدل — سه لایه.
 *
 *   پیش‌فرض کلی  →  هدف  →  تک‌درخواست
 *
 * هر لایه فقط چیزی را که می‌گوید بازنویسی می‌کند. یعنی همیشه یک پیش‌فرضِ
 * کارآمد هست و هر جا لازم شد می‌شود فقط همان یک قدم را به مدل دیگری سپرد.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../target.js';

/**
 * نقش‌ها، نه اسم مدل‌ها.
 *
 * `resolve` پرتکرارترین است و هزینهٔ اجرا را تعیین می‌کند؛ `analyze` کم‌تکرار
 * است، پس گران بودنش مهم نیست. جدا کردنشان یعنی می‌شود ارزان اجرا کرد و
 * گران فکر کرد.
 */
export const DEFAULTS = {
  provider: 'openrouter',
  baseURL: 'https://openrouter.ai/api/v1',
  default: 'anthropic/claude-haiku-4.5',
  roles: {
    resolve: 'anthropic/claude-haiku-4.5',
    author: 'anthropic/claude-haiku-4.5',
    analyze: 'anthropic/claude-sonnet-5',
  },
  /** سقف هزینهٔ هر اجرا به دلار. رد شدن از آن اجرا را متوقف می‌کند، نه اینکه بی‌صدا ادامه دهد. */
  budgetPerRun: 0.5,
  /** از هر چند اجرا، یکی کامل با مدل حل شود تا انحرافِ خاموشِ کش پیدا شود. */
  reverifyEvery: 20,
};

let globalCache;

/** `userbug.config.js` کنار ریشه، اگر باشد. */
export async function loadGlobalConfig() {
  if (globalCache) return globalCache;
  const file = path.join(ROOT, 'userbug.config.js');
  if (!fs.existsSync(file)) return (globalCache = {});
  globalCache = (await import(pathToFileURL(file).href)).default || {};
  return globalCache;
}

/**
 * مدل و تنظیماتِ مؤثر برای یک نقش.
 *
 * @param {object} opts
 * @param {object} opts.global   `userbug.config.js`
 * @param {object} opts.target   کانفیگ هدف
 * @param {string} opts.role     `resolve` | `author` | `analyze`
 * @param {string} [opts.model]  بازنویسیِ تک‌درخواست، از خودِ قدمِ سناریو
 */
export function resolveModel({ global = {}, target = {}, role, model }) {
  const g = global.models || {};
  const t = target.models || {};

  const merged = {
    provider: t.provider ?? g.provider ?? DEFAULTS.provider,
    baseURL: t.baseURL ?? g.baseURL ?? DEFAULTS.baseURL,
    apiKey: t.apiKey ?? g.apiKey ?? process.env.OPENROUTER_API_KEY,
    budgetPerRun: t.budgetPerRun ?? g.budgetPerRun ?? DEFAULTS.budgetPerRun,
    reverifyEvery: t.reverifyEvery ?? g.reverifyEvery ?? DEFAULTS.reverifyEvery,
  };

  merged.model =
    // تک‌درخواست از همه بالاتر است
    model ??
    t.roles?.[role] ??
    t.default ??
    g.roles?.[role] ??
    g.default ??
    DEFAULTS.roles[role] ??
    DEFAULTS.default;

  merged.role = role;
  return merged;
}
