import { json } from '@sveltejs/kit';
import { listRuns } from '$lib/server/artifacts.js';

export async function GET({ url }) {
  const target = url.searchParams.get('target') || undefined;
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 250)));
  return json({ runs: await listRuns({ target, limit }) });
}
