/**
 * دامنهٔ خزش — «فقط اینجا را بگرد».
 *
 * ── چرا اولویت کافی نبود ──
 *
 * `--focus` فقط ترتیب را عوض می‌کند. روی نپی نتیجه‌اش این شد: از ۲۲ حالتِ
 * نقشه، **۹ تا در `/ai-chat`** بودند — در حالی که خواستهٔ کاربر کتاب بود.
 * نزدیک به نیمی از بودجه رفت جایی که هیچ‌کس نخواسته بود.
 *
 * و با سقفِ حالت، خزش وسطِ کار بریده می‌شود — ولی در نقطهٔ دلخواهِ **خودش**،
 * نه آنجا که آدم گفته.
 *
 * ── چرا بر اساس روت و نما، نه واژه ──
 *
 * `explore.avoid` با واژه کار می‌کند و باید از قبل بدانی دکمه چه نام دارد.
 * «داخلِ کتاب بمان» را اصلاً نمی‌شود با واژه گفت. ولی نقشه از قبل `route` و
 * `view` هر حالت را دارد — یعنی دامنه از قبل قابلِ بیان است.
 *
 * ── و قاعده‌ای که این را امن می‌کند ──
 *
 * **«رسیدن» هرگز محدود نمی‌شود، فقط «گشتن».** خزنده برای رسیدن به کتاب باید
 * از منو و فهرست رد شود؛ اگر دامنه جلوی آن را بگیرد اصلاً نمی‌رسد. پس دامنه
 * فقط می‌گوید کجا **کنش‌ها را امتحان کن** — بازپخشِ مسیر دست‌نخورده می‌ماند.
 */
import { routeMatchesPattern } from './state.js';

/**
 * دامنه از الگوهای متنی.
 *
 * هر الگو یا روت است (`/content/[id]`) یا نامِ نما (`ویرایش`) — تشخیصش از
 * `/` آغازین است. نبودِ الگو یعنی «همه‌جا»، که پیش‌فرضِ همیشگی است.
 */
export function makeScope(patterns = []) {
  const clean = (Array.isArray(patterns) ? patterns : String(patterns || '').split(','))
    .map((one) => String(one ?? '').trim())
    .filter(Boolean);

  if (!clean.length) return null;

  const routes = clean.filter((one) => one.startsWith('/'));
  const views = clean.filter((one) => !one.startsWith('/')).map((one) => normalize(one));

  return {
    patterns: clean,
    routes,
    views,

    /**
     * این حالت داخلِ دامنه است؟
     *
     * روت **یا** نما — نه هر دو. کسی که می‌نویسد «ویرایش» نمی‌داند در کدام
     * روت است، و کسی که روت می‌دهد همهٔ نماهایش را می‌خواهد.
     */
    covers(state) {
      if (!state) return false;
      if (routes.some((pattern) => routeMatchesPattern(state.route, pattern))) return true;

      const haystack = normalize(`${state.view || ''} ${state.route || ''}`);
      return views.some((word) => haystack.includes(word));
    },
  };
}

/** ZWNJ و اعراب می‌روند — همان قاعدهٔ `focusWords`. */
function normalize(text) {
  return String(text ?? '')
    .replace(/[‌ـ]/g, '')
    .replace(/[ً-ْ]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .trim()
    .toLowerCase();
}

/**
 * گزارشِ آنچه بیرونِ دامنه ماند.
 *
 * ── چرا این لازم است ──
 *
 * نقشهٔ محدود با نقشهٔ کامل یکی نیست، و اگر صفحه این را نگوید کسی بعداً
 * «کجا را نیازموده‌ایم» را از روی نقشه‌ای می‌خواند که عمداً ناقص است. همان
 * پوششِ خوش‌بینانه‌ای که در `endpointCoverage` هم از آن پرهیز شد.
 */
export function outsideScope(map, scope) {
  if (!scope) return [];
  return (map?.states || []).filter((state) => !scope.covers(state));
}
