/**
 * «بگو چه کار کنم» — یک جمله، یکی از کارهایی که از قبل بلدیم.
 *
 * ── چرا این لازم شد ──
 *
 * یازده در ساختیم و هیچ راهرویی. هر قابلیت صفحهٔ خودش را گرفت — به‌ترتیبِ
 * ساخته‌شدن، نه به‌ترتیبِ نیاز — و کسی که می‌خواست «ببین باگی هست یا نه»
 * نمی‌دانست کدام را بزند، چون هیچ‌کدام دقیقاً این نبود.
 *
 * ── چرا این جای صفحه‌ها را نمی‌گیرد ──
 *
 * محصولِ این ابزار گفت‌وگو نیست، آرتیفکت است: سناریویی که باید پیش از رسمی
 * شدن بازبینی شود، چهل یافته‌ای که باید تریاژ شوند، شناختی که `by: user`ش
 * نباید بازنویسی شود. هیچ‌کدام در یک رشتهٔ چت جا نمی‌شوند.
 *
 * پس این فقط **در ورودی** است: جمله را به یکی از فعل‌های موجود می‌خورانَد و
 * بعد تو را می‌برد همان صفحه‌ای که آرتیفکتش آنجاست.
 *
 * ── چرا قاعده، نه مدل ──
 *
 * همان ترتیبِ `classify.js`: قاعده اول، مدل فقط برای آنچه ماند. سه کارِ
 * رایج — «تست‌ها را بگیر»، «برو بگرد»، «گشت برویم» — باید **صفر فراخوانی**
 * بگیرند، وگرنه درِ ورودیِ ابزاری که به AI-free بودنِ اجرایش می‌بالد، خودش
 * هزینه‌دار می‌شود.
 */

/** ZWNJ و کشیده و اعراب می‌روند: «می‌گردد» و «میگردد» یک واژه‌اند. */
export function normalize(text) {
  return String(text ?? '')
    .replace(/[‌ـ]/g, '')
    .replace(/[ً-ْ]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * کارهایی که این در می‌تواند باز کند.
 *
 * `run` عمداً اول است: وقتی هیچ نشانه‌ای در جمله نیست، «تست‌ها را بگیر»
 * بی‌خطرترین حدس است — چیزی را جهش نمی‌دهد که از قبل سناریو نگفته باشد.
 */
export const INTENTS = [
  {
    id: 'run',
    label: 'اجرای سناریوها',
    verb: 'run',
    /** چیزی جهش نمی‌دهد جز آنچه سناریوها از قبل می‌کنند */
    risk: 'low',
    words: ['تست', 'تستها', 'اجرا', 'بگیر', 'ران', 'رگرسیون', 'دوباره اجرا', 'سناریوها را اجرا'],
  },
  {
    id: 'quest',
    label: 'کاوشِ هدف‌دار',
    verb: 'quest',
    risk: 'medium',
    words: ['بررسی کن', 'چک کن', 'ببین', 'امتحان کن', 'تست کن که', 'پیدا کن', 'درست کار میکند'],
  },
  {
    id: 'crawl',
    label: 'خزشِ نقشه',
    verb: 'map',
    risk: 'high',
    words: ['بگرد', 'همه جا', 'همه دکمه', 'نقشه', 'کشف', 'خزش', 'بگردد', 'کل اپ', 'همه صفحات'],
  },
  {
    id: 'tour',
    label: 'گشتِ زنده',
    verb: 'tour',
    risk: 'low',
    words: ['گشت', 'زنده', 'لایو', 'نشانت', 'نشانم', 'معرفی', 'یاد بگیر', 'با هم', 'خودم نشان'],
  },
  {
    id: 'triage',
    label: 'دیدنِ یافته‌ها',
    verb: 'triage',
    risk: 'none',
    words: ['یافته', 'ایراد', 'باگها', 'مشکلات', 'گزارش', 'تریاژ', 'چی پیدا کردی', 'نتیجه'],
  },
];

const BY_ID = new Map(INTENTS.map((item) => [item.id, item]));

/**
 * جمله → کار، بی یک فراخوانی مدل.
 *
 * `null` یعنی «نفهمیدم» و صادقانه‌تر از حدسِ کم‌اعتماد است: اینجا حدسِ غلط
 * می‌تواند بیست دقیقه خزشِ جهش‌زا روی دادهٔ واقعی راه بیندازد. `null` یعنی
 * لایهٔ بعد (مدل) بپرسد، یا کاربر خودش دکمه بزند.
 *
 * @param {string} text جملهٔ کاربر
 * @param {object} [context]
 * @param {{name: string}[]} [context.scenarios] برای پیدا کردنِ نامِ سناریو در جمله
 */
export function matchIntent(text, { scenarios = [] } = {}) {
  const clean = normalize(text);
  if (clean.length < 2) return null;

  /**
   * نامِ سناریو از هر کلیدواژه‌ای قوی‌تر است.
   *
   * «ورود برای نقشه را بگیر» هم «اجرا» دارد هم نامِ یک سناریو. اگر ترتیب
   * برعکس بود، همهٔ سناریوها اجرا می‌شدند — یعنی کاری بزرگ‌تر از آنچه
   * خواسته شده، و این بدترین نوعِ خطای یک روتر است.
   */
  const named = scenarios
    .map((item) => item?.name)
    .filter(Boolean)
    .filter((name) => clean.includes(normalize(name)))
    // بلندترین تطبیق برنده است، وگرنه نامِ کوتاهی که زیرمجموعهٔ دیگری است می‌برد
    .sort((a, b) => b.length - a.length);

  if (named.length) {
    return {
      intent: BY_ID.get('run'),
      args: { only: named },
      why: `نامِ ${named.length} سناریو در جمله بود`,
      confidence: 'high',
    };
  }

  const scored = INTENTS.map((intent) => {
    const hits = intent.words.filter((word) => clean.includes(normalize(word)));
    return { intent, hits, at: Math.min(...hits.map((word) => clean.indexOf(normalize(word)))) };
  }).filter((row) => row.hits.length);

  if (!scored.length) return null;

  /**
   * وقتی دو کار هر دو می‌خورند، کم‌خطرتر برنده نیست — **دقیق‌تر** برنده است.
   *
   * «برو بگرد ببین باگی هست» هم `crawl` می‌خورد هم `quest` هم `triage`، و هر
   * سه با کلیدواژه‌ای چهارحرفی. بلندیِ تطبیق تساوی را نمی‌شکند.
   *
   * شکننده‌اش **جای واژه در جمله** است: در فارسی فعلِ اصلی اول می‌آید و
   * بقیه توضیحش‌اند. «بگرد» در نویسهٔ چهارم است و «ببین» در یازدهم — پس
   * خواسته گشتن است، و «ببین باگی هست» می‌گوید چرا. بی این قاعده، همین
   * جملهٔ نمونه به کاوشِ هدف‌دار می‌رفت و کلِ اپ خزیده نمی‌شد.
   */
  scored.sort(
    (a, b) => longest(b.hits) - longest(a.hits) || a.at - b.at || b.hits.length - a.hits.length
  );
  const [best, second] = scored;

  const args = {};
  if (best.intent.id === 'quest') args.goal = String(text).trim();
  if (best.intent.id === 'crawl') {
    // کلیدواژهٔ **همهٔ** تشخیص‌هایی که خوردند برداشته می‌شود، نه فقط برنده:
    // «برو بگرد ببین باگی هست» وگرنه با اولویتِ «ببین باگی» خزش می‌کرد
    const focus = focusFrom(text, scored.flatMap((row) => row.hits));
    if (focus) args.focus = focus;
  }

  return {
    intent: best.intent,
    args,
    why: `«${best.hits[0]}» در جمله بود`,
    // دو کارِ هم‌وزن یعنی جمله واقعاً مبهم است؛ رابط باید بپرسد نه اینکه بزند
    confidence: second && longest(second.hits) === longest(best.hits) ? 'low' : 'high',
    alternatives: scored.slice(1, 3).map((row) => row.intent),
  };
}

function longest(words) {
  return words.reduce((max, word) => Math.max(max, word.length), 0);
}

/**
 * «برو بگردِ بخشِ کتاب‌ها» → اولویتِ «کتاب‌ها».
 *
 * کلیدواژه‌های خودِ تشخیص از جمله برداشته می‌شوند تا «بگرد» به‌عنوان
 * اولویتِ جست‌وجو به خزش نرود.
 */
export function focusFrom(text, hits = []) {
  let rest = String(text ?? '');
  for (const word of hits) rest = rest.replace(new RegExp(word, 'gi'), ' ');
  const words = rest
    .split(/[\s،.,!?؟:؛]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOP.has(normalize(word)));
  return words.slice(0, 4).join(' ');
}

/**
 * واژه‌هایی که اولویتِ جست‌وجو نمی‌سازند.
 *
 * «باگ» و «ایراد» عمداً اینجا هستند: «برو بگرد ببین باگی هست» هدفِ پیش‌فرضِ
 * خزش را می‌گوید، نه اینکه دنبالِ **واژهٔ** «باگ» در اپ بگردد. بی این، خزش
 * با اولویتِ «باگی» شروع می‌شد و اول سراغِ جایی می‌رفت که این رشته در
 * برچسبش بود — یعنی هیچ‌جا.
 */
const STOP = new Set([
  'برو','که','را','رو','در','به','از','با','این','آن','تا','هم','یا','اگر','چه','چی',
  'باشد','هست','است','کن','کند','بکن','میکنم','میکند','برای','روی','اپ','سایت','صفحه',
  'من','ما','یک','همه','فلان','بعد','الان','لطفا',
  'باگ','باگی','باگها','ایراد','ایرادی','مشکل','مشکلی','خطا','خطایی','اشکال','مشکلات',
]);

/**
 * توضیحِ آنچه می‌خواهد بزند — پیش از زدن.
 *
 * ── چرا این اختیاری نیست ──
 *
 * روتری که «بگرد» را اشتباه بخواند، بیست دقیقه خزشِ **جهش‌زا** روی دادهٔ
 * واقعی راه می‌اندازد. همان قاعدهٔ همیشگی: کارِ برگشت‌ناپذیر پیش از انجام
 * پرسیده می‌شود. پس روتر هرگز خودش اجرا نمی‌کند؛ فقط پیشنهاد می‌دهد.
 */
export function describeIntent(match, { target = '' } = {}) {
  if (!match) return null;
  const { intent, args } = match;

  if (intent.id === 'run') {
    const only = args?.only || [];
    return {
      id: intent.id,
      label: intent.label,
      risk: intent.risk,
      command: only.length
        ? `userbug run ${target} --only "${only.join(',')}"`
        : `userbug run ${target}`,
      summary: only.length
        ? `${only.length} سناریو اجرا می‌شود: ${only.join('، ')}`
        : 'همهٔ سناریوهای این پروژه اجرا می‌شوند.',
      job: { kind: 'run', only },
    };
  }

  if (intent.id === 'quest') {
    return {
      id: intent.id,
      label: intent.label,
      risk: intent.risk,
      command: `userbug quest ${target} "${args.goal}"`,
      summary: 'نقشه رایگان می‌بردت نزدیک‌ترین نما، بعد مدل همان‌جا می‌گردد و پیش‌نویس می‌نویسد.',
      job: { kind: 'quest', goal: args.goal },
    };
  }

  if (intent.id === 'crawl') {
    return {
      id: intent.id,
      label: intent.label,
      risk: intent.risk,
      command: args.focus ? `userbug map ${target} --focus "${args.focus}"` : `userbug map ${target}`,
      // متنِ ساده، نه markdown: این رشته عیناً در رابط چاپ می‌شود و
      // ستاره‌هایش یک بار واقعاً روی صفحه دیده شدند
      summary:
        'مرورگر خودش هر دکمهٔ امن را می‌زند. چند دقیقه طول می‌کشد و داده می‌سازد' +
        (args.focus ? `؛ اول سراغِ «${args.focus}» می‌رود.` : '.'),
      job: { kind: 'map', focus: args.focus || '' },
    };
  }

  // گشت و تریاژ اجرا نیستند، مقصدند
  return {
    id: intent.id,
    label: intent.label,
    risk: intent.risk,
    command: '',
    summary:
      intent.id === 'tour'
        ? 'مرورگر باز می‌شود و شما می‌رانید؛ ابزار تماشا می‌کند و یاد می‌گیرد.'
        : 'هر نقص یک ردیف، ادغام‌شده در همهٔ اجراها.',
    /**
     * مقصد، نسبت به فضای کاریِ پروژه.
     *
     * ── چرا «tour» دیگر نیست ──
     *
     * صفحهٔ `/projects/<t>/tour` وجود داشت و حذف شد؛ گشت حالا یکی از
     * راه‌های مودالِ «کشف» در خودِ صفحهٔ «اپِ من» است. ولی این رشته سرِ
     * جایش ماند، پس نوارِ فرمان — که بالای **هر** صفحه است — با جملهٔ
     * «گشتِ زنده برویم» کاربر را به ۴۰۴ می‌برد.
     *
     * حالا به همان صفحه می‌رود و مودال را روی همان راه باز می‌کند، نه
     * اینکه فقط برساندش و بگوید خودت پیدا کن.
     */
    goto: intent.id === 'tour' ? '?discover=tour' : 'triage',
  };
}
