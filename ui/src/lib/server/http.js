const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
  '.map': 'application/json; charset=utf-8',
};

export function contentType(extension) {
  return TYPES[String(extension).toLowerCase()] || 'application/octet-stream';
}

export function jsonError(cause, status = 400) {
  const resolvedStatus = Number(cause?.status) || status;
  const message = cause?.body?.message || cause?.message || String(cause);
  return new Response(JSON.stringify({ error: message }), {
    status: resolvedStatus,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
