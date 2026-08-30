import { json } from '@sveltejs/kit';
import { promoteScenario } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

/**
 * پیش‌نویس → سناریوی رسمی.
 *
 * دو کار با هم: `status: approved` و بیرون آوردن فایل از `_drafts/`. جدا
 * کردنشان یعنی نیمه‌کاره ماندن — فایلی که رسمی به نظر می‌رسد و اجرا نمی‌شود.
 */
export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();
    return json(await promoteScenario({ target: body.target, relative: body.relative }));
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
