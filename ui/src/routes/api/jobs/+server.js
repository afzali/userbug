import { json } from '@sveltejs/kit';
import { listMissions, saveMission } from '../../../../../src/map/mission.js';
import { getActiveJob, startJob } from '$lib/server/jobs.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

export async function GET() {
  return json({ active: getActiveJob(true) });
}

export async function POST(event) {
  try {
    assertMutationRequest(event);
    const options = await event.request.json();
    const job = await startJob(options);

    /**
     * اگر این اجرا از یک مأموریت آمده، در همان فایل ثبت می‌شود.
     *
     * ── چرا اینجا و نه در مسیرِ جدا ──
     *
     * یک بار یک `action: 'run'` در `/api/mission` بود که خودش job می‌ساخت —
     * یعنی دو درِ شروعِ اجرا، و دیر یا زود یکی‌شان چیزی را می‌فرستاد که آن
     * یکی نمی‌فرستد. حالا شروعِ اجرا یک در دارد و «از کدام مأموریت» فقط یک
     * فیلدِ کنارِ آن است.
     *
     * شکستش اجرا را نمی‌کشد: خزش شروع شده و کاربر منتظرِ آن است؛ نشدنِ یک
     * یادداشتِ تاریخچه دلیلی برای خطا دادن نیست. ولی سکوت هم نمی‌کند.
     */
    const slug = String(options?.mission ?? '').trim();
    let missionNote = '';
    if (slug) {
      try {
        const mission = listMissions(options.target).find((one) => one.slug === slug);
        if (!mission) throw new Error(`مأموریتی به نام «${slug}» نیست`);
        saveMission(options.target, {
          ...mission,
          runs: [{ job: job.id, at: new Date().toISOString(), by: 'ui' }, ...(mission.runs || [])].slice(0, 20),
        });
      } catch (cause) {
        missionNote = `اجرا شروع شد ولی در مأموریت ثبت نشد: ${cause.message}`;
      }
    }

    return json({ job, missionNote }, { status: 201 });
  } catch (cause) {
    const status =
      cause?.code === 'JOB_ACTIVE'
        ? 409
        : cause?.code === 'JOB_SHUTTING_DOWN'
          ? 503
          : cause?.code === 'JOB_START_FAILED'
            ? 500
            : 400;
    return jsonError(cause, status);
  }
}
