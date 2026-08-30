import { listProjects } from '$lib/server/projects.js';

/** مسیر قدیمی. `kind` و `relative` حفظ می‌شوند تا پیوندِ یک فایل هم زنده بماند. */
export async function GET({ url }) {
  const target = url.searchParams.get('target') || (await listProjects())[0]?.key;
  if (!target) return new Response(null, { status: 308, headers: { location: '/' } });

  const keep = new URLSearchParams();
  for (const key of ['kind', 'relative']) {
    const value = url.searchParams.get(key);
    if (value) keep.set(key, value);
  }

  const query = keep.toString();
  const location = `/projects/${encodeURIComponent(target)}/files${query ? `?${query}` : ''}`;
  return new Response(null, { status: 308, headers: { location } });
}
