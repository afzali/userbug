/**
 * تنظیماتِ هوش مصنوعی — کلید و مدل، از رابط و از خط فرمان.
 *
 * ── چرا فایلِ تازه و نه `userbug.config.js` ──
 *
 * کانفیگ کلی را **آدم** می‌نویسد و کامنت‌هایش گاهی از خودِ مقدارها ارزشمندترند
 * (همان استدلالی که پروندهٔ شناخت را از کانفیگِ هدف جدا نگه داشت). ابزاری که
 * آن فایل را بازنویسی کند، دیر یا زود کامنتی را می‌برد که کسی وقت گذاشته.
 *
 * پس یک فایلِ JSONِ **مالِ ابزار**: `userbug.settings.json`، در `.gitignore`،
 * چون هم کلید در همسایگی‌اش است و هم انتخابِ مدل، تصمیمِ همین ماشین است.
 *
 * ── ترتیبِ لایه‌ها، و چرا این ترتیب ──
 *
 *   DEFAULTS  →  userbug.config.js  →  userbug.settings.json  →  هدف  →  درخواست
 *
 * فایلِ تنظیمات بر کانفیگِ دست‌نویس می‌چربد، چون کاری است که کاربر **همین
 * حالا** در رابط کرده. ولی این بازنویسی خاموش نمی‌ماند: صفحهٔ تنظیمات صریح
 * می‌گوید کدام مقدار از کجا آمده و چه چیزی را پوشانده.
 *
 * ── چرا کلید در `.env` می‌ماند، نه اینجا ──
 *
 * `.env` جایی است که همهٔ ابزارها دنبال کلید می‌گردند و از قبل در
 * `.gitignore` است. گذاشتنش در فایلِ دوم یعنی دو جا برای یک راز، و روزی یکی
 * از آن دو فراموش می‌شود.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { rootDir } from '../target.js';
import { DEFAULTS, assertModelSlug, clearGlobalConfigCache, loadConfigFile } from './config.js';
import { explainModelError, suggestedSlug } from './provider.js';

export const ROLES = ['resolve', 'author', 'analyze'];

export function settingsFile() {
  return path.join(rootDir(), 'userbug.settings.json');
}

export function readSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

/** نوشتنِ اتمیک، و باطل کردنِ کشِ کانفیگ — وگرنه همین پروسه مقدار کهنه را می‌بیند. */
export async function writeSettings(next) {
  const file = settingsFile();
  const temporary = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(temporary, JSON.stringify(next, null, 2) + '\n', 'utf8');
  await fsp.rename(temporary, file);
  clearGlobalConfigCache();
  return next;
}

/**
 * تغییرِ مدلِ یک نقش (یا پیش‌فرض) و سقفِ بودجه.
 *
 * اسلاگ از همان دروازهٔ همیشگی رد می‌شود. `null` یعنی «برگرد به لایهٔ زیرین»،
 * که با حذفِ کلید انجام می‌شود نه با نوشتنِ رشتهٔ خالی: رشتهٔ خالی یک مقدارِ
 * معتبرِ غلط است و بعداً هیچ‌کس نمی‌فهمد عمدی بوده یا نه.
 */
export async function setModel({ role, slug }) {
  const settings = readSettings();
  settings.models ||= {};

  const target = role === 'default' ? 'default' : role;
  if (role !== 'default' && !ROLES.includes(role)) {
    throw new Error(`نقشِ ناشناخته: «${role}». مجاز: ${['default', ...ROLES].join(' ')}`);
  }

  if (slug === null || slug === '') {
    if (target === 'default') delete settings.models.default;
    else if (settings.models.roles) delete settings.models.roles[target];
  } else if (target === 'default') {
    settings.models.default = assertModelSlug(slug);
  } else {
    settings.models.roles ||= {};
    settings.models.roles[target] = assertModelSlug(slug);
  }

  return await writeSettings(settings);
}

export async function setBudget(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100) {
    throw new Error(`سقفِ بودجه باید عددی بین ۰ و ۱۰۰ دلار باشد؛ «${value}» نبود`);
  }
  const settings = readSettings();
  settings.models ||= {};
  settings.models.budgetPerRun = amount;
  return await writeSettings(settings);
}

/* ────────────────────────────── کلید ────────────────────────────── */

const KEY_NAME = 'OPENROUTER_API_KEY';

/** فقط نشانه، هرگز خودِ کلید. این مقدار به مرورگر می‌رود. */
export function keyStatus() {
  const value = process.env[KEY_NAME] || '';
  return {
    present: Boolean(value),
    tail: value ? value.slice(-4) : '',
    from: fileHasKey() ? '.env' : value ? 'محیط' : '',
  };
}

function envFile() {
  return path.join(rootDir(), '.env');
}

function fileHasKey() {
  try {
    return new RegExp(`^\\s*${KEY_NAME}\\s*=`, 'm').test(fs.readFileSync(envFile(), 'utf8'));
  } catch {
    return false;
  }
}

/**
 * نوشتنِ کلید در `.env`، بی دست زدن به بقیهٔ خطوط.
 *
 * بازنویسیِ کلِ فایل ساده‌تر بود و همان‌جا کلیدهای دیگرِ کاربر را می‌برد.
 * پس فقط همان یک خط جایگزین می‌شود، یا به ته اضافه.
 */
export async function setApiKey(value) {
  const key = String(value ?? '').trim();
  if (!key) throw new Error('کلید خالی است');
  if (key.length > 300 || /\s/.test(key)) throw new Error('کلید شکلِ معقولی ندارد');

  let text = '';
  try {
    text = await fsp.readFile(envFile(), 'utf8');
  } catch {
    // نبودِ `.env` یعنی تازه ساخته می‌شود
  }

  const line = `${KEY_NAME}=${key}`;
  const pattern = new RegExp(`^\\s*${KEY_NAME}\\s*=.*$`, 'm');
  const next = pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\s*$/, '')}\n${line}\n`;

  await fsp.writeFile(envFile(), next.replace(/^\n/, ''), 'utf8');
  // همین پروسه هم باید بلافاصله کلید را ببیند، وگرنه «ذخیره شد» و «کار نمی‌کند»
  process.env[KEY_NAME] = key;
  return keyStatus();
}

/* ──────────────────────── نمای مؤثر و سنجش ──────────────────────── */

/**
 * مقدارِ مؤثرِ هر نقش، و اینکه از کدام لایه آمده.
 *
 * «از کجا آمده» همان‌قدر لازم است که خودِ مقدار — دقیقاً به همان دلیلی که
 * پروندهٔ شناخت `by` دارد. بی آن، کاربر مدلی را در رابط عوض می‌کند، چیزی
 * تغییر نمی‌کند، و هیچ‌جا نمی‌گوید چرا.
 */
export async function effectiveModels() {
  const config = (await loadConfigFile({ fresh: true })).models || {};
  const settings = readSettings().models || {};

  return {
    roles: ROLES.map((role) => pickModel(role, { settings, config })),
    budgetPerRun: settings.budgetPerRun ?? config.budgetPerRun ?? DEFAULTS.budgetPerRun,
    budgetFrom: settings.budgetPerRun ? 'settings' : config.budgetPerRun ? 'config' : 'default',
    key: keyStatus(),
    file: settingsFile(),
  };
}

/**
 * انتخابِ لایه — تابعِ خالص، عمداً.
 *
 * ── چرا جدا شد ──
 *
 * خودآزمایش اول فایلِ `userbug.config.js` را در پوشهٔ موقت می‌نوشت تا لایهٔ
 * میانی را بسازد، و آن‌وقت چیزی را می‌سنجید که مالِ importِ Node است نه مالِ
 * این منطق. منطقی که فقط با فایل‌سیستم آزمودنی باشد، عملاً آزموده نمی‌شود.
 *
 * `default` در `shadowed` نمی‌آید: پیش‌فرضِ ابزار همیشه مقدار دارد و گفتنش
 * در هر ردیف، پیامِ مهم را زیرِ نویز می‌بَرد.
 */
export function pickModel(role, { settings = {}, config = {} } = {}) {
  const layers = [
    ['settings', settings.roles?.[role] ?? settings.default],
    ['config', config.roles?.[role] ?? config.default],
    ['default', DEFAULTS.roles[role] ?? DEFAULTS.default],
  ];
  const found = layers.find(([, value]) => Boolean(value));
  const shadowed = layers
    .filter(([name, value]) => Boolean(value) && name !== found[0] && name !== 'default')
    .map(([name, value]) => ({ from: name, slug: value }));
  return { role, slug: found[1], from: found[0], shadowed };
}

/**
 * آیا این مدل واقعاً جواب می‌دهد؟
 *
 * ── چرا لازم است ──
 *
 * اسلاگِ رایگان یک روز رایگان نیست. `z-ai/glm-5.2:free` — که تا دیروز
 * پیش‌فرضِ نقشِ `analyze` بود — با ۴۰۴ برگشت و پیامش وسطِ صفحهٔ شناخت ظاهر
 * شد. یعنی کاربر وقتی فهمید که کارش شکسته بود.
 *
 * این تابع همان را **پیش از** کار می‌پرسد، با ارزان‌ترین درخواستِ ممکن.
 */
export async function checkModel(slug, { apiKey, baseURL = DEFAULTS.baseURL } = {}) {
  const key = apiKey || process.env[KEY_NAME];
  if (!key) return { slug, ok: false, error: 'کلید نیست' };

  try {
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'x-title': 'userbug' },
      body: JSON.stringify({
        model: slug,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ok' }],
      }),
    });

    if (response.ok) return { slug, ok: true };
    const body = await response.text();
    return { slug, ok: false, status: response.status, error: explainModelError(body), suggestion: suggestedSlug(body) };
  } catch (cause) {
    return { slug, ok: false, error: cause.message };
  }
}

/** هر سه نقش، با هم. مدلِ تکراری یک بار سنجیده می‌شود، نه سه بار. */
export async function checkAllModels() {
  const view = await effectiveModels();
  const unique = [...new Set(view.roles.map((item) => item.slug))];
  const results = new Map();
  for (const slug of unique) results.set(slug, await checkModel(slug));
  return view.roles.map((item) => ({ ...item, ...results.get(item.slug) }));
}
