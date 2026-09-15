import { json } from '@sveltejs/kit';
import { MAX_BRIEF, readBrief, writeBrief } from '../../../../../src/knowledge/brief.js';
import { listProjects } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

/**
 * «این پروژه چیست» — متنی که خودِ آدم می‌نویسد.
 *
 * ── چرا مسیرِ جدا و نه بخشی از `/api/knowledge` ──
 *
 * آن یکی پروندهٔ شناخت را دست می‌زند، و پرونده را اتوماسیون هم می‌نویسد.
 * این متن `by: user` است و نباید از همان دری برود که `learn` و گشت می‌روند
 * — همان تفکیکی که در `saveExplain` هم رعایت شد: یک ذخیره‌گاه، دو در.
 */
export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();

    const target = String(body?.target ?? '').trim();
    const projects = await listProjects();
    if (!projects.some((item) => item.key === target)) throw new Error('هدف نامعتبر است');

    const text = String(body?.text ?? '');
    if (text.length > MAX_BRIEF) throw new Error(`متن بیش از ${MAX_BRIEF} نویسه است`);

    return json({ target, brief: writeBrief(target, text), saved: true });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}

export async function GET({ url }) {
  try {
    const target = String(url.searchParams.get('target') ?? '').trim();
    const projects = await listProjects();
    if (!projects.some((item) => item.key === target)) throw new Error('هدف نامعتبر است');
    return json({ target, brief: readBrief(target) });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
