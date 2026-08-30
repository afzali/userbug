/**
 * متن ساده → سناریوی YAML.
 *
 * کاربر می‌نویسد «ثبت‌نام کن، کد بازیابی را دانلود کن، خارج شو و با همان کد
 * برگرد» و اینجا یک سناریوی معتبر بیرون می‌آید.
 *
 * ── چرا خروجی ذخیره نمی‌شود ──
 *
 * این تابع فایل نمی‌نویسد. YAML را برمی‌گرداند تا در رابط دیده و بازبینی شود و
 * بعد از همان دروازهٔ همیشگی (`writeProjectFile`) ذخیره شود. اگر خودش
 * می‌نوشت، دو مسیرِ نوشتن داشتیم با دو اعتبارسنجی — و یکی‌شان دیر یا زود از
 * دیگری عقب می‌افتاد.
 *
 * ── چرا برخلاف `--author` اینجا `assert` مجاز است ──
 *
 * کاوشگر رفتار *فعلی* اپ را می‌بیند، پس هر سنجشی که بنویسد باگِ امروز را رسمی
 * می‌کند. ولی اینجا خودِ کاربر گفته چه چیزی *باید* بشود؛ سنجش از نیتِ او
 * می‌آید نه از رفتار اپ. همین تفاوت است که این مسیر را از پیش‌نویسِ کاوش جدا
 * می‌کند.
 *
 * ── چرا هنوز `status: draft` می‌خورد ──
 *
 * متنِ آدم مبهم است و مدل حدس می‌زند. تا آدم نخوانده باشد، رگرسیون شمردنش یعنی
 * سپردنِ تعریفِ «درست» به یک حدس.
 */
import YAML from 'yaml';
import { KNOWN_VERBS, stepVerb } from './verbs.js';
import { askJson, Budget } from '../models/provider.js';

/** سقفِ اندازهٔ متنِ ورودی. بلندتر از این، یعنی چند سناریو در یک درخواست. */
const MAX_TEXT = 4000;

const SYSTEM = `تو یک سناریوی تست کاربرمحور می‌نویسی، به‌شکل YAML، برای ابزاری به نام userbug.

خروجی فقط JSON باشد با این شکل:
{"name": "...", "steps": [ ... ], "notes": "..."}

قواعد:
- هر قدم یک شیء با **یک** فعل است. عنوان اختیاری با کلید "as".
- فعل‌های مجاز: {{VERBS}}
- فعل دیگری ننویس. اگر کاری با این فعل‌ها بیان‌شدنی نبود، از "do" با توضیح فارسی استفاده کن.
- هدفِ کلیک و پر کردن را با نامِ دیده‌شده روی صفحه بنویس: {click: {role: button, name: "ورود"}} یا {fill: {"ایمیل": "..."}}.
- برای سنجش از "expect" (شکست سخت) یا "assert" (یافته، بدون شکست) استفاده کن.
- هویتِ تازه با {{identity.email}} و {{identity.password}} در دسترس است.
- "name" کوتاه و فارسی باشد و کارِ سناریو را بگوید.
- "notes" جای چیزهایی است که از متن کاربر مشخص نبود و حدس زده‌ای؛ اگر چیزی نبود رشتهٔ خالی.
- چیزی از خودت به سناریو اضافه نکن که کاربر نگفته.`;

function buildUser({ text, target }) {
  const lines = [`متنِ کاربر:\n${text}`];
  if (target?.baseURL) lines.push(`\nآدرس پایهٔ اپ: ${target.baseURL}`);
  if (target?.name) lines.push(`نام پروژه: ${target.name}`);
  return lines.join('\n');
}

/**
 * ساختِ خروجی مدل را بسنج.
 *
 * ملایم نیست: قدمی که فعلِ ناشناس دارد وسط اجرا می‌شکند، و سناریویی که ذخیره
 * شود ولی اجرا نشود بدتر از نساختنش است.
 *
 * @returns {{name: string, steps: object[], notes: string}}
 */
export function assertScenarioShape(json) {
  if (!json || typeof json !== 'object') throw new Error('پاسخ مدل شیء نبود');

  const name = String(json.name ?? '').trim();
  if (!name) throw new Error('سناریوی ساخته‌شده «name» ندارد');

  if (!Array.isArray(json.steps) || json.steps.length === 0) {
    throw new Error('سناریوی ساخته‌شده قدمی ندارد');
  }

  const unknown = [];
  json.steps.forEach((raw, index) => {
    const verb = stepVerb(raw);
    if (!verb) throw new Error(`قدم ${index + 1} فعل ندارد: ${JSON.stringify(raw).slice(0, 80)}`);
    if (!KNOWN_VERBS.has(verb)) unknown.push(`${index + 1}:${verb}`);
  });

  if (unknown.length) {
    throw new Error(`فعل ناشناخته در قدم‌های ${unknown.join('، ')}؛ فعل‌های مجاز: ${[...KNOWN_VERBS].join(' ')}`);
  }

  return { name: name.slice(0, 120), steps: json.steps, notes: String(json.notes ?? '').trim() };
}

/** سناریوی سنجیده‌شده را به متنِ YAML با سرصفحهٔ توضیحی تبدیل کن. */
export function toYaml({ name, steps, notes }, { text }) {
  const header = [
    '# ساخته‌شده از متنِ کاربر با هوش مصنوعی.',
    '#',
    '# متنِ اصلی:',
    ...String(text)
      .split(/\r?\n/)
      .map((line) => `#   ${line}`),
  ];

  if (notes) {
    header.push('#', '# چیزهایی که مدل حدس زده و باید بازبینی شود:', `#   ${notes}`);
  }

  header.push(
    '#',
    '# تا وقتی `status: draft` است، رگرسیون شمرده نمی‌شود. پس از بازبینی',
    '# `approved` کنید.',
    ''
  );

  return header.join('\n') + YAML.stringify({ name, status: 'draft', persona: 'novice', steps });
}

/**
 * یک فراخوانی مدل، و یک سناریوی معتبر.
 *
 * @param {object} o
 * @param {string} o.text     متنِ کاربر
 * @param {object} o.models   خروجی `resolveModel()`
 * @param {object} [o.target] برای اینکه مدل آدرس پایه و نام پروژه را بداند
 * @returns {Promise<{yaml: string, name: string, steps: number, notes: string, slug: string, budget: object}>}
 */
export async function scenarioFromText({ text, models, target }) {
  const trimmed = String(text ?? '').trim();
  if (trimmed.length < 10) throw new Error('متن خیلی کوتاه است؛ بگویید کاربر چه کاری انجام می‌دهد');
  if (trimmed.length > MAX_TEXT) throw new Error(`متن بیش از ${MAX_TEXT} نویسه است؛ آن را به چند سناریو بشکنید`);

  const budget = new Budget(models.budgetPerRun);
  const { json } = await askJson(
    models,
    {
      system: SYSTEM.replace('{{VERBS}}', [...KNOWN_VERBS].join(' ')),
      user: buildUser({ text: trimmed, target }),
    },
    budget
  );

  const scenario = assertScenarioShape(json);
  return {
    yaml: toYaml(scenario, { text: trimmed }),
    name: scenario.name,
    steps: scenario.steps.length,
    notes: scenario.notes,
    slug: slugify(scenario.name),
    budget: budget.snapshot(),
  };
}

/**
 * نامِ فایل از نامِ سناریو.
 *
 * فارسی را نگه می‌دارد چون `assertSafeSegment` در رابط حرفِ یونیکد را می‌پذیرد
 * و نامِ خواندنی در فهرست فایل‌ها ارزش دارد.
 */
export function slugify(name) {
  const base = String(name)
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'scenario';
}
