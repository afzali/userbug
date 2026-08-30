import { aggregateTriage } from '$lib/server/artifacts.js';

export async function load({ params }) {
  return { findings: await aggregateTriage(params.target) };
}
