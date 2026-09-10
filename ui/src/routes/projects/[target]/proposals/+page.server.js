import { impactOf } from '../../../../../../src/knowledge/impact.js';
import { proposalsFor } from '../../../../../../src/knowledge/propose.js';
import { listProjects } from '$lib/server/projects.js';

export async function load({ params }) {
  const empty = { proposals: [], open: 0, coveredRoutes: 0, totalRoutes: 0 };

  let proposals = empty;
  let error = '';
  try {
    proposals = proposalsFor(params.target);
  } catch (cause) {
    // پروژه‌ای که هنوز شناخت ندارد، خطا نیست — فقط هنوز چیزی برای گفتن ندارد.
    error = cause.message;
  }

  /**
   * اثرِ تغییر، با پیش‌فرضِ «هرچه از آخرین کامیت دست خورده».
   *
   * نبودنِ سورس یا نبودنِ گیت خطای صفحه نیست: بقیهٔ صفحه بی‌آن هم کار
   * می‌کند. پیام در همان بخش می‌نشیند تا معلوم باشد چه چیزی کم است.
   */
  let impact = null;
  let impactError = '';
  try {
    const project = (await listProjects()).find((item) => item.key === params.target);
    impact = await impactOf(params.target, { root: project?.sourceRoot, base: 'HEAD' });
  } catch (cause) {
    impactError = cause.message;
  }

  return { proposals, error, impact, impactError };
}
