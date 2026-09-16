import { json } from '@sveltejs/kit';
import { listProjects } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';
import { removeRound, saveRound } from '../../../../../src/runs/rounds.js';

/**
 * ثبتِ **قصدِ** یک دور — نامش، چرایی‌اش، و دامنه‌اش.
 *
 * نتیجهٔ دور از `run.json` می‌آید و این مسیر دستش به آن نمی‌خورد. آنچه
 * اینجا نوشته می‌شود همان چیزی است که هیچ ماشینی نمی‌داند: چرا این دور زده
 * شد و کجا را قرار بود ببیند.
 */
export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();

    const target = String(body?.target ?? '').trim();
    const projects = await listProjects();
    if (!projects.some((item) => item.key === target)) throw new Error('هدف نامعتبر است');

    if (body?.action === 'remove') {
      return json({ target, rounds: removeRound(target, body?.name) });
    }

    const round = saveRound(target, body?.name, { note: body?.note, scope: body?.scope });
    return json({ target, round });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
