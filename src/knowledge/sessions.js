/**
 * «چطور فهمیدیم این اپ چه دارد؟» — هر بارِ کشف، یک ردیف.
 *
 * ── چرا صندوق، و نه صفحه‌ای با سه رادیو ──
 *
 * صفحهٔ کشف یک رادیوی «چطور کشفش کنم؟» داشت که **حالت** بود نه کار. وقتی
 * گشتی در جریان بود، همان رادیو هنوز روی صفحه می‌ماند و یک کلیکِ اشتباهی
 * حالت را عوض می‌کرد — کنترلی که کارِ در جریان را خراب می‌کند، نباید کنارِ
 * همان کار باشد.
 *
 * و پایین‌ترش بیست و پنج بخشِ دیگر بود: گشت‌های پیشین، قدم‌های ضبط‌شده،
 * این پروژه چیست، واژه‌نامه، مستندات، تاریخچهٔ شناخت… سه جنسِ کاملاً
 * متفاوت که هیچ‌کدام سرِ جایشان نبودند.
 *
 * صندوق یعنی: فهرستِ آنچه تا امروز کرده‌ایم، یک دکمهٔ «تازه»، و رفتن
 * **داخلِ** یکی. همان شکلِ «بررسی» — و اپی که دو الگو داشته باشد، نصفِ
 * یاد گرفتن است.
 *
 * ── چرا این فایل چیزی نمی‌سازد ──
 *
 * گشت و خزش و کاوش هر سه از قبل در `runs/` می‌نشینند با `kind` خودشان.
 * ساختنِ یک انبارِ دوم برای «جلسه‌های کشف» یعنی دو منبعِ حقیقت — و دیر یا
 * زود یکی‌شان از قلم می‌افتد. این فایل فقط همان‌ها را می‌خواند و یک شکل
 * می‌کند.
 *
 * تنها استثنا خواندنِ سورس است که اجرا نیست و تاریخچه‌ای ندارد: یک ردیف
 * دارد که به‌روز می‌شود، و همان صادق است — چون `endpoints.json` هم فقط
 * آخرین اسکن را نگه می‌دارد.
 */
import fs from 'node:fs';
import path from 'node:path';
import { knowledgeDir } from './store.js';

/** روش‌های کشف، با برچسبِ خوانا. */
export const WAYS = {
  tour: { label: 'گشتِ زنده', hint: 'خودتان نشان دادید' },
  map: { label: 'خزش', hint: 'ابزار خودش گشت' },
  quest: { label: 'کاوشِ هدف‌دار', hint: 'گفتید کجا را' },
  source: { label: 'خواندنِ سورس', hint: 'بی مرورگر، بی مدل' },
};

/** کدام `kind`های اجرا، جلسهٔ کشف‌اند. اجرای سناریو نیست. */
export const DISCOVERY_KINDS = new Set(['tour', 'map', 'quest']);

/**
 * یک اجرا → ردیفِ صندوق.
 *
 * عددهایی که نشان داده می‌شوند به **روش** بستگی دارند و عمداً یکسان
 * نیستند: «۷ صفحه» دربارهٔ یک گشت معنا دارد و «۲۸ حالت» دربارهٔ یک خزش.
 * نشان دادنِ هر دو برای هر دو، همان ستون‌های همیشه‌خالی است که فهرست را
 * بی‌معنا می‌کند.
 */
function fromRun(run) {
  return {
    id: run.runId,
    kind: run.kind,
    way: WAYS[run.kind] || { label: run.kind, hint: '' },
    at: run.startedAt || '',
    finishedAt: run.finishedAt || '',
    status: run.status || '',
    steps: run.steps || 0,
    findings: run.findings || 0,
    bench: run.bench || '',
    /** در جریان بودن را لایهٔ بالا می‌داند؛ اینجا فقط «تمام شد یا نه». */
    done: Boolean(run.finishedAt),
  };
}

/**
 * آخرین خواندنِ سورس — یک ردیف که به‌روز می‌شود، نه تاریخچه.
 *
 * ── چرا تاریخچه ندارد و اشکالی هم ندارد ──
 *
 * `endpoints.json` فقط نتیجهٔ **آخرین** اسکن را نگه می‌دارد. ساختنِ
 * تاریخچه برایش یعنی نوشتنِ انباری که هیچ‌کس نمی‌خواندش: کسی نمی‌پرسد
 * «سه هفته پیش سورس چند endpoint داشت»، می‌پرسد «الان چه دارد».
 *
 * پس یک ردیف، با تاریخِ همان اسکن. صادق‌تر از تاریخچه‌ای که نداریم.
 */
function fromSource(target) {
  let stored = null;
  try {
    stored = JSON.parse(fs.readFileSync(path.join(knowledgeDir(target), 'endpoints.json'), 'utf8'));
  } catch {
    return null;
  }
  if (!stored?.at) return null;

  return {
    id: 'source',
    kind: 'source',
    way: WAYS.source,
    at: stored.at,
    finishedAt: stored.at,
    status: 'finished',
    done: true,
    steps: 0,
    findings: 0,
    /** عددهای مالِ خودش — چیزی که یک خزش ندارد و برعکس. */
    facts: {
      files: stored.files || 0,
      endpoints: (stored.endpoints || []).length,
      routes: (stored.routes || []).length,
    },
  };
}

/**
 * صندوقِ کشف.
 *
 * @param {string} target
 * @param {object[]} runs خروجی `listRuns` برای همین هدف
 */
export function discoverySessions(target, runs = []) {
  const rows = runs.filter((run) => DISCOVERY_KINDS.has(run.kind)).map(fromRun);

  const source = fromSource(target);
  if (source) rows.push(source);

  return rows.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

/**
 * خلاصهٔ صندوق — برای عددِ کنارِ منو و حالتِ خالی.
 *
 * `never` با `0` فرق دارد: اولی یعنی هنوز هیچ‌وقت نگشته‌ایم، دومی معنا
 * ندارد. پس همان `total` کافی است و ابداعِ حالتِ سوم لازم نیست.
 */
export function summarizeSessions(rows = []) {
  return {
    total: rows.length,
    tours: rows.filter((one) => one.kind === 'tour').length,
    crawls: rows.filter((one) => one.kind === 'map' || one.kind === 'quest').length,
    hasSource: rows.some((one) => one.kind === 'source'),
    last: rows[0]?.at || '',
  };
}
