/**
 * فهرستِ مدل‌ها، و اینکه هرکدام به دردِ **کارِ ما** می‌خورد یا نه.
 *
 * ── چرا «کیفیت» را خودمان نمی‌سنجیم ──
 *
 * هیچ عددی که اینجا بنویسیم از حافظه، فردا درست نمی‌ماند. پس هر چیزی که
 * نشان داده می‌شود یا **فکتِ اعلام‌شدهٔ ارائه‌دهنده** است (قیمت، اندازهٔ
 * context، سقفِ خروجی، پارامترهای پشتیبانی‌شده، شاخصِ artificial analysis) یا
 * **قاعده‌ای روی همان فکت‌ها** که در همین فایل نوشته شده و قابلِ بازبینی است.
 *
 * ── و چرا این قاعده‌ها، نه قاعده‌های دیگر ──
 *
 * هر سه نقشِ این ابزار یک چیز می‌خواهند: **JSON معتبر**. شکستِ واقعی که این
 * فایل را ساخت همین بود — مدلی که پیش‌فرضِ نقشِ `analyze` شد، رایگانش
 * `structured_outputs` نداشت و در عوض یک مدلِ reasoning بود: کلِ بودجهٔ
 * خروجی صرفِ استدلال شد و `content` **خالی** برگشت. کاربر این را وسطِ کار
 * دید، نه پیش از آن.
 *
 * پس «reasoning بدونِ خروجیِ ساختاریافته» اینجا یک هشدارِ صریح است، نه یک
 * جزئیاتِ فنی.
 */

/** نقش‌ها، با آنچه هرکدام واقعاً لازم دارد. */
export const ROLE_NEEDS = {
  resolve: { label: 'حل قدم', context: 16_000, output: 2_000, cheap: true },
  author: { label: 'نوشتن سناریو', context: 32_000, output: 4_000, cheap: false },
  // هضمِ سورس، بزرگ‌ترین prompt این ابزار است و خروجی‌اش هم بلند
  analyze: { label: 'تحلیل و شناخت', context: 64_000, output: 8_000, cheap: false },
};

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** یک ردیفِ خامِ OpenRouter → چیزی که می‌شود نشانش داد و رویش قضاوت کرد. */
export function describeModel(raw = {}) {
  const params = raw.supported_parameters || [];
  const analysis = raw.benchmarks?.artificial_analysis || {};
  const provider = raw.top_provider || {};

  return {
    id: raw.id,
    name: raw.name || raw.id,
    free: String(raw.id).endsWith(':free'),
    context: provider.context_length || raw.context_length || 0,
    maxOutput: provider.max_completion_tokens || 0,

    // دلار به ازای یک میلیون توکن — همان واحدی که آدم‌ها با آن مقایسه می‌کنند
    price: {
      prompt: number(raw.pricing?.prompt) * 1e6,
      completion: number(raw.pricing?.completion) * 1e6,
    },

    /**
     * سه پله، نه بله/خیر.
     *
     * `structured_outputs` یعنی می‌شود شکلِ خروجی را تحمیل کرد؛
     * `response_format` یعنی فقط می‌شود گفت «JSON باشد»؛ هیچ‌کدام یعنی امیدِ
     * ما به prompt است — که همان جایی است که خروجیِ خالی و متنِ توضیحیِ
     * دورِ JSON از آن درمی‌آید.
     */
    json: params.includes('structured_outputs')
      ? 'structured'
      : params.includes('response_format')
        ? 'format'
        : 'none',
    reasoning: params.includes('reasoning') || params.includes('include_reasoning'),

    iq: Number.isFinite(analysis.intelligence_index) ? analysis.intelligence_index : null,
    coding: Number.isFinite(analysis.coding_index) ? analysis.coding_index : null,
  };
}

/**
 * آیا این مدل به دردِ این نقش می‌خورد؟
 *
 * خروجی عمداً «امتیاز و دلیل» است، نه فقط امتیاز: عددِ بی‌دلیل همان حدسی
 * می‌شود که نمی‌خواستیم.
 */
export function fitFor(model, role) {
  const needs = ROLE_NEEDS[role];
  if (!needs) return { score: 0, level: 'unknown', notes: [] };

  const notes = [];
  let score = 0;

  if (model.json === 'structured') {
    score += 3;
    notes.push({ good: true, text: 'خروجی ساختاریافته' });
  } else if (model.json === 'format') {
    score += 1;
    notes.push({ good: true, text: 'حالت JSON' });
  }

  /**
   * همان شکستی که این فایل را ساخت.
   *
   * مدلِ reasoning که راهی برای تحمیلِ شکلِ خروجی ندارد، می‌تواند تمامِ
   * بودجه را صرفِ استدلال کند و `content` خالی بدهد. این حدس نیست: دقیقاً
   * روی `nvidia/nemotron-3-ultra-550b-a55b:free` رخ داد.
   */
  if (model.reasoning && model.json === 'none') {
    score -= 3;
    notes.push({ good: false, text: 'reasoning بدونِ JSON — خطرِ پاسخ خالی' });
  }

  if (model.context && model.context < needs.context) {
    score -= 3;
    notes.push({ good: false, text: `context کوچک برای این نقش` });
  }
  if (model.maxOutput && model.maxOutput < needs.output) {
    score -= 2;
    notes.push({ good: false, text: 'سقفِ خروجی کوچک' });
  }

  if (model.iq !== null) score += model.iq / 10;

  /**
   * قیمت فقط برای نقشِ پرتکرار وزن دارد.
   *
   * `resolve` به ازای هر قدمِ یادنگرفته صدا زده می‌شود و هزینهٔ اجرا را
   * همان تعیین می‌کند؛ `analyze` در هر پروژه چند بار. گران بودنِ دومی
   * تقریباً بی‌اهمیت است و ارزان بودنِ اولی تقریباً همه‌چیز.
   */
  if (model.free) {
    score += needs.cheap ? 2 : 1;
    notes.push({ good: true, text: 'رایگان' });
  } else if (needs.cheap && model.price.prompt > 1) {
    score -= 2;
    notes.push({ good: false, text: 'برای نقشِ پرتکرار گران است' });
  }

  const level = model.reasoning && model.json === 'none' ? 'risky' : score >= 4 ? 'good' : score >= 1 ? 'ok' : 'risky';
  return { score: Math.round(score * 10) / 10, level, notes };
}

/** فهرست، با فیتِ هر نقش. مرتب‌شده بر پایهٔ نقشی که پرسیده شده. */
export function rankFor(models, role) {
  return models
    .map((model) => ({ ...model, fit: fitFor(model, role) }))
    .sort((a, b) => b.fit.score - a.fit.score);
}
