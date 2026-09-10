import { proposalsFor } from '../../../../../../src/knowledge/propose.js';

export async function load({ params }) {
  try {
    return { proposals: proposalsFor(params.target), error: '' };
  } catch (cause) {
    // پروژه‌ای که هنوز شناخت ندارد، خطا نیست — فقط هنوز چیزی برای گفتن ندارد.
    return { proposals: { proposals: [], open: 0, coveredRoutes: 0, totalRoutes: 0 }, error: cause.message };
  }
}
