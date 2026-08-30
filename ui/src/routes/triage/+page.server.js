import { aggregateTriage } from '$lib/server/artifacts.js';
import { listProjects } from '$lib/server/projects.js';

export async function load({ url }) {
  const projects = await listProjects();
  const target = url.searchParams.get('target') || projects[0]?.key || '';
  const findings = target ? await aggregateTriage(target) : [];
  return { projects, target, findings };
}
