/**
 * ارائه‌دهندهٔ مدل — فعلاً OpenRouter.
 *
 * پشت یک لایهٔ نازک نشسته تا عوض کردنش بعداً یک تغییر کانفیگ باشد نه بازنویسی.
 *
 * ── چه چیزی اینجا عمداً نیست ──
 *
 * هیچ منطق تصمیمی. این فایل فقط درخواست می‌فرستد، پاسخ را برمی‌گرداند و
 * هزینه را می‌شمارد. اینکه چه بپرسیم و با جوابش چه کنیم، کار `steps/ai.js`
 * است — همان‌جا که بدون شبکه هم قابل آزمودن می‌ماند.
 */

/** قیمت هر میلیون توکن، به دلار. برای تخمینِ هزینه، نه صورتحساب. */
const PRICES = {
  'anthropic/claude-haiku-4.5': { in: 1.0, out: 5.0 },
  'anthropic/claude-sonnet-5': { in: 3.0, out: 15.0 },
};

export function estimateCost(model, usage) {
  const p = PRICES[model];
  if (!p || !usage) return 0;
  return ((usage.prompt_tokens || 0) * p.in + (usage.completion_tokens || 0) * p.out) / 1e6;
}

export class Budget {
  constructor(limit) {
    this.limit = limit;
    this.spent = 0;
    this.calls = 0;
    this.tokensIn = 0;
    this.tokensOut = 0;
  }

  add(model, usage) {
    this.calls++;
    this.tokensIn += usage?.prompt_tokens || 0;
    this.tokensOut += usage?.completion_tokens || 0;
    this.spent += estimateCost(model, usage);
  }

  /**
   * رد شدن از سقف، اجرا را متوقف می‌کند.
   *
   * ادامه دادنِ بی‌صدا بدترین حالت است: کسی صورتحساب را ماه بعد می‌بیند.
   */
  assertWithin() {
    if (this.spent > this.limit) {
      throw new Error(
        `سقف هزینهٔ اجرا رد شد: ${this.spent.toFixed(4)}$ از ${this.limit}$ ` +
          `(${this.calls} فراخوانی). اجرا متوقف شد.`
      );
    }
  }

  snapshot() {
    return {
      calls: this.calls,
      tokensIn: this.tokensIn,
      tokensOut: this.tokensOut,
      costUsd: Number(this.spent.toFixed(6)),
      limitUsd: this.limit,
    };
  }
}

/**
 * یک فراخوانی. پاسخ باید JSON باشد.
 *
 * @param {object} cfg خروجی `resolveModel()`
 * @param {{system: string, user: string}} prompt
 * @param {Budget} budget
 */
export async function askJson(cfg, prompt, budget) {
  if (!cfg.apiKey) {
    throw new Error(
      'کلید مدل نیست. `OPENROUTER_API_KEY` را بگذارید یا `models.apiKey` را در ' +
        '`userbug.config.js` تنظیم کنید.\n' +
        '  توجه: مسیرهای کش‌شده بدون کلید هم اجرا می‌شوند؛ کلید فقط برای قدم‌هایی ' +
        'لازم است که هنوز یاد گرفته نشده‌اند.'
    );
  }

  const res = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.apiKey}`,
      'x-title': 'userbug',
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`مدل ${cfg.model} پاسخ ${res.status} داد: ${(await res.text()).slice(0, 300)}`);
  }

  const data = await res.json();
  budget?.add(cfg.model, data.usage);
  budget?.assertWithin();

  const text = data.choices?.[0]?.message?.content ?? '';
  try {
    return { json: JSON.parse(text), usage: data.usage, model: cfg.model };
  } catch {
    throw new Error(`پاسخ مدل JSON معتبر نبود: ${text.slice(0, 200)}`);
  }
}
