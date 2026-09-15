/**
 * «مأموریت» — جمله‌ای که به نقشهٔ کار تبدیل می‌شود، پیش از آنکه پولی خرج شود.
 *
 * ── چرا این قطعه گم بود ──
 *
 * `quest` یک جمله می‌گیرد و **بلافاصله** شروع می‌کند به گشتن و فراخوانی
 * مدل. اگر بد فهمیده باشد، بیست‌وپنج قدم و چند دقیقه رفته تا معلوم شود.
 *
 * اصلاحِ یک **نقشه** رایگان است؛ اصلاحِ یک **اجرا** گران. و این همان الگویی
 * است که هر جای دیگرِ این ابزار جواب داده: نوارِ «بگو چه کار کنم» فرمان را
 * پیش از اجرا نشان می‌دهد، «بازنویسی» تفاوت را، «واردکردنِ بسته»
 * پیش‌نمایش. فقط گران‌ترین کار — خزش — این مرحله را نداشت.
 *
 * ── چرا نقشهٔ کار یک **فایل** است ــ
 *
 * نه یک prompt که در حافظه بماند. قابلِ دیدن، اصلاح، کامیت، و اجرای دوباره
 * — مثل هر چیزِ دیگری اینجا. و چون فایل است، ده‌ها مأموریتِ متفاوت می‌شود
 * داشت که همه در **یک** نقشه می‌نویسند: تفکیک بی از دست دادنِ پوشش.
 */
import fs from 'node:fs';
import path from 'node:path';
import { knowledgeDir } from '../knowledge/store.js';
import { accountSecrets } from '../knowledge/credentials.js';
import { askJson, Budget } from '../models/provider.js';
import { redactDeep } from '../models/redact.js';
import { pickState } from './quest.js';

export const MISSION_VERSION = 1;

export const SYSTEM = `تو یک مهندسِ آزمون هستی که خواستهٔ کاربر را به یک **نقشهٔ کار** برای خزندهٔ خودکار تبدیل می‌کنی.

خروجی فقط JSON، بی توضیح و بی حصار markdown:
{"goal":"...","why":"...","start":{"mode":"session|account|fresh","account":"","entry":""},"scope":["..."],"look":["..."],"notes":"..."}

معنی هر کلید:
- goal: خواستهٔ کاربر، یک جمله، به زبانِ خودش.
- why: در یک جمله بگو چرا این مسیر را انتخاب کردی.
- start.mode: چطور وارد شود —
    session = نشستِ ذخیره‌شدهٔ گشت (اگر هست و کافی است)
    account = با حسابِ ذخیره‌شده؛ آن‌وقت "account" را از فهرستِ زیر بردار
    fresh   = کاربرِ تازه بسازد (فقط وقتی خواسته دربارهٔ ثبت‌نام است)
- start.entry: نامِ فایلِ سناریوی ورود، فقط از فهرستِ زیر. اگر mode=session بود، خالی.
- scope: **کجا را بگردد** — روت (با / شروع می‌شود) یا نامِ نما. فقط از فهرست‌های زیر بردار؛ چیزی اختراع نکن.
- look: دو تا شش کارِ مشخص که آنجا باید امتحان شوند، به فارسی.
- notes: اگر چیزی از خواسته مبهم بود یا حدس زدی، همین‌جا بگو. اگر نبود، رشتهٔ خالی.

قواعد:
- **چیزی اختراع نکن.** روت و نما و حساب و سناریو فقط از فهرست‌های داده‌شده.
- اگر خواسته به هیچ روت و نمایی نمی‌خورد، scope را خالی بگذار و در notes بگو چرا.
- دامنه را تنگ بگیر: هدفِ این کار صرفه‌جویی در بودجه است.`;

/**
 * ورودیِ مدل: هرچه می‌دانیم، بی یک کلمهٔ اضافه.
 *
 * `knowledge` همان خروجیِ `knowledgeFor` است و خودش با توضیحِ صاحبِ پروژه
 * شروع می‌شود. جای جداگانه‌ای برای آن متن گذاشته نشد چون همان جمله‌ها دو بار
 * می‌رفتند — و بودجهٔ prompt جای تکرار ندارد.
 */
export function buildUser({ text, knowledge = '', routes = [], views = [], accounts = [], scenarios = [], hasSession = false }) {
  const lines = [`خواستهٔ کاربر:\n${String(text).trim()}`];

  if (knowledge) lines.push('', `آنچه از این اپ می‌دانیم:\n${knowledge}`);

  lines.push('', `روت‌های شناخته‌شده (${routes.length}):`, routes.slice(0, 60).join('  '));
  if (views.length) lines.push('', `نماهای شناخته‌شده (${views.length}):`, views.slice(0, 60).join(' · '));

  lines.push(
    '',
    `نشستِ ذخیره‌شدهٔ گشت: ${hasSession ? 'هست' : 'نیست'}`,
    `حساب‌های ذخیره‌شده: ${accounts.length ? accounts.join('، ') : '(هیچ)'}`,
    `سناریوهای ورود: ${scenarios.length ? scenarios.join('، ') : '(هیچ)'}`
  );

  return lines.join('\n');
}

/**
 * سنجشِ شکل — و **پاک کردنِ چیزهایی که مدل اختراع کرده**.
 *
 * ── چرا این سخت‌گیری ──
 *
 * دامنه‌ای که به هیچ حالتی نمی‌خورد، خزش را به جایی می‌برد که هیچ کنشی
 * امتحان نمی‌شود — و گزارشش «صف تمام شد» است، یعنی شبیهِ موفقیت. همان
 * درسی که در `classify.js` و `explain.js` هم گرفتیم: نامی که ندادیم، از
 * جوابِ مدل بیرون می‌رود.
 *
 * ولی حذف **بی‌صدا** نیست: هرچه افتاد در `dropped` می‌آید تا رابط بگوید.
 */
export function assertMission(json, { routes = [], views = [], accounts = [], scenarios = [], hasSession = false } = {}) {
  if (!json || typeof json !== 'object') throw new Error('پاسخ مدل شیء نبود');

  const goal = String(json.goal ?? '').trim();
  if (!goal) throw new Error('نقشهٔ کار «goal» ندارد');

  const dropped = [];
  const known = new Set([...routes, ...views]);
  // یکتا، چون رابط همین‌ها را کلید می‌کند و دو تای هم‌نام صفحه را می‌شکند
  const scope = [
    ...new Set(
      (Array.isArray(json.scope) ? json.scope : []).map((one) => String(one ?? '').trim()).filter(Boolean)
    ),
  ]
    .filter((one) => {
      if (known.has(one)) return true;
      dropped.push(`دامنهٔ «${one}» در نقشه و سورس نبود`);
      return false;
    });

  let mode = ['session', 'account', 'fresh'].includes(json?.start?.mode) ? json.start.mode : 'fresh';
  if (mode === 'session' && !hasSession) {
    dropped.push('نشستِ ذخیره‌شده‌ای نبود؛ به حساب/کاربرِ تازه برگشت');
    mode = accounts.length ? 'account' : 'fresh';
  }

  let account = String(json?.start?.account ?? '').trim();
  if (account && !accounts.includes(account)) {
    dropped.push(`حسابِ «${account}» وجود ندارد`);
    account = '';
  }
  if (mode === 'account' && !account) account = accounts[0] || '';

  let entry = String(json?.start?.entry ?? '').trim();
  if (entry && !scenarios.includes(entry)) {
    dropped.push(`سناریوی «${entry}» وجود ندارد`);
    entry = '';
  }
  if (mode === 'session') entry = '';

  return {
    version: MISSION_VERSION,
    goal: goal.slice(0, 200),
    why: String(json.why ?? '').slice(0, 300),
    start: { mode, account, entry },
    scope,
    look: [
      ...new Set(
        (Array.isArray(json.look) ? json.look : []).map((one) => String(one ?? '').trim()).filter(Boolean)
      ),
    ].slice(0, 8),
    notes: String(json.notes ?? '').slice(0, 500),
    dropped,
  };
}

/**
 * جمله → نقشهٔ کار. **یک** فراخوانی مدل، و نه یکی بیشتر.
 *
 * ── چرا قاعده پیش از مدل، مثل هر جای دیگر ──
 *
 * `pickState` از قبل بلد است بگوید کدام حالتِ نقشه به این جمله می‌خورد، و
 * رایگان است. جوابش هم به مدل داده می‌شود (تا حدسِ بی‌پایه نزند) و هم
 * جانشینِ `scope` می‌شود اگر مدل چیزی نگفت — که آن‌وقت `by: 'rule'` می‌شود.
 *
 * ── چرا رازها پیش از ارسال پاک می‌شوند ──
 *
 * جملهٔ کاربر و توضیحِ پروژه هر دو دست‌نویس‌اند و آدم در متنِ دست‌نویس ایمیل
 * و رمز می‌نویسد. همان لولهٔ `explainFinding`.
 */
export async function proposeMission({
  text,
  target = '',
  models,
  map = null,
  knowledge = '',
  routes = [],
  views = [],
  accounts = [],
  scenarios = [],
  hasSession = false,
}) {
  const sentence = String(text ?? '').trim();
  if (sentence.length < 5) throw new Error('یک جمله بنویسید؛ دست‌کم چند کلمه');

  const secrets = accountSecrets(target);

  /* ── قاعده اول: نقشه خودش می‌داند کجا شبیهِ این جمله است ── */
  const guess = map ? pickState(map, sentence) : null;
  const hint = guess
    ? `\nنزدیک‌ترین حالتِ نقشه به این جمله: ${guess.state.route}${guess.state.view ? ` ▸ ${guess.state.view}` : ''}` +
      ` (چون: ${guess.hits.join('، ')})`
    : '';

  const user =
    redactDeep(
      buildUser({ text: sentence, knowledge, routes, views, accounts, scenarios, hasSession }),
      secrets
    ) + hint;

  const budget = new Budget(models.budgetPerRun);
  const { json } = await askJson(models, { system: SYSTEM, user }, budget);

  const mission = assertMission(json, { routes, views, accounts, scenarios, hasSession });

  /**
   * دامنهٔ خالی یعنی «همه‌جا» — و همه‌جا دقیقاً همان چیزی است که این گام
   * برای جلوگیری از آن ساخته شد. اگر نقشه جوابی داشت، همان می‌نشیند.
   */
  let by = 'model';
  if (!mission.scope.length && guess) {
    mission.scope = [guess.state.view || guess.state.route];
    mission.dropped.push('مدل دامنه‌ای نگفت؛ نزدیک‌ترین حالتِ نقشه گذاشته شد');
    by = 'rule';
  }

  return { ...mission, text: sentence, target, by, model: models.model, at: new Date().toISOString() };
}

/**
 * نقشهٔ کار → گزینه‌های خزش.
 *
 * ترجمهٔ یک‌طرفه و بی‌حدس: هرچه در نقشهٔ کار هست همین‌جا به زبانِ
 * `MapSession` می‌رود. اگر این تابع نبود، رابط و خط فرمان هر کدام
 * ترجمهٔ خودشان را می‌داشتند و دیر یا زود واگرا می‌شدند.
 */
export function missionToJob(mission, { target = '', states = 40, minutes = 12 } = {}) {
  const { mode, account, entry } = mission.start || {};
  return {
    kind: 'map',
    target,
    from: mode === 'session' || !entry ? '' : `scenarios/${target}/${entry}`,
    profile: mode === 'session',
    remember: mode === 'account' ? account : '',
    scope: (mission.scope || []).join(','),
    /** «چه چیزی را امتحان کن» اولویت می‌شود؛ دامنه از قبل مرز را گذاشته */
    focus: (mission.look || []).join(' '),
    states,
    minutes,
  };
}

/* ── انبار ── */

export function missionsDir(target) {
  return path.join(knowledgeDir(target), 'missions');
}

export function missionSlug(goal) {
  const base = String(goal)
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'ماموریت';
}

export function saveMission(target, mission) {
  const dir = missionsDir(target);
  fs.mkdirSync(dir, { recursive: true });
  const slug = mission.slug || missionSlug(mission.goal);
  const file = path.join(dir, `${slug}.json`);
  const payload = { ...mission, slug, at: mission.at || new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return payload;
}

export function listMissions(target) {
  const dir = missionsDir(target);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

export function removeMission(target, slug) {
  const file = path.join(missionsDir(target), `${String(slug).replace(/[^\p{L}\p{N}_-]/gu, '')}.json`);
  fs.rmSync(file, { force: true });
}
