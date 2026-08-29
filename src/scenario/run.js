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
import { assertMayRequest } from '../guard.js';
import { resolvePersona } from '../personas.js';
import { loadGlobalConfig, resolveModel } from '../models/config.js';
import { Budget } from '../models/provider.js';
import { loadCache, saveCache, getEntry, putEntry, shouldReverify } from '../steps/cache.js';
import { resolveDo, performAction } from '../steps/do.js';
import { explore } from '../steps/explore.js';
import { getCurrentRun } from '../store/run-store.js';
import { writeRepros } from '../repro.js';

const NEEDS_AI = new Set(['goal']);

export async function runScenario({ page, ub, identity, scenario }) {
  // ترتیب: پرچم خط فرمان بر سناریو می‌چربد، تا بشود همان سناریو را با پرسونای
  // دیگری اجرا کرد و تفاوت رفتار اپ را دید.
  const persona = resolvePersona(process.env.UB_PERSONA || scenario.persona || 'novice');

  const globalConfig = await loadGlobalConfig();
  const models = resolveModel({ global: globalConfig, target: ub.target, role: 'resolve' });

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

  if (ctx.cacheDirty) saveCache(ub.target.key, scenario.id, ctx.cache);

  // «یافته بدون بازتولید، یافته نیست» — قانون سوم پروژه. تا امروز فقط شعار
  // بود؛ حالا برای هر یافته یک فایل اجراپذیر ساخته می‌شود.
  await writeRepros({ ub, scenario, ctx });

  // آمار در گزارش می‌نشیند: اگر نسبت «مدل» به «کش» بالا بماند، یعنی یا کش
  // کار نمی‌کند یا رابط مدام عوض می‌شود — هر دو ارزش دانستن دارند.
  if (ctx.aiStats.cache + ctx.aiStats.model + ctx.aiStats.healed > 0) {
    await ub.store.appendEvent({
      kind: 'ai',
      scenario: scenario.name,
      ...ctx.aiStats,
      budget: ctx.budget.snapshot(),
    });
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
  const keys = Object.keys(raw).filter((k) => k !== 'as');
  const verb = keys.find((k) => !['detail', 'finding', 'else', 'then', 'value', 'timeout', 'delay'].includes(k));
  if (!verb) throw new Error(`قدم بدون فعل: ${JSON.stringify(raw)}`);
  if (NEEDS_AI.has(verb)) {
    throw new Error(`فعل «${verb}» به فاز ۲ (AI) نیاز دارد و در این نسخه پشتیبانی نمی‌شود`);
  }
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
     * حلقه روی مجموعه‌ای از مقدارها.
     *
     * برای سنجیدن دادهٔ بدخیم لازم است: همان چند قدم با ده رشتهٔ متفاوت. بدون
     * آن یا سناریو ده برابر می‌شد یا فقط یک نمونه را می‌آزمودیم.
     */
    case 'forEach': {
      const { var: name, in: values } = body;
      for (const value of values) {
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

    /** دانلود فایل و ریختن محتوایش در یک متغیر. */
    case 'download': {
      const wait = page.waitForEvent('download', { timeout: body.timeout ?? 20_000 });
      const { locator } = resolveTarget(page, body.click);
      await locator.click();
      const download = await wait;
      const fs = await import('node:fs/promises');
      const text = await fs.readFile(await download.path(), 'utf8');
      if (body.saveAs) {
        ctx.vars[body.saveAs] = text;
        ctx.vars[body.saveAs + 'Filename'] = download.suggestedFilename();
        if (body.line !== undefined) ctx.vars[body.saveAs] = text.split(/\r?\n/)[body.line]?.trim() ?? '';
      }
      return;
    }

    /** شرط: اگر شرط برقرار بود، قدم‌های `then` را اجرا کن. */
    case 'when': {
      const ok = await checkCondition(page, body);
      if (ok) {
        for (const sub of raw.then || []) {
          const s = normalizeStep(sub);
          await execute({ page, ub, ctx, step: s });
        }
      }
      return;
    }

    case 'expect': {
      const ok = await checkCondition(page, body);
      expect(ok, `expect نخورد: ${JSON.stringify(body)}`).toBe(true);
      return;
    }

    /** سنجشِ نرم: نخوردنش یافته است، نه شکست. */
    case 'assert': {
      const ok = await checkCondition(page, body);
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
      const maxSteps = typeof body === 'object' ? body.maxSteps : undefined;
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
 * شرط‌ها — همان مجموعه برای `expect` ، `assert` و `when`.
 *
 * یکی بودنشان عمدی است: هر شرطی که بشود انتظار داشت، باید بشود شرطِ اجرا هم
 * باشد و برعکس.
 */
async function checkCondition(page, cond) {
  const timeout = cond.timeout ?? 10_000;

  if (cond.url !== undefined) {
    try {
      await page.waitForURL(new RegExp(cond.url), { timeout });
      return true;
    } catch {
      return false;
    }
  }

  if (cond.visible !== undefined) {
    const { locator } = resolveTarget(page, cond.visible);
    return await locator
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  if (cond.hidden !== undefined) {
    const { locator } = resolveTarget(page, cond.hidden);
    return await locator
      .waitFor({ state: 'hidden', timeout })
      .then(() => true)
      .catch(() => false);
  }

  if (cond.enabled !== undefined) {
    const { locator } = resolveTarget(page, cond.enabled);
    return await locator.isEnabled().catch(() => false);
  }

  if (cond.disabled !== undefined) {
    const { locator } = resolveTarget(page, cond.disabled);
    return await locator.isDisabled().catch(() => false);
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
