import { assertLoopbackRequest } from '$lib/server/security.js';

export async function handle({ event, resolve }) {
  assertLoopbackRequest(event);
  const response = await resolve(event);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  return response;
}

/**
 * خطای سرور را **بگو**، نه «Internal Error».
 *
 * ── چرا لازم شد ──
 *
 * یک صفحه ۵۰۰ می‌داد و تنها چیزی که می‌شد دید «Internal Error» بود. نیم
 * ساعت با نصف‌کردنِ فایل دنبالِ خطی گشتیم که پیامش از اول در دستِ سرور بود.
 *
 * فقط پیام و نخستین قابِ پشته، و فقط روی همین رابطِ محلی که از loopback
 * بیرون نمی‌رود.
 */
export function handleError({ error }) {
  const line = String(error?.stack || '').split('\n')[1]?.trim() || '';
  console.error('[userbug] SSR:', error?.message, line);
  return { message: `${error?.message || 'خطای ناشناخته'}${line ? ` — ${line}` : ''}` };
}
