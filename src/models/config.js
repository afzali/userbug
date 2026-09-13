/**
 * تنظیمات مدل — چهار لایه.
 *
 *   DEFAULTS  →  userbug.config.js  →  userbug.settings.json  →  هدف  →  درخواست
 *
 * هر لایه فقط چیزی را که می‌گوید بازنویسی می‌کند. یعنی همیشه یک پیش‌فرضِ
 * کارآمد هست و هر جا لازم شد می‌شود فقط همان یک قدم را به مدل دیگری سپرد.
 *
 * لایهٔ `settings` تازه است و رابط می‌نویسدش (`src/models/settings.js`).
 * دلیلِ جدا بودنش از `userbug.config.js` آنجا نوشته شده.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rootDir } from '../target.js';
import { loadEnv } from '../env.js';
import { describeModel } from './catalog.js';

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
    /**
     * کم‌تکرار، پس می‌شود مدل قوی‌تری گذاشت — ولی **باید JSON بدهد**.
     *
     * دو شکستِ پشتِ سر هم این خط را ساختند. اول `z-ai/glm-5.2:free` رایگان
     * بودنش تمام شد و ۴۰۴ داد. بعد `nvidia/nemotron-3-ultra-550b-a55b:free`
     * نشست و **پاسخ خالی** داد: نسخهٔ رایگانش `structured_outputs` ندارد و
     * یک مدلِ reasoning است، پس بودجهٔ خروجی صرفِ استدلال شد و `content`
     * خالی برگشت.
     *
     * درسش این نیست که این اسلاگ بهتر است؛ این است که **معیار** عوض شد:
     * برای این نقش، «JSONِ تحمیل‌شدنی» از «باهوش‌تر» مهم‌تر است. معیار در
     * `catalog.js` نوشته شده و صفحهٔ تنظیمات با همان رتبه‌بندی می‌کند.
     */
    analyze: 'nex-agi/nex-n2.5-pro:free',
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
    .map(describeModel)
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

/**
 * تنظیماتِ کلی: `userbug.config.js` و رویش `userbug.settings.json`.
 *
 * ── چرا دو فایل، و چرا این ترتیب ──
 *
 * اولی را آدم می‌نویسد و کامنت دارد؛ ابزار هرگز بازنویسی‌اش نمی‌کند. دومی
 * مالِ ابزار است و رابط می‌نویسدش. تنظیماتِ رابط بالاتر می‌نشیند چون کاری
 * است که کاربر همین حالا کرده — ولی صفحهٔ تنظیمات صریح می‌گوید چه چیزی را
 * پوشانده. بازنویسیِ خاموش، بدترین حالتِ ممکن است.
 *
 * ادغام فقط یک لایه عمیق است و همین کافی است: `models` تنها کلیدِ مشترک
 * است و شکلش تخت.
 */
export async function loadGlobalConfig({ fresh = false } = {}) {
  if (globalCache && !fresh) return globalCache;

  const config = await loadConfigFile({ fresh });
  const settings = readSettingsFile();
  globalCache = {
    ...config,
    ...settings,
    models: {
      ...(config.models || {}),
      ...(settings.models || {}),
      roles: { ...(config.models?.roles || {}), ...(settings.models?.roles || {}) },
    },
  };
  return globalCache;
}

/** بعد از نوشتنِ تنظیمات، همین پروسه هم باید مقدارِ تازه را ببیند. */
export function clearGlobalConfigCache() {
  globalCache = undefined;
}

/**
 * فقط `userbug.config.js`، بی ادغام با تنظیمات.
 *
 * صفحهٔ تنظیمات باید بگوید هر مقدار از **کدام لایه** آمده، و برای آن به
 * لایه‌ها به‌شکل جدا نیاز دارد. نخستین نسخه همان `loadGlobalConfig` را
 * می‌خواند و چون آن ادغام‌شده برمی‌گردد، هر مقداری را «پوشانده‌شده توسط
 * خودش» گزارش می‌کرد.
 */
export async function loadConfigFile({ fresh = false } = {}) {
  const file = path.join(rootDir(), 'userbug.config.js');
  if (!fs.existsSync(file)) return {};
  // `?v=` چون import کش دارد و بی آن، ویرایشِ فایل تا ریستارتِ پروسه دیده نمی‌شود
  const url = `${pathToFileURL(file).href}${fresh ? `?v=${Date.now()}` : ''}`;
  return (await import(url)).default || {};
}

/**
 * خواندنِ خامِ فایلِ تنظیمات.
 *
 * عمداً اینجا و نه `import` از `settings.js`: آن ماژول از همین فایل import
 * می‌کند و حلقهٔ وابستگی می‌سازد. خواندنِ یک JSON آن‌قدر کوچک است که تکرارش
 * از حلقه بهتر است.
 */
function readSettingsFile() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(rootDir(), 'userbug.settings.json'), 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
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
