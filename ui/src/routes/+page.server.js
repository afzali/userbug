import { listRuns } from '$lib/server/artifacts.js';
import { listProjects } from '$lib/server/projects.js';

/**
 * درِ ورودی: فهرست پروژه‌ها.
 *
 * هر پروژه آخرین اجرای **خودش** را نشان می‌دهد. یک `listRuns` برای همه صدا
 * زده می‌شود و بعد گروه می‌شود، نه یکی به‌ازای هر پروژه: خواندنِ ایندکسِ
 * اجراها گران‌ترین بخش این صفحه است.
 */
export async function load() {
  const [projects, runs] = await Promise.all([listProjects(), listRuns({ limit: 500 })]);

  const latest = new Map();
  for (const run of runs) {
    if (run.target && !latest.has(run.target)) latest.set(run.target, run);
  }

  return {
    projects: projects.map((project) => ({
      ...project,
      lastRun: latest.get(project.key) || null,
      runnable: project.scenarios.filter((scenario) => scenario.runnable).length,
      drafts: project.scenarios.filter((scenario) => scenario.status === 'draft').length,
      invalid: project.scenarios.filter((scenario) => scenario.status === 'invalid').length,
    })),
  };
}
