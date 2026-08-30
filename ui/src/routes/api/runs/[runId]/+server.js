import { json } from '@sveltejs/kit';
import { readRunDetails } from '$lib/server/artifacts.js';
import { jsonError } from '$lib/server/http.js';

export async function GET({ params }) {
  try {
    return json(await readRunDetails(params.runId));
  } catch (cause) {
    return jsonError(cause, 404);
  }
}
