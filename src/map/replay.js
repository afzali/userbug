/**
 * بازپخشِ یک زنجیرهٔ قدم — هم مسیرِ ورود، هم برگشت به یک گره.
 *
 * ── چرا مفسرِ سناریو بازاستفاده نشد ──
 *
 * `src/scenario/run.js` به `ub`، `ctx.models`، بودجه، داور و چرخهٔ عمرِ
 * `playwright test` بند است. خزش هیچ‌کدام را ندارد (پروسهٔ مستقل است، مثل
 * گشت) و کشیدنِ آن وابستگی‌ها به اینجا یعنی دو مسیرِ اجرا که دیر یا زود
 * واگرا می‌شوند.
 *
 * پس یک زیرمجموعهٔ کوچک، با یک قاعدهٔ صریح: **فعلِ ناشناس بلند می‌شکند.**
 * سکوت در برابر فعلی که اجرا نشده یعنی مسیری که فکر می‌کنیم طی شده و نشده،
 * و بعد از آن هر یالی که ثبت شود دروغ است.
 */
import { dismissBlockers } from '../observe/blockers.js';
import { resolveTarget } from '../scenario/resolve.js';
import { interpolate } from '../scenario/interpolate.js';
import { resolveFixture } from '../knowledge/fixtures.js';

/** فعل‌هایی که ضبط‌کنندهٔ گشت و خودِ نقشه تولید می‌کنند. */
export const REPLAY_VERBS = [
  'go',
  'click',
  'dblclick',
  'fill',
  'type',
  'press',
  'check',
  'hover',
  'wait',
  'clearState',
  'when',
  /**
   * سنجش — و چرا بازپخش هم باید بفهمدش.
   *
   * ── چه چیزی بی این می‌شکست ──
   *
   * سناریوی ورود دو نقش دارد: یک آزمونِ مستقل، و مقدمهٔ بازپخش‌شونده برای
   * خزش. در نقشِ اول، `expect` همان چیزی است که سناریو را قابلِ اعتماد
   * می‌کند («واقعاً وارد شدیم؟»). در نقشِ دوم، تا دیروز کلِ فایل را رد
   * می‌کرد: «فعلی که خزش اجرا نمی‌کند: expect».
   *
   * یعنی کاربر باید یا سناریوی بی‌ادعا می‌نوشت، یا دو فایلِ تقریباً یکسان
   * نگه می‌داشت.
   *
   * و بی آن، بدتر: خزشی که ورودش نگرفته باشد بی‌صدا ادامه می‌دهد و
   * صفحهٔ ورود را نقشه می‌کند. همان «خزش وارد نشد» که بعداً باید حدس زده
   * شود. حالا همان‌جا، با پیامِ روشن، می‌ایستد.
   */
  'expect',
  'assert',
  'upload',
  /**
   * بستنِ پنجرهٔ مزاحم.
   *
   * ── چرا اینجا هم لازم شد ──
   *
   * `enterRoot` خودش مزاحم‌ها را می‌بندد، پس خزش این فعل را «لازم نداشت».
   * ولی سناریوی ورود فقط برای خزش نیست: همان فایل از اجراگرِ معمولی هم رد
   * می‌شود و آنجا لازمش دارد. نبودنش یعنی فایلی که در یک مسیر کار می‌کند و
   * در دیگری بی‌صدا پشتِ یک مودال می‌ماند — و نخستین «مسیرِ ورودِ خودکار»
   * دقیقاً همین‌جا رد شد: «فعلی که خزش اجرا نمی‌کند: dismissBlockers».
   */
  'dismissBlockers',
];

const TIMEOUT = 8000;

/**
 * زیرمجموعهٔ شرط‌هایی که بازپخش می‌فهمد.
 *
 * عمداً کوچک است و با `checkCondition`ِ مفسرِ سناریو یکی نشد: آن به `ctx`،
 * بودجه، مدل و فایلِ دانلود بند است و کشیدنش به اینجا همان دو مسیرِ
 * اجرایی را می‌سازد که مقدمهٔ این فایل از آن پرهیز می‌کند.
 *
 * آنچه یک **مسیرِ ورود** واقعاً لازم دارد همین چهارتاست: کجا رسیدیم، چه
 * دیده می‌شود، چه دیگر دیده نمی‌شود، و چه متنی روی صفحه است.
 */
async function checkReplayCondition(page, cond) {
  const timeout = Number(cond.timeout) || TIMEOUT;

  if (cond.url !== undefined) {
    return await page
      .waitForURL(new RegExp(cond.url), { timeout })
      .then(() => true)
      .catch(() => false);
  }

  if (cond.visible !== undefined) {
    const { locator } = resolveTarget(page, cond.visible);
    return await locator.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  if (cond.hidden !== undefined) {
    const { locator } = resolveTarget(page, cond.hidden);
    return await locator.waitFor({ state: 'hidden', timeout }).then(() => true).catch(() => false);
  }

  if (cond.text !== undefined) {
    const { locator } = resolveTarget(page, { text: cond.text });
    return await locator.first().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  throw new Error(`شرطی که بازپخش نمی‌فهمد: ${JSON.stringify(cond)}`);
}

/** کلیدهایی که فعل نیستند: برچسبِ گروه، مقدار، و بدنهٔ شرط. */
const IGNORED = new Set(['as', 'note', 'value', 'then']);

export function verbOf(step) {
  const keys = Object.keys(step || {}).filter((key) => !IGNORED.has(key));
  return keys[0] || '';
}

/**
 * قدم‌هایی که این ماژول نمی‌فهمد.
 *
 * پیش از باز کردنِ مرورگر صدا زده می‌شود: خزشی که در قدمِ چهلمِ مسیرِ ورود
 * بشکند، چهل قدم وقتِ کاربر را هدر داده تا چیزی بگوید که از اول معلوم بود.
 */
export function unsupportedVerbs(steps = []) {
  const found = new Set();
  for (const step of steps) {
    const verb = verbOf(step);
    if (verb && !REPLAY_VERBS.includes(verb)) found.add(verb);
  }
  return [...found];
}

/**
 * یک قدم.
 *
 * @param {object} o
 * @param {import('@playwright/test').Page} o.page
 * @param {object} o.step قدم به شکلِ سناریو
 * @param {object} [o.ctx] برای جای‌گذاری `{{identity.…}}`
 * @param {string} [o.baseURL] برای `go`ِ نسبی
 */
export async function replayStep({ page, step, ctx = {}, baseURL = '', target = '' }) {
  const verb = verbOf(step);
  if (!verb) return { verb: '', skipped: true };
  if (!REPLAY_VERBS.includes(verb)) throw new Error(`فعلِ بی‌پشتیبانی در بازپخشِ نقشه: «${verb}»`);

  const body = interpolate(step[verb], ctx);
  const value = step.value === undefined ? undefined : interpolate(step.value, ctx);

  switch (verb) {
    /**
     * شرط — تنها راهِ نوشتنِ مسیرِ ورودی که **دو بار** کار کند.
     *
     * ── چرا لازم شد ──
     *
     * نخستین خزشِ موفق، بارِ دوم که خواست سرِ خانه برگردد شکست: کاربر از قبل
     * وارد شده بود و فرمِ ورود دیگر وجود نداشت. خزش دهها بار به خانه برمی‌گردد،
     * پس مسیرِ ورود باید از هر دو حالت کار کند.
     *
     * و چرا `when` و نه پرچمِ تازه‌ای مثل `optional`: این فعل از قبل در
     * سناریوها هست. اختراعِ کلیدِ تازه یعنی فایلی که مفسرِ اصلی نمی‌فهمدش.
     */
    case 'when': {
      if (await conditionHolds(page, body)) {
        /** همان دو شکل که مفسرِ سناریو می‌پذیرد — وگرنه باز واگرا می‌شوند. */
        const branch = step.then || body?.then || [];
        for (const sub of branch) await replayStep({ page, step: sub, ctx, baseURL, target });
      }
      break;
    }
    case 'go': {
      const url = String(body || '/');
      const absolute = /^https?:\/\//i.test(url) ? url : `${String(baseURL).replace(/\/+$/, '')}${url}`;
      await page.goto(absolute, { waitUntil: 'domcontentloaded' });
      break;
    }
    /**
     * `wait` دو شکل دارد — و بازپخش فقط عدد را می‌فهمید.
     *
     * ── چه چیزی بی‌صدا از بین می‌رفت ──
     *
     * `{wait: {visible: …, timeout: …}}` شکلی است که آدم برای اپِ کند
     * می‌نویسد: «صبر کن تا فرم بیاید». بازپخش `Number({})` می‌گرفت، صفر
     * می‌شد، و **اصلاً صبر نمی‌کرد** — بی هیچ خطایی. یعنی همان انتظاری که
     * کاربر صریح نوشته بود، در مسیرِ خزش وجود نداشت.
     */
    case 'wait': {
      if (body && typeof body === 'object') {
        const { timeout, ...cond } = body;
        const ok = await checkReplayCondition(page, { ...cond, timeout });
        if (!ok) {
          throw new Error(
            `انتظارِ مسیرِ ورود نخورد: ${JSON.stringify(cond).slice(0, 80)} — الان اینجاییم: ${page.url()}`
          );
        }
        break;
      }
      await page.waitForTimeout(Math.min(Number(body) || 0, 10_000));
      break;
    }

    /**
     * دادنِ فایل به اپ — تا خزش بتواند اپِ **پُر** را ببیند، نه خالی.
     *
     * ── چرا اضافه شد ──
     *
     * پیش‌نویسِ گشت `upload` دارد (کاربر یک فایل وارد کرده بود) و همین یک
     * فعل، آن سناریو را به‌عنوان مسیرِ ورود غیرقابل‌استفاده می‌کرد. و
     * مهم‌تر: نقشه‌ای که از حسابِ خالی درمی‌آید، صفحه‌های داده‌دار را اصلاً
     * نمی‌بیند.
     *
     * مسیر از `resolveFixture` می‌گذرد — همان دروازه‌ای که مفسرِ سناریو
     * استفاده می‌کند — پس فقط از `knowledge/<کلید>/fixtures/` خوانده می‌شود
     * و رشتهٔ آزاد نمی‌تواند هر فایلی از دیسک را بفرستد.
     */
    case 'upload': {
      const names = [].concat(body.file ?? body.files ?? []);
      if (!names.length) throw new Error('upload بدون `file` معنا ندارد');

      const resolved = [];
      for (const name of names) resolved.push((await resolveFixture(target, name)).file);

      if (body.trigger) {
        const chooser = page.waitForEvent('filechooser', { timeout: body.timeout ?? 15_000 });
        await resolveTarget(page, body.trigger).locator.click();
        await (await chooser).setFiles(resolved);
      } else if (body.to) {
        await resolveTarget(page, body.to).locator.setInputFiles(resolved);
      } else {
        throw new Error('upload باید `to` (خودِ input) یا `trigger` (دکمه) داشته باشد');
      }
      break;
    }
    case 'press':
      await page.keyboard.press(String(body || 'Enter'));
      break;

    /**
     * `expect` می‌شکند، `assert` فقط می‌گوید — همان تفاوتِ مفسرِ سناریو.
     *
     * شرط‌های پشتیبانی‌شده همان‌هایی‌اند که این ماژول ابزارش را دارد؛
     * شرطِ ناشناس بلند می‌شکند، چون سکوت در برابر سنجشی که انجام نشده
     * یعنی مسیری که فکر می‌کنیم طی شده و نشده.
     */
    case 'expect':
    case 'assert': {
      const ok = await checkReplayCondition(page, body || {});
      if (verb === 'expect' && !ok) {
        /**
         * پیام می‌گوید **کجا** ایستادیم.
         *
         * «سنجش نخورد: {url: /contents}» به تنهایی فقط می‌گوید نشد. آنچه
         * لازم است این است که به‌جایش کجا رفتیم — همان یک کلمه تفاوتِ بینِ
         * «حدس بزن» و «فهمیدم».
         */
        throw new Error(
          `سنجشِ مسیرِ ورود نخورد: ${JSON.stringify(body)} — الان اینجاییم: ${page.url()}`
        );
      }
      break;
    }

    /**
     * اینجا یافته ثبت نمی‌شود، برخلافِ مفسرِ سناریو.
     *
     * همان تصمیمِ `enterRoot`: مزاحمی که **پیش از شروعِ کار** بسته شود قدمِ
     * کاربر را نشکسته. جای ثبتش سناریوست، جایی که قدمی واقعاً گرفته شده.
     */
    case 'dismissBlockers':
      await dismissBlockers(page, {
        only: body?.only,
        wait: Number(body?.wait) || 0,
      }).catch(() => []);
      break;
    /**
     * پاکسازیِ وضعیت، در حدی که بی‌`ub` ممکن است.
     *
     * `ub.clearBrowserState()` سرویس‌ورکر و OPFS را هم می‌برد و به fixture بند
     * است. اینجا فقط کوکی و انبارِ همین مبدأ پاک می‌شود — و همین باید صریح
     * نوشته شود، وگرنه کسی فرض می‌کند خزش با حالتِ کاملاً تازه شروع شده.
     */
    case 'clearState':
      await page.context().clearCookies();
      await page
        .evaluate(() => {
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch {
            // انبار در دسترس نیست؛ بقیهٔ پاکسازی انجام شده
          }
        })
        .catch(() => {});
      break;
    /**
     * `fill` و `type` دو شکل دارند — و بازپخش فقط یکی را می‌فهمید.
     *
     * ── واگراییِ واقعی، با یک نمونهٔ واقعی ──
     *
     * مفسرِ سناریو هر دو را می‌پذیرد:
     *
     *   {fill: {label: «ایمیل»}, value: «a@b.c»}     ← شکلِ بلند
     *   {fill: {«ایمیل»: «a@b.c»}}                    ← شکلِ کوتاه
     *
     * شکلِ کوتاه همان است که ضبط‌کنندهٔ گشت و مدل هر دو می‌سازند — یعنی
     * شکلِ غالبِ سناریوهای واقعی. بازپخش فقط بلند را می‌فهمید و کوتاه را
     * می‌داد به `resolveTarget` که می‌گفت «توصیف هدف نامفهوم».
     *
     * نتیجه: سناریوی ورودی که در اجراگر سبز بود، در خزش می‌مرد. و مقدمهٔ
     * همین فایل دقیقاً از این می‌ترسید: «دو مسیرِ اجرا که دیر یا زود
     * واگرا می‌شوند». واگرا شده بودند.
     */
    default: {
      const typing = verb === 'fill' || verb === 'type';

      /** شکلِ کوتاه: کلیدها برچسب‌اند و مقدارها متن. */
      if (typing && value === undefined && body && typeof body === 'object') {
        for (const [label, text] of Object.entries(body)) {
          const { locator } = resolveTarget(page, { label });
          if (verb === 'fill') await locator.fill(String(text ?? ''), { timeout: TIMEOUT });
          else {
            await locator.click({ timeout: TIMEOUT });
            await page.keyboard.type(String(text ?? ''), { delay: 20 });
          }
        }
        break;
      }

      const { locator } = resolveTarget(page, body);
      if (verb === 'click') await locator.click({ timeout: TIMEOUT });
      else if (verb === 'dblclick') await locator.dblclick({ timeout: TIMEOUT });
      else if (verb === 'hover') await locator.hover({ timeout: TIMEOUT });
      else if (verb === 'check') await locator.check({ timeout: TIMEOUT });
      else if (verb === 'fill') await locator.fill(String(value ?? ''), { timeout: TIMEOUT });
      else if (verb === 'type') {
        await locator.click({ timeout: TIMEOUT });
        await page.keyboard.type(String(value ?? ''), { delay: 20 });
      }
      break;
    }
  }

  return { verb, skipped: false };
}

/**
 * زیرمجموعهٔ شرط‌های `checkCondition` که مسیرِ ورود لازم دارد.
 *
 * بقیه (`download`, `text`, …) عمداً نیامده‌اند: شرطِ ناشناس `false` می‌دهد و
 * `then` اجرا نمی‌شود، که یعنی مسیرِ ورودِ نیمه‌کاره. پس ناشناس بلند می‌شکند.
 */
/**
 * شرطِ `when` — همان ارزیابِ `expect`، نه نسخهٔ دوم.
 *
 * ── چرا یکی شدند ──
 *
 * این فایل دو ارزیابِ شرط داشت که کمی با هم فرق داشتند: یکی `text` را
 * می‌فهمید و آن یکی نه. دو تعریف از «شرط» در **یک** ماژول، همان
 * واگرایی است که مقدمهٔ این فایل دربارهٔ `run.js` هشدار می‌دهد — فقط
 * کوچک‌تر و پنهان‌تر.
 */
async function conditionHolds(page, cond = {}) {
  const timeout = cond.timeout ?? 5000;
  try {
    return await checkReplayCondition(page, { ...cond, timeout });
  } catch (cause) {
    throw new Error(`شرطِ بی‌پشتیبانی در مسیرِ ورود: ${cause.message}`);
  }
}

/** زنجیره. اولین شکست، کلِ بازپخش را می‌شکند — مسیرِ نیمه‌طی‌شده بی‌معناست. */
export async function replayPath({ page, steps = [], ctx = {}, baseURL = '', target = '', settle = 400 }) {
  for (const step of steps) {
    await replayStep({ page, step, ctx, baseURL, target });
    if (settle) await page.waitForTimeout(settle);
  }
}
