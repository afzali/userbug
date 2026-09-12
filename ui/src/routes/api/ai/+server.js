import { json } from '@sveltejs/kit';
import { jsonError } from '$lib/server/http.js';
import { assertLoopbackRequest, assertMutationRequest } from '$lib/server/security.js';
import {
  checkAllModels,
  effectiveModels,
  setApiKey,
  setBudget,
  setModel,
} from '../../../../../src/models/settings.js';
import { listModels } from '../../../../../src/models/config.js';

/**
 * تنظیماتِ هوش مصنوعی.
 *
 * ── چرا کلید هرگز برنمی‌گردد ──
 *
 * حتی روی loopback. رابط فقط باید بداند «هست یا نه» و چهار نویسهٔ آخر، تا
 * کاربر بفهمد کدام کلید نشسته. فرستادنِ خودِ کلید به مرورگر هیچ کاری را
 * ممکن‌تر نمی‌کند و فقط یک نسخهٔ دیگر از راز می‌سازد — در حافظهٔ مرورگر، در
 * devtools، و در هر افزونه‌ای که آنجا نشسته.
 */
export async function GET(event) {
  try {
    assertLoopbackRequest(event);
    const check = event.url.searchParams.get('check') === '1';
    const models = event.url.searchParams.get('models') === '1';

    return json({
      settings: await effectiveModels(),
      checks: check ? await checkAllModels() : null,
      available: models ? await listModels({ free: false, limit: 400 }).catch(() => []) : null,
    });
  } catch (cause) {
    return jsonError(cause, cause?.status === 403 ? 403 : 500);
  }
}

export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();

    if (body?.key) await setApiKey(body.key);
    if (body?.budget !== undefined && body.budget !== '') await setBudget(body.budget);

    for (const [role, slug] of Object.entries(body?.roles || {})) {
      // رشتهٔ خالی یعنی «برگرد به لایهٔ زیرین»، نه «مدلی به نام خالی»
      await setModel({ role, slug: slug === '' ? null : slug });
    }

    return json({ settings: await effectiveModels() });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
