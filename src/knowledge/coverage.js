/**
 * سنجهٔ شناخت — «چقدر این پروژه را می‌شناسیم».
 *
 * ── چرا یک عدد لازم است ──
 *
 * کلِ این ساختار روی یک ادعا بنا شده: «به‌مرور بهتر می‌شود». ادعایی که سنجه
 * نداشته باشد، قابلِ رد کردن هم نیست — و چیزی که نشود ردش کرد، نشان‌دهندهٔ
 * هیچ نیست. این عدد باید بالا برود؛ اگر نرفت، طرح شکست خورده و باید بدانیم.
 *
 * ── چرا وزن‌ها این‌طور است ──
 *
 * «چند روت می‌شناسیم» ساده‌ترین سنجه است و بدترین: پیمایشِ سورس در یک ثانیه
 * صد روت پیدا می‌کند و عدد را به سقف می‌رساند، بی‌آنکه چیزی دربارهٔ اپ
 * بدانیم. آنچه واقعاً شناخت است، `purpose` است — و آن را فقط آدم یا گشت
 * می‌دهد. پس روتِ بی‌هدف در مخرج می‌آید و در صورت نه.
 */
import { listPages, readDossier } from './store.js';

/** پرسشی که جواب گرفته دیگر باز نیست. */
function openQuestions(dossier) {
  return (dossier.openQuestions || []).filter((item) => !item.answer);
}

function ratio(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100) / 100;
}

/**
 * @param {string} target کلید پروژه
 * @returns {{score: number, routes: object, pages: object, questionsOpen: number, lastTour: string|null}}
 */
export function coverageOf(target) {
  const dossier = readDossier(target);
  const pages = listPages(target);

  const routes = dossier.routes || [];
  const described = routes.filter((route) => route.purpose).length;
  const stale = pages.filter((page) => page.stale).length;

  /**
   * فقط صفحه‌هایی که روتِ ثبت‌شده دارند در نسبت می‌آیند.
   *
   * بدون این تقاطع، گشتی که به صفحه‌ای بیرون از فهرستِ روت‌ها می‌رفت هم
   * صورت را بالا می‌برد هم مخرج را نه — و نمرهٔ ۱۰۰٪ با نیمی از روت‌های
   * ندیده ممکن می‌شد. صفحهٔ بی‌روت گم نمی‌شود؛ در `pages.total` هست و در
   * متنِ خواندنی بخشِ خودش را دارد.
   */
  const knownPaths = new Set(routes.map((route) => route.path));
  const toured = new Set(
    pages.filter((page) => page.purpose && knownPaths.has(page.path)).map((page) => page.path)
  );

  const tours = (dossier.sources || []).filter((source) => source.kind === 'tour');
  const lastTour = tours.length ? tours[tours.length - 1].at || null : null;

  /**
   * نمره از سه چیز: هدف داشتنِ روت‌ها، دیده شدنشان در مرورگر، و نبودِ پرسشِ
   * باز. سومی سقف دارد چون پروژه‌ای با ده پرسشِ باز نباید نمرهٔ منفی بگیرد؛
   * فقط نباید نمرهٔ کامل بگیرد.
   */
  const questionsOpen = openQuestions(dossier).length;
  const questionPenalty = Math.min(0.2, questionsOpen * 0.04);
  const raw = ratio(described, routes.length) * 0.5 + ratio(toured.size, routes.length) * 0.5;
  const score = routes.length ? Math.max(0, Math.round((raw - questionPenalty) * 100) / 100) : 0;

  return {
    score,
    routes: { known: routes.length, described, toured: toured.size },
    pages: { total: pages.length, stale },
    questionsOpen,
    lastTour,
    // بدون این، «۰٪» و «هنوز شروع نشده» یک شکل دیده می‌شوند
    started: routes.length > 0 || pages.length > 0,
  };
}
