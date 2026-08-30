import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { runAsset } from '$lib/server/artifacts.js';
import { contentType, jsonError } from '$lib/server/http.js';

async function serve(params, head = false) {
  try {
    const { file, stat } = await runAsset(params.runId, params.asset);
    const headers = new Headers({
      'content-type': contentType(path.extname(file)),
      'content-length': String(stat.size),
      'cache-control': 'private, no-cache',
      // صریح، تا چیزی که وسط راه نشسته آن را «فایل برای دانلود» نبیند
      'content-disposition': 'inline',
    });
    if (path.extname(file).toLowerCase() === '.html') {
      headers.set('content-security-policy', "default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'");
    }
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
