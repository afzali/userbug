import { json } from '@sveltejs/kit';
import { renderTargetConfig, assertNewProjectKey, assertProjectKey } from '../../../../../src/target-template.js';
import { deleteProject, listProjects, projectFootprint, writeProjectFile } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

/**
 * فهرست پروژه‌ها، یا ردِّ پای یکی از آنها.
 *
 * ── چرا ردِّ پا پیش از حذف لازم است ──
 *
 * دیالوگی که فقط بپرسد «مطمئنید؟» هیچ نمی‌گوید؛ آدم روی «بله» می‌زند چون
 * همیشه می‌زند. ولی «۱۹ سناریو، ۲۲۱۲ فایلِ اجرا، پروندهٔ شناخت» جمله‌ای است
 * که آدم را متوقف می‌کند — یا مطمئن می‌کند.
 */
export async function GET({ url }) {
  const footprint = url.searchParams.get('footprint');
  if (footprint) {
    try {
      return json(await projectFootprint(assertProjectKey(footprint)));
    } catch (cause) {
      return jsonError(cause, 400);
    }
  }
  return json({ projects: await listProjects() });
}

/**
 * ساختِ پروژهٔ تازه.
 *
 * قالب در `src/target-template.js` است نه اینجا، تا `userbug init` همان فایل
 * را بسازد. نوشتن هم از همان `writeProjectFile` می‌گذرد که کانفیگ را در
 * زیرپروسه اعتبارسنجی می‌کند (`node --check` و بعد import و بررسی `baseURL`).
 *
 * `createOnly` یعنی پروژهٔ موجود بی‌صدا بازنویسی نمی‌شود؛ تکراری ۴۰۹ می‌گیرد.
 */
export async function POST(event) {
  try {
    assertMutationRequest(event);
    const fields = await event.request.json();
    // ساختِ تازه سخت‌گیر است؛ خواندن و حذف نه — وگرنه پروژهٔ دیروز ناپیدا می‌شد.
    const key = assertNewProjectKey(fields?.key);
    const content = renderTargetConfig(fields);

    const saved = await writeProjectFile({ kind: 'target', target: key, content, createOnly: true });
    return json({ ...saved, key });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}

export async function DELETE(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json().catch(() => ({}));
    const key = assertProjectKey(body?.key);

    /**
     * تأییدِ صریح با نوشتنِ کلید.
     *
     * این تنها عملیاتِ رابط است که چیزی را برای همیشه پاک می‌کند و
     * `Ctrl+Z` ندارد. یک کلیک برایش کم است — نوشتنِ نام یعنی کاربر واقعاً
     * می‌داند کدام پروژه را انتخاب کرده، نه اینکه روی ردیفِ اشتباه کلیک
     * کرده باشد.
     */
    if (String(body?.confirm ?? '') !== key) {
      return jsonError(new Error('برای حذف باید کلیدِ پروژه را دقیقاً بنویسید'), 400);
    }

    return json(await deleteProject(key, { keepHistory: Boolean(body?.keepHistory) }));
  } catch (cause) {
    return jsonError(cause, cause?.message?.includes('وجود ندارد') ? 404 : 400);
  }
}
