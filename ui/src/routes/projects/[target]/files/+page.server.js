import { readProjectFile } from '$lib/server/projects.js';

export async function load({ params, url }) {
  const kind = url.searchParams.get('kind') === 'scenario' ? 'scenario' : 'target';
  const relative = url.searchParams.get('relative') || '';

  let file = null;
  let fileError = '';
  try {
    file = await readProjectFile({ kind, target: params.target, relative });
  } catch (cause) {
    fileError = cause.message;
  }
  return { kind, relative, file, fileError };
}
