import path from 'node:path';
import { RUNS_DIR, SCENARIOS_DIR } from '$lib/server/paths.js';
import { aggregateTriage } from '$lib/server/artifacts.js';
import { listScenarios } from '$lib/server/projects.js';
import { buildTree, readCapabilities, rebuild } from '../../../../../src/knowledge/capabilities.js';
import { countsByRoute, refreshTouch } from '../../../../../src/runs/touch.js';
import { loadScenario, loadScenarios } from '../../../../../src/scenario/load.js';
import { routesTouchedBy } from '../../../../../src/knowledge/propose.js';
import { normalizeCapabilityRoute } from '../../../../../src/knowledge/capabilities.js';

/**
 * «اپِ من» — خانهٔ تازهٔ هر پروژه.
 *
 * ── چرا این صفحه جای فرمِ اجرا را گرفت ──
 *
 * خانهٔ قبلی «اجرا» بود: یک فرمِ بیست‌کنترلی از سناریو و دستگاه و پرسونا و
 * مدل. آن فرم، پیکربندیِ **ابزار** است — و وسطِ خانه نشستنش یعنی اولین
 * چیزی که کاربر هر روز می‌بیند، تنظیماتِ ماشین است نه وضعیتِ اپِ خودش.
 *
 * پرسشی که آدم صبح با آن می‌آید این است: «سایتم چه دارد، کدامش را فراموش
 * کرده‌ام، کجا شکست؟» — و تا امروز هیچ صفحه‌ای این را نمی‌پرسید. فرمِ اجرا
 * نرفته؛ به «بررسی» رفته، که همان جایی است که معنا دارد.
 *
 * ── چرا هر سه شمارش اینجا جمع می‌شوند ──
 *
 * درخت بی عدد فقط یک فهرست است. و عددها از سه جای متفاوت می‌آیند که
 * هیچ‌کدام از دیگری خبر ندارد: شاخصِ لمس (سناریو و اجرا)، ادغامِ تریاژ
 * (یافته)، و خودِ شناخت (کنش و قرارداد). چسباندنشان در یک جا انجام
 * می‌شود، وگرنه هر صفحه‌ای تعریفِ خودش از «چند تا» پیدا می‌کند.
 */
export async function load({ params }) {
  const target = params.target;

  const safely = (fn, fallback) => {
    try {
      return fn() ?? fallback;
    } catch {
      return fallback;
    }
  };

  /**
   * درخت خودش را می‌سازد، اگر هنوز ساخته نشده.
   *
   * ── چرا اینجا و نه با یک دکمه ──
   *
   * پروژه‌هایی که از قبل گشت و خزش دارند نباید برای دیدنِ درخت کاری بکنند:
   * صفحه‌ای که بگوید «اول دکمهٔ بساز را بزن» در حالی که همهٔ داده‌اش روی
   * دیسک است، فقط یک کلیکِ تشریفاتی است.
   *
   * ولی فقط **یک بار**. ساختنِ دوباره `map.json` و همهٔ صفحه‌ها را می‌خواند
   * و فایل می‌نویسد؛ انجامش در هر بار باز شدنِ صفحه، همان کُندیِ بی‌دلیلی
   * است که رابط را بی‌فایده می‌کند. تازه‌سازی دکمهٔ خودش را دارد.
   */
  if (!safely(() => readCapabilities(target).nodes.length, 0)) safely(() => rebuild(target), null);

  const findings = await aggregateTriage(target).catch(() => []);
  const index = safely(() => refreshTouch(target, RUNS_DIR), { routes: {} });
  const counts = countsByRoute(index, findings);
  await addDrafts(target, counts);

  const tree = safely(() => buildTree(target, { counts }), { roots: [], flat: [] });

  return {
    tree,
    /**
     * سناریوهای موجود، برای دکمهٔ «اجرا» روی هر گره.
     *
     * فقط نام و اجراشدنی بودن لازم است؛ ریختنِ کلِ سناریو در payload یعنی
     * هر بار باز شدنِ صفحه، چند ده کیلوبایتِ بی‌مصرف.
     */
    scenarios: safely(
      () =>
        loadScenarios(target).map((one) => ({
          name: one.name,
          status: one.status,
          executable: one.status !== 'draft' || true,
        })),
      []
    ),
    ...summary(tree, findings),
  };
}

/**
 * سناریوهایی که هنوز اجرا نشده‌اند — پیش‌نویس و رسمی.
 *
 * ── چرا لازم شد ──
 *
 * با ساختنِ یک پروژهٔ تازه، کلِ حلقه را رفتم: قابلیت ← زاویه ← «بساز» ←
 * مدل YAML ساخت ← ذخیره شد. بعد برگشتم و **هیچ‌جا هیچ تغییری نبود**:
 * درخت همان «۱۰ بخش بی‌سناریو» را می‌گفت.
 *
 * علتش این بود که شاخصِ لمس از **اجراها** ساخته می‌شود، و سناریویی که
 * هنوز یک بار هم اجرا نشده اجرایی ندارد. درست، ولی از نگاهِ کاربر یعنی
 * همه‌چیز را درست کردی و صفر بازخورد گرفتی.
 *
 * ── چرا از `go:` و نه از اجرا ──
 *
 * تنها چیزی که دربارهٔ یک سناریوی نیازموده می‌دانیم، **ادعای** خودش است:
 * `go: /login`. این با «واقعاً آنجا رفت» فرق دارد و همان‌طور هم نشان
 * داده می‌شود — `planned`، نه `scenarios`. سناریویی که اتفاقی از صفحه‌ای
 * رد شود آن صفحه را نیازموده، و سناریویی که هنوز نرفته هم نیازموده.
 */
async function addDrafts(target, counts) {
  let files = [];
  try {
    files = await listScenarios(target);
  } catch {
    return;
  }

  for (const file of files) {
    let scenario = null;
    try {
      scenario = loadScenario(path.join(SCENARIOS_DIR, target, file.path));
    } catch {
      /** فایلِ خراب یا `.spec.js`؛ بقیه هنوز معنا دارند. */
      continue;
    }

    for (const raw of routesTouchedBy(scenario)) {
      const route = normalizeCapabilityRoute(raw);
      if (!route) continue;
      const row = (counts[route] ||= {
        scenarios: [],
        runs: 0,
        visits: 0,
        firstAt: '',
        lastAt: '',
        findings: 0,
        openFindings: 0,
      });
      (row.planned ||= []).push({
        name: scenario.name,
        path: file.path,
        /** پیش‌نویس اجرا نمی‌شود تا رسمی شود — و کاربر باید همین را ببیند. */
        draft: scenario.status === 'draft',
      });
    }
  }
}

/**
 * سه عددِ بالای صفحه — و یکی‌شان چیزی است که کاربر هنوز نمی‌داند باید بپرسد.
 *
 * «چند قابلیت هیچ سناریویی ندارد» همان پرسشِ «چه چیزی را فراموش کرده‌ام»
 * است، فقط با عدد. تا وقتی دیده نشود، کسی نمی‌پرسدش.
 */
function summary(tree, findings) {
  /**
   * فقط صفحه‌ها، نه نماها.
   *
   * نما شمارشِ سناریو **ندارد** (رخدادِ اجرا نما را نمی‌شناسد)، پس همه‌شان
   * «بی‌سناریو» حساب می‌شدند و عدد را باد می‌کردند تا جایی که بی‌معنا شود.
   * آنچه دربارهٔ یک نما می‌دانیم `tried/actions` است و جای خودش را دارد.
   */
  const pages = tree.flat.filter((one) => !one.view && !one.shelf);
  const views = tree.flat.filter((one) => one.view);

  return {
    total: tree.flat.length,
    pages: pages.length,
    /**
     * «بی‌سناریو» یعنی هیچ سناریویی — نه اجراشده، نه نوشته‌شده.
     *
     * پیش‌نویسی که همین حالا ساخته‌ای هنوز اجرا نشده، ولی دیگر «فراموش
     * شده» نیست. اگر در این عدد بماند، کاربر کارِ خودش را انجام می‌دهد و
     * صفحه همان عدد را می‌گوید — همان بی‌بازخوردی که با `nepi4` دیدیم.
     */
    blind: pages.filter((one) => !one.counts.scenarios.length && !one.counts.planned.length).length,
    /** سناریوی نوشته‌شده‌ای که هنوز یک بار هم اجرا نشده. */
    planned: pages.filter((one) => !one.counts.scenarios.length && one.counts.planned.length).length,
    /** نمایی که خزش هیچ‌یک از کنش‌هایش را نزده: در عمل هرگز باز نشده. */
    untried: views.filter((one) => one.actions && !one.tried).length,
    open: findings.filter((one) => (one.triage?.status || 'open') === 'open').length,
  };
}
