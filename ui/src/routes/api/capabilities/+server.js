import { json } from '@sveltejs/kit';
import { RUNS_DIR } from '$lib/server/paths.js';
import { aggregateTriage } from '$lib/server/artifacts.js';
import { listProjects } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';
import { STATUS, buildTree, rebuild, setEdit } from '../../../../../src/knowledge/capabilities.js';
import { anglesFor } from '../../../../../src/knowledge/angles.js';
import { countsByRoute, refreshTouch } from '../../../../../src/runs/touch.js';

/**
 * درختِ قابلیت‌ها — ساختنِ دوباره، و حرفِ آدم.
 *
 * ── چرا یک در برای دو کار ──
 *
 * هر دو یک چیز را برمی‌گردانند: درختِ تازه. اگر ویرایش درِ جدا داشت، رابط
 * باید بعد از هر ذخیره خودش دوباره می‌خواند — و همان‌جاست که روزی یکی از
 * دو مسیر `refreshTouch` را فراموش می‌کند و عددها عقب می‌مانند.
 *
 * ── و چرا `rebuild` پیش‌فرض نیست ──
 *
 * `map.json` و همهٔ صفحه‌ها را می‌خواند و فایل می‌نویسد. ویرایشِ یک عنوان
 * نباید کلِ استخراج را راه بیندازد؛ و برعکس، کسی که «تازه‌سازی» می‌زند
 * دقیقاً همین را می‌خواهد.
 */
async function treeOf(target, findings) {
  const index = refreshTouch(target, RUNS_DIR);
  return buildTree(target, { counts: countsByRoute(index, findings) });
}

async function assertTarget(value) {
  const target = String(value ?? '').trim();
  const projects = await listProjects();
  if (!projects.some((item) => item.key === target)) throw new Error('هدف نامعتبر است');
  return target;
}

export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();
    const target = await assertTarget(body?.target);
    const action = String(body?.action ?? '').trim();

    if (action === 'rebuild') {
      rebuild(target);
      return json({ target, ...(await treeOf(target, await aggregateTriage(target).catch(() => []))) });
    }

    if (action === 'edit') {
      const id = String(body?.id ?? '').trim();
      if (!id) throw new Error('شناسهٔ قابلیت لازم است');

      /**
       * فقط همان چهار فیلد، و `status` فقط از فهرستِ مجاز.
       *
       * این فایل حرفِ کاربر را `by: user` ثبت می‌کند و هیچ حلقهٔ خودکاری
       * بعداً عوضش نمی‌کند — پس هرچه از اینجا رد شود تا ابد می‌ماند. دری
       * که شکلِ گره را هم بپذیرد، روزی یک گرهِ خراب می‌سازد که هیچ
       * استخراجی درستش نمی‌کند.
       */
      const patch = {};
      if ('title' in body) patch.title = body.title;
      if ('desc' in body) patch.desc = body.desc;
      if ('parent' in body) patch.parent = body.parent;
      if ('status' in body) {
        if (!STATUS.includes(body.status)) throw new Error('وضعیت نامعتبر است');
        patch.status = body.status;
      }
      if (!Object.keys(patch).length) throw new Error('چیزی برای ذخیره نیست');

      setEdit(target, id, patch);
      return json({ target, ...(await treeOf(target, await aggregateTriage(target).catch(() => []))) });
    }

    /**
     * زاویه‌های آزمونِ یک قابلیت — و چرا فقط با درخواستِ صریح.
     *
     * ── چرا در لودرِ صفحه حساب نمی‌شود ──
     *
     * هر زاویه `map.json` را می‌خواند و والدِ هر حالت را پیدا می‌کند.
     * انجامش برای **هر** گرهِ درخت، در هر بار باز شدنِ صفحه، یعنی خواندنِ
     * چند مگابایت برای چیزی که کاربر شاید به یکی‌اش نگاه کند.
     *
     * پس با کلیک روی گره می‌آید — همان لحظه‌ای که واقعاً خواسته شده.
     */
    if (action === 'angles') {
      const id = String(body?.id ?? '').trim();
      const tree = await treeOf(target, await aggregateTriage(target).catch(() => []));
      const node = tree.flat.find((one) => one.id === id);
      if (!node) throw new Error('قابلیت پیدا نشد');
      return json({ target, id, angles: anglesFor(target, node, { covered: node.counts.scenarios }) });
    }

    if (action === 'reset') {
      const id = String(body?.id ?? '').trim();
      if (!id) throw new Error('شناسهٔ قابلیت لازم است');
      setEdit(target, id, null);
      return json({ target, ...(await treeOf(target, await aggregateTriage(target).catch(() => []))) });
    }

    throw new Error('کارِ نامعتبر');
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
