/**
 * نقشه → متنِ خواندنیِ آدم.
 *
 * ── چرا دسته‌بندی، و چرا همین دسته‌بندی ──
 *
 * نقشهٔ یک اپِ متوسط دهها گره دارد و فهرستِ صافِ آن‌ها بی‌فایده است. ولی
 * تاکسونومیِ تازه‌ای هم لازم نیست: دو محور از قبل در داده هست و هر دو رایگان‌اند
 * — **خانوادهٔ روت** (که الگویش را سورس داده) و **نما** (مودال/کشوی باز، که
 * زیرِ همان روتی می‌نشیند که از آن باز شد).
 *
 * دسته‌بندیِ معنایی («این بخش مالِ کتابخانه است») کارِ فاز ۳ و یک فراخوانی
 * مدل است. تا آن روز، این نما جوابِ «چند شاخه داریم» را می‌دهد.
 */
import { routePatternOf } from './state.js';

const KIND_LABEL = {
  nav: 'ناوبری',
  unknown: 'نامعلوم',
  input: 'ورودی',
  noise: 'نمایشی',
  destructive: 'برگشت‌ناپذیر',
  avoided: 'ممنوع',
};

/** شمارشِ کنش‌ها بر اساس دسته. */
function countKinds(actions = []) {
  const counts = {};
  for (const action of actions) counts[action.kind] = (counts[action.kind] || 0) + 1;
  return counts;
}

function summarizeKinds(counts) {
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([kind, count]) => `${count} ${KIND_LABEL[kind] || kind}`)
    .join(' · ');
}

/**
 * روت‌هایی که سورس می‌شناسد و خزش به آن‌ها نرسید.
 *
 * ── چرا این خط ارزشِ کلِ فایل را دارد ──
 *
 * صفر فراخوانی، و چیزی می‌گوید که هیچ ابزار دیگری نمی‌گوید: صفحه‌ای در کد هست
 * که از رابط به آن نمی‌رسند. یا یتیم است، یا نیازمندِ حالتی که نساختیم — و هر
 * دو حالت یک پرسشِ واقعی برای آدم است.
 *
 * الگوی پویا (`[id]`) با الگو مقایسه می‌شود نه با آدرس، وگرنه
 * `/content/[id]` هیچ‌وقت «رسیده» شمرده نمی‌شد.
 */
export function unreachedRoutes(map, knownRoutes = []) {
  const reached = new Set(map.states.map((state) => state.route));
  return knownRoutes
    .filter(Boolean)
    .map((route) => routePatternOf(route))
    .filter((route) => !reached.has(route))
    .filter((route, index, all) => all.indexOf(route) === index);
}

/** روت‌هایی که در مرورگر دیدیم و در سورس نبودند. */
export function extraRoutes(map, knownRoutes = []) {
  const known = new Set(knownRoutes.filter(Boolean).map((route) => routePatternOf(route)));
  return map.states
    .map((state) => state.route)
    .filter((route) => route && !known.has(route))
    .filter((route, index, all) => all.indexOf(route) === index);
}

export function renderMap(map, { knownRoutes = [] } = {}) {
  const lines = [];
  const stats = map.stats || {};

  lines.push(
    `نقشهٔ ${map.target} — ${map.states.length} حالت · ${map.edges.length} یال · ${stats.tried || 0} کنشِ امتحان‌شده`
  );
  lines.push(
    `  سقف: ${map.caps.states} حالت · ${map.caps.actionsPerState} کنش/حالت · ${map.caps.minutes} دقیقه` +
      (stats.stoppedBecause ? `  ·  توقف: ${stats.stoppedBecause}` : '')
  );
  if (map.entry) lines.push(`  مسیرِ ورود: ${map.entry.scenario || '—'} (${map.entry.steps} قدم)`);
  if (!map.states.length) {
    lines.push('\n  خالی است. `userbug map <هدف>` را بزنید.');
    return lines.join('\n');
  }

  /** گروه‌بندی بر خانوادهٔ روت، و درونش بر نما. */
  const families = new Map();
  for (const state of map.states) {
    const list = families.get(state.route) || [];
    list.push(state);
    families.set(state.route, list);
  }

  lines.push('');
  for (const route of [...families.keys()].sort()) {
    const states = families.get(route);
    lines.push(`  ${route}   (${states.length} حالت)`);
    for (const state of states) {
      const tried = state.actions.filter((action) => action.tried).length;
      const inert = state.actions.filter((action) => action.inert).length;
      lines.push(
        `    ${state.view ? `▸ ${state.view}` : '•'}  ${state.actions.length} کنش · ${tried} امتحان` +
          (inert ? ` · ${inert} بی‌اثر` : '') +
          (state.pathBroken ? ' · مسیر شکسته' : '')
      );
      const kinds = summarizeKinds(countKinds(state.actions));
      if (kinds) lines.push(`       ${kinds}`);
    }
  }

  if (map.frontier?.length) lines.push(`\n  صفِ باقی‌مانده: ${map.frontier.length} کنش`);

  const unreached = unreachedRoutes(map, knownRoutes);
  if (unreached.length) {
    lines.push(`\n  در سورس هست و به آن نرسیدیم (${unreached.length}):`);
    lines.push(`    ${unreached.slice(0, 20).join('  ')}`);
  }

  const extra = extraRoutes(map, knownRoutes);
  if (extra.length && knownRoutes.length) {
    lines.push(`\n  دیدیم و در سورس نبود (${extra.length}):`);
    lines.push(`    ${extra.slice(0, 20).join('  ')}`);
  }

  return lines.join('\n');
}
