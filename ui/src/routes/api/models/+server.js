import { json } from '@sveltejs/kit';
import { listModels } from '../../../../../src/models/config.js';
import { jsonError } from '$lib/server/http.js';

/**
 * فهرست مدل‌ها برای کشویی انتخاب مدل.
 *
 * همان تابعی که `userbug models` استفاده می‌کند، نه یک واکشیِ دوم. اگر کلید
 * نباشد یا شبکه نرسد، این اندپوینت خطا می‌دهد و رابط به «پیش‌فرض کانفیگ»
 * برمی‌گردد — انتخاب مدل قابلیتی اضافه است، نه پیش‌نیازِ اجرا.
 */
export async function GET({ url }) {
  try {
    const free = url.searchParams.get('free') === '1';
    const limit = Number(url.searchParams.get('limit') || 60);
    return json({ models: await listModels({ free, limit }) });
  } catch (cause) {
    return jsonError(cause, 502);
  }
}
