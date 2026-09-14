import { json } from '@sveltejs/kit';
import { describeBundle, exportBundle, importBundle } from '../../../../../src/knowledge/bundle.js';
import { listProjects } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

/**
 * بستهٔ پروژه — گرفتن و برگرداندن، از رابط.
 *
 * ── چرا این مسیر لازم بود ──
 *
 * `userbug bundle` فقط در خط فرمان بود، و این خلافِ قاعدهٔ خودِ پروژه است:
 * هیچ‌چیز نباید فقط-CLI یا فقط-UI باشد. کسی که با رابط کار می‌کند، دقیقاً
 * همان کسی است که نمی‌خواهد ترمینال باز کند تا کارش گم نشود.
 *
 * ── چرا `GET` برای گرفتن ──
 *
 * برخلافِ بقیهٔ مسیرها اینجا `GET` درست است: چیزی نمی‌نویسد، و مرورگر باید
 * بتواند مستقیم دانلودش کند. `Content-Disposition` کار را تمام می‌کند بی
 * آنکه لازم باشد کلِ JSON از جاوااسکریپت رد شود.
 */
export async function GET({ url }) {
  try {
    const target = String(url.searchParams.get('target') ?? '').trim();
    const projects = await listProjects();
    if (!projects.some((item) => item.key === target)) throw new Error('هدف نامعتبر است');

    const withFixtures = url.searchParams.get('fixtures') !== 'no';
    const bundle = exportBundle(target, { fixtures: withFixtures });
    const body = JSON.stringify(bundle, null, 2) + '\n';

    return new Response(body, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        /**
         * نامِ فایل ASCII می‌ماند و نامِ فارسی در `filename*` می‌رود.
         *
         * بعضی مرورگرها هنوز `filename` را می‌خوانند و نامِ فارسی را در آن
         * مخدوش می‌کنند — همان مشکلی که در پنجرهٔ cmd هم داشتیم.
         */
        'content-disposition': `attachment; filename="userbug-bundle.json"; filename*=UTF-8''${encodeURIComponent(
          `${target}-bundle.json`
        )}`,
      },
    });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}

/**
 * برگرداندنِ بسته.
 *
 * ── چرا `preview` جدا از `import` ──
 *
 * بسته فایلی است که از جای دیگری آمده. دیدنِ محتوایش پیش از نوشتن روی
 * دیسک، همان قاعدهٔ «پیش از هر کارِ برگشت‌ناپذیر بپرس» است — و اینجا
 * برگشت‌ناپذیری واقعی است: `force` می‌تواند نقشه و سناریوهای تازه‌تر را
 * ببرد.
 */
export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();

    const bundle = body?.bundle;
    if (!bundle || typeof bundle !== 'object') throw new Error('محتوای بسته خوانده نشد');

    if (body?.preview) return json({ preview: describeBundle(bundle) });

    const result = importBundle(bundle, {
      as: String(body?.as ?? '').trim(),
      force: Boolean(body?.force),
    });
    return json(result);
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
