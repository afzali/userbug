import { listRuns } from '$lib/server/artifacts.js';
import { listProjects } from '$lib/server/projects.js';

/**
 * مسیر قدیمی مقایسه.
 *
 * پروژه در آدرس نبود، پس از خودِ اجرا گرفته می‌شود: هر اجرا می‌داند مالِ کدام
 * هدف است. اگر شناسه‌ای نداشت، به پروژهٔ اول می‌رود — چون رفتار قبلی هم همین
 * بود.
 */
export async function GET({ url }) {
  const a = url.searchParams.get('a') || '';
  const b = url.searchParams.get('b') || '';

  const runs = await listRuns({ limit: 500 });
  const target =
    runs.find((run) => run.runId === a)?.target ||
    runs.find((run) => run.runId === b)?.target ||
    (await listProjects())[0]?.key;

  if (!target) return new Response(null, { status: 308, headers: { location: '/' } });

  const keep = new URLSearchParams();
  if (a) keep.set('a', a);
  if (b) keep.set('b', b);

  const query = keep.toString();
  const location = `/projects/${encodeURIComponent(target)}/compare${query ? `?${query}` : ''}`;
  return new Response(null, { status: 308, headers: { location } });
}
