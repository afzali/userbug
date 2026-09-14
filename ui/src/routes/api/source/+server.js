import { json } from '@sveltejs/kit';
import { coverageSnapshot, readEndpoints, writeEndpoints } from '../../../../../src/knowledge/endpoints.js';
import {
  listAllSourceFiles,
  readAnySourceFile,
  resolveSourceRoots,
} from '../../../../../src/source-access.js';
import { scanSource } from '../../../../../src/knowledge/digest.js';
import { mergeInvariants } from '../../../../../src/knowledge/invariants.js';
import { RUNS_DIR } from '$lib/server/paths.js';
import { listProjects, sourceOf } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

/**
 * خواندنِ دوبارهٔ سورس — endpointها و ناوردا.
 *
 * ── چرا `POST` وقتی چیزی «تغییر» نمی‌دهد ──
 *
 * صدها فایل خوانده می‌شود و دو فایل روی دیسک نوشته. کاری که چند ثانیه طول
 * می‌کشد و چیزی می‌نویسد، نباید با یک `GET` اتفاق بیفتد که مرورگر ممکن است
 * خودش پیش‌بارگذاری‌اش کند.
 *
 * ── و چرا هیچ مدلی صدا زده نمی‌شود ──
 *
 * هر دو کشف نحوی‌اند: `case 'GET /x'` و `UNIQUE(...)`. این همان مرزی است که
 * `learn` را گران می‌کند و این را رایگان: `learn` **معنا** می‌سازد (این
 * صفحه برای چیست)، این یکی فقط **فهرست** می‌سازد.
 */
export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();

    const target = String(body?.target ?? '').trim();
    const projects = await listProjects();
    const project = projects.find((item) => item.key === target);
    if (!project) throw new Error('هدف نامعتبر است');

    if (!project.sourceRoot) {
      throw new Error(
        `پروژهٔ «${project.name}» کلید source.root ندارد.\n` +
          '  آن را در پیکربندی پروژه بگذارید تا سورس خوانده شود.'
      );
    }

    const source = sourceOf(project);
    const roots = await resolveSourceRoots({ key: target, source });
    const files = await listAllSourceFiles(roots);
    const read = async (relative) =>
      (await readAnySourceFile(roots, relative).catch(() => ({ content: '' }))).content || '';

    const coverage = await coverageSnapshot({
      target,
      runsRoot: RUNS_DIR,
      rescan: true,
      scan: { files, read },
    });

    /**
     * ناوردا هم از همین پیمایش درمی‌آید.
     *
     * دو بار خواندنِ صدها فایل برای دو فهرستی که از یک منبع می‌آیند،
     * وقتِ کاربر را دو برابر می‌کند بی آنکه چیزی اضافه بدهد.
     */
    let added = 0;
    let routes = [];
    try {
      const scan = await scanSource({ key: target, source });
      routes = (scan.routes || []).map((one) => one.path).filter(Boolean);
      if (scan.invariants?.length) added = mergeInvariants(target, scan.invariants).added;
    } catch {
      // پروژه‌ای که SQL ندارد ناوردا هم ندارد؛ پوشش بی آن هم معنا دارد
    }

    /**
     * روت‌ها کنارِ endpointها ذخیره می‌شوند.
     *
     * `dossier.routes` را فقط `learn` پر می‌کند و آن مدل لازم دارد. بی این،
     * صفحهٔ سورس روی پروژه‌ای که `learn` نشده عددِ کمتر از واقعیت نشان می‌داد.
     */
    if (routes.length) {
      const stored = readEndpoints(target);
      writeEndpoints(target, {
        endpoints: stored.endpoints,
        byDetector: stored.byDetector,
        files: stored.files,
        routes,
      });
    }

    return json({
      target,
      files: files.length,
      endpoints: coverage.endpoints.length,
      untouched: coverage.untouched.length,
      calls: coverage.calls,
      invariantsAdded: added,
      at: coverage.at,
    });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
