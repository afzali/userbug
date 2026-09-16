import { aggregateTriage, listRuns } from '$lib/server/artifacts.js';
import { groupRounds, printsByRound, readRounds } from '../../../../../../src/runs/rounds.js';
import { readCapabilities } from '../../../../../../src/knowledge/capabilities.js';

/**
 * «دورها» — هر بارِ بررسی، یک ردیف.
 *
 * ── چرا این صفحه جای «تاریخچهٔ اجراها» را نمی‌گیرد ──
 *
 * نمی‌گیرد و نباید بگیرد: تاریخچه در `/run` می‌ماند، چون آنجا سؤال «آخرین
 * اجرا چه شد» است. اینجا سؤال دیگری است — «بارِ گذشته که کلِ اپ را بررسی
 * کردیم چه دیدیم، و این بار چه فرق کرد؟»
 *
 * سی اجرای پراکنده جوابِ آن نیست. سه دورِ نام‌دار هست.
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
   * اثرانگشتِ هر دور، تا تفاوتِ دور‌به‌دور در خودِ ردیف دیده شود.
   *
   * ── چرا اینجا حساب می‌شود و نه با کلیک ──
   *
   * «چه چیزی نسبت به دورِ قبل تازه است» تنها عددی است که این صفحه را از یک
   * فهرستِ دیگر جدا می‌کند. پشتِ یک دکمه گذاشتنش یعنی کسی نبیندش.
   */
  const prints = printsByRound(findings);
  const named = rounds.filter((one) => one.name);

  const withDiff = rounds.map((round) => {
    if (!round.name) return { ...round, diff: null };
    /** دورِ قبلی یعنی دورِ **نام‌دارِ** بعدی در ترتیبِ زمانی، نه اجرای قبلی. */
    const index = named.findIndex((one) => one.name === round.name);
    const previous = named[index + 1];
    if (!previous) return { ...round, diff: null };

    const a = prints.get(previous.name) || new Set();
    const b = prints.get(round.name) || new Set();
    return {
      ...round,
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
   * می‌شود و شناسه‌اش نه. ولی شناسه روی صفحه خوانده نمی‌شود، پس همین‌جا
   * به نام برمی‌گردد — و شناسه‌ای که دیگر وجود ندارد، بی‌صدا نمی‌افتد.
   */
  const caps = new Map(safely(() => readCapabilities(target).nodes, []).map((one) => [one.id, one]));

  return {
    rounds: withDiff.map((round) => ({
      ...round,
      scopeLabels: (round.scope || []).map((id) => caps.get(id)?.title || `(قابلیتِ ناشناخته ${id})`),
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
