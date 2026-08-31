/**
 * مفسر سناریو.
 *
 * ── دو نوع سنجش ──
 *
 *   expect  سنجشِ سخت. اگر نخورد، سناریو ادامه‌اش بی‌معنا است و می‌شکند.
 *   assert  سنجشِ نرم. اگر نخورد، **یافته ثبت می‌شود** و سناریو ادامه می‌دهد.
 *
 * این تفاوت هستهٔ کار است: بیشتر باگ‌ها جایی‌اند که اپ به کارش ادامه می‌دهد و
 * فقط چیزِ غلطی انجام می‌دهد. اگر همه‌چیز `expect` بود، اولین یافته بقیهٔ مسیر
 * را قطع می‌کرد و هیچ‌وقت نمی‌فهمیدیم بعدش چه می‌شود.
 *
 * ── چه چیزی عمداً اینجا نیست ──
 *
 * قدم به زبان طبیعی (`do: «دکمه را بزن»`). فاز ۱ بدون AI است و حدس زدنِ
 * مقصودِ یک جملهٔ فارسی بدون مدل، یا کار نمی‌کند یا بدتر: گاهی کار می‌کند.
 * پس صریح رد می‌شود تا کسی رویش حساب نکند.
 */
import { expect } from '@playwright/test';
import { interpolate } from './interpolate.js';
import { resolveTarget } from './resolve.js';
import { NASTY } from '../data/persian.js';
import { assertMayQuery, assertMayRequest } from '../guard.js';
import { resolvePersona } from '../personas.js';
import { loadGlobalConfig, resolveModel } from '../models/config.js';
import { Budget } from '../models/provider.js';
import { loadCache, saveCache, getEntry, putEntry, shouldReverify } from '../steps/cache.js';
import { KNOWN_VERBS, stepVerb } from './verbs.js';
import { resolveDo, performAction } from '../steps/do.js';
import { explore } from '../steps/explore.js';
import { resolveFixture } from '../knowledge/fixtures.js';
import { getCurrentRun } from '../store/run-store.js';
import { writeRepros } from '../repro.js';

const NEEDS_AI = new Set(['goal']);

export async function runScenario({ page, ub, identity, scenario }) {
  // ترتیب: پرچم خط فرمان بر سناریو می‌چربد، تا بشود همان سناریو را با پرسونای
  // دیگری اجرا کرد و تفاوت رفتار اپ را دید.
  const persona = resolvePersona(process.env.UB_PERSONA || scenario.persona || 'novice');

  const globalConfig = await loadGlobalConfig();
  // `--model` بر کانفیگ هدف و پیش‌فرض کلی می‌چربد — همان ترتیبِ `--persona` و
  // `--depth`: پرچم خط فرمان بر فایل. تا بشود همان سناریو را یک بار با مدل
  // ارزان و یک بار با مدل قوی اجرا کرد و تفاوت را دید.
  const models = resolveModel({
    global: globalConfig,
    target: ub.target,
    role: 'resolve',
    model: process.env.UB_MODEL || undefined,
  });

  const ctx = {
    identity: { ...identity, local: identity.email.split('@')[0] },
    nasty: NASTY,
    vars: {},
    persona,
    models,
    budget: new Budget(models.budgetPerRun),
    cache: loadCache(ub.target.key, scenario.id),
    cacheDirty: false,
    scenarioId: scenario.id,
    // از هر N اجرا یکی کامل با مدل حل می‌شود، تا انحرافِ خاموشِ کش پیدا شود
    reverify: shouldReverify(getCurrentRun(), models.reverifyEvery),
    aiStats: { cache: 0, model: 0, healed: 0, verified: 0 },
    executed: [],
    groups: [],
  };

  /**
   * چه سناریو تمام شود چه وسط راه بشکند، آموخته‌ها و هزینه باید ثبت شوند.
   *
   * پیش‌تر این سه کار بعد از حلقه بودند، پس یک `throw` وسط سناریو هر سه را
   * می‌برد. بدترینش آمار مدل بود: اجرایی که کش‌اش نخورد، مدل را صدا زد، پول
   * داد و بعد شکست، در `run.json` می‌گفت `ai: null` — یعنی گران‌ترین اجرا،
   * بی‌هزینه‌ترین به نظر می‌رسید. همین اشتباه یک بار برای کاوش رخ داده بود و
   * اینجا تکرار شده بود، با یک لایه فاصله.
   *
   * کشِ heal‌شده هم از دست می‌رفت: مدل مسیر تازه را پیدا می‌کرد، سناریو در قدم
   * بعدی می‌شکست، و اجرای بعدی دوباره از صفر می‌پرسید.
   */
  try {
    for (const group of groupSteps(scenario.steps)) {
      ctx.groups.push({ title: group.title, raw: [] });
      await ub.step(group.title, async () => {
        for (const step of group.steps) {
          await execute({ page, ub, ctx, step });
          if (step.verb !== 'explore') ctx.groups.at(-1).raw.push(step.raw);
          // قدم‌های پیش از کاوش، مقدمهٔ پیش‌نویس می‌شوند: پیش‌نویس باید خودش
          // قابل اجرا باشد، نه اینکه کسی دستی «چطور به اینجا برسیم» را بنویسد.
          if (step.verb !== 'explore') ctx.executed.push(step.raw);
        }
      });
    }
  } finally {
    if (ctx.cacheDirty) saveCache(ub.target.key, scenario.id, ctx.cache);

    // «یافته بدون بازتولید، یافته نیست» — قانون سوم پروژه. تا امروز فقط شعار
    // بود؛ حالا برای هر یافته یک فایل اجراپذیر ساخته می‌شود.
    await writeRepros({ ub, scenario, ctx }).catch((cause) => {
      console.error(`  نوشتن فایل بازتولید ناموفق بود: ${cause.message}`);
    });

    // آمار در گزارش می‌نشیند: اگر نسبت «مدل» به «کش» بالا بماند، یعنی یا کش
    // کار نمی‌کند یا رابط مدام عوض می‌شود — هر دو ارزش دانستن دارند.
    if (ctx.aiStats.cache + ctx.aiStats.model + ctx.aiStats.healed > 0) {
      await ub.store
        .appendEvent({
          kind: 'ai',
          scenario: scenario.name,
          // کدام مدل، نه فقط چند فراخوانی. بدون این، «یک بار ارزان و یک بار قوی
          // اجرا کن و تفاوت را ببین» از روی آرتیفکت‌ها قابل انجام نبود: هر دو
          // اجرا یک‌شکل به نظر می‌رسیدند.
          slug: `${models.provider}:${models.model}`,
          ...ctx.aiStats,
          budget: ctx.budget.snapshot(),
        })
        .catch(() => {});
    }
  }

  return ctx;
}

/**
 * `as:` سرِ گروه است، نه فقط برچسب.
 *
 * بدون گروه‌بندی، هر فعل یک قدم می‌شد: بیست‌وچهار ردیف در گزارش و بیست‌وچهار
 * عکس، که خط زمانی را از خواندن می‌انداخت. با گروه‌بندی، همان سناریو چهار قدمِ
 * معنادار دارد — درست مثل نسخهٔ اسکریپتی‌اش.
 *
 * مرزِ گروه، مرزِ زمانیِ لاگ سرور هم هست، پس بی‌معنا ریز کردنش دقت را کم می‌کند
 * نه زیاد.
 */
function groupSteps(rawSteps) {
  const groups = [];
  let current = null;

  for (const raw of rawSteps) {
    const step = normalizeStep(raw);
    if (raw.as || !current) {
      current = { title: raw.as || step.title, steps: [] };
      groups.push(current);
    }
    current.steps.push(step);
  }
  return groups;
}

/** هر قدم یک شیء تک‌کلیدی است: `{click: …}`. عنوان اختیاری با `as`. */
function normalizeStep(raw) {
  if (typeof raw === 'string') throw new Error(`قدم باید شیء باشد، نه رشته: «${raw}»`);
  const verb = stepVerb(raw);
  if (!verb) throw new Error(`قدم بدون فعل: ${JSON.stringify(raw)}`);
  if (NEEDS_AI.has(verb)) {
    throw new Error(`فعل «${verb}» به فاز ۲ (AI) نیاز دارد و در این نسخه پشتیبانی نمی‌شود`);
  }
  // اینجا می‌شکند نه در `switch`، چون `groupSteps` همهٔ قدم‌ها را پیش از اجرا
  // نرمال می‌کند: غلطِ املایی در قدم ۳۸ دیگر بعد از اجرای ۳۷ قدم پیدا نمی‌شود.
  if (!KNOWN_VERBS.has(verb)) throw new Error(`فعل ناشناخته: «${verb}»`);
  return { verb, body: raw[verb], raw, title: raw.as || defaultTitle(verb, raw[verb]) };
}

function defaultTitle(verb, body) {
  const short = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  return `${verb} ${short}`.slice(0, 70);
}

async function execute({ page, ub, ctx, step }) {
  const { verb, raw } = step;
  const body = interpolate(step.body, ctx);
  const persona = ctx.persona;

  switch (verb) {
    case 'go':
      await page.goto(body);
      if (persona.settle) await page.waitForTimeout(persona.settle);
      return;

    /**
     * حلقه روی مجموعه‌ای از مقدارها، یا `n` بار.
     *
     * `in` برای سنجیدن دادهٔ بدخیم لازم بود: همان چند قدم با ده رشتهٔ متفاوت.
     *
     * `times` برای سنجشِ حجم اضافه شد. «n یادداشت بساز» را نمی‌شد با فهرستِ
     * ادبی نوشت جز با تکرارِ دستیِ n سطر، و آن‌وقت عددِ حجم در دلِ داده گم
     * می‌شد. شمارنده از ۱ شروع می‌شود تا در عنوان‌ها خوانا باشد.
     */
    case 'forEach': {
      const { var: name, in: values, times } = body;

      let sequence;
      if (times !== undefined) {
        if (values !== undefined) throw new Error('forEach یا `in` می‌گیرد یا `times`، نه هر دو');
        const count = Number(times);
        // سقف عمدی: یک `times` تایپی نباید اجرا را تا بی‌نهایت ببرد
        if (!Number.isInteger(count) || count < 1 || count > 500) {
          throw new Error(`forEach.times باید عددی صحیح بین ۱ و ۵۰۰ باشد؛ «${times}» نبود`);
        }
        sequence = Array.from({ length: count }, (_, index) => index + 1);
      } else if (Array.isArray(values)) {
        sequence = values;
      } else {
        throw new Error(`forEach نامفهوم: ${JSON.stringify(body)}`);
      }

      for (const value of sequence) {
        ctx.vars[name] = value;
        for (const sub of raw.then || []) {
          await execute({ page, ub, ctx, step: normalizeStep(sub) });
        }
      }
      return;
    }

    case 'clearState':
      await ub.clearBrowserState();
      return;

    case 'wait':
      if (typeof body === 'number') return void (await page.waitForTimeout(body));
      if (body.visible) {
        const { locator } = resolveTarget(page, body.visible);
        return void (await locator.waitFor({ state: 'visible', timeout: body.timeout ?? 20_000 }));
      }
      throw new Error(`wait نامفهوم: ${JSON.stringify(body)}`);

    case 'click': {
      const { locator } = resolveTarget(page, body);
      if (persona.actionDelay) await page.waitForTimeout(persona.actionDelay);
      return void (await locator.click());
    }

    case 'dblclick': {
      // همان توالی رخدادی که مرورگر از انگشتِ عجول تولید می‌کند
      const { locator } = resolveTarget(page, body);
      return void (await locator.dblclick({ delay: raw.delay ?? 20 }));
    }

    case 'reload':
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      if (persona.settle) await page.waitForTimeout(persona.settle);
      return;

    // ── فعل‌های آشوب ──
    //
    // اینها همان کارهایی‌اند که کاربر واقعی از سرِ عادت می‌کند و برنامه‌نویس
    // هیچ‌وقت دستی امتحان نمی‌کند. هیچ‌کدام AI نمی‌خواهند و همه قطعی‌اند.

    /** دکمهٔ back مرورگر — پرتکرارترین کاری که هیچ تستی نمی‌زند. */
    case 'back':
      await page.goBack();
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      if (persona.settle) await page.waitForTimeout(persona.settle);
      return;

    case 'forward':
      await page.goForward();
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      return;

    /**
     * قطع و وصل شبکه.
     *
     * برای اپی که خودش را آفلاین‌محور می‌داند، این سنجشِ ادعای اصلی‌اش است.
     */
    case 'offline':
      await page.context().setOffline(body !== false);
      return;

    /**
     * چسباندن، نه تایپ کردن.
     *
     * `insertText` متن را بدون رخدادهای keydown/keyup وارد می‌کند — همان کاری
     * که چسباندن می‌کند. هر منطقی که فقط به رخداد کیبورد گوش داده باشد،
     * اینجا اجرا نمی‌شود؛ و همان‌جاست که باگ‌های «فرم می‌گوید خالی است ولی
     * پر است» زندگی می‌کنند.
     */
    case 'paste': {
      const { locator } = resolveTarget(page, body.into);
      await locator.click();
      await locator.fill('');
      await page.keyboard.insertText(String(interpolate(body.value, ctx)));
      return;
    }

    /**
     * خواندن وضعیت واقعی از دیتابیسِ خودِ اپ.
     *
     * ── چرا این لازم است ──
     *
     * تا اینجا هر سنجش از روی چیزی بود که روی صفحه دیده می‌شد. ولی بخش بزرگی
     * از باگ‌ها همان‌جایی است که صفحه درست نشان می‌دهد و دیتابیس چیز دیگری
     * دارد — «دو ردیف کاربر با یک ایمیل» از بیرون هیچ نشانه‌ای ندارد.
     *
     * ── چرا موتور نمی‌داند چطور بخواند ──
     *
     * *چگونه* خواندن مسئلهٔ هدف است نه ابزار. تابعش در کانفیگ هدف می‌نشیند و
     * موتور فقط صدایش می‌زند. وگرنه کدِ مخصوص نپی وسط موتور می‌ماند و هدف
     * بعدی مجبور می‌شد دورش بزند.
     */
    case 'query': {
      const probe = ub.target.state?.sql;
      if (!probe) throw new Error(`هدف «${ub.target.key}» تابع state.sql ندارد`);

      // این تابع همان دیتابیسِ خودِ اپ را می‌راند، پس نوشتن با آن واقعاً
      // می‌نویسد. خواندن روی هر محیطی آزاد است، نوشتن فقط روی توسعه.
      assertMayQuery(ub.target, body.sql);

      const rows = await page.evaluate(probe, { query: body.sql, params: body.params || [] });
      ctx.vars[body.saveAs || 'rows'] = rows;
      return;
    }

    /**
     * بردن نشانگر روی عنصر، بدون کلیک.
     *
     * لازم شد چون بخش‌هایی از رابط فقط با hover ظاهر می‌شوند — در نپی دکمهٔ
     * «+» افزودن پاراگراف چنین است. بدون این فعل، کل آن ناحیه برای ابزار
     * وجود نداشت.
     */
    case 'hover': {
      const { locator } = resolveTarget(page, body);
      await locator.hover();
      await page.waitForTimeout(300);
      return;
    }

    case 'clickIfPresent': {
      const { locator } = resolveTarget(page, body);
      if (await locator.isVisible().catch(() => false)) await locator.click();
      return;
    }

    case 'check': {
      const { locator } = resolveTarget(page, body);
      return void (await locator.check());
    }

    case 'fill': {
      // دو شکل: {fill: {label: …}, value: …}  یا  {fill: {«برچسب»: «مقدار»}}
      if (raw.value !== undefined) {
        const { locator } = resolveTarget(page, body);
        return void (await typeInto(page, locator, String(interpolate(raw.value, ctx)), persona));
      }
      for (const [label, value] of Object.entries(body)) {
        const { locator } = resolveTarget(page, { label });
        await typeInto(page, locator, String(value), persona);
      }
      return;
    }

    case 'press':
      return void (await page.keyboard.press(body));

    /**
     * تایپ با رخدادهای واقعی کیبورد.
     *
     * `fill` مقدار را یکجا می‌گذارد و روی contenteditable (ویرایشگر tiptap)
     * اصلاً کار نمی‌کند؛ `press` هم فقط کلیدهای نام‌دار را می‌گیرد و «پ» را
     * نمی‌شناسد. برای سنجیدنِ چیزی که به تایپِ واقعی وابسته است — مثل ساخت
     * پاراگراف با Enter — این فعل لازم است.
     */
    case 'type': {
      const { locator } = resolveTarget(page, body.into);
      await locator.click();
      await page.keyboard.type(String(interpolate(body.value, ctx)), {
        delay: raw.delay ?? persona.typeDelay ?? 0,
      });
      return;
    }

    case 'answerDialog':
      ub.answerDialog(body);
      return;

    case 'dismissBlockers':
      await ub.dismissBlockers(
        body && body.expected ? { expected: body.expected.map((r) => new RegExp(r)) } : {}
      );
      return;

    /** متن یک عنصر را در متغیر بگذار، تا قدم‌های بعد بتوانند استفاده کنند. */
    case 'set': {
      const { name, from } = body;
      if (from.text) {
        const { locator } = resolveTarget(page, from.text);
        ctx.vars[name] = (await locator.innerText()).trim();
      } else if (from.url) {
        ctx.vars[name] = page.url();
      } else throw new Error(`set نامفهوم: ${JSON.stringify(body)}`);
      return;
    }

    /**
     * دانلود فایل.
     *
     * ── چرا این فعل بازنویسی شد ──
     *
     * نسخهٔ اول همیشه `readFile(..., 'utf8')` می‌زد. برای فایلِ متنی درست بود
     * و برای PDF و ZIP و تصویر، یک رشتهٔ مخدوش در متغیر می‌نشست **بی‌آنکه
     * چیزی بشکند**. یعنی سناریویی که PDF دانلود می‌کند سبز می‌شد و هیچ
     * نمی‌گفت — همان شکستِ خاموشی که این ابزار برای گرفتنش ساخته شده.
     *
     * حالا فایل در `runs/<id>/downloads/` می‌نشیند و متغیر یک شیء می‌شود:
     * `{path, filename, size}`. رمزگشاییِ متنی فقط با درخواستِ صریح
     * (`as: text`)، چون تنها آنجاست که می‌دانیم متن است.
     *
     * ── چرا فایل نگه داشته می‌شود ──
     *
     * «یافته بدون بازتولید، یافته نیست.» دانلودی که خراب باشد، بدونِ خودِ
     * فایل قابل بررسی نیست — و پلی‌رایت فایل‌های موقت را در پایان اجرا پاک
     * می‌کند.
     */
    case 'download': {
      const wait = page.waitForEvent('download', { timeout: body.timeout ?? 20_000 });
      const { locator } = resolveTarget(page, body.click);
      await locator.click();
      const download = await wait;

      const saved = await ub.store.saveDownload(download.suggestedFilename(), await download.path());
      const info = { ...saved, filename: download.suggestedFilename() };

      if (body.as === 'text') {
        const fs = await import('node:fs/promises');
        const text = await fs.readFile(info.path, 'utf8');
        info.text = body.line !== undefined ? (text.split(/\r?\n/)[body.line]?.trim() ?? '') : text;
      }

      if (body.saveAs) {
        /**
         * ── چرا هنوز رشته است وقتی `as: text` خواسته شده ──
         *
         * سناریوهای موجود `{{vars.code}}` را داخل یک `fill` می‌گذارند. اگر
         * ناگهان شیء می‌شد، همه‌شان `[object Object]` تایپ می‌کردند — و
         * چکِ همگانیِ خودمان آن را روی صفحه پیدا می‌کرد، که خنده‌دار ولی
         * دیر است. پس شکلِ قدیمی برای متن حفظ شد و اطلاعاتِ فایل کنارش
         * می‌آید.
         */
        ctx.vars[body.saveAs] = body.as === 'text' ? info.text : info;
        ctx.vars[body.saveAs + 'Filename'] = info.filename;
        ctx.vars[body.saveAs + 'File'] = info;
      }
      return;
    }

    /**
     * آپلود فایل.
     *
     * دو شکل، چون اپ‌ها هر دو را دارند:
     *
     *   {upload: {to: {label: "انتخاب فایل"}, file: "fixtures/sample.pdf"}}
     *   {upload: {trigger: {role: button, name: "بارگذاری"}, file: "…"}}
     *
     * اولی مستقیم روی `input[type=file]` می‌نشیند. دومی برای رابط‌هایی است
     * که input را پنهان کرده‌اند و دکمهٔ خودشان را نشان می‌دهند — که در
     * اپ‌های امروزی بیشتر از حالت اول است.
     *
     * فایل فقط از `knowledge/<کلید>/fixtures/` می‌آید. دلیلش در
     * `src/knowledge/fixtures.js` نوشته شده: این رشته را ممکن است مدل نوشته
     * باشد.
     */
    case 'upload': {
      const names = [].concat(body.file ?? body.files ?? []);
      if (!names.length) throw new Error('upload بدون `file` معنا ندارد');

      const targetKey = ub.target.key || process.env.UB_TARGET || '';
      const resolved = [];
      for (const name of names) resolved.push(await resolveFixture(targetKey, name));
      const paths = resolved.map((item) => item.file);

      if (body.trigger) {
        const wait = page.waitForEvent('filechooser', { timeout: body.timeout ?? 15_000 });
        const { locator } = resolveTarget(page, body.trigger);
        await locator.click();
        await (await wait).setFiles(paths);
      } else if (body.to) {
        const { locator } = resolveTarget(page, body.to);
        await locator.setInputFiles(paths);
      } else {
        throw new Error('upload باید `to` (خودِ input) یا `trigger` (دکمه) داشته باشد');
      }

      // تا سناریو بتواند بعداً بگوید «همین فایل باید در فهرست دیده شود»
      ctx.vars[body.saveAs || 'uploaded'] = resolved.map((item) => ({
        name: item.relative.split('/').pop(),
        relative: item.relative,
        bytes: item.bytes,
      }));
      return;
    }

    /** شرط: اگر شرط برقرار بود، قدم‌های `then` را اجرا کن. */
    case 'when': {
      const ok = await checkCondition(page, body, ctx);
      if (ok) {
        for (const sub of raw.then || []) {
          const s = normalizeStep(sub);
          await execute({ page, ub, ctx, step: s });
        }
      }
      return;
    }

    case 'expect': {
      const ok = await checkCondition(page, body, ctx);
      expect(ok, `expect نخورد: ${JSON.stringify(body)}`).toBe(true);
      return;
    }

    /** سنجشِ نرم: نخوردنش یافته است، نه شکست. */
    case 'assert': {
      const ok = await checkCondition(page, body, ctx);
      if (!ok) {
        await ub.note({
          message: interpolate(raw.finding || `سنجش نخورد: ${JSON.stringify(body)}`, ctx),
          detail: interpolate(raw.detail || null, ctx),
        });
      }
      return;
    }

    /**
     * درخواست مستقیم به API هدف.
     *
     * ── چرا این هم لازم است ──
     *
     * userbug مرورگر را می‌راند، ولی بخشی از قرارداد سرور را هیچ کاربری از راه
     * UI نمی‌زند: مسیرهای خطای اعتبارسنجی. همان‌هایی که وقتی خراب‌اند، هیچ‌کس
     * تا روزِ بد نمی‌فهمد.
     *
     * از `page.request` می‌رود تا هم‌بستر با نشستِ صفحه باشد — و لاگ سرور هم
     * در همان بازهٔ زمانیِ قدم جمع می‌شود، پس درخواست و خطِ لاگش کنار هم
     * می‌نشینند.
     */
    case 'request': {
      const base = ub.target.apiURL;
      if (!base) throw new Error('هدف `apiURL` ندارد؛ فعل request بدون آن معنا ندارد');

      // خواندن آزاد است، نوشتن فقط روی محیط توسعه. یک اشتباه تایپی در apiURL
      // نباید بتواند روی دادهٔ واقعی کاربران بنویسد.
      assertMayRequest(ub.target, body.method || 'GET', body.path);

      const res = await page.request.fetch(base + body.path, {
        method: body.method || 'GET',
        data: body.json !== undefined ? body.json : undefined,
        headers: { 'content-type': 'application/json', ...(body.headers || {}) },
        failOnStatusCode: false,
      });

      const text = await res.text();
      ctx.vars[body.saveAs || 'res'] = { status: String(res.status()), text };
      return;
    }

    /**
     * قدم به زبان طبیعی — تنها فعلی که ممکن است مدل صدا بزند.
     *
     * «ممکن است» مهم است: اگر کش دارد و امضای صفحه نخورده، هیچ تماسی برقرار
     * نمی‌شود و اجرا بدون کلید هم پیش می‌رود.
     */
    case 'do': {
      const intent = String(body);
      const result = await resolveDo({
        page,
        intent,
        cache: ctx.cache,
        models: ctx.models,
        budget: ctx.budget,
        identity: ctx.identity,
        getEntry,
        putEntry,
        forceModel: ctx.reverify,
      });

      ctx.aiStats[result.source]++;
      if (result.source !== 'cache' || result.learnedSignature) ctx.cacheDirty = true;

      if (persona.actionDelay) await page.waitForTimeout(persona.actionDelay);

      // کش می‌گوید «کجا»، سناریو می‌گوید «چه». اگر مقدار هم کش می‌شد، ایمیلِ
      // اجرای قبلی در فایل می‌ماند و اجرای بعدی با هویت مرده پر می‌شد.
      const withValue =
        raw.value !== undefined ? { ...result.entry, value: interpolate(raw.value, ctx) } : result.entry;

      await performAction(result.locator, withValue, page);
      return;
    }

    /**
     * کاوش آزاد.
     *
     * قدم‌هایش خودشان `ub.step` می‌سازند، پس هر کدام عکس و بازهٔ لاگ سرورِ
     * خودش را دارد و داور روی همه‌شان کار می‌کند — همان چیزی که این حلقه را
     * از سرگرمی جدا می‌کند.
     */
    case 'explore': {
      const goal = typeof body === 'string' ? body : body.goal;

      // همان ترتیبِ پرسونا: `--depth` بر سناریو می‌چربد، تا بشود همان سناریو
      // را یک بار کم‌عمق برای دیدنِ مسیر و یک بار عمیق برای شکار اجرا کرد،
      // بدون دست زدن به فایل.
      const fromFlag = Number(process.env.UB_DEPTH);
      const maxSteps = Number.isInteger(fromFlag) && fromFlag > 0
        ? fromFlag
        : typeof body === 'object'
          ? body.maxSteps
          : undefined;

      // نوشتنِ پیش‌نویس یا از سناریو می‌آید یا از پرچم خط فرمان
      const author = (typeof body === 'object' && body.author) || process.env.UB_AUTHOR === '1';
      await explore({ page, ub, ctx, goal, maxSteps, author, preamble: ctx.executed });
      return;
    }

    case 'note':
      await ub.note({ message: body, detail: interpolate(raw.detail || null, ctx) });
      return;

    default:
      throw new Error(`فعل ناشناخته: «${verb}»`);
  }
}

/**
 * تایپ با سرعتِ پرسونا.
 *
 * `fill` مقدار را یکجا می‌گذارد و هیچ رخداد کیبوردی تولید نمی‌کند — پس هر
 * منطقی که به تایپِ تدریجی وابسته است (debounce، اعتبارسنجی زنده، شمارندهٔ
 * حروف) اصلاً اجرا نمی‌شود. `pro` همان `fill` را می‌خواهد چون هدفش بردنِ
 * مسابقه است؛ `novice` باید واقعاً تایپ کند.
 */
async function typeInto(page, locator, value, persona) {
  if (!persona.typeDelay) return locator.fill(value);
  await locator.fill('');
  await locator.pressSequentially(value, { delay: persona.typeDelay });
}

/**
 * «شرط نخورد» یا «توصیف بد بود»؟
 *
 * ── چرا این تفکیک هستهٔ درستیِ ابزار است ──
 *
 * هر شرطی که نخورد، در `assert` یافته ثبت می‌کند. پس اگر خطای **ابزار** را هم
 * «نخورد» بخوانیم، هر توصیفِ مبهم به یک یافتهٔ قلابی تبدیل می‌شود و به‌نام اپ
 * نوشته می‌شود.
 *
 * یک بار همین اتفاق افتاد: `{text: "همه مطالب"}` در `/list` به سه چیز خورد —
 * آیتم نوار کناری، breadcrumb، و `<title>`. پلی‌رایت strict-mode داد،
 * `.catch(() => false)` قورتش داد، و گزارش گفت «/list چیزی رندر نکرد» در حالی
 * که عکسِ همان قدم صفحهٔ کاملاً سالم را نشان می‌داد. سه یافتهٔ قلابی در یک
 * اجرا.
 *
 * قاعده: تنها **timeout** یعنی شرط نخورد. هر خطای دیگری — تطبیق چندگانه،
 * selector نامعتبر، بسته شدن صفحه — ایرادِ سناریو یا ابزار است و باید بلند
 * بشکند، نه اینکه به حساب اپ نوشته شود.
 */
function conditionFailed(err) {
  const message = String(err?.message || err);
  // پلی‌رایت تطبیقِ چندگانه را گاهی تا پایان timeout تکرار می‌کند و بعد
  // TimeoutError می‌دهد که متنِ strict-mode درونش است. پس فقط به `name` تکیه
  // نمی‌کنیم.
  const ambiguous = message.includes('strict mode violation');
  if (!ambiguous && err?.name === 'TimeoutError') return false;
  throw new Error(
    `توصیفِ هدف در شرط قابل استفاده نبود — این ایرادِ سناریو است، نه اپ: ${err?.message || err}`,
    { cause: err },
  );
}

/**
 * شرط‌ها — همان مجموعه برای `expect` ، `assert` و `when`.
 *
 * یکی بودنشان عمدی است: هر شرطی که بشود انتظار داشت، باید بشود شرطِ اجرا هم
 * باشد و برعکس.
 */
async function checkCondition(page, cond, ctx) {
  const timeout = cond.timeout ?? 10_000;

  if (cond.url !== undefined) {
    try {
      await page.waitForURL(new RegExp(cond.url), { timeout });
      return true;
    } catch (err) {
      return conditionFailed(err);
    }
  }

  if (cond.visible !== undefined) {
    const { locator } = resolveTarget(page, cond.visible);
    return await locator
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(conditionFailed);
  }

  if (cond.hidden !== undefined) {
    const { locator } = resolveTarget(page, cond.hidden);
    return await locator
      .waitFor({ state: 'hidden', timeout })
      .then(() => true)
      .catch(conditionFailed);
  }

  if (cond.enabled !== undefined) {
    const { locator } = resolveTarget(page, cond.enabled);
    return await locator.isEnabled({ timeout }).then(Boolean).catch(conditionFailed);
  }

  if (cond.disabled !== undefined) {
    const { locator } = resolveTarget(page, cond.disabled);
    return await locator.isDisabled({ timeout }).then(Boolean).catch(conditionFailed);
  }

  /**
   * سنجشِ فایلِ دانلودشده.
   *
   * ── چرا این شرط لازم است ──
   *
   * تا دیروز تنها سنجشِ ممکن روی دانلود، مقایسهٔ متنِ فایل بود — که روی
   * باینری بی‌معناست. یعنی «PDF درست ساخته شد» اصلاً بیان‌شدنی نبود، و
   * سناریو مجبور بود به دیدنِ یک پیامِ موفقیت روی صفحه بسنده کند. آن پیام
   * وقتی هم نشان داده می‌شود که فایل صفر بایت باشد.
   *
   *   {expect: {download: {var: "pdf", minSize: 1000, filename: "\\.pdf$"}}}
   */
  if (cond.download !== undefined) {
    const spec = cond.download;
    const info = spec.var ? ctx?.vars?.[spec.var + 'File'] ?? ctx?.vars?.[spec.var] : ctx?.vars?.uploaded;
    if (!info || typeof info !== 'object' || !info.relative) return false;

    if (spec.minSize !== undefined && !(info.size >= spec.minSize)) return false;
    if (spec.maxSize !== undefined && !(info.size <= spec.maxSize)) return false;
    if (spec.filename && !new RegExp(spec.filename).test(String(info.filename || ''))) return false;
    // فایلِ خالی پیش‌فرضاً شکست است: اپی که دکمهٔ دانلود دارد و صفر بایت
    // می‌دهد، از اپی که اصلاً دکمه ندارد بدتر است
    if (spec.allowEmpty !== true && info.empty) return false;
    return true;
  }

  if (cond.equals !== undefined) {
    return String(cond.equals[0]) === String(cond.equals[1]);
  }

  if (cond.matches !== undefined) {
    const [value, pattern] = cond.matches;
    return new RegExp(pattern).test(String(value));
  }

  throw new Error(`شرط نامفهوم: ${JSON.stringify(cond)}`);
}
