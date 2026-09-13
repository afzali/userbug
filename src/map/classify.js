/**
 * فاز ۲ — «این دکمه چه می‌کند؟»، از سورس.
 *
 * فاز ۱ می‌گوید **کجاها می‌شود رفت**. این یکی می‌گوید هر کنش چه جنسی دارد:
 * ناوبری، جهش، یا برگشت‌ناپذیر. و ارزشش دوتاست: خزنده می‌داند چه چیزی را
 * نزند، و نقشه می‌تواند **پیش‌بینی** کند هر دکمه کجا می‌رسد.
 *
 * ── چرا بیشترش بی‌مدل است ──
 *
 * `on:click={() => goto('/x')}` یک فکتِ ساختاری است، نه قضاوت. همان استدلالِ
 * `routes.js`: پول دادن برای چیزی که یک regex جواب می‌دهد، و جوابی گرفتن که
 * گاهی غلط است و هیچ‌وقت معلوم نیست کِی.
 *
 * مدل فقط **باقی‌مانده** را می‌گیرد — دکمه‌هایی که هیچ قاعده‌ای رویشان نخورد
 * — و آن هم یک بار به ازای هر گره، نه هر کنش.
 *
 * ── باطل‌سازیِ دوتایی ──
 *
 * نتیجه کش می‌شود با دو مهر: `profile` گره (سمتِ رندر) و هشِ فایل‌های سورسی
 * که به آن گره نسبت داده شده‌اند (سمتِ کد). هر کدام نخورد، **فقط همان گره**
 * دوباره طبقه‌بندی می‌شود.
 *
 * هشِ کلِ ریپو نه: هر کامیت کلِ نقشه را باطل می‌کرد. و فقط گیت هم نه: صفحه
 * می‌تواند بی‌تغییرِ سورس عوض شود.
 */
import { hashSignature } from '../steps/signature.js';
import { findRelevantSource, listAllSourceFiles, readAnySourceFile } from '../source-access.js';

/** جنسِ کنش — از دیدِ «اگر بزنمش چه می‌شود». */
export const KINDS = ['nav', 'mutate', 'destructive', 'inert', 'unknown'];

/**
 * نرمال‌سازیِ متن برای تطبیقِ برچسب با سورس.
 *
 * نیم‌فاصله برداشته می‌شود، وگرنه «یادداشت‌ها» و «یادداشت‌ها» دو رشتهٔ
 * مختلف‌اند — همان تله‌ای که `from-text.js` هم خورد.
 */
export function normalize(text) {
  return String(text ?? '')
    .replace(/‌/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const NAV = [/goto\(\s*['"`]([^'"`]+)['"`]/i, /href\s*=\s*['"`{]?\s*['"`]?(\/[^'"`\s}]*)/i];
const MUTATE = [
  /method\s*:\s*['"`](post|put|patch|delete)['"`]/i,
  /\.(post|put|patch|delete)\s*\(/i,
  /(insert|update|delete)\s+(into|from)?\s*\w/i,
];
const DESTRUCTIVE = [/\bconfirm\s*\(/i, /alertdialog/i, /\b(delete|destroy|drop|wipe|reset)\b/i, /حذف|پاک|ریست/];

/**
 * هندلری که نامش جای دیگری تعریف شده.
 *
 * در Svelte معمول است: `onclick={handleDelete}` و بدنهٔ تابع بیست خط پایین‌تر.
 * بی دنبال کردنش، قاعده‌ها روی نیمی از دکمه‌ها هیچ نمی‌گویند.
 */
function handlerBody(lines, window) {
  const named = window.join('\n').match(/on:?click=\{\s*([A-Za-z_$][\w$]*)\s*\}/);
  if (!named) return [];
  const at = lines.findIndex((line) =>
    new RegExp(`(function\\s+${named[1]}\\b|(const|let)\\s+${named[1]}\\s*=)`).test(line)
  );
  if (at < 0) return [];

  /**
   * تا **بسته شدنِ** تابع، نه n خطِ ثابت.
   *
   * نسخهٔ اول چهارده خط برمی‌داشت و از انتهای تابع رد می‌شد: بدنهٔ
   * `handleDelete` تمام می‌شد، `</script>` می‌آمد، و بعد دکمهٔ ناوبریِ بعدی
   * — که `goto` داشت. نتیجه: «حذف کتاب» ناوبری اعلام شد.
   */
  const body = [];
  let depth = 0;
  for (let i = at; i < Math.min(lines.length, at + 40); i++) {
    body.push(lines[i]);
    depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    if (i > at && depth <= 0) break;
  }
  return body;
}

/**
 * یک برچسب → حکمِ قاعده‌ای، یا هیچ.
 *
 * پنجره از خودِ خطِ برچسب شروع می‌شود و چند خط پایین‌تر می‌رود: در JSX و
 * Svelte، هندلر معمولاً **بعد** از متنِ دکمه نمی‌آید بلکه روی همان تگ است،
 * پس دو خط بالا هم دیده می‌شود.
 *
 * `null` یعنی «نمی‌دانم»، نه `unknown`: تفاوتشان این است که اولی به مدل
 * سپرده می‌شود و دومی جوابِ نهایی است.
 */
export function ruleVerdict(label, files) {
  const needle = normalize(label).slice(0, 40);
  if (needle.length < 2) return null;

  for (const file of files) {
    // خطوطِ نرمال‌شده یک بار حساب می‌شوند و می‌مانند: همان فایل برای دهها
    // برچسب و دهها گره دوباره خوانده می‌شود
    const lines = file.lines || (file.lines = String(file.content || '').split(/\r?\n/));
    const flat = file.normalized || (file.normalized = lines.map(normalize));
    const at = flat.findIndex((line) => line.includes(needle));
    if (at < 0) continue;

    /**
     * دامنه به **خودِ عنصر** بسته است، نه به چند خطِ اطراف.
     *
     * نسخهٔ اول ده خط اطرافِ برچسب را می‌خواند و نتیجه‌اش این شد: دکمهٔ «حذف
     * کتاب» که یک خط پایین‌ترِ دکمهٔ ناوبری بود، `goto('/contents')` همسایه
     * را برداشت و «ناوبری» اعلام شد. یعنی قاعده‌ای که قرار بود جلوی حدس را
     * بگیرد، خودش حدسِ خطرناک زد — و درست روی برگشت‌ناپذیرترین دکمه.
     *
     * پس: اگر خطِ خودِ برچسب هندلر دارد، فقط همان. وگرنه چند خطِ **بالا**،
     * چون در JSX و Svelte صفت‌ها پیش از متن می‌آیند.
     */
    const own = lines[at];
    const nearby = /on:?click|href\s*=/.test(own) ? [own] : lines.slice(Math.max(0, at - 3), at + 2);
    const text = [...nearby, ...handlerBody(lines, nearby)].join('\n');

    for (const rx of NAV) {
      const found = text.match(rx);
      if (found?.[1]?.startsWith('/')) {
        return { kind: 'nav', predicted: found[1], why: `goto/href در ${file.relative}`, file: file.relative };
      }
    }
    if (DESTRUCTIVE.some((rx) => rx.test(text)) && MUTATE.some((rx) => rx.test(text))) {
      return { kind: 'destructive', why: `درخواستِ حذف در ${file.relative}`, file: file.relative };
    }
    if (MUTATE.some((rx) => rx.test(text))) {
      return { kind: 'mutate', why: `درخواستِ نویسنده در ${file.relative}`, file: file.relative };
    }
  }
  return null;
}

/** مهرِ سمتِ کد: فایل‌هایی که به این گره نسبت داده شده‌اند، با محتوایشان. */
export function hashSource(files) {
  return hashSignature(files.map((file) => `${file.relative}:${String(file.content || '').length}:${hashSignature(String(file.content || ''))}`).join('|'));
}

/**
 * آیا این گره دوباره طبقه‌بندی لازم دارد؟
 *
 * سه حالت: هرگز نشده · صفحه عوض شده · کد عوض شده. هر سه یعنی «بله»، و بقیه
 * یعنی «نه» — که همان صرفه‌جویی است.
 */
export function needsClassify(state, stamp) {
  const done = state?.classified;
  if (!done) return true;
  if (done.profile !== state.profile) return true;
  return done.sourceHash !== stamp;
}

/**
 * حکم‌ها → کنش‌های گره.
 *
 * دستِ آدم دست‌نخورده می‌ماند. این همان قاعدهٔ همیشگیِ این مخزن است: هیچ
 * حلقهٔ خودکاری حرفِ `by: user` را عوض نمی‌کند.
 *
 * و `to` دست نمی‌خورد: آن می‌گوید کلیک **واقعاً** کجا رسید. حدسِ سورس در
 * `predicted` می‌نشیند تا بشود این دو را با هم سنجید.
 */
export function applyVerdicts(state, verdicts, { by }) {
  let changed = 0;
  for (const action of state.actions || []) {
    const verdict = verdicts[action.key];
    if (!verdict || action.by === 'user') continue;
    if (!KINDS.includes(verdict.kind)) continue;

    action.kind = verdict.kind;
    action.by = by;
    if (verdict.predicted) action.predicted = verdict.predicted;
    if (verdict.why) action.why = String(verdict.why).slice(0, 160);
    changed++;
  }
  return changed;
}

/**
 * پیش‌بینی در برابر واقعیت.
 *
 * سورس می‌گوید این دکمه به `/a` می‌رود؛ کلیک به `/login` رسید. این اختلاف
 * صفر هزینه دارد و جنسِ باگی است که هیچ چکِ همگانی نمی‌گیرد.
 *
 * فقط کنشی شمرده می‌شود که **هم** پیش‌بینی دارد **هم** واقعاً امتحان شده و
 * به گرهی رسیده؛ بقیه سکوت است، نه اختلاف.
 */
export function mispredictions(map) {
  const byId = new Map((map.states || []).map((state) => [state.id, state]));
  const out = [];

  for (const state of map.states || []) {
    for (const action of state.actions || []) {
      if (!action.predicted || !action.to) continue;
      const landed = byId.get(action.to);
      if (!landed) continue;
      if (routeMatches(action.predicted, landed.route)) continue;
      out.push({
        from: state.route,
        view: state.view || '',
        label: action.label,
        predicted: action.predicted,
        actual: landed.route,
        why: action.why || '',
      });
    }
  }
  return out;
}

/** `/content/[id]` با `/content/42` یکی است؛ مقایسهٔ رشته‌ای این را نمی‌فهمد. */
function routeMatches(predicted, actual) {
  const clean = (value) => String(value || '').split('?')[0].replace(/\/+$/, '') || '/';
  const a = clean(predicted);
  const b = clean(actual);
  if (a === b) return true;

  const partsA = a.split('/');
  const partsB = b.split('/');
  if (partsA.length !== partsB.length) return false;
  return partsA.every((part, index) => /^\[.+\]$/.test(part) || /^\[.+\]$/.test(partsB[index]) || part === partsB[index]);
}

/**
 * سورسِ مرتبط با یک گره.
 *
 * تطبیق روی **متنِ برچسب** است، نه سلکتور — چون در یک SPAی کامپایل‌شده
 * کلاس‌ها از تیلویند می‌آیند و شناسه‌ها `bits-cNN`اند که با هر رندر عوض
 * می‌شوند. همان چیزی که `signature.js` درباره‌اش نوشته.
 */
/**
 * **همهٔ** سورس، یک بار، برای قاعده‌ها.
 *
 * ── چرا چهار فایلِ برتر کافی نبود ──
 *
 * نخستین اجرای واقعی روی نپی: از ۳۵۵ کنش، قاعده‌ها فقط **یکی** را حل کردند و
 * بقیه به مدل افتاد. علتش این بود که `findRelevantSource` چهار فایلِ برتر را
 * می‌دهد و دکمه‌های یک صفحه در نپی بین دهها کامپوننت پخش‌اند — برچسبِ اکثرشان
 * در آن چهارتا نبود.
 *
 * تطبیقِ برچسب با سورس **جست‌وجوی دقیق** است، نه رتبه‌بندی: یا آن رشته در
 * فایلی هست یا نیست. پس کلِ پیکره یک بار خوانده می‌شود و همان‌جا می‌ماند.
 *
 * `findRelevantSource` سرِ جایش می‌ماند، برای کاری که در آن خوب است: انتخابِ
 * تکه‌های مرتبط برای **مدل**، جایی که بودجه واقعاً محدود است.
 */
export async function loadCorpus(roots, { maxFiles = 600, maxBytes = 8e6 } = {}) {
  const all = await listAllSourceFiles(roots);
  const corpus = [];
  let used = 0;

  for (const relative of all.slice(0, maxFiles)) {
    if (used > maxBytes) break;
    const read = await readAnySourceFile(roots, relative).catch(() => null);
    if (!read?.content) continue;
    used += read.content.length;
    corpus.push({ relative, content: read.content });
  }
  return corpus;
}

export async function sourceFor({ roots, labels, budget = 6000 }) {
  const found = await findRelevantSource({ roots, text: labels.join(' '), budget, maxFiles: 4 });
  const files = [];
  for (const relative of found.files || []) {
    const read = await readAnySourceFile(roots, relative).catch(() => null);
    if (read?.content) files.push({ relative, content: read.content });
  }
  return { files, snippets: found.snippets || '' };
}
