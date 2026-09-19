/**
 * «این کشف چه چیزی برای اجرا ساخت؟» — تنها سوالی که می‌گوید کشف تمام شد.
 *
 * ── چرا این ملاک و نه شمارِ صفحه ──
 *
 * کاربر گفت: «هر کشف باید حداقل یک سناریو به ما بدهد؛ این ملاکِ این است
 * که آیا کشف را درست انجام داده‌ایم یا نه».
 *
 * و حق داشت، چون ملاکِ فعلی دروغ می‌گفت: یک خزش که ۲۸ حالت پیدا کند و
 * ۹۴ کنش بشمارد، در فهرست «تمام‌شده» است و عددهای بزرگی نشان می‌دهد —
 * ولی هیچ چیزی به‌جا نگذاشته که بشود فردا اجرایش کرد. نقشه دانش است،
 * سناریو کار است. کشفی که فقط دانش بدهد، نیمهٔ کار را کرده و رابط
 * می‌گفت تمام شد.
 *
 * ── چرا هیچ‌چیزِ تازه‌ای ذخیره نمی‌شود ──
 *
 * وسوسه این بود که هر سناریو در خودش بنویسد از کدام کشف آمده. ولی آن
 * یعنی منبعِ دوم حقیقت: فیلدی که با ویرایشِ دستیِ فایل از بین می‌رود، و
 * سناریویی که آدم خودش نوشته هرگز ندارد.
 *
 * هر دو تکه از قبل روی دیسک‌اند:
 *
 *   کشف کجا رفت      `events.ndjson` همان اجرا
 *   سناریو کجا را می‌زند   `routesTouchedBy` — همان تابعی که درخت استفاده می‌کند
 *   کِی ساخته شد        زمانِ خودِ فایل
 *
 * پس مشتق است، مثلِ کلِ این درخت.
 */
import fs from 'node:fs';
import path from 'node:path';
import { knowledgeDir } from './store.js';
import { normalizeCapabilityRoute } from './capabilities.js';
import { routesTouchedBy } from './propose.js';
import { loadScenario, scenarioDir } from '../scenario/load.js';

/**
 * مسیرهایی که یک جلسهٔ کشف واقعاً لمس کرد.
 *
 * ── چرا از خودِ اجرا و نه از شاخصِ لمس ──
 *
 * `touch.json` جمعِ همهٔ اجراهاست و نمی‌داند کدام مسیر مالِ کدام اجرا بود.
 * افزودنِ این تفکیک به شاخص یعنی بزرگ‌تر کردنِ فایلی که هر صفحه می‌خواندش،
 * برای سوالی که فقط داخلِ **یک** جلسه پرسیده می‌شود.
 *
 * خواندنِ `events.ndjson`ِ همان یک اجرا ارزان است و همیشه درست.
 */
export function routesOfSession(runDir) {
  const found = new Set();
  const each = (file, fn) => {
    try {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          fn(JSON.parse(line));
        } catch {
          // خطِ نیمه‌نوشته وسطِ اجرا
        }
      }
    } catch {
      // اجرایی که این فایل را ندارد
    }
  };

  each(path.join(runDir, 'events.ndjson'), (event) => {
    if (event.kind !== 'step') return;
    const route = normalizeCapabilityRoute(event.route);
    if (route) found.add(route);
  });

  return found;
}

/** خواندنِ سورس اجرا نیست؛ مسیرهایش را خودِ اسکن نوشته. */
export function routesOfSource(target) {
  const found = new Set();
  try {
    const stored = JSON.parse(fs.readFileSync(path.join(knowledgeDir(target), 'endpoints.json'), 'utf8'));
    for (const one of stored.routes || []) {
      const route = normalizeCapabilityRoute(one.path || one);
      if (route) found.add(route);
    }
  } catch {
    // هنوز اسکنی نشده
  }
  return found;
}

/**
 * سناریوی «تازه» — و چرا زمانِ فایل کافی است.
 *
 * ── مشکلی که این حل می‌کند ──
 *
 * سادهٔ کار این بود که بپرسیم «آیا مسیرهای این کشف سناریو دارند؟». ولی
 * آن‌وقت کشفِ دومِ همان صفحه همیشه سبز است — سناریویی که ماهِ پیش نوشته
 * شده جوابِ این کشف نیست. یعنی دقیقاً همان سبزِ دروغینی که این پروژه
 * چند بار خورده: عددی که راست به نظر می‌رسد و کارِ نکرده را کرده نشان
 * می‌دهد.
 *
 * ── و چرا زمانِ فایل، با علم به عیبش ──
 *
 * `git checkout` زمانِ فایل را به امروز می‌برد، پس سناریویی که قدیمی است
 * می‌تواند تازه به نظر برسد. عیبش این است که یک کشف را **تمام‌شده** نشان
 * می‌دهد در حالی که نیست — و در برابرش، تنها جایگزین ذخیرهٔ یک فیلد در
 * خودِ سناریو بود که با ویرایشِ دستی از بین می‌رود و سناریوی دست‌نوشته
 * اصلاً ندارد.
 *
 * بینِ «گاهی سخت‌گیرِ کمتر» و «منبعِ دومِ حقیقت»، اولی را برمی‌داریم.
 */
/**
 * مسیرِ یک سناریو نسبت به پوشهٔ سناریوهای همان هدف.
 *
 * جداکننده همیشه `/` است: این رشته در آدرسِ وب می‌نشیند، نه در مسیرِ
 * فایل‌سیستم — و روی ویندوز `path.relative` بک‌اسلش می‌دهد.
 */
function relativeTo(target, file) {
  return path.relative(scenarioDir(target), file).split(path.sep).join('/');
}

function madeAt(file) {
  try {
    return fs.statSync(file).mtime.toISOString();
  } catch {
    return '';
  }
}

/**
 * آیا مسیرِ یک سناریو به مسیرهای این کشف می‌خورد.
 *
 * `:id` از دو طرف جمع می‌شود، وگرنه سناریویی که `/content/42` می‌نویسد
 * هرگز به کشفی که `/content/:id` دیده نمی‌خورد.
 */
function overlaps(scenarioRoutes, sessionRoutes) {
  for (const raw of scenarioRoutes) {
    const route = normalizeCapabilityRoute(raw);
    if (route && sessionRoutes.has(route)) return true;
  }
  return false;
}

/**
 * همهٔ سناریوهای یک پروژه — **با** پیش‌نویس‌ها.
 *
 * ── چرا `loadScenarios` کافی نبود ──
 *
 * آن فقط پوشهٔ سطحِ اول را می‌خواند و `_drafts/` را نمی‌بیند. و این
 * دقیقاً محصولِ یک گشت است: گشت در پایان یک پیش‌نویس می‌نویسد، نه یک
 * سناریوی رسمی.
 *
 * نتیجه‌اش با دادهٔ واقعی دیده شد: گشتی که درست کار کرده بود و
 * پیش‌نویسش را هم نوشته بود، «سناریو نداد» گرفت. یعنی ملاکی که قرار
 * بود بگوید کشف درست انجام شده، درست‌ترین کشف را رد می‌کرد.
 *
 * `_learned/` کنار می‌رود: کشِ قدم است، نه سناریو.
 */
export function allScenarios(target) {
  const root = scenarioDir(target);
  const out = [];

  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '_learned') walk(full);
        continue;
      }
      if (!/\.ya?ml$/i.test(entry.name)) continue;
      try {
        out.push(loadScenario(full));
      } catch {
        // فایلِ خراب؛ بقیه هنوز معنا دارند
      }
    }
  };

  walk(root);
  return out;
}

/**
 * حاصلِ یک جلسهٔ کشف.
 *
 * @param {object} o
 * @param {object} o.session ردیفِ `discoverySessions`
 * @param {string} o.runDir پوشهٔ همان اجرا (برای `source` بی‌معنا و نادیده)
 * @param {string} o.target
 * @param {object[]} [o.scenarios] پیش‌فرض: همهٔ سناریوهای پروژه، با پیش‌نویس‌ها
 * @param {object} [o.counts] خروجی `countsByRoute`، برای «نیازموده»
 */
export function yieldOf({ session, runDir, target, scenarios, counts = {} }) {
  const all = scenarios || allScenarios(target);
  const routes =
    session.kind === 'source' ? routesOfSource(target) : routesOfSession(runDir);

  const since = session.at || '';
  const made = [];
  const older = [];

  for (const one of all) {
    if (!overlaps(routesTouchedBy(one), routes)) continue;
    const at = madeAt(one.file);
    /**
     * «بعد از شروعِ کشف» و نه «بعد از پایانش».
     *
     * در گشت، کاربر وسطِ کار سناریو ثبت می‌کند و خودِ گشت هم در پایان
     * پیش‌نویس می‌نویسد. مرزِ پایان، اولی را دور می‌ریخت.
     */
    (at && since && at >= since ? made : older).push({
      id: one.id,
      name: one.name,
      status: one.status,
      /**
       * مسیرِ نسبی — تا بشود به خودِ فایل لینک داد.
       *
       * ── چرا لازم شد ──
       *
       * پنلِ «این کشف N سناریو ساخت» نامِ هر سناریو را به
       * `files?open=<id>` لینک می‌داد، و `open` پارامتری است که آن صفحه
       * **نمی‌شناسد**. نتیجه‌اش این بود: روی نامِ سناریو می‌زدی و
       * `<target>.config.js` باز می‌شد. هیچ خطایی هم نمی‌داد.
       *
       * ویرایشگر `relative` می‌خواهد، و تنها جایی که آن را می‌داند همین
       * است — `id` نامِ فایل بی پسوند است و زیرپوشه (`_drafts/`) را
       * نمی‌گوید.
       */
      path: relativeTo(target, one.file),
      at,
    });
  }

  /**
   * «چه کاری مانده» — همان زاویه‌هایی که درخت از قبل می‌شناسد.
   *
   * کشفِ ناتمام بی این فقط یک سرزنش است. با این، یک فهرستِ کار است.
   */
  const blind = [...routes].filter((route) => {
    const row = counts[route];
    return !row?.scenarios?.length && !row?.planned?.length;
  });

  return {
    routes: [...routes].sort(),
    made: made.sort((a, b) => String(b.at).localeCompare(String(a.at))),
    older,
    blind: blind.sort(),
    /** ملاکِ کاربر، سرراست: کشفی که چیزی برای اجرا نساخته، ناتمام است. */
    complete: made.length > 0,
  };
}

/**
 * خلاصه برای فهرست — بی خواندنِ سناریوها، وقتی فقط عدد لازم است.
 *
 * ── چرا جدا ──
 *
 * `yieldOf` برای هر جلسه `events.ndjson` را می‌خواند. انجامش برای بیست
 * ردیفِ فهرست یعنی بیست فایلِ چندمگابایتی در هر بار باز شدنِ صفحه —
 * همان کُندیِ بی‌دلیلی که شاخصِ لمس برای پرهیز از آن ساخته شد.
 */
export function incompleteCount(rows = []) {
  return rows.filter((one) => one.done && one.yield && !one.yield.complete).length;
}
