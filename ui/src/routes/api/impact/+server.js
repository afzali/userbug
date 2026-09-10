import { json } from '@sveltejs/kit';
import { impactOf } from '../../../../../src/knowledge/impact.js';
import { listProjects } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';

/**
 * «کد عوض شد — چه چیزی را باید دوباره آزمود؟»
 *
 * ── چرا GET است با اینکه گیت را صدا می‌زند ──
 *
 * `git diff` و `git ls-files` هر دو فقط می‌خوانند. چیزی در مخزنِ کاربر عوض
 * نمی‌شود، پس این درخواست تغییری نیست و `assertMutationRequest` بی‌جا
 * می‌بود.
 */
export async function GET({ url }) {
  try {
    const target = String(url.searchParams.get('target') ?? '').trim();
    const project = (await listProjects()).find((item) => item.key === target);
    if (!project) throw new Error('هدف نامعتبر است');

    const base = url.searchParams.get('base') || 'HEAD';
    return json(await impactOf(target, { root: project.sourceRoot, base }));
  } catch (error) {
    return jsonError(error);
  }
}
