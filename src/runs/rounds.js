/**
 * «دورِ بررسی» — چند کار زیرِ یک اسم، با یک دامنه.
 *
 * ── چرا `bench` کافی نبود ──
 *
 * `bench` مفهومش درست بود و سه چیز کم داشت:
 *
 *   یک **رشتهٔ اختیاری** در فرمِ اجرا بود، نه یک چیز. اگر خالی می‌گذاشتی،
 *   آن اجرا تا ابد بی‌هویت می‌ماند — و خالی گذاشتن حالتِ پیش‌فرض بود.
 *
 *   فقط به **اجرای سناریو** می‌چسبید. دوری که هم سناریو می‌گرفت هم دوباره
 *   می‌خزید، نیمه‌اش بی‌نام ثبت می‌شد.
 *
 *   **دامنه** نداشت. «همهٔ اپ را دوباره بررسی کن» و «فقط بخشِ کتاب را»
 *   دو کارِ کاملاً متفاوت‌اند و هر دو یک شکل ثبت می‌شدند.
 *
 * ── چرا این فایل چیزی «نمی‌سازد» ──
 *
 * دور، اجرا نمی‌سازد. اجراها از قبل `bench` را در `run.json` می‌نویسند؛
 * این فایل فقط آن‌ها را **گروه می‌کند** و می‌گوید هر گروه چه داد.
 *
 * وسوسه این بود که دور یک فایلِ حالت داشته باشد که بگوید «این دور شامل
 * این جاب‌هاست». نشد، و عمدی: دو منبعِ حقیقت برای «کدام اجرا مالِ کدام
 * دور» یعنی روزی یکی‌شان عقب بماند — اجرایی که از خط فرمان با همان
 * `--bench` رفته و در فایلِ رابط نیست. نامِ روی `run.json` تنها چیزی است
 * که هر دو راه می‌نویسندش.
 *
 * دامنه و توضیح ولی جایی برای زندگی می‌خواهند، چون در `run.json` نیستند.
 * آن‌ها در `rounds.json` می‌نشینند — و نبودنشان دور را نابود نمی‌کند، فقط
 * بی‌توضیح می‌کند.
 */
import fs from 'node:fs';
import path from 'node:path';
import { knowledgeDir } from '../knowledge/store.js';
import { normalizeBench } from './bench.js';

export const ROUNDS_VERSION = 1;

function roundsFile(target) {
  return path.join(knowledgeDir(target), 'rounds.json');
}

export function readRounds(target) {
  try {
    const raw = JSON.parse(fs.readFileSync(roundsFile(target), 'utf8'));
    return raw?.version === ROUNDS_VERSION && raw.rounds ? raw.rounds : {};
  } catch {
    return {};
  }
}

/**
 * ثبتِ قصدِ یک دور — پیش از آنکه اجرایی داشته باشد.
 *
 * ── چرا «قصد» و نه «نتیجه» ──
 *
 * نتیجه از `run.json` می‌آید و همیشه درست است. آنچه ماشین نمی‌داند این
 * است که **چرا** این دور را زدید و **کجا** را می‌خواستید. آن دو فقط در
 * همان لحظه در ذهنِ آدم هست، و اگر همان‌جا ثبت نشود، هفتهٔ بعد کسی
 * نمی‌تواند بگوید «دورِ پیش از ۴.۲» یعنی چه.
 */
export function saveRound(target, name, { note = '', scope = [], at = '' } = {}) {
  const key = normalizeBench(name);
  if (!key) throw new Error('نامِ دور لازم است');

  const all = readRounds(target);
  all[key] = {
    name: key,
    note: String(note || '').slice(0, 300),
    /** شناسهٔ قابلیت‌ها — نه مسیر، چون نامِ قابلیت می‌تواند عوض شود ولی شناسه نه. */
    scope: (Array.isArray(scope) ? scope : []).map((one) => String(one).slice(0, 40)).slice(0, 500),
    at: at || all[key]?.at || new Date().toISOString(),
  };

  const file = roundsFile(target);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: ROUNDS_VERSION, target, rounds: all }, null, 2) + '\n', 'utf8');
  return all[key];
}

export function removeRound(target, name) {
  const all = readRounds(target);
  delete all[normalizeBench(name)];
  const file = roundsFile(target);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: ROUNDS_VERSION, target, rounds: all }, null, 2) + '\n', 'utf8');
  return all;
}

/**
 * اجراها → دورها، با نتیجهٔ هرکدام.
 *
 * ── چرا اجرای بی‌نام هم یک ردیف می‌شود ──
 *
 * اگر فقط دورهای نام‌دار دیده شوند، فهرست دروغ می‌گوید: کاربری که ده بار
 * سریع اجرا گرفته و اسم نگذاشته، صفحه‌ای می‌بیند که می‌گوید هیچ کاری نشده.
 * پس یک ردیفِ «بی‌نام» هست که همه‌شان را جمع می‌کند — صادق، و بی‌آنکه
 * وانمود کند دور است.
 *
 * @param {Array} runs فهرستِ اجراها (از `listRuns`)، تازه‌ترین اول
 * @param {object} saved خروجی `readRounds`
 */
export function groupRounds(runs = [], saved = {}) {
  const byName = new Map();

  for (const run of runs) {
    const name = normalizeBench(run.bench);
    const key = name || '';
    const row =
      byName.get(key) ||
      {
        name,
        /** توضیح و دامنه فقط برای دورِ نام‌دار معنا دارند. */
        note: saved[name]?.note || '',
        scope: saved[name]?.scope || [],
        runs: [],
        kinds: {},
        findings: 0,
        steps: 0,
        startedAt: '',
        finishedAt: '',
        red: 0,
        green: 0,
      };

    row.runs.push(run.runId);
    row.kinds[run.kind || 'run'] = (row.kinds[run.kind || 'run'] || 0) + 1;
    row.findings += run.findings || 0;
    row.steps += run.steps || 0;
    row.green += run.green || 0;
    row.red += run.red || 0;

    const at = run.startedAt || '';
    if (at && (!row.startedAt || at < row.startedAt)) row.startedAt = at;
    if (at && (!row.finishedAt || at > row.finishedAt)) row.finishedAt = at;

    byName.set(key, row);
  }

  /**
   * دورِ ثبت‌شده‌ای که هنوز اجرایی ندارد هم می‌آید.
   *
   * کسی که دور را ساخته و اجرا هنوز تمام نشده، نباید صفحه‌ای ببیند که
   * می‌گوید دوری در کار نیست — همان لحظه بیشترین شک را دارد که آیا دکمه
   * کار کرد یا نه.
   */
  for (const row of Object.values(saved)) {
    if (byName.has(row.name)) continue;
    byName.set(row.name, {
      name: row.name,
      note: row.note,
      scope: row.scope,
      runs: [],
      kinds: {},
      findings: 0,
      steps: 0,
      startedAt: row.at,
      finishedAt: row.at,
      red: 0,
      green: 0,
      empty: true,
    });
  }

  return [...byName.values()].sort((a, b) =>
    String(b.finishedAt || '').localeCompare(String(a.finishedAt || ''))
  );
}

/**
 * دو دور، کنارِ هم: چه تازه است، چه رفع شده، چه مانده.
 *
 * ── چرا این جای مقایسهٔ دو **اجرا** را می‌گیرد ──
 *
 * `compareRuns` از قبل بود و کمتر کسی می‌خواهدش: دو اجرای تکی معمولاً دو
 * زیرمجموعهٔ متفاوت‌اند و تفاوتشان بیشتر از تغییرِ کد، از تفاوتِ پوشش
 * می‌آید. ولی دو **دور** همان چیزی است که آدم در ذهن دارد — «پیش از
 * انتشار» در برابر «بعد از اصلاح».
 *
 * @param {Map<string,Set<string>>} prints نام دور → مجموعهٔ اثرانگشت‌ها
 */
export function diffRounds(prints, first, second) {
  const a = prints.get(first) || new Set();
  const b = prints.get(second) || new Set();

  return {
    first,
    second,
    added: [...b].filter((one) => !a.has(one)),
    gone: [...a].filter((one) => !b.has(one)),
    kept: [...b].filter((one) => a.has(one)),
  };
}

/**
 * اثرانگشتِ هر دور، از یافته‌های ادغام‌شدهٔ تریاژ.
 *
 * ── چرا از تریاژ و نه از خودِ اجراها ──
 *
 * تریاژ از قبل `benches` را روی هر یافته جمع کرده (`artifacts.js`). خواندنِ
 * دوبارهٔ همهٔ `findings.ndjson`ها فقط برای همین، یعنی دو تعریف از «این
 * یافته در کدام دور دیده شد» — و آن دو دیر یا زود از هم دور می‌شوند.
 */
export function printsByRound(findings = []) {
  const prints = new Map();
  for (const finding of findings) {
    for (const bench of finding.benches || []) {
      const set = prints.get(bench) || new Set();
      set.add(finding.fingerprint);
      prints.set(bench, set);
    }
  }
  return prints;
}
