import { json } from '@sveltejs/kit';
import { listProjects } from '$lib/server/projects.js';

export async function GET() {
  return json({ projects: await listProjects() });
}
