/**
 * چه بخشی از شناخت به مدل برسد.
 *
 * ── چرا `JSON.stringify(dossier)` جواب نیست ──
 *
 * پرونده رشد می‌کند: پروژه‌ای با شصت روت و چهل واژه و بیست ناوردا، در هر
 * فراخوانی چند هزار توکن اضافه می‌کند. `do:` پرتکرارترین فراخوانیِ این ابزار
 * است و کلِ اقتصادِ فاز ۲ روی ارزان بودنش بنا شده. شناختی که هر قدم را گران
 * کند، خودش را نقض کرده.
 *
 * و بدتر از هزینه: prompt که نصفش بی‌ربط باشد، **کیفیت را پایین می‌آورد**.
 * مدل باید میان شصت روت دنبال یکی بگردد که به این صفحه ربط دارد.
 *
 * ── چرا سقف از روزِ اول ──
 *
 * اگر بعداً اضافه شود، تا آن روز چند سناریو با پروندهٔ کامل ساخته شده‌اند و
 * وقتی کیفیت افت کند کسی نمی‌فهمد چرا. سقف باید از همان اولین مصرف‌کننده
 * باشد.
 *
 * ── چه چیزی همیشه می‌رود ──
 *
 *   - `summary` و `auth`: کوچک‌اند و همه‌جا لازم
 *   - `risks`: ایمنی است، نه کیفیت. کاوشگری که نداند «ریست کامل» چه می‌کند،
 *     یک بار می‌زندش و بقیهٔ اجرا هدر می‌رود
 *
 * بقیه بر اساس ربط انتخاب می‌شوند.
 */
import { keywords } from '../source-access.js';
import { normalizeRoutePath } from './schema.js';
import { listPages, readDossier } from './store.js';

/** سقفِ پیش‌فرضِ نویسه. حدوداً ۴۰۰ توکن فارسی. */
const DEFAULT_BUDGET = 1200;

function normalize(value) {
  return String(value ?? '').replace(/‌/g, '').toLowerCase();
}

/**
 * ربطِ یک روت به متن و صفحهٔ فعلی.
 *
 * تطبیقِ دقیقِ مسیر از هر امتیازِ واژه‌ای بالاتر است: اگر کاربر روی
 * `/library` است، آن یک ردیف باید برود حتی وقتی هیچ واژه‌ای مشترک نیست.
 */
function scoreRoute(route, { words, currentPath }) {
  if (currentPath && route.path === currentPath) return 1000;

  const haystack = normalize(`${route.path} ${route.title} ${route.purpose}`);
  let score = 0;
  for (const word of words) {
    if (haystack.includes(normalize(word))) score += 10;
  }
  // مسیرِ ریشه و مسیرِ ورود تقریباً همیشه به کار می‌آیند
  if (route.path === '/' ) score += 2;
  return score;
}

/** سقفِ تعداد مسیر. بیشتر از این، مدل باید بین آن‌ها بگردد به‌جای صفحه. */
const MAX_ROUTES = 8;
/** کمینه‌ای که همیشه می‌رود، حتی وقتی هیچ واژه‌ای نخورد. */
const MIN_ROUTES = 4;

/**
 * مسیرهایی که به مدل می‌رسند.
 *
 * ── چرا فقط امتیازِ واژه‌ای کافی نبود ──
 *
 * نخستین آزمون این را نشان داد: نیتِ «سند تازه در **کتابخانه** بساز» به روتِ
 * `/library` با هدفِ «فهرست **اسناد** کاربر» هیچ امتیازی نداد. «سند» و
 * «اسناد» برای `includes` دو رشتهٔ بی‌ربط‌اند — جمعِ مکسر فارسی ریشهٔ مشترک
 * ندارد.
 *
 * نتیجه‌اش بدترین حالت بود: **صفر مسیر**. یعنی مدل هیچ نقشه‌ای نمی‌گرفت،
 * دقیقاً در همان جایی که قرار بود کمکش کنیم.
 *
 * پس یک کف گذاشته شد. چند مسیرِ شاید بی‌ربط، از هیچ مسیر بهتر است؛ و سقف
 * جلوی برگشتن به «همهٔ شصت‌تا» را می‌گیرد.
 */
function pickRoutes(data, { words, currentPath, auth }) {
  const all = data.routes || [];
  const scored = all
    .map((route) => ({ route, score: scoreRoute(route, { words, currentPath }) }))
    .sort((a, b) => b.score - a.score);

  const picked = scored.filter((item) => item.score > 0).slice(0, MAX_ROUTES);
  if (picked.length >= MIN_ROUTES) return picked.map((item) => item.route);

  const chosen = new Map(picked.map((item) => [item.route.path, item.route]));

  // ستون‌های همیشگی: ریشه و ورود. کاربر از یکی از این دو شروع می‌کند.
  for (const path of ['/', auth?.loginPath]) {
    const route = path && all.find((item) => item.path === path);
    if (route) chosen.set(route.path, route);
  }

  // بقیه: آن‌هایی که هدفِ نوشته‌شده دارند، چون همان‌ها چیزی به مدل می‌گویند
  for (const { route } of scored) {
    if (chosen.size >= MIN_ROUTES + 2) break;
    if (route.purpose) chosen.set(route.path, route);
  }

  return [...chosen.values()];
}

function trim(text, max) {
  const value = String(text ?? '').trim();
  return value.length > max ? value.slice(0, max - 1) + '…' : value;
}

/**
 * تکه‌ای از شناخت، به‌شکل متنِ آمادهٔ prompt.
 *
 * رشته برمی‌گرداند نه شیء: هر سه مصرف‌کننده (`from-text`، `explore`، `do`)
 * prompt متنی می‌سازند، و اگر هرکدام خودش شیء را قالب‌بندی می‌کرد، سه شکلِ
 * مختلف از یک داده به مدل می‌رفت.
 *
 * @param {object} o
 * @param {string} [o.target] کلید پروژه — اگر `dossier` داده نشود از دیسک خوانده می‌شود
 * @param {object} [o.dossier] پروندهٔ از قبل خوانده‌شده
 * @param {string} [o.text] متنِ کاربر یا نیتِ قدم
 * @param {string} [o.url] آدرس صفحهٔ فعلی
 * @param {number} [o.budget] سقفِ نویسه
 * @returns {string} خالی اگر شناختی نباشد
 */
export function knowledgeFor({ target, dossier, text = '', url = '', budget = DEFAULT_BUDGET } = {}) {
  let data = dossier;
  if (!data) {
    try {
      data = readDossier(target);
    } catch {
      return '';
    }
  }
  if (!data) return '';

  const words = keywords(text);
  const currentPath = url ? normalizeRoutePath(url) : '';

  const lines = [];
  let used = 0;
  const push = (line) => {
    if (used + line.length > budget) return false;
    lines.push(line);
    used += line.length;
    return true;
  };

  if (data.summary) push(`اپ: ${trim(data.summary, 400)}`);

  const auth = data.auth || {};
  if (auth.kind && auth.kind !== 'unknown') {
    const parts = [`ورود: ${auth.kind}`];
    if (auth.loginPath) parts.push(`مسیر ${auth.loginPath}`);
    if (auth.signupOpen === true) parts.push('ثبت‌نام باز');
    if (auth.signupOpen === false) parts.push('ثبت‌نام بسته');
    if (auth.logoutLabel) parts.push(`خروج با «${auth.logoutLabel}»`);
    push(parts.join(' · '));
  }

  /**
   * خطرها همیشه و کامل.
   *
   * این تنها بخشی است که سقف نمی‌شکندش — اگر بودجه تمام شود، خطرها هنوز
   * می‌روند. یافتهٔ از دست رفته گران است؛ کاوشی که خودش را بیرون بیندازد
   * گران‌تر.
   */
  const risks = (data.risks || []).map((risk) => risk.label).filter(Boolean);
  if (risks.length) {
    lines.push(`نزن: ${risks.slice(0, 12).join('، ')}`);
  }

  const routes = pickRoutes(data, { words, currentPath, auth });

  if (routes.length) {
    push('مسیرها:');
    for (const route of routes) {
      const purpose = route.purpose ? ` — ${trim(route.purpose, 110)}` : '';
      const auth = route.requiresAuth === true ? ' (نیازمند ورود)' : '';
      if (!push(`  ${route.path}${purpose}${auth}`)) break;
    }
  }

  /**
   * واژه‌نامه فقط برای واژه‌هایی که در متن آمده.
   *
   * فرستادنِ کلِ واژه‌نامه یعنی مدل باید بین چهل تعریف دنبال یکی بگردد که
   * لازم دارد. اگر متنی نباشد (مثل کاوشِ آزاد)، چند تای اول می‌روند تا مدل
   * دستِ‌کم زبانِ اپ را بشناسد.
   */
  const glossary = (data.glossary || []).filter((item) => item.term && item.meaning);
  const relevant = words.length
    ? glossary.filter((item) => words.some((word) => normalize(item.term).includes(normalize(word)) || normalize(word).includes(normalize(item.term))))
    : glossary.slice(0, 4);

  if (relevant.length) {
    push('واژه‌ها:');
    for (const item of relevant.slice(0, 8)) {
      if (!push(`  ${item.term}: ${trim(item.meaning, 90)}`)) break;
    }
  }

  return lines.join('\n');
}

/**
 * هدفِ صفحه‌ای که کاربر رویش است — از `pages/` که جملهٔ خودِ آدم در آن است.
 *
 * جدا از `knowledgeFor` چون فقط کاوش و گشت لازمش دارند، و خواندنِ پوشهٔ
 * `pages/` در هر فراخوانیِ `do:` هزینهٔ دیسکِ بی‌دلیل است.
 */
export function purposeOfPage(target, url) {
  const path = normalizeRoutePath(url);
  if (!path) return '';
  try {
    const page = listPages(target).find((item) => item.path === path);
    if (page?.purpose) return page.purpose;
    return (readDossier(target).routes || []).find((route) => route.path === path)?.purpose || '';
  } catch {
    return '';
  }
}

/**
 * خطرهای پرونده به‌شکلی که `explore.avoid` می‌فهمد.
 *
 * `avoid` آرایه‌ای از رشته است و در `explore.js` به regex تبدیل می‌شود. پس
 * برچسبِ خطر باید همان متنی باشد که روی دکمه دیده می‌شود — و همین در prompt
 * هضمِ سورس صریح خواسته شده.
 */
export function avoidFrom(target) {
  try {
    return (readDossier(target).risks || []).map((risk) => risk.label).filter(Boolean);
  } catch {
    return [];
  }
}
