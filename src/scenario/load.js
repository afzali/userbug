/**
 * خواندن سناریوهای YAML.
 *
 * سناریوها فایل‌اند و — طبق قانون ۵ — کنار پروژهٔ تحت تست زندگی می‌کنند. برای
 * نپی این یعنی `scenarios/nepi/*.yml` تا وقتی که ریپوی خودِ نپی میزبانشان شود.
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { rootDir } from '../target.js';

const REQUIRED = ['name', 'steps'];

/**
 * پوشهٔ سناریوهای یک هدف.
 *
 * ریشه هر بار حساب می‌شود چون اینجا فقط خوانده نمی‌شود: `_drafts/` و
 * `_learned/` در همین پوشه نوشته می‌شوند، و مسیرِ نوشتنیِ غلط بی‌صدا فایلِ
 * پروژهٔ دیگری را می‌سازد.
 */
export function scenarioDir(targetName) {
  return path.join(rootDir(), 'scenarios', targetName);
}

export function loadScenarios(targetName) {
  // اجرای یک فایل مشخص از هر جای دیسک — برای بازتولیدِ یک یافته، بدون
  // اینکه لازم باشد فایل را دستی در پوشهٔ سناریوها کپی کنید.
  if (process.env.UB_SCENARIO_FILE) return [loadScenario(process.env.UB_SCENARIO_FILE)];

  const dir = scenarioDir(targetName);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort()
    .map((file) => loadScenario(path.join(dir, file)));
}

export function loadScenario(file) {
  const doc = YAML.parse(fs.readFileSync(file, 'utf8'));

  for (const key of REQUIRED) {
    if (doc?.[key] === undefined) throw new Error(`${path.basename(file)}: «${key}» ندارد`);
  }
  if (!Array.isArray(doc.steps)) throw new Error(`${path.basename(file)}: steps باید فهرست باشد`);

  return {
    file,
    id: path.basename(file).replace(/\.ya?ml$/, ''),
    name: doc.name,
    /**
     * سناریوی پیش‌نویس هرگز رگرسیون شمرده نمی‌شود.
     *
     * در فاز ۲ که مدل سناریو می‌نویسد، این تنها چیزی است که جلوی رسمی شدنِ
     * باگِ امروز به‌عنوان «انتظارِ درست» را می‌گیرد.
     */
    status: doc.status || 'approved',
    persona: doc.persona || 'novice',
    device: doc.device || null,
    /** مهلت کل سناریو. کاوش آزاد ذاتاً بلند است و با پیش‌فرض نمی‌سازد. */
    timeout: doc.timeout || null,
    steps: doc.steps,
  };
}

/**
 * «کدام سناریو» — از نام، یا از مسیر.
 *
 * ── باگی که با رفتنِ کلِ حلقه روی نپی پیدا شد ──
 *
 * `--from` فقط **مسیرِ فایل** می‌پذیرفت. ولی کشویی «اول با این سناریو وارد
 * شو» در رابط، **نام** سناریو را می‌داد — چون نام همان چیزی است که آدم
 * می‌شناسد و روی صفحه می‌بیند.
 *
 * نتیجه: کاربر «ورود» را انتخاب می‌کرد، خزش شروع می‌شد، و یک ثانیه بعد با
 * `سناریوی مسیرِ ورود پیدا نشد: D:/Projects/userbug/ورود` می‌مرد — بی هیچ
 * پوشهٔ اجرایی، پس رابط هم چیزی برای نشان دادن نداشت. از بیرون: دکمه‌ای که
 * هیچ کاری نمی‌کرد.
 *
 * ── چرا هر دو، و به این ترتیب ──
 *
 * مسیر اول امتحان می‌شود تا رفتارِ امروزِ خط فرمان دست‌نخورده بماند؛ بعد
 * نام، داخلِ پوشهٔ همان هدف. نامِ سناریو با مسیرِ فایل اشتباه گرفته نمی‌شود
 * چون اولی وقتی برنده است که فایلی واقعاً همان‌جا باشد.
 */
export function resolveScenarioRef(targetName, ref) {
  const raw = String(ref || '').trim();
  if (!raw) return '';

  /** مسیر — چه مطلق چه نسبت به جایی که کاربر ایستاده. */
  const asPath = path.resolve(raw);
  if (fs.existsSync(asPath) && fs.statSync(asPath).isFile()) return asPath;

  /**
   * و نسبت به ریشهٔ مخزن.
   *
   * ── چرا این پله لازم شد ──
   *
   * `map.entry.scenario` مسیر را **نسبت به ریشه** ذخیره می‌کند
   * (`scenarios/nepi6/ورود.yml`) — که درست است، چون باید قابلِ حمل باشد.
   *
   * ولی رابط از `ui/` اجرا می‌شود، پس `path.resolve` همان رشته را به
   * `ui/scenarios/…` می‌برد و پیدا نمی‌کند. از خط فرمان کار می‌کرد و در
   * رابط نه — بدترین نوعِ اختلاف، چون با آزمودن از ترمینال هرگز دیده
   * نمی‌شود.
   */
  const fromRoot = path.resolve(rootDir(), raw);
  if (fs.existsSync(fromRoot) && fs.statSync(fromRoot).isFile()) return fromRoot;

  const dir = scenarioDir(targetName);

  /** مسیرِ نسبی به پوشهٔ همان هدف — همان شکلی که رابط در فهرست نشان می‌دهد. */
  const inside = path.resolve(dir, raw);
  if (fs.existsSync(inside) && fs.statSync(inside).isFile()) return inside;

  for (const suffix of ['.yml', '.yaml']) {
    const guess = `${inside}${suffix}`;
    if (fs.existsSync(guess)) return guess;
  }

  /**
   * و در آخر، نامِ داخلِ فایل — چون نامی که کاربر می‌بیند `name:` است،
   * نه نامِ فایل. روی نپی این دو یکی بودند و همین پنهانش کرده بود.
   */
  const named = [];
  const walk = (folder) => {
    let entries = [];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '_learned') walk(full);
        continue;
      }
      if (!/\.ya?ml$/i.test(entry.name)) continue;
      try {
        const one = loadScenario(full);
        named.push(one.name);
        if (one.name === raw) throw { hit: full };
      } catch (cause) {
        if (cause?.hit) throw cause;
        // فایلِ خراب؛ بقیه هنوز نامزدند
      }
    }
  };

  try {
    walk(dir);
  } catch (cause) {
    if (cause?.hit) return cause.hit;
    throw cause;
  }

  /**
   * پیامِ خطا نامزدها را می‌گوید.
   *
   * «پیدا نشد: D:/Projects/userbug/ورود» به کاربر می‌گفت ابزار دنبالِ
   * فایلی در ریشهٔ مخزن گشته — که هیچ ربطی به چیزی که او انتخاب کرده بود
   * نداشت و راهنمایی‌اش نمی‌کرد.
   */
  const hint = named.length ? ` — این‌ها هست: ${named.slice(0, 8).join('، ')}` : ' — این پروژه هنوز سناریویی ندارد';
  throw new Error(`سناریوی «${raw}» پیدا نشد${hint}`);
}
