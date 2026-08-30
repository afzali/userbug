import { compareRuns, listRuns } from '$lib/server/artifacts.js';

/**
 * مقایسه، محصور به اجراهای همین پروژه.
 *
 * پیش‌تر فهرست همهٔ اجراها می‌آمد و می‌شد اجرای نپی را با اجرای پروژهٔ دیگری
 * مقایسه کرد. خروجی‌اش «همه‌چیز تازه، همه‌چیز رفته» بود — عددی که چیزی
 * نمی‌گوید.
 */
export async function load({ params, url }) {
  const runs = await listRuns({ target: params.target, limit: 500 });
  const a = url.searchParams.get('a') || runs[1]?.runId || runs[0]?.runId || '';
  const b = url.searchParams.get('b') || runs[0]?.runId || '';

  let comparison = null;
  let compareError = '';
  if (a && b && a !== b) {
    try {
      comparison = await compareRuns(a, b);
    } catch (cause) {
      compareError = cause.message;
    }
  }
  return { runs, a, b, comparison, compareError };
}
