/**
 * «انتظار داشتیم چه ببینیم؟»
 *
 * ── چرا این حلقه باز بود ──
 *
 * کاربر گفت مهم‌ترین چیز این است: «نه‌تنها بفهمیم مشکلِ کد یا سرور بود یا
 * نه، بلکه آیا فلان اتفاق افتاد یا نه — و انتظار داشتیم چه ببینیم.»
 *
 * و نگاه کردیم به سناریویی که همین ابزار ساخته بود (`scenarios/nepi/ورود.yml`):
 * چهل‌وهفت خط `go` و `fill` و `click`، و **صفر `expect`**. هیچ‌جا نمی‌گفت
 * «بعد از ورود باید کتابخانه دیده شود».
 *
 * این تصادفی نبود؛ `author.js` صریح می‌گوید «هیچ assertی — کاوشگر نمی‌داند
 * چه چیزی *باید* می‌شد». آن تصمیم درست بود (وگرنه باگِ امروز به‌عنوان
 * «انتظارِ درست» رسمی می‌شد) ولی قدمِ بعدش هرگز ساخته نشد: راهی که آدم،
 * ارزان، آن انتظارها را اضافه کند.
 *
 * ── چرا مدل «انتظار» نمی‌سازد، فقط **انتخاب** می‌کند ──
 *
 * همان درسی که `snapshot.js` نوشته است: نسخهٔ اولِ آن از مدل می‌خواست خودش
 * `{role, name}` بسازد و مدل `role: "input"` برگرداند — که نقشِ ARIA نیست و
 * هیچ locatorی پیدایش نمی‌کند.
 *
 * اینجا خطر بزرگ‌تر است: انتظاری که به عنصری اشاره کند که وجود ندارد،
 * **برای همیشه قرمز** می‌ماند. کاربر دو بار نگاه می‌کند، دو بار چیزی پیدا
 * نمی‌کند، و بار سوم کلِ فهرست را می‌بندد.
 *
 * پس نامزدها از چیزهایی ساخته می‌شوند که **واقعاً دیده شده‌اند**:
 *
 *   `page.contract.must`  عناصری که در چند بازدیدِ گشت پایدار مانده‌اند
 *   `map.states[].actions` برچسبِ کنش‌هایی که خزش واقعاً کلیکشان کرده
 *
 * مدل فقط شمارهٔ نامزد و جایش را می‌گوید. ساختنِ خودِ شرط کارِ ماست.
 */
import fs from 'node:fs';
import path from 'node:path';
import { rootDir } from '../target.js';
import { listPages } from '../knowledge/store.js';
import { readMap } from '../map/store.js';
import { describeTarget } from '../checks/contract.js';
import { askJson, Budget } from '../models/provider.js';
import { redactDeep } from '../models/redact.js';
import { accountSecrets } from '../knowledge/credentials.js';

/** سقفِ نامزدها. فهرستِ بلندتر هم prompt را باد می‌کند هم انتخاب را سخت. */
const MAX_CANDIDATES = 60;

/**
 * نامزدهای انتظار — رایگان، بی هیچ فراخوانی.
 *
 * ── چرا همین فهرست بی مدل هم ارزش دارد ──
 *
 * آدمی که می‌داند چه می‌خواهد، لازم نیست منتظرِ پیشنهادِ مدل بماند: همین
 * فهرست را می‌بیند و تیک می‌زند. مدل فقط میان‌بُر است، نه دروازه.
 *
 * @param {string} target
 * @returns {{ref: string, route: string, view: string, label: string, target: object, by: string}[]}
 */
export function candidatesFor(target) {
  const out = [];
  const seen = new Set();

  const push = (row) => {
    const key = `${row.route}|${JSON.stringify(row.target)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...row, ref: `e${out.length + 1}` });
  };

  /**
   * قراردادِ صفحه‌ها — بهترین منبع.
   *
   * این‌ها از یک بازدید نیامده‌اند: `reinforce` هر بازدید تقاطع می‌گیرد، پس
   * آنچه مانده واقعاً بخشِ ثابتِ اپ است نه دادهٔ کاربر. یعنی انتظاری که از
   * این‌ها ساخته شود، فردا با دادهٔ دیگری نمی‌شکند.
   */
  for (const page of safely(() => listPages(target), [])) {
    for (const item of page.contract?.must || []) {
      push({
        route: page.path,
        view: '',
        label: describeTarget(item),
        target: item,
        by: 'contract',
        seenIn: page.contract.seenIn || 0,
      });
    }
  }

  /**
   * و نماهای نقشه — چیزی که گشت ندیده ولی خزش پیدا کرده.
   *
   * مودال و کشو و منویی که آدرس ندارند، دقیقاً همان‌هایی‌اند که هیچ سناریویی
   * سراغشان نمی‌رود؛ نبودنشان در این فهرست یعنی انتظارها فقط برای صفحه‌های
   * آدرس‌دار نوشته شوند.
   */
  for (const state of safely(() => readMap(target).states, []) || []) {
    for (const action of state.actions || []) {
      if (!action.label || action.kind === 'noise') continue;
      /**
       * برچسبِ ماسک‌شده، انتظارِ ناممکن است.
       *
       * نقشه نامِ متغیر را ماسک می‌کند تا هویتِ حالت با هر اجرا عوض نشود؛
       * روی نپی یک گره نامش شد «U {{identity.email}} کاربر سامانه». آن متن
       * هرگز روی صفحه دیده نمی‌شود، پس انتظاری که رویش بنشیند **برای همیشه
       * قرمز** است — بدترین چیزی که می‌شود به یک سناریو اضافه کرد.
       */
      if (action.label.includes('{{')) continue;
      push({
        route: state.route,
        view: state.view || '',
        label: action.label.slice(0, 60),
        target: { role: action.role || 'button', name: action.label, exact: true, visible: true },
        by: 'map',
        seenIn: action.seenIn || 1,
      });
    }
  }

  return out.slice(0, MAX_CANDIDATES);
}

function safely(fn, fallback) {
  try {
    return fn() ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * قدم‌ها **واقعاً** کجا رسیدند — از اجراهای گذشته.
 *
 * ── چرا این مهم‌ترین تکهٔ شواهد است ──
 *
 * نخستین آزمایشِ واقعی روی `ورود.yml` دو انتظار پیشنهاد داد و هر دو دربارهٔ
 * **خودِ صفحهٔ ورود** بودند: «دکمهٔ نپی دیده شود»، «فراموشی رمز دیده شود».
 * یعنی سناریوی ورود، انتظارش این بود که هنوز پشتِ درِ ورود ایستاده باشیم.
 *
 * دلیلش ساده بود: مدل نمی‌دانست این سناریو به کجا می‌رسد. قدم‌هایش `when`
 * است و مقصدِ یک کلیک از متنِ YAML معلوم نیست.
 *
 * ولی ما می‌دانیم — چون یک بار اجرایش کرده‌ایم. `events.ndjson` برای هر قدم
 * `route` را ثبت کرده. این حدس نیست، مشاهده است.
 *
 * @returns {string[]} روت‌هایی که این سناریو در آخرین اجرایش دید، به ترتیب
 */
export function routesSeen(scenarioName) {
  const name = String(scenarioName || '').trim();
  if (!name) return [];

  const runs = path.join(rootDir(), 'runs');
  let ids = [];
  try {
    ids = fs.readdirSync(runs).filter((one) => !one.startsWith('.')).sort().reverse();
  } catch {
    return [];
  }

  // فقط چند اجرای آخر: قدیمی‌ترها مسیرِ اپِ دیروز را می‌گویند
  for (const id of ids.slice(0, 20)) {
    let rows = [];
    try {
      rows = fs
        .readFileSync(path.join(runs, id, 'events.ndjson'), 'utf8')
        .split(NEWLINE)
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        });
    } catch {
      continue;
    }

    const mine = rows.filter(
      (row) => row?.kind === 'step' && row.route && String(row.scenario || '').startsWith(name)
    );
    if (mine.length) return [...new Set(mine.map((row) => row.route))];
  }
  return [];
}

const NEWLINE = String.fromCharCode(10);

/**
 * چند بندِ سنجش دارد؟
 *
 * ── چرا بازگشتی، و چرا این عدد مهم است ──
 *
 * سناریوی بی‌انتظار اجرا می‌شود، سبز تمام می‌شود، و **هیچ‌چیز را نسنجیده**:
 * فقط می‌گوید «چیزی نشکست». صفحهٔ مأموریت‌ها همین عدد را نشان می‌دهد، پس
 * شمارشِ کم یعنی سناریویی که واقعاً انتظار دارد، «بی‌انتظار» علامت بخورد —
 * و آدم برود انتظاری اضافه کند که از قبل هست.
 *
 * و بازگشتی، چون سناریوی ورودی که همین ابزار ساخت **همهٔ** کارش زیرِ `when`
 * بود: شمارشِ سطحی روی آن صفر می‌داد حتی بعد از افزودنِ انتظار.
 */
export function countExpects(steps) {
  let total = 0;
  for (const step of Array.isArray(steps) ? steps : []) {
    if (!step || typeof step !== 'object') continue;
    if (step.expect !== undefined || step.assert !== undefined) total++;

    // `then`/`else` هم در سطحِ قدم می‌آیند و هم داخلِ بدنهٔ `when`
    for (const key of ['then', 'else']) {
      if (Array.isArray(step[key])) total += countExpects(step[key]);
      if (Array.isArray(step.when?.[key])) total += countExpects(step.when[key]);
    }
    if (Array.isArray(step.forEach?.steps)) total += countExpects(step.forEach.steps);
  }
  return total;
}

export const SYSTEM = `تو یک مهندسِ آزمون هستی که به یک سناریوی موجود **انتظار** اضافه می‌کند.

سناریو امروز فقط کار می‌کند و هیچ‌جا نمی‌گوید «حالا باید چه دیده شود». تو می‌گویی.

خروجی فقط JSON، بی توضیح و بی حصار markdown:
{"expectations":[{"after":<شمارهٔ قدم>,"ref":"e12","kind":"visible|hidden","why":"...","confidence":"high|medium|low"}]}

معنی هر کلید:
- after: بعد از کدام قدم سنجیده شود. شمارهٔ قدم‌ها از ۱ است؛ برای «در پایان» شمارهٔ آخرین قدم را بده.
- ref: شناسهٔ یکی از نامزدهای فهرستِ زیر. **فقط از همان فهرست.**
- kind: "visible" یعنی باید دیده شود، "hidden" یعنی باید رفته باشد.
- why: در یک جملهٔ کوتاهِ فارسی بگو چرا این نشانهٔ درست کار کردن است. همین جمله در گزارشِ شکست به کاربر نشان داده می‌شود.
- confidence: اگر مطمئن نیستی این عنصر بعد از آن قدم واقعاً باید باشد، "low".

قواعد:
- **هیچ عنصری اختراع نکن.** فقط \`ref\`های فهرستِ زیر.
- **ارزشمندترین انتظار، نتیجهٔ کار است.** اگر سناریو ورود است، مهم این است که بعدش چه چیزی دیده می‌شود که پیش از ورود نبود — نه اینکه فرمِ ورود هنوز سرِ جایش است. دست‌کم یک انتظار باید بعد از **آخرین** قدم باشد.
- انتظاری که فقط می‌گوید «صفحهٔ اول هنوز همان است»، تقریباً بی‌ارزش است.
- کم و دقیق بهتر از زیاد و مشکوک: دو تا چهار انتظار برای یک سناریو کافی است.
- انتظارِ تکراری نده؛ اگر دو نامزد یک چیز را می‌گویند، یکی را بردار.
- انتظار را جایی بگذار که **نتیجه** معلوم می‌شود، نه وسطِ پر کردنِ فرم.
- فارسی بنویس.`;

/** ورودیِ مدل: قدم‌ها با شماره، و نامزدها با شناسه. */
export function buildUser({ scenario, candidates, knowledge = '', seen = [] }) {
  const steps = (scenario.steps || []).map((step, index) => {
    const verb = Object.keys(step).find((key) => !['value', 'detail', 'finding', 'timeout', 'as'].includes(key));
    const body = step[verb];
    const short = typeof body === 'object' ? JSON.stringify(body).slice(0, 90) : String(body).slice(0, 90);
    return `${index + 1}. ${verb} ${short}`;
  });

  const rows = candidates.map(
    (one) => `${one.ref}  ${one.route}${one.view ? ` ▸ ${one.view}` : ''}  ${one.label}`
  );

  const lines = [`سناریو: ${scenario.name || '(بی‌نام)'}`, '', 'قدم‌ها:', ...steps];

  /**
   * کجا واقعاً رسید — مشاهده، نه حدس.
   *
   * بی این، مدل برای سناریوی ورود انتظار می‌دهد که «فرمِ ورود هنوز دیده
   * شود»؛ چون از متنِ YAML معلوم نیست کلیکِ داخلِ `when` به کجا می‌برد.
   */
  if (seen.length) {
    lines.push(
      '',
      `این سناریو در آخرین اجرایش این مسیرها را دید: ${seen.join(' ← ')}`,
      `پس انتظارِ پایانی باید دربارهٔ «${seen.at(-1)}» باشد، نه جایی که از آن شروع کرد.`
    );
  }
  if (knowledge) lines.push('', `آنچه از این اپ می‌دانیم:`, knowledge);
  lines.push('', `نامزدهای انتظار (${candidates.length}):`, ...rows);
  return lines.join('\n');
}

/**
 * سنجشِ پاسخ — و انداختنِ هرچه مدل اختراع کرده.
 *
 * ── چرا این سخت‌گیری، حتی بیشتر از جاهای دیگر ──
 *
 * انتظارِ غلط بدتر از نبودِ انتظار است: سناریو برای همیشه قرمز می‌ماند و
 * آدم یاد می‌گیرد قرمزها را نادیده بگیرد. آن لحظه کلِ این ابزار بی‌اثر شده.
 *
 * حذف **بی‌صدا** نیست: هرچه افتاد در `dropped` می‌آید.
 */
export function assertProposals(json, { candidates = [], steps = 0 } = {}) {
  if (!json || typeof json !== 'object') throw new Error('پاسخ مدل شیء نبود');

  const byRef = new Map(candidates.map((one) => [one.ref, one]));
  const dropped = [];
  const seen = new Set();
  const out = [];

  for (const raw of Array.isArray(json.expectations) ? json.expectations : []) {
    const candidate = byRef.get(String(raw?.ref ?? '').trim());
    if (!candidate) {
      dropped.push(`نامزدِ «${raw?.ref ?? '—'}» در فهرست نبود`);
      continue;
    }

    const kind = raw?.kind === 'hidden' ? 'hidden' : 'visible';
    const key = `${candidate.ref}|${kind}`;
    if (seen.has(key)) {
      dropped.push(`انتظارِ تکراری روی «${candidate.label}»`);
      continue;
    }
    seen.add(key);

    /**
     * جای نامعتبر → پایانِ سناریو، نه حذف.
     *
     * «کجا سنجیده شود» جزئیاتی است که آدم در یک نگاه اصلاحش می‌کند؛ ولی
     * انداختنِ کلِ انتظار یعنی آن حرفِ درست هم از دست برود.
     */
    const after = Number(raw?.after);
    const at = Number.isInteger(after) && after >= 1 && after <= steps ? after : steps;
    if (at !== after) dropped.push(`جایِ «${candidate.label}» نامعتبر بود؛ به پایان رفت`);

    out.push({
      after: at,
      ref: candidate.ref,
      kind,
      label: candidate.label,
      route: candidate.route,
      target: candidate.target,
      why: String(raw?.why ?? '').slice(0, 200),
      confidence: ['high', 'medium', 'low'].includes(raw?.confidence) ? raw.confidence : 'low',
      by: 'model',
    });
  }

  return { expectations: out.sort((a, b) => a.after - b.after), dropped };
}

/**
 * انتظارها → قدم‌های سناریو.
 *
 * ── چرا `assert` و نه `expect` ──
 *
 * `expect` سخت می‌شکند و اجرا را همان‌جا تمام می‌کند؛ `assert` یافته ثبت
 * می‌کند و ادامه می‌دهد. چیزی که **مدل** پیشنهاد داده هنوز حرفِ آدم نیست، و
 * حرفِ نیازموده نباید بتواند بقیهٔ سناریو را از اجرا بیندازد.
 *
 * وقتی آدم تأیید کرد (`hard: true`)، همان بند `expect` می‌شود — و از آن به
 * بعد یک قاعده است.
 *
 * @param {object} scenario سناریوی خوانده‌شده
 * @param {object[]} chosen انتظارهایی که آدم تیک زده
 */
export function applyExpectations(scenario, chosen = []) {
  const steps = [...(scenario.steps || [])];

  /**
   * از آخر به اول درج می‌شود.
   *
   * وگرنه هر درج، شمارهٔ بندهای بعدی را یکی جلو می‌برد و انتظارِ دوم یک قدم
   * دیرتر از جایی می‌نشیند که آدم انتخاب کرده — خطایی که در بازبینی دیده
   * نمی‌شود چون سناریو هنوز معتبر است.
   */
  for (const item of [...chosen].sort((a, b) => b.after - a.after)) {
    const condition = { [item.kind === 'hidden' ? 'hidden' : 'visible']: item.target };
    const step = item.hard ? { expect: condition } : { assert: condition };
    if (!item.hard) step.finding = item.why || `انتظار نخورد: ${item.label}`;
    steps.splice(Math.min(item.after, steps.length), 0, step);
  }

  return { ...scenario, steps };
}

/**
 * جمله‌ای که در فهرست دیده می‌شود.
 *
 * نه JSON: آدم باید در یک نگاه بفهمد دارد چه چیزی را تأیید می‌کند.
 */
export function describeExpectation(item) {
  const where = item.after ? `بعد از قدم ${item.after}` : 'در پایان';
  const what = item.kind === 'hidden' ? 'نباید دیده شود' : 'باید دیده شود';
  return `${where}: ${item.label} ${what}`;
}

/**
 * جمله → پیشنهادِ انتظار. یک فراخوانی.
 *
 * رازها پیش از ارسال پاک می‌شوند: نامِ عناصر از خودِ اپ می‌آید و می‌تواند
 * ایمیلِ حسابِ ذخیره‌شده باشد — روی نپی یک گرهٔ نقشه نامش شد «منوی ub-…».
 */
export async function proposeExpectations({ scenario, target = '', models, knowledge = '' }) {
  const candidates = candidatesFor(target);
  if (!candidates.length) {
    throw new Error(
      'هیچ نامزدی نیست: این پروژه نه گشتِ ثبت‌شده دارد نه نقشه.\n' +
        '  یک گشت برو یا نقشه بکش تا معلوم شود چه عناصری واقعاً وجود دارند.'
    );
  }

  const secrets = accountSecrets(target);
  const budget = new Budget(models.budgetPerRun);
  const { json } = await askJson(
    models,
    {
      system: SYSTEM,
      user: redactDeep(buildUser({ scenario, candidates, knowledge, seen: routesSeen(scenario.name) }), secrets),
    },
    budget
  );

  const result = assertProposals(json, { candidates, steps: (scenario.steps || []).length });
  return { ...result, candidates, model: models.model, at: new Date().toISOString() };
}
