/**
 * ضبطِ کارِ کاربر در مرورگر.
 *
 * ── چرا ضبط‌کننده‌های معمولی به درد نمی‌خورند ──
 *
 * ابزارهای ضبط، سلکتور می‌نویسند: `div > div:nth-child(3) > button`. فردا که
 * یک `div` اضافه شود، سناریو می‌شکند — و بدتر، با پیامی که دربارهٔ اپ چیزی
 * نمی‌گوید.
 *
 * اینجا چیزی نوشته می‌شود که `do:` هم می‌نویسد: `{role, name}` یا `{label}`
 * یا `{testid}`. **و از همان کد**: صفحه فقط فهرست عناصر و شمارهٔ عنصرِ
 * کلیک‌شده را می‌فرستد؛ `descriptorFor` در نود توصیف را می‌سازد. یک تعریف از
 * «عنصرِ قابل اشاره»، نه دو تا.
 *
 * ── چرا snapshot در لحظهٔ رخداد گرفته می‌شود ──
 *
 * کلیکی که ناوبری کند، عنصر را از DOM می‌برد. اگر نود بعداً snapshot
 * می‌گرفت، نصفِ کلیک‌ها به «عنصر پیدا نشد» می‌خوردند. پس شنونده در فازِ
 * capture می‌نشیند و **پیش از** آنکه اپ واکنش نشان دهد، عکس را می‌گیرد.
 *
 * ── چرا رمز از صفحه بیرون نمی‌آید ──
 *
 * `input[type=password]` مقدارش جای `value` یک `secret: true` می‌فرستد. این
 * قاعده در خودِ اسکریپتِ داخلِ صفحه است، نه در نود: چیزی که فرستاده نشود، لو
 * هم نمی‌رود. حتی اگر روزی لاگِ خامِ گشت جایی کپی شود، رمز در آن نیست.
 */
import { SNAPSHOT_FN, descriptorFor } from '../steps/snapshot.js';

/** نامِ تابعی که Playwright در صفحه می‌گذارد تا رخداد به نود برسد. */
export const BINDING = '__ubRecord';

/**
 * اسکریپتی که در هر صفحه اجرا می‌شود.
 *
 * `SNAPSHOT_FN` به‌شکل رشته تزریق می‌شود چون باید **داخل مرورگر** اجرا شود و
 * همان تابعی باشد که کاوش و `do:` استفاده می‌کنند.
 */
export function recorderScript() {
  return `(() => {
  const snapshot = ${SNAPSHOT_FN.toString()};
  const MARK = 'data-ub-rec';
  let seq = 0;

  /**
   * ضبط پیش‌فرض **روشن** است.
   *
   * این اسکریپت با هر سندِ تازه از نو اجرا می‌شود، پس مقدارش هر ناوبری
   * برمی‌گردد به همین پیش‌فرض. اگر خاموش بود، نود بعد از ناوبری دوباره
   * خاموشش می‌کند — و آن یک خطِ صریح است، نه یک فرض.
   *
   * پیش‌فرضِ خاموش یک بار امتحان شد و نتیجه‌اش بدترین حالت بود: گشت کار
   * می‌کرد، صفحه‌ها ثبت می‌شدند، یافته‌ها می‌آمدند، و **هیچ قدمی ضبط
   * نمی‌شد** — بی‌آنکه چیزی خطا بدهد.
   */
  window.__ubRecording = true;

  /**
   * مقدارِ ورودی از فهرستِ عناصر پاک می‌شود.
   *
   * تابعِ snapshot برای مدل مقدارِ فعلیِ هر ورودی را هم می‌گذارد (تا بداند
   * چه چیزی از قبل پر شده). آنجا درست است، چون redactDeep در نود رازها را با
   * فهرستِ شناخته‌شده ماسک می‌کند.
   *
   * اینجا آن فهرست وجود ندارد — کاربر با حسابِ واقعیِ خودش وارد می‌شود و ما
   * رمزش را نمی‌دانیم. پس هیچ مقداری از صفحه بیرون نمی‌رود؛ ضبط‌کننده به
   * **هویتِ** عنصر نیاز دارد نه محتوایش.
   */
  function strip(items) {
    return items.map((item) => {
      const { value, ...rest } = item;
      return rest;
    });
  }

  function capture(el, action, extra) {
    if (!window.__ubRecording || !el || !el.setAttribute) return;
    const id = 'r' + ++seq;
    el.setAttribute(MARK, id);
    let payload;
    try {
      const shot = snapshot();
      const item = shot.items.find((i) => i.rec === id);
      // عنصری که در snapshot نیامده، توصیفِ پایداری ندارد؛ ثبتش فقط
      // سناریویی می‌سازد که اجرا نمی‌شود
      if (item) {
        const { value, ...clean } = item;
        payload = { action, item: clean, items: strip(shot.items), url: location.href, ...extra };
      }
    } finally {
      el.removeAttribute(MARK);
    }
    if (payload) window.${BINDING}(payload);
  }

  /**
   * تایپِ در جریان.
   *
   * ── چرا \`change\` به‌تنهایی کافی نیست ──
   *
   * \`change\` روی ورودیِ متنی فقط هنگام **از دست دادنِ فوکوس** می‌آید. یعنی
   * کاربری که در فیلد بنویسد و بعد Enter بزند یا صفحه ناوبری کند، آخرین
   * فیلدش هرگز ضبط نمی‌شود. این را همان نخستین آزمون نشان داد: تایپِ تنها
   * در یک فیلد، صفر قدم ضبط کرد.
   *
   * پس مقدار روی \`input\` نگه داشته می‌شود و در نخستین لنگرِ بعدی خالی
   * می‌شود: change، blur، کنشِ بعدی، یا Enter.
   */
  let pending = null;

  function flush() {
    if (!pending) return;
    const { el, secret } = pending;
    pending = null;
    if (!el.isConnected) return;
    capture(el, 'fill', secret ? { secret: true } : { value: String(el.value ?? '').slice(0, 300) });
  }

  function remember(el) {
    const type = (el.getAttribute('type') || '').toLowerCase();
    // عنصرِ تازه یعنی قبلی تمام شده
    if (pending && pending.el !== el) flush();
    pending = { el, secret: type === 'password' };
  }

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el?.tagName) return;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea') return;
    if (['checkbox', 'radio', 'file'].includes(type)) return;
    remember(el);
  }, true);

  document.addEventListener('blur', () => flush(), true);

  document.addEventListener('click', (e) => {
    flush();
    const el = e.target?.closest?.('button, a[href], input, select, textarea, [role], [contenteditable="true"], label');
    if (!el) return;
    const type = (el.getAttribute?.('type') || '').toLowerCase();
    if (type === 'checkbox' || type === 'radio') return; // با change ثبت می‌شود، نه دو بار
    // ورودیِ متنی با کلیک ثبت نمی‌شود؛ تایپش خودش ضبط شده
    if (['text', 'email', 'password', 'search', 'tel', 'url', 'number'].includes(type)) return;
    capture(el, 'click');
  }, true);

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || !el.tagName) return;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();

    if (type === 'checkbox' || type === 'radio') {
      pending = null;
      return capture(el, 'check', { checked: !!el.checked });
    }
    if (type === 'file') {
      pending = null;
      return capture(el, 'upload', { files: [...(el.files || [])].map((f) => f.name) });
    }
    if (tag === 'select') {
      pending = null;
      return capture(el, 'fill', { value: String(el.value ?? '').slice(0, 300) });
    }
    if (pending?.el === el) flush();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const el = e.target?.closest?.('input, textarea, [contenteditable="true"]');
    if (!el) return;
    // اول مقدار، بعد کلید — وگرنه سناریو Enter می‌زند روی فیلدِ خالی
    flush();
    capture(el, 'press', { key: 'Enter' });
  }, true);

  // ناوبری، آخرین فرصت است
  window.addEventListener('beforeunload', () => flush(), true);
  window.addEventListener('pagehide', () => flush(), true);
})();`;
}

/**
 * رخدادِ خام از صفحه → قدمِ سناریو.
 *
 * ── چرا اعتبارسنجی در نود و نه در صفحه ──
 *
 * توصیفی که به دو عنصر بخورد بی‌فایده است — نه فقط الان، بلکه در کش هم، چون
 * دفعهٔ بعد هم اجرا نمی‌شود. `descriptorFor` با دیدنِ کلِ فهرست `nth` اضافه
 * می‌کند؛ صفحه این کار را نمی‌تواند بکند چون منطقش در نود است.
 *
 * @returns {{step: object, intent: string, target: object}|null}
 */
export function toStep(event) {
  if (!event?.item) return null;
  const target = descriptorFor(event.item, event.items || []);
  if (!target) return null;

  const label = describe(event.item);

  switch (event.action) {
    case 'click':
      return { step: { click: target }, intent: `${label} را بزن`, target, action: 'click' };

    case 'check':
      return { step: { check: target }, intent: `${label} را علامت بزن`, target, action: 'check' };

    case 'press':
      return { step: { press: event.key || 'Enter' }, intent: '', target: null, action: 'press' };

    case 'fill': {
      /**
       * مقدارِ رمز جایش را به متغیرِ هویت می‌دهد.
       *
       * سناریویی که رمزِ ثابت داشته باشد، هم رازِ کاربر را در گیت می‌گذارد و
       * هم فقط با همان یک حساب اجرا می‌شود. `{{identity.password}}` هر دو را
       * حل می‌کند.
       */
      const value = event.secret ? '{{identity.password}}' : String(event.value ?? '');
      return {
        step: { fill: target, value },
        intent: `${label} را پر کن`,
        target,
        action: 'fill',
        secret: Boolean(event.secret),
      };
    }

    case 'upload':
      /**
       * فایلِ کاربر روی دیسکِ خودش است و مسیرش از مرورگر بیرون نمی‌آید.
       *
       * پس قدم با نامِ فایل ساخته می‌شود و پیش‌نویس صریح می‌گوید که باید در
       * `fixtures/` گذاشته شود — وگرنه سناریو روی هر ماشین دیگری می‌شکند.
       */
      return {
        step: { upload: { to: target, file: `fixtures/${(event.files || [])[0] || 'نام-فایل'}` } },
        intent: '',
        target,
        action: 'upload',
        needsFixture: (event.files || [])[0] || null,
      };

    default:
      return null;
  }
}

/** نامِ خوانای یک عنصر، برای نیتِ قدم و برای پنل. */
export function describe(item) {
  const name = item?.name || item?.label || item?.placeholder || item?.testid || 'عنصر';
  const role = item?.role;
  if (role === 'button') return `دکمهٔ «${name}»`;
  if (role === 'link') return `پیوند «${name}»`;
  if (role === 'textbox') return `فیلدِ «${name}»`;
  if (role === 'checkbox') return `تیکِ «${name}»`;
  return `«${name}»`;
}
