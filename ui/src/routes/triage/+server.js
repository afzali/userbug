import { listProjects } from '$lib/server/projects.js';

/**
 * مسیر قدیمی، پیش از فضای کاری.
 *
 * `?target=` جای خودش را به مسیر داد. redirect می‌ماند چون نشانک‌ها نباید
 * بشکنند. `+server.js` است نه `+page.server.js`: مسیری که همیشه redirect
 * می‌کند، کامپوننت صفحه ندارد.
 */
export async function GET({ url }) {
  const target = url.searchParams.get('target') || (await listProjects())[0]?.key;
  const location = target ? `/projects/${encodeURIComponent(target)}/triage` : '/';
  return new Response(null, { status: 308, headers: { location } });
}
