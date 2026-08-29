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

const NEEDS_AI = new Set(['do', 'explore', 'goal']);

export async function runScenario({ page, ub, identity, scenario }) {
  const ctx = {
    identity: { ...identity, local: identity.email.split('@')[0] },
    nasty: NASTY,
    vars: {},
  };

  for (const group of groupSteps(scenario.steps)) {
    await ub.step(group.title, async () => {
      for (const step of group.steps) await execute({ page, ub, ctx, step });
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
  const verb = keys.find((k) => !['detail', 'finding', 'else', 'then', 'value', 'timeout'].includes(k));
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

  switch (verb) {
    case 'go':
      await page.goto(body);
      return;

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
      return;

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
        return void (await locator.fill(String(interpolate(raw.value, ctx))));
      }
      for (const [label, value] of Object.entries(body)) {
        const { locator } = resolveTarget(page, { label });
        await locator.fill(String(value));
      }
      return;
    }

    case 'press':
      return void (await page.keyboard.press(body));

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

    case 'note':
      await ub.note({ message: body, detail: interpolate(raw.detail || null, ctx) });
      return;

    default:
      throw new Error(`فعل ناشناخته: «${verb}»`);
  }
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
