import { json } from '@sveltejs/kit';
import { removeSchedule, runScheduleNow } from '../../../../../../src/schedule.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

export async function DELETE(event) {
  try {
    assertMutationRequest(event);
    return json(await removeSchedule(event.params.key));
  } catch (cause) {
    return jsonError(cause, 400);
  }
}

/**
 * اجرای دستیِ همان تسک.
 *
 * تنها راهِ اثباتِ اینکه زمان‌بندی واقعاً کار می‌کند، بدون منتظر ماندن تا دو
 * بامداد. اجرا را خودِ زمان‌بندِ سیستم شروع می‌کند، نه این پروسه — پس همان
 * مسیری آزموده می‌شود که شب اجرا می‌شود.
 */
export async function POST(event) {
  try {
    assertMutationRequest(event);
    return json(await runScheduleNow(event.params.key));
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
