import { json } from '@sveltejs/kit';
import { startTour, stopTour, tourAction, tourState } from '$lib/server/tours.js';
import { listProjects } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertLoopbackRequest, assertMutationRequest } from '$lib/server/security.js';

/**
 * کنترلِ گشتِ زنده.
 *
 * پنجرهٔ مرورگر کنارِ همین صفحه باز است و کاربر در آن کار می‌کند؛ اینجا فقط
 * دستورها رد و بدل می‌شوند. توضیحِ صفحه هم از همین‌جا می‌آید، نه از داخلِ اپ:
 * تزریقِ HUD به صفحهٔ تحت تست دقیقاً همان تداخلی است که این ابزار برای کشفش
 * ساخته شده.
 */

async function assertProject(key) {
  const target = String(key ?? '').trim();
  const project = (await listProjects()).find((item) => item.key === target);
  if (!project) throw new Error('هدف نامعتبر است');
  return project;
}

export async function GET(event) {
  try {
    assertLoopbackRequest(event);
    const project = await assertProject(event.url.searchParams.get('target'));
    return json(tourState(project.key));
  } catch (cause) {
    return jsonError(cause, 400);
  }
}

export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();
    const project = await assertProject(body?.target);
    const action = String(body?.action || '');

    if (action === 'start') {
      /**
       * هشدارِ تولید اینجا هم تکرار می‌شود.
       *
       * `TourSession` خودش رخدادِ هشدار می‌فرستد، ولی آن پس از باز شدنِ
       * مرورگر است. کاربری که روی محیط تولیدی گشت می‌زند باید **پیش از**
       * دیدنِ پنجره بداند.
       */
      await startTour({ target: project.key, device: body.device });
      return json({ ...tourState(project.key), environment: project.environment });
    }

    if (action === 'stop') {
      return json(await stopTour(project.key, { name: body.name, discard: Boolean(body.discard) }));
    }

    return json(await tourAction(project.key, action, body));
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
