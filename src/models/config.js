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
import { loadEnv } from '../env.js';

loadEnv();

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
  /**
   * پیش‌فرض‌ها فعلاً مدل‌های رایگانِ OpenRouter هستند، چون هنوز در مرحلهٔ
   * ساختِ ابزاریم و هزینه‌دار کردنِ چیزی که روزی ده بار اجرا می‌شود بی‌معناست.
   *
   * اسلاگ‌ها از فهرست زندهٔ `/api/v1/models` گرفته شده‌اند، نه از حافظه.
   * برای دیدن فهرست تازه: `node bin/userbug.js models --free`
   */
  default: 'inclusionai/ling-3.0-flash-fin:free',
  roles: {
    // پرتکرارترین نقش: باید سریع باشد و JSON تمیز بدهد
    resolve: 'inclusionai/ling-3.0-flash-fin:free',
    author: 'inclusionai/ling-3.0-flash-fin:free',
    // کم‌تکرار، پس می‌شود مدل قوی‌تری گذاشت
    analyze: 'z-ai/glm-5.2:free',
  },
  /** سقف هزینهٔ هر اجرا به دلار. رد شدن از آن اجرا را متوقف می‌کند، نه اینکه بی‌صدا ادامه دهد. */
  budgetPerRun: 0.5,
  /** از هر چند اجرا، یکی کامل با مدل حل شود تا انحرافِ خاموشِ کش پیدا شود. */
  reverifyEvery: 20,
};

let globalCache;

/**
 * فهرست زندهٔ مدل‌ها.
 *
 * اسلاگ‌ها را از حافظه ننویسید: عوض می‌شوند، و مدلی که وجود ندارد با یک ۴۰۰
 * وسط اجرا خودش را نشان می‌دهد نه پیش از آن.
 *
 * اینجا نشسته نه در CLI، چون رابط گرافیکی هم همین فهرست را برای کشویی انتخاب
 * مدل می‌خواهد. دو تا واکشیِ جدا یعنی دو رفتار که دیر یا زود واگرا می‌شوند.
 */
export async function listModels({ free = false, limit = 200 } = {}) {
  const response = await fetch(`${DEFAULTS.baseURL}/models`, {
    headers: process.env.OPENROUTER_API_KEY
      ? { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }
      : {},
  });
  if (!response.ok) throw new Error(`فهرست مدل‌ها نیامد: ${response.status}`);

  const all = (await response.json()).data || [];
  return all
    .filter((model) => (free ? String(model.id).endsWith(':free') : true))
    .map((model) => ({
      id: model.id,
      name: model.name || model.id,
      context: model.context_length || 0,
      free: String(model.id).endsWith(':free'),
    }))
    .sort((a, b) => b.context - a.context)
    .slice(0, Math.max(1, Math.min(500, Number(limit) || 200)));
}

/**
 * اسلاگ مدل، اگر شکلش معقول باشد.
 *
 * اعتبارسنجی عمداً سبک است: فهرست مجاز را نگه نمی‌داریم چون اسلاگ‌ها عوض
 * می‌شوند و ابزار نباید از فهرستِ زندهٔ ارائه‌دهنده عقب بماند. ولی رشتهٔ
 * بی‌شکل هم نباید بی‌صدا رد شود و وسط اجرا با ۴۰۰ خودش را نشان دهد.
 */
export function assertModelSlug(value) {
  const slug = String(value ?? '').trim();
  if (!/^[\w.-]+\/[\w.:-]+$/.test(slug) || slug.length > 120) {
    throw new Error(`اسلاگ مدل معتبر نیست: «${value}». نمونه: openai/gpt-4o-mini`);
  }
  return slug;
}

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
 * @param {string} [opts.model]  بازنویسیِ تک‌درخواست — پرچم `--model` یا قدمِ سناریو
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
