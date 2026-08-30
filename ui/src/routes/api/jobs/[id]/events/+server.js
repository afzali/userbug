import { json } from '@sveltejs/kit';
import { getJob, subscribeJob } from '$lib/server/jobs.js';

const encoder = new TextEncoder();
const TERMINAL_STATUSES = new Set(['finished', 'cancelled', 'error']);

function encode(event) {
  return encoder.encode(`id: ${event.id}\nevent: message\ndata: ${JSON.stringify(event)}\n\n`);
}

export async function GET({ params, request, url }) {
  if (!getJob(params.id)) return json({ error: 'کار پیدا نشد' }, { status: 404 });

  const headerId = Number(request.headers.get('last-event-id') || 0);
  const queryId = Number(url.searchParams.get('after') || 0);
  const after = Math.max(Number.isFinite(headerId) ? headerId : 0, Number.isFinite(queryId) ? queryId : 0);
  let unsubscribe = null;
  let heartbeat = null;
  let streamController = null;
  let closed = false;

  function cleanup(closeStream) {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    unsubscribe = null;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    if (closeStream) {
      try {
        streamController?.close();
      } catch {
        // اتصال سمت کاربر پیش‌تر بسته شده است.
      }
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      streamController = controller;
      controller.enqueue(encoder.encode(': userbug-sse\n\n'));
      unsubscribe = subscribeJob(params.id, after, (event) => {
        if (closed) return;
        try {
          controller.enqueue(encode(event));
        } catch {
          cleanup(false);
          return;
        }
        if (event.type === 'complete') queueMicrotask(() => cleanup(true));
      });
      if (!unsubscribe) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'کار پیدا نشد' })}\n\n`));
        cleanup(true);
        return;
      }
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          cleanup(false);
        }
      }, 15_000);
      heartbeat.unref?.();

      const latest = getJob(params.id);
      if (!latest || TERMINAL_STATUSES.has(latest.status)) queueMicrotask(() => cleanup(true));
    },
    cancel() {
      cleanup(false);
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
