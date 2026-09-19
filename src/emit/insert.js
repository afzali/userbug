/**
 * درجِ ادعا در یک `.spec.js`ِ موجود.
 *
 * ── چرا این کار از اسپلایسِ آرایه سخت‌تر است ──
 *
 * `applyExpectations` در YAML یک `steps.splice()` بود. اینجا هدف **متن**
 * است: فایلی که ممکن است کاربر دستی ویرایشش کرده باشد و ما حق نداریم
 * خرابش کنیم.
 *
 * ── دو محافظ، چون یکی کافی نیست ──
 *
 * ۱. لنگر نام است نه شماره، و اگر نامی پیدا نشد **بلند می‌شکند**. درجی که
 *    جای دیگری بنشیند از درج‌نشدن بدتر است: کاربر ادعا را در فایل می‌بیند
 *    و فکر می‌کند جای درستی است.
 *
 * ۲. خروجی پیش از بازگشت پارس می‌شود. اسکنرِ زیر رشته و کامنت و
 *    template را می‌فهمد ولی literalِ منظم (`/}/`) را نه — و آنجا شمارشِ
 *    آکولاد بی‌صدا غلط می‌شود. به‌جای وانمود کردن به پارسرِ کامل، نتیجه
 *    سنجیده می‌شود: فایلِ خراب هرگز برنمی‌گردد.
 *
 * وابستگیِ پارسر اضافه نشد. قاعدهٔ همین مخزن در `env.js`: «یک وابستگی
 * کمتر یعنی یک چیز کمتر برای شکستن».
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { emitAssertion } from './assertion.js';

/**
 * انتهای بلوکِ `ub.step('<نام>', async () => { … });`
 *
 * اندیسی برمی‌گرداند که **بعد از** `});` است — یعنی جایی که خطِ تازه
 * می‌نشیند.
 *
 * @param {string} source
 * @param {string} stepName
 * @returns {number}
 */
export function blockEnd(source, stepName) {
  const anchor = findAnchor(source, stepName);
  if (anchor < 0) {
    throw new Error(
      `قدمی به نامِ «${stepName}» در فایل نیست.\n` +
        '  لنگرِ درج نامِ قدم است؛ شاید فایل ویرایش شده و نام عوض شده باشد.',
    );
  }

  const open = source.indexOf('{', anchor);
  if (open < 0) throw new Error(`بلوکِ قدمِ «${stepName}» باز نمی‌شود`);

  const close = matchBrace(source, open);
  if (close < 0) throw new Error(`بلوکِ قدمِ «${stepName}» بسته نمی‌شود`);

  // بعد از `}` باید `)` و `;` بیایند. هرچه بینشان است فاصله است.
  let index = close + 1;
  for (const expected of [')', ';']) {
    while (index < source.length && /\s/.test(source[index])) index += 1;
    if (source[index] !== expected) {
      throw new Error(`پایانِ قدمِ «${stepName}» شکلِ منتظره را ندارد؛ فایل دست‌نخورده ماند`);
    }
    index += 1;
  }
  return index;
}

/** جای `ub.step(` با همین نام — هر دو شکلِ نقل‌قول. */
function findAnchor(source, stepName) {
  for (const quote of ["'", '"']) {
    const literal = quote === "'" ? singleQuoted(stepName) : JSON.stringify(stepName);
    const needle = `ub.step(${literal}`;
    const at = source.indexOf(needle);
    if (at >= 0) return at;
  }
  return -1;
}

const singleQuoted = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * آکولادِ متناظر.
 *
 * رشته، کامنت و template را رد می‌کند؛ `${}` داخلِ template دوباره وارد
 * حالتِ کد می‌شود چون آکولادهایش می‌شمارند. literalِ منظم را نمی‌فهمد —
 * و همین است که تأییدِ پارس را لازم می‌کند.
 *
 * @returns {number} اندیسِ `}`ِ متناظر، یا ۱- اگر بسته نشد
 */
function matchBrace(source, open) {
  let depth = 0;
  const templates = []; // عمقِ آکولاد در لحظهٔ ورود به هر `${`

  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '/' && next === '/') {
      i = source.indexOf('\n', i);
      if (i < 0) return -1;
      continue;
    }

    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) return -1;
      i = end + 1;
      continue;
    }

    if (char === "'" || char === '"') {
      i = skipString(source, i, char);
      if (i < 0) return -1;
      continue;
    }

    if (char === '`') {
      const found = skipTemplate(source, i);
      if (found.interpolation) {
        templates.push(depth);
        depth += 1;
        i = found.index;
        continue;
      }
      if (found.index < 0) return -1;
      i = found.index;
      continue;
    }

    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;

      // بستنِ یک `${` — برگشت به خودِ template.
      if (templates.length && depth === templates[templates.length - 1]) {
        templates.pop();
        const found = skipTemplate(source, i, true);
        if (found.interpolation) {
          templates.push(depth);
          depth += 1;
        }
        if (found.index < 0) return -1;
        i = found.index;
      }
    }
  }
  return -1;
}

/** تا پایانِ رشته. `\` کاراکترِ بعدی را می‌بلعد. */
function skipString(source, start, quote) {
  for (let i = start + 1; i < source.length; i += 1) {
    if (source[i] === '\\') i += 1;
    else if (source[i] === quote) return i;
    else if (source[i] === '\n') return -1; // رشتهٔ تک‌خطی که بسته نشده
  }
  return -1;
}

/**
 * تا پایانِ template یا تا اولین `${`.
 *
 * @param {boolean} [resuming] از وسطِ template ادامه می‌دهیم (بعد از `}`)
 */
function skipTemplate(source, start, resuming = false) {
  for (let i = start + 1; i < source.length; i += 1) {
    if (source[i] === '\\') i += 1;
    else if (source[i] === '`' ) return { index: i, interpolation: false };
    else if (source[i] === '$' && source[i + 1] === '{') return { index: i + 1, interpolation: true };
  }
  return { index: -1, interpolation: false, resuming };
}

/**
 * پایانِ خودِ `test(...)` — جایی که ادعای بی‌لنگر می‌نشیند.
 *
 * آخرین `});` در ستونِ صفر. فایلِ تولیدشده همیشه همین شکل است و فایلِ
 * ویرایش‌شده هم تا وقتی تستِ دوم اضافه نشده.
 */
export function testEnd(source) {
  const at = source.lastIndexOf('\n});');
  if (at < 0) throw new Error('پایانِ `test(...)` پیدا نشد؛ فایل دست‌نخورده ماند');
  return at + 1;
}

/**
 * درجِ چند ادعا.
 *
 * `after` نامِ قدم است؛ نبودش یعنی «در پایان». از آخر به اول درج می‌شود تا
 * اندیس‌های محاسبه‌شده با درجِ قبلی جابه‌جا نشوند.
 *
 * @param {string} source
 * @param {import('./assertion.js').Expectation[]} items هر کدام با `after`
 * @returns {string}
 */
export function insertAssertions(source, items = []) {
  const placed = items.map((item) => ({
    item,
    at: item.after ? blockEnd(source, item.after) : testEnd(source),
  }));

  // ترتیبِ خواندن باید حفظ شود، پس درج از آخر به اول است و هم‌جاها معکوس
  // نمی‌شوند: `sort` پایدار است و `reverse` روی گروهِ هم‌اندیس اعمال نمی‌شود.
  const byPosition = [...placed].sort((a, b) => b.at - a.at);

  let out = source;
  for (let i = 0; i < byPosition.length; i += 1) {
    const { at } = byPosition[i];
    const sameSpot = byPosition.filter((entry) => entry.at === at);
    if (sameSpot[0] !== byPosition[i]) continue; // این جا قبلاً پر شده

    const block = sameSpot.map(({ item }) => '  ' + emitAssertion(item)).join('\n');
    out = out.slice(0, at) + '\n' + block + '\n' + out.slice(at);
  }

  assertParses(out);
  return out;
}

/**
 * واقعاً پارس می‌شود؟
 *
 * با `node --check`، نه با regex و نه با `new Function` — دومی `import` را
 * نمی‌پذیرد و ما دقیقاً فایلی می‌سازیم که `import` دارد.
 */
export function assertParses(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-check-'));
  const file = path.join(dir, 'candidate.mjs');

  try {
    fs.writeFileSync(file, source, 'utf8');
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(
        'درج، فایل را نامعتبر می‌کرد — پس انجام نشد.\n' +
          '  این یعنی لنگر درست پیدا نشد (مثلاً literalِ منظم در فایل).\n' +
          `  پیامِ node: ${String(result.stderr).split('\n').find((l) => l.includes('Error')) || '؟'}`,
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
