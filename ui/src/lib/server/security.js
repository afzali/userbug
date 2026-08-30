import { error } from '@sveltejs/kit';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function normalizedHostname(host) {
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function assertLoopbackRequest(event) {
  const host = event.request.headers.get('host') || event.url.host;
  if (!LOOPBACK_HOSTS.has(normalizedHostname(host))) {
    error(403, 'رابط userbug فقط از loopback قابل دسترسی است');
  }

  try {
    const address = event.getClientAddress();
    if (address && !LOOPBACK_ADDRESSES.has(address.toLowerCase())) {
      error(403, 'درخواست غیرمحلی پذیرفته نمی‌شود');
    }
  } catch (cause) {
    if (cause?.status === 403) throw cause;
    // بعضی adapterهای توسعه آدرس را ارائه نمی‌کنند؛ Host همچنان کنترل شده است.
  }
}

export function assertMutationRequest(event) {
  assertLoopbackRequest(event);
  if (event.request.headers.get('x-userbug-request') !== '1') {
    error(403, 'درخواست تغییردهنده بدون نشان محلی رد شد');
  }

  const origin = event.request.headers.get('origin');
  if (!origin) error(403, 'Origin لازم است');
  try {
    const parsed = new URL(origin);
    if (parsed.host !== event.url.host || parsed.protocol !== event.url.protocol) {
      error(403, 'Origin درخواست با رابط محلی یکی نیست');
    }
  } catch (cause) {
    if (cause?.status === 403) throw cause;
    error(403, 'Origin نامعتبر است');
  }
}
