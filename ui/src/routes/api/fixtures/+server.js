import { json } from '@sveltejs/kit';
import {
  listFixtures,
  removeFixture,
  saveFixture,
  setFixtureNote,
} from '../../../../../src/knowledge/fixtures.js';
import { listProjects } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

/**
 * فایل‌هایی که سناریو آپلود می‌کند — حالا از خودِ رابط.
 *
 * ── چرا اندپوینتِ جدا و نه یک `action` در `/api/knowledge` ──
 *
 * آن یکی JSON می‌گیرد. فایلِ باینری در JSON یعنی base64، یعنی یک‌سومِ حجمِ
 * اضافه روی چیزی که تا ۲۵ مگابایت مجاز است — برای کاری که مرورگر از قبل
 * `multipart/form-data` را برایش دارد.
 *
 * ── چرا تا امروز نبود ──
 *
 * صفحه می‌گفت «فایل را در این مسیر بگذارید» و مسیر را نشان می‌داد. یعنی
 * کاربری که فقط از رابط کار می‌کند، برای دادنِ دادهٔ اولیه باید فایل‌منیجر
 * باز می‌کرد — همان نیمهٔ شکستهٔ قاعده که `POST /api/knowledge` برای شناخت
 * حلش کرده بود.
 *
 * همهٔ سنجش‌ها در `src/knowledge/fixtures.js` است، نه اینجا: نامِ فایل از
 * مرورگر می‌آید و تنها جایی که کاربر مستقیم روی دیسکِ پروژه می‌نویسد همین
 * است.
 */
async function assertProject(key) {
  const target = String(key ?? '').trim();
  const project = (await listProjects()).find((item) => item.key === target);
  if (!project) throw new Error(`پروژهٔ «${target}» وجود ندارد`);
  return project;
}

export async function POST(event) {
  try {
    assertMutationRequest(event);

    const form = await event.request.formData();
    const project = await assertProject(form.get('target'));
    const action = String(form.get('action') || 'add');

    if (action === 'remove') {
      await removeFixture(project.key, String(form.get('relative') || ''));
      return json({ fixtures: await listFixtures(project.key) });
    }

    if (action === 'note') {
      await setFixtureNote(project.key, String(form.get('relative') || ''), String(form.get('note') || ''));
      return json({ fixtures: await listFixtures(project.key) });
    }

    const file = form.get('file');
    if (!file || typeof file === 'string') throw new Error('فایلی فرستاده نشد');

    const saved = await saveFixture(project.key, {
      name: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      note: String(form.get('note') || ''),
    });

    return json({ saved, fixtures: await listFixtures(project.key) });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
