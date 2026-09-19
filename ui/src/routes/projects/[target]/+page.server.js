import fs from 'node:fs';
import path from 'node:path';
import { RUNS_DIR, SCENARIOS_DIR } from '$lib/server/paths.js';
import { aggregateTriage } from '$lib/server/artifacts.js';
import { listScenarios } from '$lib/server/projects.js';
import { buildTree, isStale, rebuild } from '../../../../../src/knowledge/capabilities.js';
import { countsByRoute, refreshTouch } from '../../../../../src/runs/touch.js';
import { loadScenario, loadScenarios } from '../../../../../src/scenario/load.js';
import { routesTouchedBy } from '../../../../../src/knowledge/propose.js';
import { normalizeCapabilityRoute } from '../../../../../src/knowledge/capabilities.js';
import { listAccounts } from '../../../../../src/knowledge/credentials.js';
import { readMap } from '../../../../../src/map/store.js';
import { knowledgeDir } from '../../../../../src/knowledge/store.js';

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
  /**
   * درخت وقتی شناخت تازه‌تر شد، خودش را می‌سازد.
   *
   * ── چرا «فقط یک بار، وقتی خالی است» کافی نبود ──
   *
   * دقیقاً پس از یک خزشِ موفق شکست: خزش یازده مودالِ تازه پیدا کرد،
   * این صفحه باز شد، و همان درختِ قدیمی را نشان داد — بی هیچ نشانی از
   * کهنگی. کاربری که نمی‌داند عقب افتاده، دکمهٔ تازه‌سازی را نمی‌زند.
   *
   * حالا شرط «خالی بودن» نیست، «عقب بودن» است — و چون درخت مشتق است،
   * ساختنِ دوباره هیچ حرفِ آدمی را نمی‌برد.
   */
  if (safely(() => isStale(target), false)) safely(() => rebuild(target), null);

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
    /**
     * «از کجا شروع کند» — همان دو چیزی که مودالِ کشف لازم دارد.
     *
     * ── چرا اینجا و نه در خودِ مودال ──
     *
     * مودال کامپوننت است و نباید `knowledge/` را بشناسد؛ همان مرزی که
     * درخت رعایت می‌کند. و هر دو ارزان‌اند: یک `existsSync` و یک فایلِ
     * JSON.
     *
     * ── چرا تا امروز نبود ──
     *
     * جعبهٔ «پیشرفته»ی مودال `profile` را به‌شکلِ یک تیکِ تنها داشت و
     * `remember` را **اصلاً نداشت** — یعنی از درِ پیش‌فرضِ کشف نمی‌شد
     * گفت «با این حساب وارد شو». آن انتخاب فقط در صفحهٔ «خزشِ دقیق» بود.
     */
    accounts: safely(() => listAccounts(target).map((one) => ({ id: one.id, email: one.email })), []),
    /**
     * سناریویی که نقشه با آن وارد شده — پیش‌فرضِ خاموشِ کاوش.
     *
     * ── چرا رابط باید بداند ──
     *
     * `userbug quest` وقتی `--from` ندهی، خودش `map.entry.scenario` را
     * برمی‌دارد و اولش بازپخش می‌کند. یعنی کاوش **از قبل وارد می‌شود** —
     * ولی کشویی رابط گزینهٔ خالی‌اش را «هیچ — از خودِ آدرسِ اول شروع کن»
     * صدا می‌زد، که در این حالت دروغ است.
     *
     * کاربر درست پرسید «چرا اینجا گزینهٔ نشستِ قبلی نیست؟» — و بخشی از
     * جوابش این بود که کارِ معادلش هست و رابط پنهانش کرده.
     */
    mapEntry: safely(() => {
      const scenario = readMap(target)?.entry?.scenario || '';
      return scenario ? scenario.split('/').pop().replace(/.ya?ml$/i, '') : '';
    }, ''),
    hasProfile: safely(() => fs.existsSync(path.join(knowledgeDir(target), 'profile')), false),
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
  const pages = tree.flat.filter((one) => !one.view && !one.shelf && !one.feature);
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
    /**
     * فیچر شمرده می‌شود، ولی نه اینجا.
     *
     * ── چرا عددش در لودر نیست ──
     *
     * «چند فیچرِ حدسی مانده» دقیقاً همان چیزی است که کاربر با هر کلیک
     * عوضش می‌کند. عددی که از لودر بیاید تا رفرشِ بعدی سرِ جایش می‌ماند
     * و بعد از تأییدِ آخری هم «۶ تأیید می‌کنید؟» می‌گوید. پس از درختِ
     * زنده حساب می‌شود، در خودِ صفحه.
     */
    open: findings.filter((one) => (one.triage?.status || 'open') === 'open').length,
  };
}
