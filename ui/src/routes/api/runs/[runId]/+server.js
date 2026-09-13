import { json } from '@sveltejs/kit';
import { deleteRun, readRunDetails } from '$lib/server/artifacts.js';
import { getActiveJob } from '$lib/server/jobs.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

export async function GET({ params }) {
  try {
    return json(await readRunDetails(params.runId));
  } catch (cause) {
    return jsonError(cause, 404);
  }
}

/**
 * حذفِ یک اجرا.
 *
 * ── چرا `DELETE` و نه یک `action` در POST ──
 *
 * بقیهٔ اندپوینت‌های این رابط با `action` کار می‌کنند چون چند کارِ مختلف
 * دارند. اینجا یک کار است و فعلِ HTTP خودش می‌گویدش. و از همان دروازهٔ
 * `assertMutationRequest` می‌گذرد که هر نوشتنِ دیگری می‌گذرد.
 *
 * اجرای در جریان حذف نمی‌شود؛ تشخیصش از خودِ `jobs` می‌آید نه از حدس.
 */
export async function DELETE(event) {
  try {
    assertMutationRequest(event);
    const active = getActiveJob(true);
    const isActive = (runId) => Boolean(active && (active.activeRun === runId || active.runs?.includes(runId)));
    return json(await deleteRun(event.params.runId, { isActive }));
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
