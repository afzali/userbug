import { listSchedules } from '../../../../../src/schedule.js';
import { healthFor, listRuns } from '$lib/server/artifacts.js';
import { loadScenarios } from '../../../../../src/scenario/load.js';
import { getActiveJob } from '$lib/server/jobs.js';
import { coverageOf } from '../../../../../src/knowledge/coverage.js';
import { listPages } from '../../../../../src/knowledge/store.js';
import { readMap } from '../../../../../src/map/store.js';
import { proposalsFor } from '../../../../../src/knowledge/propose.js';

/**
 * اجراها به همین پروژه فیلتر می‌شوند.
 *
 * پیش‌تر داشبورد همهٔ اجراهای همهٔ پروژه‌ها را نشان می‌داد، پس «آخرین اجرا»
 * می‌توانست مالِ پروژهٔ دیگری باشد. `listRuns` از اول پارامتر `target` داشت و
 * فقط استفاده نمی‌شد.
 *
 * فهرست پروژه‌ها از `+layout.server.js` می‌آید و اینجا تکرار نمی‌شود.
 */
export async function load({ params }) {
  /**
   * زمان‌بندی‌ها هم اینجا می‌آیند، چون به همین پروژه بند‌ند.
   *
   * شکستشان صفحه را نمی‌خواباند: روی سیستمی که `schtasks` ندارد یا پوشهٔ
   * `schedules/` هنوز ساخته نشده، بقیهٔ داشبورد باید کار کند.
   */
  let schedules = [];
  try {
    schedules = (await listSchedules()).filter((row) => row.target === params.target);
  } catch {
    schedules = [];
  }

  /**
   * سلامتِ سفرها — همان پرسشی که این صفحه تا امروز جوابش را نمی‌داد.
   *
   * سناریوهای روی دیسک هم می‌آیند، حتی آن‌هایی که هرگز اجرا نشده‌اند: فهرستی
   * که خطرناک‌ترین ردیفش را نشان ندهد، سبزِ دروغین است.
   */
  let known = [];
  try {
    known = loadScenarios(params.target).map((one) => one.name);
  } catch {
    known = [];
  }

  return {
    health: await healthFor(params.target, { known }).catch(() => []),
    runs: await listRuns({ target: params.target, limit: 60 }),
    activeJob: getActiveJob(true, params.target),
    schedules,
    progress: readProgress(params.target),
  };
}

/**
 * «کجای کار هستیم» — با عدد، نه با حدس.
 *
 * ── چرا این جای کارتِ «از کجا شروع کنیم» را می‌گیرد ──
 *
 * آن کارت فقط روی پروژهٔ **خالی** دیده می‌شد، پس دقیقاً وقتی ناپدید می‌شد که
 * تازه کار جدی شده بود: کاربری که یک اجرا داشت، دیگر هیچ‌جا نمی‌دید که نقشه
 * نکشیده و شناختش نصفه است.
 *
 * هر عدد از جایی می‌آید که خودش منبعِ حقیقت است؛ هیچ‌کدام اینجا حساب نمی‌شود.
 * و هر خواندن جدا محصور است: پروژه‌ای که هنوز `knowledge/` ندارد باید همین
 * صفحه را ببیند، نه یک ۵۰۰.
 */
function readProgress(target) {
  const safely = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  const map = safely(() => readMap(target), null);
  const coverage = safely(() => coverageOf(target), null);

  return {
    pages: safely(() => listPages(target).length, 0),
    states: map?.states?.length || 0,
    // «چند کنش هنوز امتحان نشده» صادقانه‌تر از «نقشه کامل است» است
    frontier: map?.frontier?.length || 0,
    coverage: coverage?.score ?? null,
    questions: coverage?.questionsOpen ?? 0,
    proposals: safely(() => proposalsFor(target).open, 0),
  };
}
