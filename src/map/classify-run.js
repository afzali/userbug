/**
 * اجرای فاز ۲ روی یک نقشه.
 *
 * جدا از `classify.js` است چون آن یکی **خالص** است و آزمودنی؛ این یکی سورس
 * می‌خواند، مدل صدا می‌زند، و روی دیسک می‌نویسد.
 *
 * ترتیب عمدی است: قاعده اول، مدل بعد، و مدل فقط باقی‌مانده را می‌بیند. گرهی
 * که همهٔ کنش‌هایش با قاعده حل شوند، **صفر فراخوانی** می‌گیرد.
 */
import { Budget, askJson } from '../models/provider.js';
import { redactDeep } from '../models/redact.js';
import { KINDS, applyVerdicts, hashSource, loadCorpus, needsClassify, ruleVerdict, sourceFor } from './classify.js';
import { readMap, writeMap } from './store.js';

const SYSTEM = `تو یک مهندسِ نرم‌افزاری که کدِ یک اپِ وب را می‌خواند و می‌گوید هر دکمه چه می‌کند.

خروجی: فقط JSON، بدون توضیح و بدون حصار markdown.

قالب:
{"actions":[{"key":"<همان کلید>","kind":"nav|mutate|destructive|inert|unknown","predicted":"/مسیر یا خالی","why":"کوتاه"}]}

معنی هر kind:
- nav: فقط جای دیگری می‌برد؛ چیزی را عوض نمی‌کند
- mutate: داده‌ای را می‌سازد یا عوض می‌کند (درخواستِ POST/PUT/PATCH)
- destructive: چیزی را برمی‌دارد یا نشست را می‌بندد؛ برگشت‌ناپذیر
- inert: هیچ اثری ندارد (برچسب، عنوان، چیزی که فقط نشان می‌دهد)
- unknown: از روی این کد نمی‌شود فهمید

قواعد:
- «key» را عیناً از ورودی بردار؛ چیزی اختراع نکن.
- «predicted» فقط وقتی که مسیرِ مقصد در کد دیده می‌شود.
- اگر مطمئن نیستی «unknown» بگو. حدسِ اشتباه از «نمی‌دانم» بدتر است.`;

/**
 * @param {object} o
 * @param {string} o.target کلید پروژه
 * @param {object[]} o.roots خروجی `resolveSourceRoots`
 * @param {object} o.models خروجی `resolveModel({role:'analyze'})`
 * @param {boolean} [o.force] حتی گره‌هایی که مهرشان می‌خورد
 * @param {(event: object) => void} [o.onState] برای گزارشِ زنده
 */
export async function classifyMap({ target, roots, models, force = false, onState }) {
  const map = readMap(target);
  const budget = new Budget(models?.budgetPerRun);
  const stats = { states: 0, skipped: 0, byRule: 0, byModel: 0, calls: 0, failed: 0 };

  /**
   * پیکرهٔ سورس یک بار، نه به ازای هر گره.
   *
   * تطبیقِ برچسب با سورس جست‌وجوی دقیق است: یا آن رشته در فایلی هست یا
   * نیست. نسخهٔ اول به چهار فایلِ برترِ هر گره تکیه می‌کرد و از ۳۵۵ کنش فقط
   * **یکی** را با قاعده حل کرد.
   */
  const corpus = await loadCorpus(roots);

  for (const state of map.states || []) {
    const actions = (state.actions || []).filter((action) => action.kind !== 'noise' && action.by !== 'user');
    if (!actions.length) continue;

    const labels = actions.map((action) => action.label).filter(Boolean);
    const { files, snippets } = await sourceFor({ roots, labels }).catch(() => ({ files: [], snippets: '' }));
    const stamp = hashSource(files);

    if (!force && !needsClassify(state, stamp)) {
      stats.skipped++;
      continue;
    }
    stats.states++;

    /* ── قاعده اول ── */
    const verdicts = {};
    for (const action of actions) {
      const verdict = ruleVerdict(action.label, corpus);
      if (verdict) verdicts[action.key] = verdict;
    }
    stats.byRule += applyVerdicts(state, verdicts, { by: 'source' });

    /* ── و مدل، فقط برای آنچه ماند ── */
    const left = actions.filter((action) => !verdicts[action.key]);
    let modelVerdicts = {};
    if (left.length && models) {
      try {
        modelVerdicts = await askModel({ state, actions: left, snippets, models, budget });
        stats.calls++;
        stats.byModel += applyVerdicts(state, modelVerdicts, { by: 'model' });
      } catch (cause) {
        stats.failed++;
        onState?.({ state, error: cause.message });
      }
    }

    state.classified = {
      at: new Date().toISOString(),
      profile: state.profile,
      sourceHash: stamp,
      files: files.map((file) => file.relative),
      model: left.length ? `${models?.provider}:${models?.model}` : '',
    };

    onState?.({
      state,
      rules: Object.keys(verdicts).length,
      model: Object.keys(modelVerdicts).length,
      left: left.length,
    });

    // هر گره همان لحظه نوشته می‌شود: طبقه‌بندیِ ده‌گره‌ای که وسطش بشکند نباید
    // همه‌چیز را ببرد — همان درسِ خزش
    await writeMap(target, map);
  }

  return { map, stats, spent: budget.spent, calls: budget.calls };
}

async function askModel({ state, actions, snippets, models, budget }) {
  const safe = redactDeep(
    actions.map((action) => ({ key: action.key, label: action.label, role: action.role })),
    []
  );

  const { json } = await askJson(
    models,
    {
      system: SYSTEM,
      user:
        `صفحه: ${state.route}${state.view ? ` ▸ ${state.view}` : ''}\n\n` +
        `کنش‌ها:\n${JSON.stringify(safe, null, 1)}\n\n` +
        (snippets ? `تکه‌های مرتبطِ سورس:\n${snippets}` : '(سورسِ مرتبطی پیدا نشد)'),
    },
    budget
  );

  const out = {};
  for (const row of json?.actions || []) {
    if (!row?.key || !KINDS.includes(row.kind)) continue;
    out[row.key] = {
      kind: row.kind,
      predicted: typeof row.predicted === 'string' && row.predicted.startsWith('/') ? row.predicted : '',
      why: row.why,
    };
  }
  return out;
}
