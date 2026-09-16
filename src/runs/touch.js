/**
 * «کدام قابلیت را چند بار و با کدام سناریو لمس کرده‌ایم؟»
 *
 * ── چرا این شاخص لازم شد ──
 *
 * درختِ قابلیت‌ها بی عدد فقط یک فهرست است. عددی که کاربر خواست سه‌تاست:
 * چند سناریو، چند اجرا، چند یافته. دوتای اول هیچ‌جا ذخیره نشده بودند —
 * ولی داده‌شان از قبل هست و کسی نخوانده بودش: هر رخدادِ `step` در
 * `events.ndjson` هم `route` دارد هم `scenario`.
 *
 * این دقیقاً همان پیوندِ درستی است که می‌خواستیم، و اتفاقی نیست: «کدام
 * سناریو این قابلیت را می‌آزماید» یک **فکت** است نه یک ادعا. سناریو
 * می‌تواند در سرش بنویسد `go: /login` و بعد با کلیک به ده جای دیگر برود؛
 * آنچه واقعاً لمس شده را فقط اجرا می‌داند.
 *
 * ── چرا شاخص، و نه خواندنِ زنده ──
 *
 * نود‌و‌سه اجرا امروز است. فردا هزار. خواندنِ `events.ndjson`ِ همه، در هر
 * بار باز کردنِ یک صفحه، همان کُندیِ خزنده‌ای است که رابط را بی‌فایده
 * می‌کند.
 *
 * پس افزایشی است: هر اجرا یک بار خوانده می‌شود و شناسه‌اش ثبت می‌گردد.
 * اجرایی که از قبل در فهرست است، دوباره باز نمی‌شود.
 */
import fs from 'node:fs';
import path from 'node:path';
import { knowledgeDir } from '../knowledge/store.js';
import { normalizeCapabilityRoute } from '../knowledge/capabilities.js';

export const TOUCH_VERSION = 1;

function touchFile(target) {
  return path.join(knowledgeDir(target), 'touch.json');
}

function empty(target) {
  return { version: TOUCH_VERSION, target, updatedAt: '', seen: [], routes: {} };
}

export function readTouch(target) {
  try {
    const raw = JSON.parse(fs.readFileSync(touchFile(target), 'utf8'));
    /**
     * نسخهٔ قدیمی دور ریخته می‌شود، نه مهاجرت.
     *
     * شاخص کاملاً از اجراها بازسازی‌شدنی است، پس نوشتنِ کدِ مهاجرت برای
     * چیزی که رایگان دوباره ساخته می‌شود، فقط کدی است که باید نگهش داشت.
     */
    if (raw?.version !== TOUCH_VERSION) return empty(target);
    return { ...empty(target), ...raw };
  } catch {
    return empty(target);
  }
}

/**
 * یک اجرا → مسیرهایی که لمس کرد، و با کدام سناریو.
 *
 * `findings.ndjson` هم خوانده می‌شود چون یافته‌ای می‌تواند روی مسیری بیفتد
 * که هیچ `step`ی رویش ثبت نشده (مثلاً خطایی که بینِ دو قدم آمد). شمارشی که
 * آن را نبیند، دقیقاً همان قابلیتی را کم‌خطرتر نشان می‌دهد که خطر دارد.
 */
function scanRun(dir) {
  const routes = new Map();

  const add = (route, scenario) => {
    const key = normalizeCapabilityRoute(route);
    if (!key) return;
    const entry = routes.get(key) || { scenarios: new Set() };
    if (scenario) entry.scenarios.add(scenario);
    routes.set(key, entry);
  };

  const each = (file, fn) => {
    try {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          fn(JSON.parse(line));
        } catch {
          // خطِ نیمه‌نوشته وسطِ اجرا؛ بقیهٔ فایل هنوز معنا دارد
        }
      }
    } catch {
      // اجرایی که این فایل را ندارد (گشت، خزشِ نیمه‌کاره)
    }
  };

  each(path.join(dir, 'events.ndjson'), (event) => {
    if (event.kind !== 'step') return;
    add(event.route, event.scenario || '');
  });

  each(path.join(dir, 'findings.ndjson'), (finding) => {
    if (finding.synthetic) return;
    add(finding.route, finding.scenario || '');
  });

  return routes;
}

/**
 * شاخص را تا امروز جلو می‌آورد.
 *
 * @param {string} target
 * @param {string} runsRoot پوشهٔ `runs/` — از بیرون می‌آید، چون این ماژول
 *   نباید ریشهٔ پروژه را حدس بزند (همان قرارداد `endpoints.callsFor`).
 */
export function refreshTouch(target, runsRoot) {
  const index = readTouch(target);
  if (!fs.existsSync(runsRoot)) return index;

  const seen = new Set(index.seen);
  let added = 0;

  for (const entry of fs.readdirSync(runsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || seen.has(entry.name)) continue;
    const dir = path.join(runsRoot, entry.name);

    let meta = null;
    try {
      meta = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'));
    } catch {
      /**
       * اجرایی که هنوز در جریان است `run.json` ندارد.
       *
       * علامتش نمی‌زنیم، وگرنه وقتی تمام شد هرگز خوانده نمی‌شود — یک
       * اجرای گم‌شده به ازای هر بار که کسی وسطِ اجرا صفحه را باز کند.
       */
      continue;
    }
    if (meta?.target !== target) {
      /** مالِ هدفِ دیگری است: علامت می‌خورد تا دوباره باز نشود. */
      seen.add(entry.name);
      continue;
    }

    const at = meta.startedAt || '';
    for (const [route, data] of scanRun(dir)) {
      const row = index.routes[route] || { runs: 0, scenarios: {}, firstAt: at, lastAt: at };
      row.runs += 1;
      for (const scenario of data.scenarios) {
        row.scenarios[scenario] = (row.scenarios[scenario] || 0) + 1;
      }
      if (at && (!row.firstAt || at < row.firstAt)) row.firstAt = at;
      if (at && (!row.lastAt || at > row.lastAt)) row.lastAt = at;
      index.routes[route] = row;
    }

    seen.add(entry.name);
    added += 1;
  }

  index.seen = [...seen];
  index.updatedAt = new Date().toISOString();

  /**
   * فقط وقتی می‌نویسد که چیزی عوض شده باشد.
   *
   * هر باز کردنِ صفحه یک نوشتنِ دیسک، روی پروژه‌ای که هفته‌هاست اجرایی
   * نداشته، هزینهٔ بی‌دلیل است — و `updatedAt`ی می‌سازد که دروغ می‌گوید
   * «تازه شد» در حالی که هیچ‌چیز تازه نشده.
   */
  if (added) {
    const file = touchFile(target);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(index, null, 2) + '\n', 'utf8');
  }

  return index;
}

/**
 * شاخص + یافته‌ها → عددهای کنارِ هر قابلیت.
 *
 * یافته‌ها از بیرون می‌آیند (ادغامِ تریاژ کارِ لایهٔ رابط است، چون
 * وضعیتِ قضاوت آنجا زندگی می‌کند). این تابع فقط جمعشان می‌کند تا هر دو طرف
 * یک تعریف از «چند تا» داشته باشند.
 */
export function countsByRoute(index, findings = []) {
  const counts = {};

  for (const [route, row] of Object.entries(index.routes || {})) {
    counts[route] = {
      scenarios: Object.keys(row.scenarios || {}).filter(Boolean).sort(),
      runs: row.runs || 0,
      firstAt: row.firstAt || '',
      lastAt: row.lastAt || '',
      findings: 0,
      openFindings: 0,
    };
  }

  for (const finding of findings) {
    for (const raw of finding.routes || []) {
      const route = normalizeCapabilityRoute(raw);
      if (!route) continue;
      const row = (counts[route] ||= {
        scenarios: [],
        runs: 0,
        firstAt: '',
        lastAt: '',
        findings: 0,
        openFindings: 0,
      });
      row.findings += 1;
      /** «باز» یعنی هنوز قضاوت نشده — همان تعریفِ منو و صفحهٔ یافته‌ها. */
      if ((finding.triage?.status || 'open') === 'open') row.openFindings += 1;
    }
  }

  return counts;
}
