/**
 * سرو کردن یک trace برای نمایشگرِ Playwright.
 *
 * ── چرا مسیر جداست و شمارهٔ ردیف می‌گیرد، نه نام فایل ──
 *
 * traceها از مسیر عمومیِ `/assets/<...>` سرو می‌شدند، پس آدرسشان به `.zip`
 * ختم می‌شد. مدیرهای دانلود — روی این ماشین Internet Download Manager — روی
 * همین قلاب می‌اندازند: هر بار که صفحهٔ «روایت کامل اجرا» باز می‌شد، به‌جای
 * نمایشگر، پنجرهٔ دانلود بالا می‌آمد.
 *
 * پس آدرس دیگر پسوند ندارد: `/api/runs/<runId>/trace/<شماره>`. شماره، ردیفِ
 * همان trace در `traces.ndjson` است.
 *
 * `content-disposition: inline` هم صریح گفته می‌شود. لازم نبود — پیش‌فرضِ
 * مرورگر همین است — ولی وقتی چیزی وسطِ راه نشسته، صریح گفتن ارزان‌تر از
 * فرض کردن است.
 */
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { readRunDetails, runAsset } from '$lib/server/artifacts.js';
import { jsonError } from '$lib/server/http.js';

async function serve(params, head = false) {
  try {
    const index = Number(params.index);
    if (!Number.isInteger(index) || index < 0) {
      throw Object.assign(new Error('شمارهٔ trace نامعتبر است'), { code: 'EINVAL' });
    }

    const detail = await readRunDetails(params.runId);
    const trace = detail?.traces?.[index];
    if (!trace?.file) {
      throw Object.assign(new Error(`trace شمارهٔ ${index} در این اجرا نیست`), { code: 'ENOENT' });
    }

    const { file, stat } = await runAsset(params.runId, trace.file);
    const headers = new Headers({
      'content-type': 'application/zip',
      'content-length': String(stat.size),
      'content-disposition': 'inline',
      'cache-control': 'private, no-cache',
    });

    if (head) return new Response(null, { headers });
    return new Response(Readable.toWeb(createReadStream(file)), { headers });
  } catch (cause) {
    return jsonError(cause, cause?.code === 'ENOENT' ? 404 : 400);
  }
}

export async function GET({ params }) {
  return serve(params);
}

export async function HEAD({ params }) {
  return serve(params, true);
}
