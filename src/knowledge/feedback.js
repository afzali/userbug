/**
 * تریاژ → شناخت. مهم‌ترین حلقهٔ یادگیری.
 *
 * ── چرا از بقیه مهم‌تر است ──
 *
 * `absorb.js` داده جمع می‌کند: کجا رفتیم، چه عوض شد. این یکی تنها جایی است
 * که **قضاوتِ آدم** وارد سیستم می‌شود. بقیهٔ مسیرها می‌گویند «چه دیدیم»؛ این
 * می‌گوید «آنچه دیدیم درست بود یا نه».
 *
 * ── شکافی که پر می‌کند ──
 *
 * `triage/` از قبل هست ولی یک‌طرفه است: یافته می‌آید، آدم برچسب می‌زند، تمام.
 * برچسب هیچ‌جا برنمی‌گردد. یعنی چکی که ده بار یافتهٔ قلابی داده، بارِ یازدهم
 * هم می‌دهد — و کاربر بعد از سومی دیگر گزارش را نمی‌خواند.
 *
 * ── تنها جایی که خودکار اجازه دارد چیزی را خاموش کند ──
 *
 * قاعدهٔ کلیِ این ساختار: خودکارها اضافه می‌کنند و علامت می‌زنند، ولی چیزی
 * را که آدم گفته عوض نمی‌کنند. اینجا یک استثنا هست و عمدی است: چکی که از
 * آستانهٔ قلابی رد شود، **خودش** خاموش می‌شود.
 *
 * دلیلش در طرح نوشته شده: سکوتِ یک چکِ بد، از سکوتِ کلِ گزارش کم‌هزینه‌تر
 * است. و این استثنا امن است چون برگشت‌پذیر است — `why` می‌گوید چرا خاموش شد
 * و کاربر یک کلیک تا روشن کردنش فاصله دارد.
 */
import { readChecksConfig, writeChecksConfig } from '../checks/config.js';
import { appendHistory } from './history.js';
import { knowledgeDir, readDossier, writeDossier } from './store.js';
import { mergeIntoDossier } from './merge.js';

/** برچسب‌هایی که معنا دارند. `later` عمداً کاری نمی‌کند. */
export const VERDICTS = ['false-positive', 'real-bug', 'by-design', 'later'];

/**
 * از این تعداد قلابی به بعد، چک خودش خاموش می‌شود.
 *
 * سه، نه یک: یک قلابی ممکن است اشتباهِ تریاژ باشد، دو تا هنوز تصادف است.
 * و نه ده: تا آن‌وقت کاربر گزارش را رها کرده.
 */
const NOISE_LIMIT = 3;

/**
 * برچسبِ آدم روی یک یافته → تغییر در شناخت.
 *
 * @param {object} o
 * @param {string} o.target کلید پروژه
 * @param {object} o.finding یافته — باید `checkId` داشته باشد تا چک شناخته شود
 * @param {string} o.verdict یکی از `VERDICTS`
 * @returns {Promise<{applied: string[], disabled: string|null}>}
 */
export async function applyVerdict({ target, finding, verdict }) {
  if (!VERDICTS.includes(verdict)) throw new Error(`برچسبِ نامعتبر: «${verdict}»`);
  const applied = [];
  let disabled = null;

  if (verdict === 'false-positive' && finding?.checkId) {
    const config = readChecksConfig(target);
    const entry = (config.checks[finding.checkId] ??= { mode: 'watch', why: '', noise: 0, hits: 0 });
    entry.noise = (entry.noise || 0) + 1;

    if (entry.noise >= NOISE_LIMIT && entry.mode !== 'off') {
      entry.mode = 'off';
      entry.why = `خودکار خاموش شد: ${entry.noise} یافتهٔ قلابی در تریاژ`;
      disabled = finding.checkId;
    }

    writeChecksConfig(target, config);
    applied.push(disabled ? `چکِ «${finding.checkId}» خاموش شد` : `سروصدای چکِ «${finding.checkId}» شمرده شد`);

    await appendHistory(knowledgeDir(target), {
      op: disabled ? 'disable' : 'update',
      path: `checks[${finding.checkId}]`,
      by: 'user',
      why: disabled ? entry.why : 'یافتهٔ قلابی در تریاژ',
      ref: finding.fingerprint,
    });
  }

  if (verdict === 'real-bug') {
    /**
     * باگِ تأییدشده در پرونده می‌ماند.
     *
     * ── چرا `risks` و نه یک فهرست تازه ──
     *
     * `risks` همان چیزی است که به `explore.avoid` و به prompt می‌رود. یک
     * باگِ شناخته‌شده دقیقاً همان جنس است: «اینجا خراب است، حساب کن». و
     * `by: 'user'` یعنی هیچ اجرای بعدی پاکش نمی‌کند.
     *
     * برچسب از پیامِ یافته می‌آید و کوتاه می‌شود، چون `explore.avoid` آن را
     * به regex تبدیل می‌کند و یک پاراگراف آنجا بی‌معناست.
     */
    const label = String(finding?.message || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
    if (label) {
      const merged = mergeIntoDossier(readDossier(target), {
        risks: [{ label, why: `باگِ تأییدشده در تریاژ (${finding.fingerprint || '—'})`, by: 'user' }],
      });
      await writeDossier(target, merged.dossier, { by: 'user', why: 'باگِ تأییدشده در تریاژ', ref: finding.fingerprint });
      applied.push('به فهرست خطرهای شناخت اضافه شد');
    }
  }

  if (verdict === 'by-design') {
    /**
     * «رفتار درست است» یعنی چک اشتباه نکرده، ولی این مورد استثناست.
     *
     * ── چرا فعلاً فقط ثبت می‌شود ──
     *
     * طرح می‌گوید این باید به `contract.must` صفحه اضافه شود. ولی قراردادها
     * امروز خالی‌اند (گشت آن‌ها را با `must: []` می‌سازد و پر کردنشان کارِ
     * لایهٔ ۲ بخش ۸ است). افزودنِ یک بندِ قرارداد به صفحه‌ای که قرارداد
     * ندارد، ساختاری می‌سازد که هیچ‌چیز نمی‌خواندش.
     *
     * پس تا آن روز فقط در تاریخچه می‌نشیند — که دستِ‌کم جوابِ «چرا این را
     * نادیده گرفتیم» را نگه می‌دارد.
     */
    await appendHistory(knowledgeDir(target), {
      op: 'note',
      path: `findings[${finding?.fingerprint || '—'}]`,
      by: 'user',
      why: 'رفتارِ خواسته‌شده است، نه باگ',
      ref: finding?.checkId || finding?.source,
    });
    applied.push('در تاریخچهٔ شناخت ثبت شد');
  }

  return { applied, disabled };
}
