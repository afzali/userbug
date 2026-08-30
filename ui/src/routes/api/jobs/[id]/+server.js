import { json } from '@sveltejs/kit';
import { cancelJob, getJob } from '$lib/server/jobs.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

export async function GET({ params }) {
  const job = getJob(params.id, true);
  return job ? json({ job }) : json({ error: 'کار پیدا نشد' }, { status: 404 });
}

export async function DELETE(event) {
  try {
    assertMutationRequest(event);
    const job = await cancelJob(event.params.id);
    return json({ job }, { status: job.status === 'cancelling' ? 202 : 200 });
  } catch (cause) {
    return jsonError(cause, cause?.code === 'JOB_NOT_FOUND' ? 404 : 400);
  }
}
