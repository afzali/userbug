import { json } from '@sveltejs/kit';
import { aggregateTriage, saveTriage } from '$lib/server/artifacts.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

export async function GET({ params }) {
  try {
    return json({ findings: await aggregateTriage(params.target) });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}

export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();
    return json({ triage: await saveTriage(event.params.target, body.fingerprint, body) });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
