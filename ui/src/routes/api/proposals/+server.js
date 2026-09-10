import { json } from '@sveltejs/kit';
import { proposalsFor, setDismissed } from '../../../../../src/knowledge/propose.js';
import { listProjects } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

/**
 * پیشنهادهای آزمون — خواندن، و رد/برگرداندن.
 *
 * ── چرا مدل صدا زده نمی‌شود ──
 *
 * `proposalsFor` حساب است نه قضاوت (توضیحش در `src/knowledge/propose.js`).
 * پس این مسیر برخلاف `POST /api/scenarios/draft` نه بودجه می‌خواهد نه انتظار،
 * و می‌شود در بارگذاری هر صفحه صدایش زد.
 *
 * ساختنِ خودِ سناریو کارِ همان مسیرِ draft است؛ اینجا فقط `text` تحویل داده
 * می‌شود. دو مسیرِ ساخت یعنی دو رفتار که به‌مرور واگرا می‌شوند.
 */

/** هدفی که واقعاً در `targets/` هست. */
async function assertProject(key) {
  const target = String(key ?? '').trim();
  const project = (await listProjects()).find((item) => item.key === target);
  if (!project) throw new Error('هدف نامعتبر است');
  return project.key;
}

export async function GET({ url }) {
  try {
    const target = await assertProject(url.searchParams.get('target'));
    return json(proposalsFor(target));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();
    const target = await assertProject(body?.target);

    const id = String(body?.id ?? '').trim();
    if (!id) throw new Error('شناسهٔ پیشنهاد لازم است');

    // `why: null` یعنی برگردان. رشتهٔ خالی یعنی رد شد بی‌آنکه دلیلی نوشته شود.
    const why = body?.why === null ? null : String(body?.why ?? '');
    setDismissed(target, id, why);

    return json(proposalsFor(target));
  } catch (error) {
    return jsonError(error);
  }
}
