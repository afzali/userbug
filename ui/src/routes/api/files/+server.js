import { json } from '@sveltejs/kit';
import { readProjectFile, writeProjectFile } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

export async function GET({ url }) {
  try {
    return json(await readProjectFile({
      kind: url.searchParams.get('kind'),
      target: url.searchParams.get('target'),
      relative: url.searchParams.get('relative'),
    }));
  } catch (cause) {
    return jsonError(cause, 404);
  }
}

export async function POST(event) {
  try {
    assertMutationRequest(event);
    return json(await writeProjectFile(await event.request.json()));
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
