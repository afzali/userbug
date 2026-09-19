import { json } from '@sveltejs/kit';
import { deleteScenario, readProjectFile, writeProjectFile } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

export async function GET({ url }) {
  try {
    return json(await readProjectFile({
      kind: url.searchParams.get('kind'),
      target: url.searchParams.get('target'),
      relative: url.searchParams.get('relative'),
    }));
  } catch (cause) {
    return jsonError(cause, 404);
  }
}

export async function POST(event) {
  try {
    assertMutationRequest(event);
    return json(await writeProjectFile(await event.request.json()));
  } catch (cause) {
    return jsonError(cause, 400);
  }
}

/**
 * حذف — و چرا فقط سناریو.
 *
 * `kind: 'target'` یعنی حذفِ کلِ پروژه، و آن راهِ خودش را دارد: اول
 * `projectFootprint` می‌شمارد چه چیزی از بین می‌رود، بعد کاربر نامِ پروژه
 * را تایپ می‌کند. اجازه دادنِ همان کار از این در، یعنی یک `DELETE` ساده
 * می‌تواند ساعت‌ها اجرا و شناخت را ببرد بی‌آنکه کسی شمرده باشدشان.
 *
 * بدنه JSON است نه query، چون `assertMutationRequest` روی درخواستِ
 * تغییردهنده حساب می‌کند و مسیرِ حذف باید دقیقاً همان شکلِ مسیرِ نوشتن را
 * داشته باشد — وگرنه دو اعتبارسنجی می‌شود که دیر یا زود از هم عقب می‌افتند.
 */
export async function DELETE(event) {
  try {
    assertMutationRequest(event);
    const { kind, target, relative } = await event.request.json();
    if (kind !== 'scenario') throw new Error('از این مسیر فقط سناریو حذف می‌شود');
    return json(await deleteScenario({ target, relative }));
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
