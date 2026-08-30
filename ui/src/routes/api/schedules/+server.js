import { json } from '@sveltejs/kit';
import { createSchedule, listSchedules } from '../../../../../src/schedule.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

/**
 * زمان‌بندی‌ها.
 *
 * ساختِ زمان‌بندی یک تغییرِ سطحِ سیستم است (تسک در Task Scheduler). همان
 * دروازهٔ اندپوینت‌های نویسنده را دارد: فقط loopback، فقط با نشانِ محلی، و
 * Origin یکسان. رابط از روز اول پروسه spawn می‌کرده؛ این یکی هم از همان جنس
 * است، ولی ماندگارتر — پس نامش پیشوند دارد و حذف فقط روی همان پیشوند مجاز
 * است.
 */
export async function GET({ url }) {
  try {
    const target = url.searchParams.get('target');
    const rows = await listSchedules();
    return json({ schedules: target ? rows.filter((row) => row.target === target) : rows });
  } catch (cause) {
    return jsonError(cause, 500);
  }
}

export async function POST(event) {
  try {
    assertMutationRequest(event);
    return json(await createSchedule(await event.request.json()));
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
