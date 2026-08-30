import { listRuns } from '$lib/server/artifacts.js';
import { getActiveJob } from '$lib/server/jobs.js';
import { listProjects } from '$lib/server/projects.js';

export async function load() {
  const [projects, runs] = await Promise.all([listProjects(), listRuns({ limit: 60 })]);
  return { projects, runs, activeJob: getActiveJob(true) };
}
