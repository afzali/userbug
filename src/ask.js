/**
 * پرسیدن از کاربر — شماره‌دار، نه صفحه‌آرایی.
 *
 * ── چرا TUI نه ──
 *
 * وسوسه‌اش هست: فهرستی با کلید بالا/پایین و تیکِ رنگی. ولی آن یعنی raw
 * mode، بازکشیِ صفحه، و موقعیت‌دهیِ مکان‌نما — و ما تازه فهمیده‌ایم که
 * `cmd.exe` فارسی را وارونه نشان می‌دهد. چیزی که مکان‌نما را جابه‌جا کند،
 * روی همان ترمینال بدتر می‌شکند، و اشکالش را هم نمی‌شود دید.
 *
 * شماره خواندن بی‌رنگ‌وبو است ولی همه‌جا کار می‌کند: هر ترمینالی، هر
 * جهتی، و در لولهٔ اسکریپت هم بی‌صدا نمی‌مانَد.
 *
 * ── چرا خودمان، و نه بسته ──
 *
 * قاعدهٔ `env.js`: «یک وابستگی کمتر یعنی یک چیز کمتر برای شکستن». آنچه
 * لازم است چند خط خواندنِ خط است.
 */
import readline from 'node:readline';
import { clip, pad } from './terminal.js';

/**
 * رقمِ فارسی و عربی → لاتین.
 *
 * کاربرِ این ابزار فارسی تایپ می‌کند و صفحه‌کلیدش ممکن است `۱` بدهد نه
 * `1`. بی این، «۱،۳» هیچ انتخابی نمی‌شود و کاربر فکر می‌کند فهرست خراب
 * است.
 */
export function latinDigits(text) {
  return String(text ?? '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * «۱،۳ و ۵-۷» → [0, 2, 4, 5, 6]
 *
 * ویرگولِ فارسی (،) هم جداکننده است، چون کاربر با صفحه‌کلیدِ فارسی همان
 * را می‌زند.
 */
export function parseSelection(input, count) {
  const text = latinDigits(input).trim().toLowerCase();
  if (!text) return null;
  if (text === 'all' || text === 'همه') return [...Array(count).keys()];
  if (text === 'none' || text === 'هیچ') return [];

  const picked = new Set();
  for (const part of text.split(/[,،\s]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
      for (let n = from; n <= to; n += 1) if (n >= 1 && n <= count) picked.add(n - 1);
      continue;
    }
    const one = Number(part);
    if (Number.isInteger(one) && one >= 1 && one <= count) picked.add(one - 1);
  }
  return [...picked].sort((a, b) => a - b);
}

/** یک خط از کاربر. در غیرِ TTY، رشتهٔ خالی. */
async function readLine(prompt) {
  if (!process.stdin.isTTY) return '';

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolve) => rl.question(prompt, resolve));
  } finally {
    rl.close();
  }
}

/**
 * انتخاب از فهرست.
 *
 * ── چرا در غیرِ TTY نمی‌پرسد ──
 *
 * اسکریپت و CI ورودی ندارند. پرسیدن آنجا یعنی اجرا تا ابد منتظر می‌ماند،
 * و کسی که لاگ را می‌بیند فکر می‌کند کار سنگین است. پس پیش‌فرض برمی‌گردد
 * و صریح گفته می‌شود که پرسیده نشد.
 *
 * @param {object[]} items
 * @param {object} options
 * @param {(item: object, index: number) => string} options.render
 * @param {string} [options.message]
 * @param {string} [options.hint] زیرنویسِ هر بند
 * @param {number[]} [options.fallback] وقتی ترمینال تعاملی نیست
 * @returns {Promise<number[]>} اندیسِ انتخاب‌شده‌ها
 */
export async function choose(items, { render, message = 'کدام‌ها؟', hint, fallback } = {}) {
  if (!items.length) return [];

  console.log('');
  items.forEach((item, index) => {
    console.log(`  ${pad(String(index + 1), 3, 'start')}. ${render(item, index)}`);
    const note = hint?.(item, index);
    if (note) console.log(`       ${clip(note, 74)}`);
  });

  if (!process.stdin.isTTY) {
    const chosen = fallback ?? [];
    console.log(`\n  (ترمینال تعاملی نیست — ${chosen.length ? 'همه' : 'هیچ‌کدام'} انتخاب شد)\n`);
    return chosen;
  }

  console.log('\n  شماره‌ها را با ویرگول یا بازه بدهید — یا «همه» / «هیچ».');
  const answer = await readLine(`  ${message} › `);
  const parsed = parseSelection(answer, items.length);

  // Enterِ خالی یعنی «کاری نکن» — امن‌ترین پیش‌فرض وقتی قرار است فایل عوض شود
  return parsed ?? [];
}

/**
 * متنِ بلند از راهِ ویرایشگر.
 *
 * ── چرا لازم شد ──
 *
 * در `cmd.exe` تایپِ فارسی به‌هم می‌ریزد. بایت‌ها درست می‌رسند، ولی کاربر
 * **نمی‌بیند چه می‌نویسد**: echo از همان رندررِ خرابِ کنسول رد می‌شود، و
 * بدتر — `readline` موقعیتِ مکان‌نما را چپ‌به‌راست حساب می‌کند، پس
 * backspace و ویرایش هم جابه‌جا می‌شوند.
 *
 * هیچ‌کدام از داخلِ Node رفع‌شدنی نیست؛ رندر کارِ کنسول است.
 *
 * ── چرا ویرایشگر جواب می‌دهد ──
 *
 * Notepad و هر ویرایشگرِ گرافیکیِ دیگری bidi دارند. کاربر آنجا راحت
 * می‌نویسد، ذخیره می‌کند، می‌بندد — و ما فایل را می‌خوانیم. همان مسیری که
 * `git commit` بی `-m` می‌رود.
 *
 * @param {object} [options]
 * @param {string} [options.initial] متنِ اولیه
 * @param {string} [options.hint] توضیحی که بالای فایل می‌آید و حذف می‌شود
 * @returns {Promise<string>}
 */
export async function viaEditor({ initial = '', hint = '' } = {}) {
  const { spawnSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-note-'));
  const file = path.join(dir, 'note.txt');

  // خطوطی که با `#` شروع شوند راهنمایند و در خروجی نمی‌آیند — قاعدهٔ آشنا.
  const header = hint ? hint.split('\n').map((line) => `# ${line}`).join('\n') + '\n#\n' : '';

  try {
    fs.writeFileSync(file, `${initial}\n${header ? '\n' + header : ''}`, 'utf8');

    /**
     * `notepad` پیش‌فرضِ ویندوز است چون همیشه هست.
     *
     * `EDITOR` و `VISUAL` بر آن می‌چربند: کسی که آن‌ها را گذاشته، تصمیمش
     * را گرفته است.
     */
    const editor =
      process.env.VISUAL || process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'nano');

    const result = spawnSync(editor, [file], { stdio: 'inherit', shell: true });
    if (result.error) throw new Error(`ویرایشگر باز نشد (${editor}): ${result.error.message}`);

    return fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n')
      .trim();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * بله/خیر.
 *
 * پیش‌فرض `false` است و در غیرِ TTY هم همان برمی‌گردد: کاری که فایل را
 * عوض می‌کند نباید با سکوت انجام شود.
 */
export async function confirm(message, { fallback = false } = {}) {
  if (!process.stdin.isTTY) return fallback;

  const answer = latinDigits(await readLine(`  ${message} (y/n) › `))
    .trim()
    .toLowerCase();
  return answer === 'y' || answer === 'yes' || answer === 'بله' || answer === 'آره';
}
