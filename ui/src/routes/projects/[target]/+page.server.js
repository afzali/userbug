import { listRuns } from '$lib/server/artifacts.js';
import { getActiveJob } from '$lib/server/jobs.js';

/**
 * اجراها به همین پروژه فیلتر می‌شوند.
 *
 * پیش‌تر داشبورد همهٔ اجراهای همهٔ پروژه‌ها را نشان می‌داد، پس «آخرین اجرا»
 * می‌توانست مالِ پروژهٔ دیگری باشد. `listRuns` از اول پارامتر `target` داشت و
 * فقط استفاده نمی‌شد.
 *
 * فهرست پروژه‌ها از `+layout.server.js` می‌آید و اینجا تکرار نمی‌شود.
 */
export async function load({ params }) {
  return {
    runs: await listRuns({ target: params.target, limit: 60 }),
    activeJob: getActiveJob(true),
  };
}
