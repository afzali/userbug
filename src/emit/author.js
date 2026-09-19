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
