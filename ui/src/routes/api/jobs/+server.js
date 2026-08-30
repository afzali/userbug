import { json } from '@sveltejs/kit';
import { getActiveJob, startJob } from '$lib/server/jobs.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

export async function GET() {
  return json({ active: getActiveJob(true) });
}

export async function POST(event) {
  try {
    assertMutationRequest(event);
    const options = await event.request.json();
    return json({ job: await startJob(options) }, { status: 201 });
  } catch (cause) {
    const status =
      cause?.code === 'JOB_ACTIVE'
        ? 409
        : cause?.code === 'JOB_SHUTTING_DOWN'
          ? 503
          : cause?.code === 'JOB_START_FAILED'
            ? 500
            : 400;
    return jsonError(cause, status);
  }
}
