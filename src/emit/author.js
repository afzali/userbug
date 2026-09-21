/**
 * ساختارِ سناریو → فایلِ `.spec.js`.
 *
 * ── جایی که سه ماژولِ دیگر به هم می‌رسند ──
 *
 *   emit/locator.js   توصیفِ هدف → locator
 *   emit/action.js    فعل        → کنش
 *   emit/spec.js      قدم‌ها     → اسکلتِ فایل
 *
 * این ماژول فقط می‌چیندشان و یک چیز از خودش دارد: **نام‌گذاریِ قدم‌ها**.
 *
 * ── چرا نام‌گذاری کارِ کمی نیست ──
 *
 * نامِ `ub.step()` سه کار می‌کند: مرزِ زمانی برای همبسته کردنِ لاگ سرور،
 * چیزی که در گزارش خوانده می‌شود، و **لنگرِ درجِ ادعا**. سومی سخت‌گیر است:
 * دو قدمِ هم‌نام یعنی درجی که نمی‌داند کجا بنشیند، و `emitSpec` اجازه‌اش
 * را نمی‌دهد. پس نامِ تکراری اینجا شماره می‌گیرد، نه اینکه بگذاریم فایل
 * نساخته بماند.
 */
import { describeTarget } from '../checks/contract.js';
import { emitAction, verbOf } from './action.js';
import { emitLocator } from './locator.js';
import { emitSpec } from './spec.js';

/** جمله‌ای که کنارِ قدم در گزارش دیده می‌شود. */
function describeStep(step) {
  const verb = verbOf(step);
  const body = step[verb];

  switch (verb) {
    case 'go':
      return `رفتن به ${body || '/'}`;
    case 'clearState':
      return 'پاکسازیِ حالت';
    case 'dismissBlockers':
      return 'بستنِ مزاحم‌ها';
    case 'press':
      return `زدنِ کلیدِ ${body || 'Enter'}`;
    case 'wait':
      return typeof body === 'object' ? `صبر تا ${safeDescribe(firstCondition(body)[1])}` : `صبرِ ${body} میلی‌ثانیه`;
    case 'when':
      return `اگر ${safeDescribe(firstCondition(body)[1])} بود`;
    case 'click':
      return `کلیکِ ${safeDescribe(body)}`;
    case 'dblclick':
      return `دوبار کلیکِ ${safeDescribe(body)}`;
    case 'hover':
      return `اشاره به ${safeDescribe(body)}`;
    case 'check':
      return `تیکِ ${safeDescribe(body)}`;
    case 'fill':
    case 'type': {
      // شکلِ کوتاه `{fill: {«ایمیل»: «…»}}` نامش را از برچسب‌ها می‌گیرد.
      if (step.value === undefined && body && typeof body === 'object' && !isTarget(body)) {
        return `پر کردنِ ${Object.keys(body).map((k) => `«${k}»`).join('، ')}`;
      }
      return `پر کردنِ ${safeDescribe(body)}`;
    }
    default:
      return verb;
  }
}

const TARGET_KEYS = new Set(['testid', 'role', 'name', 'label', 'text', 'placeholder', 'selector']);
const isTarget = (body) => Object.keys(body ?? {}).some((key) => TARGET_KEYS.has(key));

/** اولین شرطِ یک `when`/`wait` — کلید و هدفش. */
function firstCondition(body) {
  const entries = Object.entries(body ?? {}).filter(([key]) => !['timeout', 'then', 'else'].includes(key));
  return entries[0] ?? ['visible', ''];
}

/**
 * `describeTarget` روی هر شکلی نمی‌خورد.
 *
 * و اینجا خطایش نباید کلِ تولید را بخواباند: نام فقط برچسب است، و برچسبِ
 * نه‌چندان زیبا از نساختنِ فایل بهتر است.
 */
function safeDescribe(target) {
  try {
    const described = describeTarget(target);
    if (described) return described;
  } catch {
    // از شکلِ خام می‌سازیم
  }
  if (typeof target === 'string') return `«${target}»`;
  const value = target?.name ?? target?.label ?? target?.text ?? target?.testid ?? target?.placeholder;
  return value ? `«${value}»` : 'عنصر';
}

/**
 * نامِ یکتا.
 *
 * تکرار طبیعی است — دو بار «کلیکِ دکمهٔ ذخیره» در یک سفر عجیب نیست. ولی
 * لنگر باید یکتا باشد، پس دومی شماره می‌گیرد.
 */
function uniqueName(base, taken) {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let n = 2;
  while (taken.has(`${base} (${n})`)) n += 1;
  const name = `${base} (${n})`;
  taken.add(name);
  return name;
}

/**
 * قدمِ `when` → بلوکِ شرطی.
 *
 * `ub.appears()` یک پیاده‌سازی دارد و در `fixtures.js` زندگی می‌کند، نه در
 * هر فایلِ تولیدشده.
 */
function emitConditional(step) {
  const body = step.when;
  const [kind, target] = firstCondition(body);
  const timeout = Number(body?.timeout) || 5000;
  const branch = step.then || body?.then || [];

  const inner = branch.flatMap((sub) => emitAction(sub)).map((line) => '  ' + line);
  const locator = emitLocator(target);
  const check = kind === 'hidden' ? `!(await ub.appears(${locator}, ${timeout}))` : `await ub.appears(${locator}, ${timeout})`;

  return [`if (${check}) {`, ...inner, '}'];
}

/**
 * گشتِ ضبط‌شده → متنِ فایل.
 *
 * ── چرا گروه‌بندی بر اساسِ صفحه، و نه هر کلیک یک قدم ──
 *
 * ضبطِ گشت ریز است: ده کلیک و پنج تایپ در یک صفحه. اگر هر کدام یک
 * `ub.step()` شود، فایل خوانده نمی‌شود و لنگرها بی‌معنا می‌شوند.
 *
 * خودِ `stepsToYaml` از روزِ اول این را می‌دانست و کلیدِ `as:` را وقتی
 * می‌گذاشت که کاربر وارد صفحهٔ تازه‌ای شده بود — «گزارش خواناتر می‌شود».
 * همان مرز اینجا مرزِ `ub.step()` است، و عنوانش از مسیر و از **توضیحی که
 * خودِ کاربر حین گشت نوشته** ساخته می‌شود.
 *
 * یعنی چیزی که در ترمینال تایپ کردید، در گزارشِ تست دیده می‌شود.
 *
 * @param {object} input
 * @param {{url?: string, step: object, needsFixture?: string}[]} input.steps
 * @param {{path: string, purpose?: string}[]} [input.pages]
 * @param {string} input.name
 * @param {string} [input.purpose] توضیحِ کلیِ کاربر دربارهٔ این گشت
 * @param {string} [input.startPath]
 * @returns {string}
 */
export function tourToSpec({ steps = [], pages = [], name, purpose = '', startPath = '/' }) {
  if (!steps.length) throw new Error('گشت قدمی ضبط نکرده');

  const groups = [{ title: `شروع از ${startPath}`, steps: [{ clearState: true }, { go: startPath }] }];
  let lastUrl = null;

  for (const entry of steps) {
    if (entry.url && entry.url !== lastUrl) {
      const page = pages.find((item) => item.path === entry.url);
      groups.push({ title: page?.purpose ? `${entry.url} — ${page.purpose}` : entry.url, steps: [] });
      lastUrl = entry.url;
    }
    groups.at(-1).steps.push(entry.step);
  }

  const taken = new Set();
  const emitted = groups
    .filter((group) => group.steps.length)
    .map((group) => ({
      name: uniqueName(String(group.title).slice(0, 70), taken),
      lines: group.steps.flatMap((step) => (verbOf(step) === 'when' ? emitConditional(step) : emitAction(step))),
    }));

  /**
   * فایل‌های نمونه در سرصفحه اعلام می‌شوند.
   *
   * بی آن‌ها این تست روی ماشینِ دیگری نمی‌دود، و خطایش («فایل پیدا نشد»)
   * دربارهٔ اپ هیچ نمی‌گوید.
   */
  const uploads = steps.map((item) => item.needsFixture).filter(Boolean);

  const doc = [
    'ضبط‌شده از گشتِ زندهٔ کاربر.',
    '',
    'قدم‌ها با توصیفِ معنایی نوشته شده‌اند (نقش و برچسب، نه سلکتور)، پس',
    'تغییرِ ساختارِ HTML نمی‌شکندشان.',
  ];
  if (purpose) doc.splice(1, 0, '', `دربارهٔ چه بود: ${purpose}`);
  if (uploads.length) {
    doc.push(
      '',
      'این فایل‌ها باید با `userbug fixtures <هدف> --add` اضافه شوند،',
      'وگرنه تست روی ماشینِ دیگری اجرا نمی‌شود:',
      ...[...new Set(uploads)].map((file) => `  ${file}`),
    );
  }
  doc.push(
    '',
    'ضبطِ کلیک تستِ خوبی نمی‌سازد: مسیرِ اشتباه و کلیکِ تکراری هم ضبط شده،',
    'و ادعا جایی که مهم بوده نوشته نشده. بازبینی‌اش کنید، بعد:',
    '  userbug expect <هدف> --from <همین فایل>',
  );

  return emitSpec({ title: name || 'گشت', doc: doc.join('\n'), steps: emitted });
}

/**
 * سناریو → متنِ فایل.
 *
 * @param {object} scenario `{name, steps}`
 * @param {object} [options]
 * @param {string} [options.doc] کامنتِ بالای فایل
 * @returns {string}
 */
export function scenarioToSpec(scenario, { doc } = {}) {
  const steps = Array.isArray(scenario?.steps) ? scenario.steps : [];
  if (!steps.length) throw new Error('سناریو قدمی ندارد');

  const taken = new Set();
  const emitted = steps.map((step) => ({
    name: uniqueName(describeStep(step), taken),
    lines: verbOf(step) === 'when' ? emitConditional(step) : emitAction(step),
  }));

  return emitSpec({
    title: scenario.name || 'بی‌نام',
    doc:
      doc ??
      'ساختهٔ `userbug author`.\n\n' +
        'این فایل مالِ شماست: دستی ویرایشش کنید، در گیت نگهش دارید، و با\n' +
        '`npx playwright test` اجرایش کنید. برای افزودنِ ادعا: `userbug expect`.',
    steps: emitted,
  });
}
