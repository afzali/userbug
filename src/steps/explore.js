/**
 * کاوش آزاد — «تست بدون سناریو».
 *
 * ── این چه چیزی پیدا می‌کند و چه چیزی نه ──
 *
 * کاوشگر در کلیک کردن خوب است و در دانستنِ «چه چیزی باید می‌شد» بد. پس این
 * حلقه **باگ منطقی پیدا نمی‌کند**. کاری که می‌کند این است: مسیرهایی را طی
 * می‌کند که هیچ سناریویی ننوشته، و داورِ خودکار در پس‌زمینه هر کرش، هر خطای
 * کلاینت، هر ۵۰۰ و هر خطِ لاگ سرور را می‌گیرد.
 *
 * یعنی ارزشش در مدل نیست، در داور است. مدل فقط جایی می‌رود که ما نرفته‌ایم.
 *
 * ── چرا اینجا پنجره‌ها بسته نمی‌شوند ──
 *
 * در سناریوهای معمولی، پنجره‌ای که سرِ راه باز باشد مزاحم است و ثبت می‌شود.
 * در کاوش برعکس است: کاوشگر **خودش** آن را باز کرده و درونش همان جایی است که
 * باید بگردد. بستنش هم کاوش را کم‌عمق می‌کند هم گزارش را از یافته‌های قلابی
 * پر — نخستین اجرا سه «مزاحم» ثبت کرد که هر سه پنجره‌های خواسته‌شده بودند.
 *
 * ── چرا کنشِ ناموفق کاوش را نمی‌کشد ──
 *
 * کلیکی که timeout بخورد در سناریوی معمولی یعنی شکست. در کاوش یعنی «این در
 * بسته بود، سراغ در بعدی». مردنِ کاوش در قدم هشتم از ده، کلِ اجرا را هدر
 * می‌دهد و چیزی هم اثبات نمی‌کند. پس ثبت می‌شود و حلقه ادامه می‌دهد — و
 * مدل در تاریخچه می‌بیند که آنجا بن‌بست بود.
 *
 * ── چرا فهرست «ممنوع» لازم است ──
 *
 * عاملی که آزاد بگردد، دیر یا زود «خروج» یا «ریست کامل دیتابیس» را می‌زند و
 * بقیهٔ کاوش روی صفحهٔ ورود می‌گذرد. این کشفِ باگ نیست، خودزنی است. پس
 * عناصرِ ممنوع اصلاً به مدل نشان داده نمی‌شوند.
 */
import { snapshotPage, descriptorFor } from './snapshot.js';
import { resolveTarget } from '../scenario/resolve.js';
import { redactDeep, secretsOf } from '../models/redact.js';
import { askJson } from '../models/provider.js';
import { writeDraft } from './author.js';

const SYSTEM = `تو یک تسترِ انسانی را شبیه‌سازی می‌کنی که با یک اپ کار می‌کند.

ورودی: هدفِ کاوش، کارهایی که تا حالا کرده‌ای، و فهرست عناصرِ صفحهٔ فعلی
(هر کدام با شمارهٔ «ref»).

خروجی: فقط JSON، بدون توضیح و بدون حصار markdown.

قالب:
{"action":"click"|"fill"|"check"|"press"|"done","ref":<شماره>,"value":"...","why":"..."}

قواعد:
- «ref» باید یکی از شماره‌های همان فهرست باشد.
- کارِ تکراری نکن؛ به جای تازه برو.
- «value» فقط برای fill و press.
- وقتی هدف برآورده شد یا جای تازه‌ای نمانده: {"action":"done","why":"..."}`;

/**
 * @param {object} o
 * @param {number} [o.maxSteps] سقف قدم — بدون آن کاوش تا timeout ادامه می‌دهد
 */
export async function explore({ page, ub, ctx, goal, maxSteps = 12, author = false, preamble = [] }) {
  const avoid = (ub.target.explore?.avoid || []).map((r) => new RegExp(r, 'i'));
  const history = [];

  for (let i = 0; i < maxSteps; i++) {
    const snapshot = await snapshotPage(page);

    // عناصرِ ممنوع اصلاً به مدل نمی‌رسند — نه اینکه بعداً ردشان کنیم
    const items = snapshot.items.filter(
      (it) => !avoid.some((rx) => rx.test(`${it.name || ''} ${it.label || ''}`))
    );

    if (!items.length) {
      history.push({ step: i, action: 'done', why: 'عنصر قابل کاوشی نماند' });
      break;
    }

    const safe = redactDeep({ ...snapshot, items }, secretsOf(ctx.identity));

    const { json } = await askJson(
      ctx.models,
      {
        system: SYSTEM,
        user:
          `هدف کاوش: ${goal}\n\n` +
          `کارهای انجام‌شده تا حالا:\n${history.map((h) => `- ${h.why || h.action}`).join('\n') || '(هیچ)'}\n\n` +
          `صفحهٔ فعلی:\n${JSON.stringify(safe, null, 1)}`,
      },
      ctx.budget
    );

    if (json.action === 'done') {
      history.push({ step: i, action: 'done', why: json.why });
      break;
    }

    const item = items.find((it) => it.ref === Number(json.ref));
    if (!item) {
      // ref نامعتبر یعنی مدل گم شده؛ ادامه دادن فقط پول می‌سوزاند
      history.push({ step: i, action: 'invalid', why: `ref نامعتبر: ${json.ref}` });
      break;
    }

    // رفعِ ابهام باید روی فهرستِ کامل باشد، نه فهرستِ فیلترشده:
    // locator عناصرِ ممنوع را هم می‌بیند.
    const target = descriptorFor(item, snapshot.items);
    const label = json.why || `${json.action} روی «${item.name || item.label || item.testid}»`;

    let failure = null;

    await ub.step(`کاوش ${i + 1}: ${label}`.slice(0, 80), async () => {
      const { locator } = resolveTarget(page, target);
      if (ctx.persona.actionDelay) await page.waitForTimeout(ctx.persona.actionDelay);

      try {
        switch (json.action) {
          case 'click':
            await locator.click({ timeout: 8000 });
            break;
          case 'fill':
            await locator.fill(String(json.value ?? ''), { timeout: 8000 });
            break;
          case 'check':
            await locator.check({ timeout: 8000 });
            break;
          case 'press':
            await page.keyboard.press(String(json.value ?? 'Enter'));
            break;
          default:
            throw new Error(`کنشِ ناشناخته در کاوش: ${json.action}`);
        }
      } catch (e) {
        failure = String(e.message).replace(/\s+/g, ' ').slice(0, 140);
      }

      await page.waitForTimeout(600);
    });

    const record = {
      step: i,
      action: json.action,
      target,
      // مقدار برای نوشتنِ پیش‌نویس لازم است، وگرنه fillها بی‌مقدار در می‌آیند
      ...(json.value !== undefined ? { value: String(json.value) } : {}),
      why: json.why,
      ...(failure ? { failed: failure } : {}),
    };
    history.push(record);

    /**
     * هر قدم همان لحظه نوشته می‌شود، نه در پایان.
     *
     * نخستین کاوش هشت قدمِ معنادار رفت و بعد سناریو timeout خورد — و چون
     * تاریخچه فقط در پایان نوشته می‌شد، هیچ‌کدام نماند. همان درسی که در
     * گزارشگر گرفتیم: چیزی که فقط در مسیرِ خوش‌فرجام نوشته شود، دقیقاً وقتی
     * لازم است که نیست.
     */
    await ub.store.appendEvent({ kind: 'explore-step', goal, ...record });
  }

  await ub.store.appendEvent({ kind: 'explore', goal, steps: history.length, history });

  if (author) {
    const slug = `explore-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
    const draft = writeDraft({ targetName: ub.target.key, goal, preamble, history, slug });
    if (draft) {
      console.log(`    پیش‌نویس نوشته شد: ${draft.file} (${draft.steps} قدم)`);
      await ub.store.appendEvent({ kind: 'draft', goal, file: draft.file, steps: draft.steps });
    }
  }

  return history;
}
