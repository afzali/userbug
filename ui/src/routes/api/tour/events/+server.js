import { json } from '@sveltejs/kit';
import { getTour } from '$lib/server/tours.js';
import { assertLoopbackRequest } from '$lib/server/security.js';

/**
 * جریانِ زندهٔ یک گشت.
 *
 * ── چرا تاریخچه هم فرستاده می‌شود ──
 *
 * کاربر ممکن است تبِ پنل را ببندد و دوباره باز کند، در حالی که مرورگرِ گشت
 * هنوز باز است. بدون بازپخشِ تاریخچه، پنلِ تازه خالی می‌آمد و آنچه تا آن
 * لحظه ضبط شده بود نامرئی می‌شد — و کاربر منطقاً فکر می‌کرد گشت مرده است.
 */
const encoder = new TextEncoder();

export async function GET(event) {
  try {
    assertLoopbackRequest(event);
  } catch (cause) {
    return json({ error: cause?.body?.message || 'دسترسی رد شد' }, { status: 403 });
  }

  const target = String(event.url.searchParams.get('target') || '');
  const handle = getTour(target);
  if (!handle) return json({ error: 'گشتی در حال اجرا نیست' }, { status: 404 });

  let listener = null;
  let heartbeat = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (listener) handle.off('event', listener);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // اتصال از سمت کاربر بسته شده
        }
      };

      controller.enqueue(encoder.encode(': userbug-tour\n\n'));
      for (const past of handle.history) send(past);

      listener = (payload) => {
        send(payload);
        if (payload.type === 'stopped') queueMicrotask(cleanup);
      };
      handle.on('event', listener);

      heartbeat = setInterval(() => send({ type: 'ping' }), 15_000);
      heartbeat.unref?.();

      if (handle.session.status !== 'running') queueMicrotask(cleanup);
    },
    cancel() {
      closed = true;
      if (listener) handle.off('event', listener);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
