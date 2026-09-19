import { error } from '@sveltejs/kit';
import { readRunDetails } from '$lib/server/artifacts.js';
import { listScenarios } from '$lib/server/projects.js';

export async function load({ params }) {
  let details;
  try {
    details = await readRunDetails(params.runId);
  } catch (cause) {
    error(404, cause.message);
  }

  /**
   * سناریوهایی که هنوز روی دیسک‌اند — ورودیِ «اجرای دوباره».
   *
   * ── چرا تقاطع، و نه خودِ `run.scenarios` ──
   *
   * `run.json` می‌گوید آن روز چه اجرا شد. ولی سناریو از آن روز تا امروز
   * ممکن است حذف شده باشد، و `--grep`ی که نامِ ناموجود داشته باشد یا
   * هیچ تستی نمی‌گیرد یا بی‌صدا کمتر از آنچه دکمه وعده داده. همان درسی
   * که فهرستِ دورها با «۴۲۸ سناریو» داد.
   */
  const onDisk = new Set(
    (await listScenarios(details.run.target || '').catch(() => []))
      .filter((one) => one.executable)
      .map((one) => one.name)
  );

  return {
    ...details,
    runnable: [
      ...new Set((details.run.scenarios || []).map((one) => one.name).filter((name) => name && onDisk.has(name))),
    ],
  };
}
