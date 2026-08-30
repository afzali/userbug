import { json } from '@sveltejs/kit';
import { renderTargetConfig, assertProjectKey } from '../../../../../src/target-template.js';
import { listProjects, writeProjectFile } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

export async function GET() {
  return json({ projects: await listProjects() });
}

/**
 * ساختِ پروژهٔ تازه.
 *
 * قالب در `src/target-template.js` است نه اینجا، تا `userbug init` همان فایل
 * را بسازد. نوشتن هم از همان `writeProjectFile` می‌گذرد که کانفیگ را در
 * زیرپروسه اعتبارسنجی می‌کند (`node --check` و بعد import و بررسی `baseURL`).
 *
 * `createOnly` یعنی پروژهٔ موجود بی‌صدا بازنویسی نمی‌شود؛ تکراری ۴۰۹ می‌گیرد.
 */
export async function POST(event) {
  try {
    assertMutationRequest(event);
    const fields = await event.request.json();
    const key = assertProjectKey(fields?.key);
    const content = renderTargetConfig(fields);

    const saved = await writeProjectFile({ kind: 'target', target: key, content, createOnly: true });
    return json({ ...saved, key });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
