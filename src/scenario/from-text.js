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
- شکل بدنه‌ها دقیقاً همین است:
    {"go": "/login"}                      ← رشته، نه شیء. مسیر نسبی بهتر از آدرس کامل است.
    {"click": {"role": "button", "name": "ورود"}}
    {"fill": {"ایمیل": "a@b.c"}}
    {"press": "Enter"}
    {"wait": 2000}
    {"expect": {"visible": {"role": "heading", "name": "..."}}}
    {"expect": {"url": "/library"}}
    {"expect": {"text": "سلام"}}
    {"clearState": true}
    {"do": "دکمهٔ ذخیره را بزن"}
- برای سنجش از "expect" (شکست سخت) یا "assert" (یافته، بدون شکست) استفاده کن.
- هویتِ تازه با {{identity.email}} و {{identity.password}} در دسترس است.
- "name" کوتاه و فارسی باشد و کارِ سناریو را بگوید.
- "notes" جای چیزهایی است که از متن کاربر مشخص نبود و حدس زده‌ای؛ اگر چیزی نبود رشتهٔ خالی.
- چیزی از خودت به سناریو اضافه نکن که کاربر نگفته.`;

function buildUser({ text, target, source, knowledge }) {
  const lines = [`متنِ کاربر:\n${text}`];
  if (target?.baseURL) lines.push(`\nآدرس پایهٔ اپ: ${target.baseURL}`);
  if (target?.name) lines.push(`نام پروژه: ${target.name}`);

  /**
   * شناخت پیش از سورس می‌آید، عمداً.
   *
   * تکه‌های سورس خام‌اند و مدل باید از رویشان استنباط کند؛ شناخت جمعِ‌بندیِ
   * همان کار است و بخشی‌اش را آدم تأیید کرده. وقتی هر دو هستند، آنکه بالاتر
   * می‌آید لنگرِ فهم است.
   *
   * و مهم‌تر: فهرست مسیرها یعنی `go:` دیگر حدس نیست. پیش‌تر مدل در `notes`
   * صادقانه می‌نوشت «بر اساس الگوهای رایج فرض شده».
   */
  if (knowledge) lines.push('\nآنچه از این پروژه می‌دانیم:', knowledge);

  /**
   * سورس، وقتی هست.
   *
   * بدون این، مدل برچسب دکمه‌ها را حدس می‌زد و در `notes` هم صادقانه می‌نوشت
   * «بر اساس الگوهای رایج فرض شده». با این، همان برچسب‌ها را از کد می‌خواند.
   *
   * فهرست مسیرها هم می‌رود چون ساختار روت‌ها را می‌گوید — یعنی `go:` هم دیگر
   * حدسی نیست.
   */
  if (source?.tree?.length) {
    lines.push('\nساختار فایل‌های پروژه (بخشی):');
    lines.push(source.tree.slice(0, 200).join('\n'));
  }
  if (source?.snippets) {
    lines.push('\nتکه‌های مرتبطِ سورس — برچسب‌ها و متن‌های واقعی را از همین‌ها بردار:');
    lines.push(source.snippets);
  }

  return lines.join('\n');
}

/**
 * فعل‌هایی که بدنه‌شان قطعاً رشته است.
 *
 * نخستین اجرای واقعی `{go: {url: 'http://…'}}` داد. فعل شناخته‌شده بود پس از
 * اعتبارسنجی رد شد، ولی مفسر `page.goto(object)` می‌زد و وسط اجرا می‌شکست —
 * یعنی سناریویی ذخیره می‌شد که هرگز اجرا نمی‌شد. اعتبارسنجیِ فعل بدونِ
 * اعتبارسنجیِ بدنه، نیمی از کار است.
 */
const STRING_BODY = new Set(['go', 'press', 'note', 'do']);

function assertBody(verb, body, index) {
  const at = `قدم ${index + 1} («${verb}»)`;

  if (STRING_BODY.has(verb)) {
    if (typeof body !== 'string' || !body.trim()) {
      throw new Error(`${at} باید رشته باشد، نه ${JSON.stringify(body)?.slice(0, 60)}`);
    }
    return;
  }

  if (verb === 'wait' && typeof body !== 'number' && !(body && typeof body === 'object')) {
    throw new Error(`${at} باید عدد میلی‌ثانیه یا شرطِ visible باشد`);
  }

  if (verb === 'explore' && typeof body !== 'string' && !body?.goal) {
    throw new Error(`${at} باید رشته باشد یا کلید goal داشته باشد`);
  }
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
    assertBody(verb, raw[verb], index);
  });

  if (unknown.length) {
    throw new Error(`فعل ناشناخته در قدم‌های ${unknown.join('، ')}؛ فعل‌های مجاز: ${[...KNOWN_VERBS].join(' ')}`);
  }

  return { name: name.slice(0, 120), steps: json.steps, notes: String(json.notes ?? '').trim() };
}

/** سناریوی سنجیده‌شده را به متنِ YAML با سرصفحهٔ توضیحی تبدیل کن. */
export function toYaml({ name, steps, notes }, { text, sourceFiles = [], knowledge = '' }) {
  const header = [
    '# ساخته‌شده از متنِ کاربر با هوش مصنوعی.',
    '#',
    '# متنِ اصلی:',
    ...String(text)
      .split(/\r?\n/)
      .map((line) => `#   ${line}`),
  ];

  // بدون این، بعداً نمی‌شد فهمید سناریو با شناخت ساخته شده یا بی‌آن — و وقتی
  // کیفیتِ دو سناریو فرق کند، همین خط جوابِ «چرا» است.
  if (knowledge) header.push('#', '# با شناختِ ثبت‌شدهٔ پروژه ساخته شد.');

  // بدون این، بعداً نمی‌شد فهمید برچسب‌ها از کد آمده‌اند یا حدس بوده‌اند.
  if (sourceFiles.length) {
    header.push('#', '# سورس این فایل‌ها خوانده شد:');
    for (const file of sourceFiles) header.push(`#   ${file}`);
  }

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
 * @param {object} [o.source] خروجی `findRelevantSource()`، اگر کاربر اجازه داده باشد
 * @param {string} [o.knowledge] خروجی `knowledgeFor()` — مسیرها، ورود، واژه‌ها، خطرها
 * @returns {Promise<{yaml: string, name: string, steps: number, notes: string, slug: string, budget: object}>}
 */
export async function scenarioFromText({ text, models, target, source, knowledge }) {
  const trimmed = String(text ?? '').trim();
  if (trimmed.length < 10) throw new Error('متن خیلی کوتاه است؛ بگویید کاربر چه کاری انجام می‌دهد');
  if (trimmed.length > MAX_TEXT) throw new Error(`متن بیش از ${MAX_TEXT} نویسه است؛ آن را به چند سناریو بشکنید`);

  const budget = new Budget(models.budgetPerRun);
  const { json } = await askJson(
    models,
    {
      system: SYSTEM.replace('{{VERBS}}', [...KNOWN_VERBS].join(' ')),
      user: buildUser({ text: trimmed, target, source, knowledge }),
    },
    budget
  );

  const scenario = assertScenarioShape(json);
  return {
    yaml: toYaml(scenario, { text: trimmed, sourceFiles: source?.files || [], knowledge }),
    sourceFiles: source?.files || [],
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
