import { error } from '@sveltejs/kit';
import { listProjects } from '$lib/server/projects.js';

/**
 * فضای کاری یک پروژه.
 *
 * هدف از مسیر می‌آید نه از `?target=`. پیش‌تر روی هر صفحه یک کشویی بود و هر
 * صفحه پیش‌فرضِ خودش را داشت (`projects[0]`)، پس رفتن از تریاژ به فایل‌ها
 * می‌توانست بی‌صدا پروژه را عوض کند.
 *
 * هدفِ ناموجود ۴۰۴ می‌گیرد، نه اینکه بی‌صدا به پروژهٔ اول بیفتد: آدرسِ غلط
 * باید خودش را نشان دهد.
 */
export async function load({ params }) {
  const projects = await listProjects();
  const project = projects.find((item) => item.key === params.target);
  if (!project) error(404, `پروژهٔ «${params.target}» وجود ندارد`);
  return { projects, project, target: project.key };
}
