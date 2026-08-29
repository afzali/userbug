/**
 * نوشتنِ سناریو از روی کاوش.
 *
 * ── چرا این تقریباً رایگان است ──
 *
 * در کاوش، مدل همین حالا حاضر است و صفحه را می‌خواند. تبدیل کارهایی که کرد به
 * یک سناریوی YAML هیچ فراخوانی تازه‌ای لازم ندارد — همان تاریخچه‌ای که برای
 * گزارش نگه داشته‌ایم، ساختارش را دارد. یک بار پول می‌دهید، هم کاوش می‌گیرید
 * هم سناریویی که تا همیشه بدون مدل اجرا می‌شود.
 *
 * ── چرا خروجی همیشه پیش‌نویس است ──
 *
 * مدل رفتار **فعلی** اپ را می‌نویسد. اگر امروز باگی وجود داشته باشد، سناریوی
 * تولیدشده آن را به‌عنوان «انتظارِ درست» ثبت می‌کند و باگ برای همیشه رسمی
 * می‌شود. پس `status: draft` می‌خورد و تا بازبینی انسانی رگرسیون شمرده
 * نمی‌شود.
 *
 * ── چه چیزی عمداً تولید نمی‌شود ──
 *
 * هیچ `assert`ی. کاوشگر نمی‌داند چه چیزی *باید* می‌شد؛ فقط می‌داند چه شد.
 * سنجش را آدم اضافه می‌کند — و همان‌جاست که پیش‌نویس به سناریو تبدیل می‌شود.
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { scenarioDir } from '../scenario/load.js';

/** نامِ کوتاه از منشور — تا در فهرست تست‌ها خوانا بماند. */
function shortName(goal) {
  const firstClause = String(goal).split(/[:.،]|\r?\n/)[0].trim();
  return `[پیش‌نویس] ${firstClause}`.slice(0, 60);
}

/** یک قدمِ کاوش را به فعلِ سناریو تبدیل کن. */
function toStep(record) {
  if (record.failed) return null; // کاری که نشد، در سناریو جایی ندارد

  switch (record.action) {
    case 'click':
      return { click: record.target };
    case 'check':
      return { check: record.target };
    case 'fill':
      return { fill: record.target, value: record.value ?? '' };
    case 'press':
      return { press: record.value ?? 'Enter' };
    default:
      return null;
  }
}

/**
 * @param {object} o
 * @param {object[]} o.preamble قدم‌های سناریوی میزبان تا پیش از کاوش
 * @param {object[]} o.history تاریخچهٔ کاوش
 * @returns {{file: string, steps: number}|null}
 */
export function writeDraft({ targetName, goal, preamble = [], history = [], slug }) {
  const explored = history.map(toStep).filter(Boolean);
  if (!explored.length) return null;

  // `as` باید روی قدمِ اول بنشیند، نه به‌شکل قدمِ جدا: قدمی که فقط `as` دارد
  // فعل ندارد و مفسر ردش می‌کند. پیش‌نویسی که اجرا نشود، پیش‌نویس نیست.
  const [firstStep, ...restSteps] = explored;

  const doc = {
    name: shortName(goal),
    status: 'draft',
    persona: 'novice',
    steps: [
      // مقدمه از سناریوی میزبان می‌آید، پس پیش‌نویس واقعاً قابل اجراست و
      // لازم نیست کسی دستی «چطور به اینجا برسیم» را بنویسد.
      ...preamble,
      { as: 'مسیرِ کشف‌شده', ...firstStep },
      ...restSteps,
    ].filter((s) => Object.keys(s).length > 0),
  };

  const dir = path.join(scenarioDir(targetName), '_drafts');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug}.yml`);

  const header = [
    '# پیش‌نویسِ تولیدشده از کاوش آزاد.',
    '#',
    '# این فایل رفتارِ **فعلی** اپ را ثبت کرده، نه رفتارِ درست را. پیش از',
    '# استفاده بازبینی‌اش کنید و `assert` اضافه کنید — کاوشگر نمی‌داند چه چیزی',
    '# باید می‌شد، فقط می‌داند چه شد.',
    '#',
    '# تا وقتی `status: draft` است، رگرسیون شمرده نمی‌شود.',
    '',
  ].join('\n');

  fs.writeFileSync(file, header + YAML.stringify(doc), 'utf8');
  return { file, steps: explored.length };
}
