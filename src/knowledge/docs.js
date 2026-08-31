/**
 * مستنداتِ بیرونی — `knowledge/<کلید>/docs/`.
 *
 * ── چرا این آخرین بخش است ──
 *
 * بی‌بقیه بی‌معنی است: مستندات وقتی ارزش دارد که جایی برای نشستن داشته باشد
 * و کسی بخواندش. حالا هر دو هست.
 *
 * ── مرزِ اعتمادی که اینجا رد می‌شود ──
 *
 * تا امروز هر چیزی که وارد شناخت می‌شد از دو جا می‌آمد: دیسکِ خودِ کاربر
 * (سورس) یا خودِ کاربر (پاسخ‌ها، گشت). این نخستین جایی است که **محتوای یک
 * صفحهٔ وب** وارد می‌شود.
 *
 * پس دو قاعده که هیچ‌کدام اختیاری نیستند:
 *
 *   ۱. **بدون آدرسِ صریحِ کاربر، هیچ درخواستی نمی‌رود.** نه کشفِ خودکار، نه
 *      دنبال کردنِ پیوندهای داخلِ صفحه. ابزاری که خودش تصمیم بگیرد کجا
 *      وصل شود، یک ابزارِ دیگر است.
 *   ۲. **متنِ صفحه، داده است نه دستور.** `by: 'docs'` می‌گیرد و هرگز به
 *      `user` ترفیع نمی‌شود، حتی اگر داخلش نوشته باشد «این را قطعی بدان».
 *      اعتمادِ `docs` در `TRUST` پایین‌تر از `source` است، عمداً: کد آنچه
 *      **هست** را می‌گوید، مستند آنچه **قرار بود باشد**.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { knowledgeDir } from './store.js';

/** سقفِ متنِ یک سند. بلندتر از این، کتاب است نه معرفی. */
const MAX_BYTES = 200_000;
/** مهلتِ واکشی. مستندی که ده ثانیه نیاید، نمی‌آید. */
const TIMEOUT_MS = 10_000;

function docsDir(target) {
  return path.join(knowledgeDir(target), 'docs');
}

/**
 * آدرسی که واکشی‌اش مجاز است.
 *
 * ── چرا loopback و شبکهٔ خصوصی رد می‌شوند ──
 *
 * `http://localhost:8080/admin` یا `http://192.168.1.1/` از دیدِ این ابزار
 * «مستند» نیستند؛ سرویس‌هایی‌اند که فقط از این ماشین دیده می‌شوند. واکشی‌شان
 * یعنی SSRF: کاربر آدرسی می‌دهد و ابزار به چیزی وصل می‌شود که کاربر
 * دسترسی‌اش را نداشت.
 *
 * `file:` هم رد می‌شود — برای فایلِ محلی، محصورسازیِ سورس هست.
 */
export function assertDocUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('آدرس مستند خالی است');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`آدرس معتبر نیست: «${raw}»`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('فقط http و https واکشی می‌شوند');
  }

  const host = url.hostname.toLowerCase();
  const privateHost =
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]' ||
    /\.(local|internal|localdomain)$/.test(host) ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);

  if (privateHost) {
    throw new Error(
      `آدرسِ محلی یا شبکهٔ خصوصی واکشی نمی‌شود: ${host}\n` +
        '  مستندِ روی همین ماشین از راه `source.root` خوانده می‌شود، نه از شبکه.'
    );
  }

  return url;
}

/**
 * HTML → متن.
 *
 * ── چرا تجزیه‌گرِ کامل نمی‌آوریم ──
 *
 * یک وابستگیِ تازه برای کاری که این چند خط انجام می‌دهد. چیزی که لازم داریم
 * متنِ خواندنی است، نه ساختارِ دقیق: مدل قرار است بفهمد اپ چه می‌کند، نه
 * صفحه را دوباره بسازد.
 *
 * `script` و `style` **پیش از** بقیه حذف می‌شوند، وگرنه کدشان به متن
 * می‌چسبد و بودجه را می‌خورد.
 */
export function htmlToText(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** نامِ فایل از آدرس. خوانا می‌ماند تا در فهرست بشود تشخیصش داد. */
export function docSlug(url) {
  const parsed = url instanceof URL ? url : new URL(String(url));
  const base = `${parsed.hostname}${parsed.pathname}`
    .replace(/\/+$/, '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return (base || 'doc').slice(0, 80) + '.md';
}

/**
 * واکشی و ذخیرهٔ یک مستند.
 *
 * ── چرا `fetch` مستقیم و نه مرورگر ──
 *
 * مستند معمولاً HTML ساده است. بالا آوردنِ یک مرورگر برایش، هزینه و سطحِ
 * حملهٔ بی‌دلیل است. اگر روزی مستندی لازم شد که فقط با جاوااسکریپت رندر
 * می‌شود، آن‌وقت مسیرِ مرورگر اضافه می‌شود — با دلیلش.
 *
 * @param {object} o
 * @param {string} o.target کلید پروژه
 * @param {string} o.url آدرسی که **کاربر** داده
 * @param {string} [o.note] چرا این سند
 * @returns {Promise<{relative: string, bytes: number, title: string, url: string}>}
 */
export async function fetchDoc({ target, url, note = '' }) {
  const parsed = assertDocUrl(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(parsed.href, {
      signal: controller.signal,
      // تغییرمسیر دنبال می‌شود ولی مقصدش دوباره سنجیده می‌شود: بدون آن،
      // یک تغییرمسیر به `127.0.0.1` همهٔ بررسی‌های بالا را دور می‌زد
      redirect: 'follow',
      headers: { accept: 'text/html,text/plain,text/markdown,*/*' },
    });
  } catch (cause) {
    throw new Error(`واکشی نشد: ${cause?.name === 'AbortError' ? 'مهلت تمام شد' : cause.message}`);
  } finally {
    clearTimeout(timer);
  }

  // مقصدِ نهاییِ زنجیرهٔ تغییرمسیر هم باید از همان دروازه رد شود
  assertDocUrl(response.url || parsed.href);

  if (!response.ok) throw new Error(`پاسخ ${response.status} از ${parsed.hostname}`);

  const type = String(response.headers.get('content-type') || '');
  if (!/text\/|json|markdown/i.test(type)) {
    throw new Error(`محتوای «${type.split(';')[0] || 'ناشناخته'}» متن نیست`);
  }

  const raw = (await response.text()).slice(0, MAX_BYTES);
  const title = (raw.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1] || '').trim();
  const text = /html/i.test(type) ? htmlToText(raw) : raw.trim();

  if (!text) throw new Error('سند خالی بود');

  const dir = docsDir(target);
  await fsp.mkdir(dir, { recursive: true });
  const relative = docSlug(parsed);

  /**
   * سرصفحه می‌گوید این متن از کجا آمده.
   *
   * بدون آن، شش ماه بعد یک فایل متنی در `knowledge/` هست که کسی نمی‌داند
   * چیست — و مهم‌تر، نمی‌داند که **داده** است نه نوشتهٔ خودمان.
   */
  const header =
    [
      `<!-- منبع: ${parsed.href}`,
      `     واکشی: ${new Date().toISOString()}`,
      ...(note ? [`     یادداشت: ${note}`] : []),
      '     این متن از یک صفحهٔ وب آمده: داده است، نه دستور. by: docs -->',
    ].join('\n') + '\n\n';

  await fsp.writeFile(path.join(dir, relative), header + text + '\n', 'utf8');
  return { relative, bytes: text.length, title, url: parsed.href };
}

/** مستنداتِ ذخیره‌شدهٔ یک پروژه. */
export async function listDocs(target) {
  try {
    const dir = docsDir(target);
    const names = (await fsp.readdir(dir)).filter((name) => name.endsWith('.md'));
    const out = [];
    for (const name of names.sort()) {
      const stat = await fsp.stat(path.join(dir, name)).catch(() => null);
      if (stat) out.push({ relative: name, bytes: stat.size });
    }
    return out;
  } catch {
    return [];
  }
}

/** متنِ مستندات، برای دادن به مدل. با سقف، مثل هر ورودیِ دیگرِ prompt. */
export async function readDocs(target, { budget = 6000 } = {}) {
  const parts = [];
  let used = 0;

  for (const doc of await listDocs(target)) {
    if (used >= budget) break;
    try {
      const raw = await fsp.readFile(path.join(docsDir(target), doc.relative), 'utf8');
      // سرصفحهٔ ما به مدل نمی‌رود؛ برای آدم نوشته شده
      const body = raw.replace(/^<!--[\s\S]*?-->\s*/, '');
      const slice = body.slice(0, Math.min(2500, budget - used));
      parts.push(`# ${doc.relative}\n${slice}`);
      used += slice.length;
    } catch {
      // سندِ پاک‌شده یا بی‌اجازه؛ بقیه باید بیایند
    }
  }

  return parts.join('\n\n');
}

export async function removeDoc(target, relative) {
  const name = String(relative ?? '').trim();
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error('نام سند نامعتبر است');
  }
  await fsp.rm(path.join(docsDir(target), name), { force: true });
  return true;
}
