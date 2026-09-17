import { aggregateTriage, listRuns } from '$lib/server/artifacts.js';
import { listSchedules } from '../../../../../../src/schedule.js';
import { groupRounds, printsByRound, readRounds } from '../../../../../../src/runs/rounds.js';
import { discoverySessions } from '../../../../../../src/knowledge/sessions.js';
import { readCapabilities } from '../../../../../../src/knowledge/capabilities.js';

/**
 * «بررسی» — یک بار بررسی کن، و ببین بارهای قبل چه دادند.
 *
 * ── چرا `/run` و `/rounds` یکی شدند ──
 *
 * سه در برای یک کار داشتیم و کاربر نمی‌دانست کدام را بزند:
 *
 *   `/run`     فرمِ اجرا داشت و تاریخچهٔ تخت
 *   `/rounds`  دورها را نشان می‌داد و می‌گفت «دورِ تازه از اپِ من شروع می‌شود»
 *   درخت      دکمهٔ «دورِ تازه» داشت
 *
 * هر سه یک پرسش را جواب می‌دادند و هیچ‌کدام کامل: «چطور این پروژه را
 * بررسی کنم؟» — که پرسشِ اصلیِ کلِ ابزار است. حالا یک جا دارد.
 *
 * ── و چرا فهرستِ تختِ اجراها حذف شد ──
 *
 * پنج فیلتر داشت (نوع، بنچ، یافته‌دار، مرتب‌سازی، جست‌وجو) و همه‌شان
 * دور زدنِ یک کمبود بودند: گروه‌بندی نداشتیم. حالا داریم. فهرستی که با
 * پنج فیلتر قابلِ تحمل شود، مشکلش فیلتر نبوده.
 *
 * اجراهای تکی از دست نرفته‌اند — هر دور بازشدنی است و اجراهایش را نشان
 * می‌دهد.
 */
export async function load({ params }) {
  const target = params.target;

  const safely = (fn, fallback) => {
    try {
      return fn() ?? fallback;
    } catch {
      return fallback;
    }
  };

  const runs = await listRuns({ target, limit: 500 }).catch(() => []);
  const findings = await aggregateTriage(target).catch(() => []);
  const saved = safely(() => readRounds(target), {});
  const rounds = groupRounds(runs, saved);

  /**
   * زمان‌بندی‌ها هم اینجا می‌آیند، چون بررسیِ شبانه هم یک بررسی است.
   *
   * شکستشان صفحه را نمی‌خواباند: روی سیستمی که `schtasks` ندارد، بقیهٔ
   * صفحه باید کار کند.
   */
  const discoveries = safely(() => discoverySessions(target, runs), []);

  const schedules = await listSchedules()
    .then((all) => all.filter((row) => row.target === target))
    .catch(() => []);

  /**
   * اثرانگشتِ هر دور، تا تفاوتِ دور‌به‌دور در خودِ ردیف دیده شود.
   *
   * ── چرا اینجا حساب می‌شود و نه با کلیک ──
   *
   * «چه چیزی نسبت به دورِ قبل تازه است» تنها عددی است که این فهرست را از
   * یک فهرستِ دیگرِ اجراها جدا می‌کند. پشتِ یک دکمه گذاشتنش یعنی کسی
   * نبیندش.
   */
  const prints = printsByRound(findings);
  const named = rounds.filter((one) => one.name);

  const withDetail = rounds.map((round) => {
    /** اجراهای خودِ این دور، برای بازشدنِ ردیف. */
    const own = runs.filter((one) => round.runs.includes(one.runId));

    if (!round.name) return { ...round, diff: null, items: own };

    /** دورِ قبلی یعنی دورِ **نام‌دارِ** بعدی در ترتیبِ زمانی، نه اجرای قبلی. */
    const index = named.findIndex((one) => one.name === round.name);
    const previous = named[index + 1];
    if (!previous) return { ...round, diff: null, items: own };

    const a = prints.get(previous.name) || new Set();
    const b = prints.get(round.name) || new Set();
    return {
      ...round,
      items: own,
      diff: {
        against: previous.name,
        added: [...b].filter((one) => !a.has(one)).length,
        gone: [...a].filter((one) => !b.has(one)).length,
        kept: [...b].filter((one) => a.has(one)).length,
      },
    };
  });

  /**
   * عنوانِ خواناىِ هر شناسهٔ دامنه.
   *
   * دامنه با **شناسه** ذخیره می‌شود نه با نام، چون نامِ یک قابلیت عوض
   * می‌شود و شناسه‌اش نه. ولی شناسه روی صفحه خوانده نمی‌شود، پس همین‌جا به
   * نام برمی‌گردد — و شناسه‌ای که دیگر وجود ندارد، بی‌صدا نمی‌افتد.
   */
  const caps = new Map(safely(() => readCapabilities(target).nodes, []).map((one) => [one.id, one]));
  const names = safely(() => readCapabilities(target).names, {}) || {};

  return {
    schedules,
    /**
     * کشف‌ها، کنارِ بررسی‌ها — دو دستهٔ یک صفحه.
     *
     * ── چرا صندوقِ کشف اینجا حل شد ──
     *
     * کاربر گفت «اینکه چگونه رفتیم کشف کردیم و چند بار، به ذات مهم نیست».
     * پس یک صفحهٔ مستقل برایش، همان مقصدی است که نباید باشد. ولی حذف هم
     * نمی‌شود: گاهی می‌خواهی برگردی ببینی آن خزش چه گرفت.
     *
     * جایش همین‌جاست، کنارِ بررسی‌ها — چون هر دو یک جنس‌اند: کاری که یک
     * بار اجرا شد و نتیجه‌ای داد.
     */
    discoveries,
    rounds: withDetail.map((round) => ({
      ...round,
      scopeLabels: (round.scope || []).map(
        (id) => names[id]?.title || caps.get(id)?.title || `(قابلیتِ ناشناخته ${id})`
      ),
    })),
    findings: findings.map((one) => ({
      fingerprint: one.fingerprint,
      message: one.normalized || one.message,
      benches: one.benches || [],
      routes: one.routes || [],
      status: one.triage?.status || 'open',
    })),
  };
}
