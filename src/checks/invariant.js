/**
 * ناوردا — لایهٔ ۳ از سنجهٔ هوشمند.
 *
 * ── تفاوتش با دو لایهٔ دیگر ──
 *
 *   لایهٔ ۱ (همگانی)  «صفحه سالم رندر شد»
 *   لایهٔ ۲ (قرارداد) «چیزی که بود، هنوز هست»
 *   لایهٔ ۳ (ناوردا)  «قاعده نشکست»
 *
 * فقط این یکی باگِ **منطقی** می‌گیرد: جایی که صفحه سالم است، خطایی نیست، و
 * دیتابیس دو کاربر با یک ایمیل دارد.
 *
 * ── چرا در پایان سناریو و نه در `finalizeRun` ──
 *
 * `state.sql` در **مرورگر** اجرا می‌شود — همان ماژول دیتابیسی که خودِ اپ
 * استفاده می‌کند. `finalizeRun` بعد از بسته شدن مرورگر است، پس آنجا صفحه‌ای
 * نمانده که پرس‌وجو روی آن اجرا شود.
 *
 * ── چرا پروژهٔ بی‌`state.sql` چیزی نمی‌گیرد، و چرا باید صریح گفته شود ──
 *
 * README برای «جعبه‌سیاه» همین تفکیک را دارد: «صفر یافته روی جعبه‌سیاه
 * ضعیف‌تر از صفر یافته روی نپی است و نباید یکی خوانده شود.» ناوردا دقیقاً
 * همان‌جاست: بدونِ داورِ وضعیت، این لایه اصلاً اجرا نمی‌شود و سکوتش معنایی
 * ندارد.
 */
import { assertMayQuery } from '../guard.js';
import { fingerprint, normalizeMessage } from '../observe/oracle.js';
import { listInvariants, setInvariantMode } from '../knowledge/invariants.js';

/**
 * ناورداها را روی وضعیتِ فعلیِ اپ بسنج.
 *
 * @param {object} o
 * @param {import('@playwright/test').Page} o.page
 * @param {object} o.target کانفیگ هدف — `state.sql` از اینجا می‌آید
 * @param {string} [o.step]
 * @param {boolean} [o.synthetic]
 * @returns {Promise<{findings: object[], ran: number, skipped: string}>}
 */
export async function runInvariants({ page, target, step = 'ناوردا', device, synthetic = false }) {
  const probe = target?.state?.sql;
  if (!probe) return { findings: [], ran: 0, unavailable: [], skipped: 'هدف داورِ وضعیت (state.sql) ندارد' };

  const all = listInvariants(target.key).filter((item) => item.mode !== 'off' && item.query);
  if (!all.length) return { findings: [], ran: 0, unavailable: [], skipped: 'ناوردایی ثبت نشده' };

  const findings = [];
  /** ناورداهایی که روی این دیتابیس اصلاً قابل اجرا نیستند. */
  const unavailable = [];
  let ran = 0;

  for (const invariant of all) {
    /**
     * هر پرس‌وجو از همان دروازهٔ همیشگی رد می‌شود.
     *
     * ناورداها از سورس استخراج می‌شوند و نامِ جدول و ستون مستقیم در متنِ
     * پرس‌وجو می‌نشیند. اگر روزی آشکارسازی چیزی نویسنده بسازد، `assertMayQuery`
     * جلویش را می‌گیرد — نه اینکه چون «خودمان ساختیمش» به آن اعتماد کنیم.
     */
    try {
      assertMayQuery(target, invariant.query);
    } catch (cause) {
      findings.push(
        make(invariant, `ناوردای «${invariant.id}» پرس‌وجوی مجاز ندارد: ${cause.message}`, step, device, synthetic, {
          reason: 'guard',
        })
      );
      continue;
    }

    let rows;
    try {
      rows = await page.evaluate(probe, { query: invariant.query, params: [] });
      ran++;
    } catch (cause) {
      /**
       * جدولی که وجود ندارد، **یافته نیست** — و این را به‌سختی یاد گرفتیم.
       *
       * ── چه شد ──
       *
       * نخستین اجرای واقعی چهار یافته داد: «no such table: changes»،
       * «no such column: email_hash». هیچ‌کدام باگِ اپ نبودند. نپی **دو**
       * دیتابیس دارد — یکی در مرورگر و یکی روی سرور PHP — و `state.sql`
       * فقط به اولی می‌رسد. قاعده‌های سرور آنجا قابل سنجش نیستند.
       *
       * ── چرا یافته ثبت نمی‌شود ──
       *
       * یافته باید دربارهٔ **اپ** باشد. این دربارهٔ تنظیمِ خودِ ماست. ثبتش
       * یعنی هر اجرا چهار یافتهٔ قلابی — و دقیقاً همان چیزی که این پروژه
       * دربارهٔ چکِ پرسروصدا نوشته: سه هفته بعد کسی گزارش را نمی‌خواند.
       *
       * ── چرا خودش خاموش می‌شود ──
       *
       * ناوردایی که هرگز اجرا نمی‌شود، فهرست را شلوغ می‌کند و «۱۶۵ ناوردا»
       * را به یک عددِ دروغ تبدیل می‌کند. خاموشی با `why` می‌ماند، پس هم
       * دیده می‌شود هم برگشت‌پذیر است.
       */
      const message = String(cause?.message || '');
      /**
       * فقط همان جمله‌ای که می‌گوید چه چیزی نیست.
       *
       * خطای خام سه لایه دارد: `page.evaluate: SQLiteError: no such column:
       * email_hash` به‌علاوهٔ چند خط stack. بریدن با `split(':').pop()`
       * آخرین تکه را می‌داد که گاهی شمارهٔ خط بود — و دلیلِ خاموشی به
       * «(22))» تبدیل می‌شد، که هیچ نمی‌گوید.
       */
      const missing = message.match(/no such (?:table|column):\s*([\w.]+)/i);
      const unknown = message.match(/unknown column\s+'?([\w.]+)/i);
      const name = missing?.[1] || unknown?.[1] || '';

      unavailable.push({
        id: invariant.id,
        why: name
          ? `این دیتابیس «${name}» را ندارد — احتمالاً قاعده مالِ دیتابیسِ دیگری است`
          : `پرس‌وجو اجرا نشد: ${message.split(/\r?\n/)[0].slice(0, 90)}`,
      });
      continue;
    }

    const violated = evaluate(invariant, rows);
    if (!violated) continue;

    findings.push(
      make(invariant, `قاعده شکست: ${invariant.statement}`, step, device, synthetic, {
        rows: Array.isArray(rows) ? rows.slice(0, 5) : rows,
        from: invariant.from,
        query: invariant.query,
      })
    );
  }

  /**
   * خاموشی پس از حلقه، نه وسطش.
   *
   * `setInvariantMode` کلِ فایل را می‌نویسد؛ صدا زدنش داخل حلقه یعنی صد
   * بار نوشتنِ همان فایل در یک اجرا.
   */
  for (const item of unavailable) {
    try {
      setInvariantMode(target.key, item.id, 'off', item.why);
    } catch {
      // ناوردایی که دیگر در فهرست نیست؛ چیزی برای خاموش کردن نمانده
    }
  }

  return { findings, ran, unavailable, skipped: '' };
}

/** آیا نتیجهٔ پرس‌وجو یعنی تخلف؟ */
function evaluate(invariant, rows) {
  const list = Array.isArray(rows) ? rows : rows == null ? [] : [rows];

  if (invariant.expect === 'empty') return list.length > 0;

  if (invariant.expect === 'zero') {
    const first = list[0];
    if (!first) return false;
    const value = typeof first === 'object' ? Object.values(first)[0] : first;
    return Number(value) > 0;
  }

  // `max`: نخستین ستونِ نخستین ردیف نباید از این بیشتر باشد
  if (typeof invariant.max === 'number') {
    const first = list[0];
    if (!first) return false;
    const value = typeof first === 'object' ? Object.values(first)[0] : first;
    return Number(value) > invariant.max;
  }

  return false;
}

function make(invariant, message, step, device, synthetic, detail) {
  return {
    fingerprint: fingerprint({ source: 'invariant', message, route: '', step }),
    source: 'invariant',
    checkId: invariant.id,
    severity: 'error',
    message,
    normalized: normalizeMessage(message),
    step,
    route: '',
    device,
    at: new Date().toISOString(),
    detail: { ...detail, statement: invariant.statement, by: invariant.by, mode: invariant.mode },
    synthetic,
  };
}
