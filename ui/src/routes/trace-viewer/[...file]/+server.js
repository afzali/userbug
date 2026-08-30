import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { existingFileInside, TRACE_VIEWER_DIR } from '$lib/server/paths.js';
import { contentType, jsonError } from '$lib/server/http.js';

async function serve(params, head = false) {
  try {
    const relative = params.file || 'index.html';
    const { file, stat } = await existingFileInside(TRACE_VIEWER_DIR, relative);
    const headers = new Headers({
      'content-type': contentType(path.extname(file)),
      'content-length': String(stat.size),
      'cache-control': relative === 'index.html' || relative === 'sw.bundle.js' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'service-worker-allowed': '/trace-viewer/',
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
