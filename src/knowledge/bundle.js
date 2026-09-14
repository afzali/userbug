/**
 * بسته‌بندیِ یک پروژه — «تا اینجا آمده‌ام، از همین‌جا ادامه بده».
 *
 * ── چرا لازم شد ──
 *
 * کاربر گشت می‌رود، تنظیمات می‌گذارد، حساب می‌سازد، فایلِ نمونه آپلود
 * می‌کند — و بعد اگر بخواهد از نو شروع کند یا روی ماشینِ دیگری ادامه دهد،
 * باید **همهٔ آن را با دست تکرار کند**. گشتِ زنده وقتِ آدم است، نه وقتِ
 * ماشین؛ دور ریختنش گران‌ترین کاری است که این ابزار می‌تواند بکند.
 *
 * ── چرا یک فایلِ JSON و نه zip ──
 *
 * همه‌چیزِ این ابزار فایلِ متنی است و همین را قابلِ دیدن و دیف کردن نگه
 * داشته. فایلِ نمونه هم base64 می‌شود و داخل می‌نشیند — یک فایل که بشود
 * فرستاد، نه پوشه‌ای که نصفش گم شود.
 *
 * ── و چرا رمزها بیرون می‌مانند ──
 *
 * `credentials.json` رمزِ متنی دارد. بسته چیزی است که آدم می‌فرستد و در
 * چت می‌گذارد؛ رمز در آن یعنی رمزی که دیر یا زود جایی لو می‌رود. شناسه و
 * ایمیل می‌مانند — با یادداشتی که می‌گوید رمز را دوباره بگذار.
 */
import fs from 'node:fs';
import path from 'node:path';
import { knowledgeDir } from './store.js';
import { rootDir } from '../target.js';

export const BUNDLE_VERSION = 1;

/** حجمِ هر فایلِ نمونه که داخلِ بسته می‌رود. بزرگ‌تر، نامش می‌ماند نه محتوایش. */
const MAX_FIXTURE_BYTES = 5 * 1024 * 1024;

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** فایل‌های یک پوشه، بازگشتی، با مسیرِ نسبی. */
function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/**
 * همه‌چیزِ یک پروژه در یک شیء.
 *
 * @param {string} target
 * @param {{fixtures?: boolean}} [options] فایل‌های نمونه هم داخل بروند؟
 */
export function exportBundle(target, { fixtures = true } = {}) {
  const root = rootDir();
  const know = knowledgeDir(target);
  const scenarioRoot = path.join(root, 'scenarios', target);

  const bundle = {
    version: BUNDLE_VERSION,
    target,
    at: new Date().toISOString(),
    config: readText(path.join(root, 'targets', `${target}.config.js`)),
    knowledge: {},
    scenarios: {},
    fixtures: {},
    /** چیزهایی که عمداً نیامده‌اند — تا کسی فکر نکند بسته کامل است */
    omitted: [],
  };

  for (const name of ['dossier.json', 'map.json', 'invariants.json', 'endpoints.json', 'checks.json']) {
    const data = readJson(path.join(know, name));
    if (data) bundle.knowledge[name] = data;
  }

  for (const name of walk(path.join(know, 'pages'))) {
    const data = readJson(path.join(know, 'pages', name));
    if (data) bundle.knowledge[`pages/${name}`] = data;
  }

  /**
   * حساب‌ها بی رمز.
   *
   * شناسه و ایمیل ساختارند و بی آن‌ها سناریوهای `{{account.…}}` معنا
   * نمی‌دهند. رمز داده است و جای فرستادن ندارد.
   */
  const accounts = readJson(path.join(know, 'credentials.json'));
  if (accounts?.accounts?.length) {
    bundle.knowledge['credentials.json'] = {
      ...accounts,
      accounts: accounts.accounts.map(({ password, ...rest }) => rest),
    };
    if (accounts.accounts.some((one) => one.password)) {
      bundle.omitted.push('رمزِ حساب‌ها — پس از ورود دوباره در «پیکربندی» بگذارید.');
    }
  }

  for (const name of walk(scenarioRoot)) {
    const text = readText(path.join(scenarioRoot, name));
    if (text !== null) bundle.scenarios[name] = text;
  }

  if (fixtures) {
    const dir = path.join(know, 'fixtures');
    for (const name of walk(dir)) {
      const file = path.join(dir, name);
      const size = fs.statSync(file).size;
      if (size > MAX_FIXTURE_BYTES) {
        bundle.omitted.push(`fixtures/${name} — ${Math.round(size / 1024 / 1024)} مگابایت، بزرگ‌تر از سقفِ بسته.`);
        continue;
      }
      bundle.fixtures[name] = fs.readFileSync(file).toString('base64');
    }
  } else if (fs.existsSync(path.join(know, 'fixtures'))) {
    bundle.omitted.push('فایل‌های نمونه — با `--fixtures` داخل بسته می‌آیند.');
  }

  return bundle;
}

/**
 * بسته → روی دیسک.
 *
 * ── چرا پیش‌فرض بازنویسی نمی‌کند ──
 *
 * وارد کردنِ بسته روی پروژه‌ای که کار روی آن جلو رفته، می‌تواند نقشه و
 * سناریوهای تازه‌تر را ببرد. پس آنچه هست دست‌نخورده می‌ماند مگر `force`.
 *
 * @param {object} bundle
 * @param {{as?: string, force?: boolean}} [options] `as` برای واردکردن با نامِ دیگر
 */
export function importBundle(bundle, { as = '', force = false } = {}) {
  if (bundle?.version !== BUNDLE_VERSION) {
    throw new Error(`نسخهٔ بسته پشتیبانی نمی‌شود: ${bundle?.version ?? '—'} (این ابزار ${BUNDLE_VERSION} می‌خواند)`);
  }

  const target = as || bundle.target;
  if (!/^[\w.-]+$/u.test(target)) throw new Error(`نامِ هدف نامعتبر است: «${target}»`);

  const root = rootDir();
  const know = knowledgeDir(target);
  const scenarioRoot = path.join(root, 'scenarios', target);
  const written = [];
  const skipped = [];

  const put = (file, data, binary = false) => {
    if (fs.existsSync(file) && !force) {
      skipped.push(path.relative(root, file).split(path.sep).join('/'));
      return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, binary ? Buffer.from(data, 'base64') : data, binary ? undefined : 'utf8');
    written.push(path.relative(root, file).split(path.sep).join('/'));
  };

  if (bundle.config) put(path.join(root, 'targets', `${target}.config.js`), bundle.config);

  for (const [name, data] of Object.entries(bundle.knowledge || {})) {
    put(path.join(know, name), JSON.stringify(data, null, 2) + '\n');
  }
  for (const [name, text] of Object.entries(bundle.scenarios || {})) {
    put(path.join(scenarioRoot, name), text);
  }
  for (const [name, base64] of Object.entries(bundle.fixtures || {})) {
    put(path.join(know, 'fixtures', name), base64, true);
  }

  return { target, written, skipped, omitted: bundle.omitted || [] };
}

/** خلاصهٔ یک بسته، برای وقتی که آدم می‌خواهد پیش از واردکردن ببیند چه دارد. */
export function describeBundle(bundle) {
  const count = (obj) => Object.keys(obj || {}).length;
  return {
    target: bundle?.target || '',
    at: bundle?.at || '',
    config: Boolean(bundle?.config),
    knowledge: count(bundle?.knowledge),
    scenarios: count(bundle?.scenarios),
    fixtures: count(bundle?.fixtures),
    states: bundle?.knowledge?.['map.json']?.states?.length || 0,
    pages: Object.keys(bundle?.knowledge || {}).filter((one) => one.startsWith('pages/')).length,
    omitted: bundle?.omitted || [],
  };
}
