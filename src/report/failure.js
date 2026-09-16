/**
 * خطای اجراگر → جمله‌ای که آدم می‌فهمد.
 *
 * ── چرا لازم شد ──
 *
 * یک بار از اول مثل کاربر اجرا گرفتیم، و ردیفِ قرمزِ صفحهٔ مأموریت‌ها این
 * بود:
 *
 *     TimeoutError: locator.check: Timeout 15000ms exceeded.
 *
 * حرفِ واقعی‌اش این بود: «تیکی که باید زده می‌شد، زده نشد». کاربری که
 * Playwright نمی‌شناسد از آن خط هیچ برنمی‌دارد جز اینکه «یک چیزی خراب است» —
 * و این دقیقاً همان جایی است که آدم ابزار را می‌بندد.
 *
 * ── چرا ترجمه، و چرا خطای خام نگه داشته می‌شود ──
 *
 * چون جملهٔ آدم‌فهم **تفسیر** است و خطای خام **شاهد**. اگر جای هم بنشینند،
 * روزی که تفسیر غلط باشد هیچ راهی برای فهمیدنش نمی‌ماند. پس هر دو می‌مانند:
 * جمله جلو، خام پشتش.
 *
 * ── چرا اینجا و نه در رابط ──
 *
 * چون خطِ فرمان هم همین را چاپ می‌کند. دو ترجمه از یک خطا یعنی روزی یکی‌شان
 * عقب می‌ماند و کاربر دو حرفِ متفاوت دربارهٔ یک شکست می‌شنود.
 */

/** فعلِ Playwright → کاری که کاربر می‌کرد. */
const VERB = {
  click: 'کلیک',
  dblclick: 'دابل‌کلیک',
  check: 'تیک زدن',
  uncheck: 'برداشتنِ تیک',
  fill: 'پر کردنِ فیلد',
  type: 'تایپ',
  press: 'زدنِ کلید',
  selectOption: 'انتخاب از فهرست',
  hover: 'بردنِ نشانگر روی عنصر',
  setInputFiles: 'پیوست کردنِ فایل',
  waitFor: 'انتظار برای عنصر',
};

/** خطای شبکه → حرفی که دربارهٔ **اپ** است، نه دربارهٔ مرورگر. */
const NET = {
  ERR_CONNECTION_REFUSED: 'اپ بالا نبود',
  ERR_CONNECTION_RESET: 'اتصال وسطِ کار قطع شد',
  ERR_NAME_NOT_RESOLVED: 'این آدرس پیدا نشد',
  ERR_CONNECTION_TIMED_OUT: 'اپ جواب نداد',
  ERR_EMPTY_RESPONSE: 'اپ پاسخِ خالی داد',
  ERR_CERT_AUTHORITY_INVALID: 'گواهیِ HTTPS پذیرفته نشد',
};

const seconds = (ms) => {
  const value = Number(ms) / 1000;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

/**
 * @param {string} error خطای خامِ اجراگر (همان که در `tests.ndjson` است)
 * @returns {string} یک جملهٔ فارسی، یا خودِ خطا اگر الگویی نشناختیم
 */
export function describeFailure(error) {
  const raw = String(error || '').trim();
  if (!raw) return '';

  /* ── اپ اصلاً جواب نداد ── */
  const net = raw.match(/net::(ERR_[A-Z_]+)(?: at (\S+))?/);
  if (net) {
    const what = NET[net[1]] || `شبکه خطا داد (${net[1]})`;
    return net[2] ? `${what}: ${net[2]} پاسخ نداد.` : `${what}.`;
  }

  /* ── صفحه بالا نیامد ── */
  const goto = raw.match(/page\.goto.*?Timeout (\d+)ms exceeded/);
  if (goto) return `صفحه تا ${seconds(goto[1])} ثانیه بالا نیامد.`;

  /**
   * ── عنصر آماده نشد ──
   *
   * «پیدا نشد» نمی‌نویسیم: Playwright وقتی عنصر هست ولی پوشیده یا غیرفعال
   * است هم همین خطا را می‌دهد. جمله‌ای که بگوید «نبود»، کاربر را دنبالِ
   * انتخابگر می‌فرستد در حالی که مشکل جای دیگری است.
   */
  const locator = raw.match(/locator\.(\w+).*?Timeout (\d+)ms exceeded/);
  if (locator) {
    const verb = VERB[locator[1]] || `کارِ «${locator[1]}»`;
    return `${verb} انجام نشد — عنصر تا ${seconds(locator[2])} ثانیه آمادهٔ کار نشد (نبود، یا پوشیده و غیرفعال بود).`;
  }

  /* ── انتظاری که برآورده نشد ── */
  if (/expect.*toBeVisible/.test(raw)) return 'چیزی که باید دیده می‌شد، دیده نشد.';
  if (/expect.*toHaveText|toContainText/.test(raw)) return 'متنِ روی صفحه آن چیزی نبود که انتظار می‌رفت.';
  if (/expect.*toHaveURL/.test(raw)) return 'بعد از این قدم، جایی که باید می‌رسیدیم نرسیدیم.';
  if (/expect.*toBeEnabled/.test(raw)) return 'چیزی که باید قابلِ استفاده می‌بود، غیرفعال ماند.';

  const timeout = raw.match(/Test timeout of (\d+)ms exceeded/);
  if (timeout) return `سناریو تا ${seconds(timeout[1])} ثانیه تمام نشد و نیمه‌کاره بریده شد.`;

  /**
   * الگویی نشناختیم → خودِ خطا.
   *
   * جملهٔ عمومیِ «خطایی رخ داد» بدترین کار است: هم اطلاعات را می‌گیرد هم
   * وانمود می‌کند می‌فهمد. سکوت بهتر از حدس است.
   */
  return raw;
}

/** آیا ترجمه‌ای واقعاً اتفاق افتاد؟ رابط با این تصمیم می‌گیرد خام را نشان بدهد یا نه. */
export function isTranslated(error) {
  return describeFailure(error) !== String(error || '').trim();
}
