import { assertLoopbackRequest } from '$lib/server/security.js';

export async function handle({ event, resolve }) {
  assertLoopbackRequest(event);
  const response = await resolve(event);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  return response;
}
