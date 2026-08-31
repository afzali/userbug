/**
 * اجراگرِ چک‌ها.
 *
 * ── چرا هیچ چکی `throw` نمی‌کند ──
 *
 * اگر چکِ اول سناریو را بشکند، چهار مسئلهٔ بعدیِ همان صفحه هرگز دیده
 * نمی‌شوند و اجرای بعدی همان یکی را دوباره پیدا می‌کند. پس همه از لولهٔ
 * `findings` رد می‌شوند — همان لوله‌ای که داورِ رخدادها استفاده می‌کند، تا
 * تریاژ و گزارش و JUnit لازم نباشد چیز تازه‌ای یاد بگیرند.
 *
 * `expect` تنها استثناست، و فقط وقتی آدم صریح ترفیعش داده باشد.
 *
 * ── چرا یافته شناسهٔ چک را حمل می‌کند ──
 *
 * بدون `checkId`، حلقهٔ یادگیری نمی‌تواند بفهمد کدام چک پرسروصداست. یعنی
 * «چکی که از آستانهٔ قلابی رد شود خودش خاموش می‌شود» غیرقابلِ پیاده‌سازی
 * می‌ماند — و آن تنها محافظی است که نگذارد این قابلیت گزارش را خفه کند.
 */
import { fingerprint, normalizeMessage } from '../observe/oracle.js';
import { modeOf, readChecksConfig } from './config.js';
import { UNIVERSAL, probePage } from './universal.js';
import { snapshotPage } from '../steps/snapshot.js';

/**
 * چک‌های همگانی را روی وضعیتِ فعلیِ صفحه اجرا کن.
 *
 * @param {object} o
 * @param {import('@playwright/test').Page} o.page
 * @param {string} o.target کلید پروژه — برای خواندنِ `checks.json`
 * @param {object} [o.config] تنظیم از قبل خوانده‌شده، تا هر قدم از دیسک نخواند
 * @param {string} [o.step] نام قدمِ جاری
 * @param {string} [o.device]
 * @param {boolean} [o.synthetic] یافته‌های خودآزما، تا گزارش واقعی آلوده نشود
 * @returns {Promise<{findings: object[], hard: object[], probe: object|null}>}
 */
export async function runUniversalChecks({ page, target, config, step = 'checks', device, synthetic = false }) {
  let probe;
  try {
    probe = await probePage(page);
  } catch {
    // صفحه‌ای که بسته شده یا وسط ناوبری است، وضعیتی برای سنجیدن ندارد.
    // این نبودِ سنجش است، نه سنجشِ موفق — و نباید یافته بسازد.
    return { findings: [], hard: [], probe: null };
  }

  const settings = config || readChecksConfig(target);
  const findings = [];
  const hard = [];

  for (const check of UNIVERSAL) {
    const mode = modeOf(settings, check.id);
    if (mode === 'off') continue;

    let result = null;
    try {
      result = check.run(probe);
    } catch {
      // چکِ شکسته نباید بقیه را ببرد؛ خودش هم یافته نمی‌سازد
      continue;
    }
    if (!result) continue;

    const finding = {
      fingerprint: fingerprint({
        source: 'check',
        message: result.message,
        route: probe.path,
        step,
      }),
      source: 'check',
      checkId: check.id,
      severity: 'error',
      message: result.message,
      normalized: normalizeMessage(result.message),
      step,
      route: probe.path,
      device,
      at: new Date().toISOString(),
      detail: { ...result.detail, check: check.title, mode },
      synthetic,
    };

    findings.push(finding);
    if (mode === 'expect') hard.push(finding);
  }

  return { findings, hard, probe };
}

/**
 * قراردادِ صفحهٔ فعلی را بسنج و تقویت کن.
 *
 * ── چرا سنجش و تقویت با هم ──
 *
 * قرارداد از رفتارِ اپ ساخته می‌شود و بدونِ تکرار نمی‌شود فهمید کدام بند
 * «بخشِ اپ» است و کدام «دادهٔ کاربر». پس هر بازدید هم می‌سنجد هم یاد
 * می‌گیرد — و در مرحلهٔ یادگیری، غیبت یعنی «داده بود»، نه «شکست».
 *
 * ── چرا نوشتن فقط وقتی چیزی عوض شده ──
 *
 * این در پایانِ هر قدم اجرا می‌شود. نوشتنِ بی‌قیدِ فایلِ صفحه در هر قدم،
 * روی سناریوی چهل‌قدمی چهل بار نوشتن است برای چیزی که معمولاً عوض نشده.
 *
 * @returns {Promise<{findings: object[], page: object|null}>}
 */
export async function runContractCheck({ page, target, record, step = 'قرارداد', device, synthetic = false }) {
  const nothing = { findings: [], page: null };
  if (!record || record.contract?.mode === 'off') return nothing;

  /**
   * قراردادی که همهٔ بندهایش حذف شده، تمام است.
   *
   * یعنی هر نامزدی که ثبت شده بود، در بازدیدهای بعد غایب بود — پس همه‌شان
   * دادهٔ کاربر بودند و این صفحه بخشِ ثابتِ قابلِ اتکایی ندارد. ادامه دادن
   * یعنی یک `snapshot` در پایانِ هر قدم برای فهرستی که خالی است.
   */
  if (!record.contract?.must?.length && record.contract?.seenIn) return nothing;

  const snapshot = await snapshotPage(page).catch(() => null);
  if (!snapshot) return { findings: [], page: null };

  const { verifyContract, reinforce, contractFrom, contractFinding, LEARNING_VISITS } = await import('./contract.js');

  const { missing } = await verifyContract(page, record.contract);
  const learning = (record.contract.seenIn || 0) < LEARNING_VISITS;

  const findings = [];
  if (missing.length && !learning) {
    findings.push(
      contractFinding({
        path: record.path,
        missing,
        mode: record.contract.mode,
        step,
        device,
        synthetic,
      })
    );
  }

  /**
   * تقویت با نامزدهای همین بازدید.
   *
   * در مرحلهٔ یادگیری، بندی که غایب بود بی‌صدا حذف می‌شود — همان مکانیزمی
   * که دادهٔ کاربر را از چیدمانِ ثابت جدا می‌کند.
   */
  const { contract, dropped } = reinforce(record.contract, contractFrom(snapshot));
  const changed = dropped > 0 || contract.seenIn !== record.contract.seenIn;

  return { findings, page: changed ? { ...record, contract } : null };
}

/**
 * پیامِ شکستِ سخت.
 *
 * جدا شده چون هم مفسرِ سناریو و هم گشت به آن نیاز دارند، و پیامِ متفاوت برای
 * یک چیز یعنی دو باگِ به‌ظاهر جدا در گزارش.
 */
export function hardFailureMessage(hard) {
  const lines = hard.map((finding) => `  · [${finding.checkId}] ${finding.message}`);
  return `چکِ تأییدشده شکست:\n${lines.join('\n')}`;
}
