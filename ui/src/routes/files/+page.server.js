import { listProjects, readProjectFile } from '$lib/server/projects.js';

export async function load({ url }) {
  const projects = await listProjects();
  const target = url.searchParams.get('target') || projects[0]?.key || '';
  const kind = url.searchParams.get('kind') === 'scenario' ? 'scenario' : 'target';
  const relative = url.searchParams.get('relative') || '';
  let file = null;
  let fileError = '';
  if (target) {
    try {
      file = await readProjectFile({ kind, target, relative });
    } catch (cause) {
      fileError = cause.message;
    }
  }
  return { projects, target, kind, relative, file, fileError };
}
