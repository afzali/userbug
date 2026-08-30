import { error } from '@sveltejs/kit';
import { readRunDetails } from '$lib/server/artifacts.js';

export async function load({ params }) {
  try {
    return await readRunDetails(params.runId);
  } catch (cause) {
    error(404, cause.message);
  }
}
