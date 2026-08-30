import { compareRuns, listRuns } from '$lib/server/artifacts.js';

export async function load({ url }) {
  const runs = await listRuns({ limit: 500 });
  const a = url.searchParams.get('a') || runs[1]?.runId || runs[0]?.runId || '';
  const b = url.searchParams.get('b') || runs[0]?.runId || '';
  let comparison = null;
  let compareError = '';
  if (a && b && a !== b) {
    try {
      comparison = await compareRuns(a, b);
    } catch (cause) {
      compareError = cause.message;
    }
  }
  return { runs, a, b, comparison, compareError };
}
