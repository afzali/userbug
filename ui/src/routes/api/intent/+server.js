import { json } from '@sveltejs/kit';
import { describeIntent, matchIntent, INTENTS } from '../../../../../src/intent.js';
import { assertModelSlug, loadGlobalConfig, resolveModel } from '../../../../../src/models/config.js';
import { askJson, Budget } from '../../../../../src/models/provider.js';
import { listProjects } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

/**
 * جمله → کاری که می‌شود زد. **نمی‌زند، فقط می‌گوید.**
 *
 * ── چرا اجرا نمی‌کند ──
 *
 * روتری که «بگرد» را اشتباه بخواند، بیست دقیقه خزشِ جهش‌زا روی دادهٔ واقعی
 * راه می‌اندازد. پس این مسیر همیشه یک **پیشنهاد** برمی‌گرداند و اجرا از
 * همان `POST /api/jobs` می‌گذرد که هر جای دیگر — با تأییدِ صریحِ آدم.
 *
 * ── چرا قاعده اول ──
 *
 * همان ترتیبِ `classify.js`. جمله‌های رایج کلیدواژه دارند و صفر فراخوانی
 * می‌گیرند؛ مدل فقط وقتی می‌آید که قاعده هیچ نگفت.
 */
const SYSTEM = `کاربر یک جمله به فارسی می‌نویسد و تو می‌گویی کدام کار را می‌خواهد.

خروجی فقط JSON: {"id": "...", "goal": "...", "focus": "..."}

کارهای ممکن:
- run: سناریوهای موجود را اجرا کن («تست‌ها را بگیر»)
- quest: یک چیزِ مشخص را بررسی کن؛ "goal" را از جملهٔ کاربر بردار
- crawl: کلِ اپ را خودکار بگرد و نقشه بساز؛ "focus" اگر جایی را نام برد
- tour: کاربر می‌خواهد خودش زنده در اپ بگردد و ابزار تماشا کند
- triage: می‌خواهد یافته‌ها و ایرادهای قبلی را ببیند

اگر هیچ‌کدام نبود، "id" را خالی بگذار. حدسِ بی‌پایه نزن.`;

export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();

    const target = String(body?.target ?? '').trim();
    const projects = await listProjects();
    const project = projects.find((item) => item.key === target);
    if (!project) throw new Error('هدف نامعتبر است');

    const text = String(body?.text ?? '').trim();
    if (text.length < 2) throw new Error('یک جمله بنویسید');

    /* ── قاعده اول: صفر فراخوانی ── */
    const scenarios = (project.scenarios || []).filter((item) => item.executable);
    let match = matchIntent(text, { scenarios });
    let by = 'rule';
    /**
     * اگر مدل هم نفهمید، **چه گفت** برمی‌گردد.
     *
     * «نفهمیدم» بی دلیل، همان شکستِ خاموش است با لباسِ مؤدب: نه کاربر
     * می‌فهمد جمله‌اش کجا لنگید، نه ما می‌فهمیم prompt کجا کم دارد.
     */
    let modelSaid = '';

    /* ── و مدل، فقط اگر قاعده هیچ نگفت ── */
    if (!match) {
      const models = resolveModel({
        global: await loadGlobalConfig(),
        role: 'author',
        model: body?.model ? assertModelSlug(String(body.model)) : undefined,
      });

      const { json: guess } = await askJson(
        models,
        { system: SYSTEM, user: text },
        new Budget(models.budgetPerRun)
      );

      modelSaid = guess?.id ? `مدل گفت «${guess.id}» که کارِ شناخته‌شده‌ای نیست` : 'مدل هم چیزی نفهمید';
      const intent = INTENTS.find((item) => item.id === guess?.id);
      if (intent) {
        by = 'model';
        match = {
          intent,
          args: {
            ...(intent.id === 'quest' ? { goal: String(guess?.goal || text).trim() } : {}),
            ...(intent.id === 'crawl' && guess?.focus ? { focus: String(guess.focus).trim() } : {}),
          },
          why: 'قاعده‌ای نخورد، مدل گفت',
          // پیشنهادِ مدل هرگز «مطمئن» نیست: رابط باید گزینه‌های دیگر را هم بدهد
          confidence: 'low',
          alternatives: INTENTS.filter((item) => item.id !== intent.id).slice(0, 2),
        };
      }
    }

    if (!match) {
      return json({
        understood: false,
        why: modelSaid,
        // فهرستِ کارها برمی‌گردد تا «نفهمیدم» بن‌بست نباشد
        options: INTENTS.map((item) => ({ id: item.id, label: item.label })),
      });
    }

    return json({
      understood: true,
      by,
      confidence: match.confidence,
      why: match.why,
      plan: describeIntent(match, { target }),
      alternatives: (match.alternatives || []).map((item) => ({ id: item.id, label: item.label })),
    });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
