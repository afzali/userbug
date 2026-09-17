import { json } from '@sveltejs/kit';
import { listProjects } from '$lib/server/projects.js';
import { jsonError } from '$lib/server/http.js';
import { assertLoopbackRequest } from '$lib/server/security.js';

/**
 * «اپ بالاست یا نه» — فرانت و بک، جدا از هم.
 *
 * ── چرا لازم شد ──
 *
 * تا امروز کاربر **بعد از** شروعِ یک کار می‌فهمید اپ بالا نیست: خزش شروع
 * می‌شد، مرورگر باز می‌شد، و بعد `اپِ هدف روی ... بالا نیست` می‌آمد. یک
 * دقیقه وقت، برای چیزی که یک درخواستِ نیم‌ثانیه‌ای جوابش را می‌داد.
 *
 * ── چرا فرانت و بک جدا ──
 *
 * اپی که فرانتش بالاست و بکش نه، دقیقاً همان چیزی است که یک بررسیِ پر از
 * ۵۰۰ می‌دهد — و ساعتی وقت می‌گیرد تا بفهمی علتش این بوده. یک عددِ مشترک
 * این را پنهان می‌کند.
 *
 * ── چرا محافظتِ SSRFِ `docs.js` اینجا نیست ──
 *
 * آنجا کاربر **آدرسِ دلخواه** می‌دهد تا واکشی شود، پس `localhost` و شبکهٔ
 * خصوصی ممنوع‌اند. اینجا برعکس است: آدرس **پیکربندیِ خودِ پروژه** است و
 * تقریباً همیشه `localhost` است. ممنوع کردنش یعنی این قابلیت اصلاً کار
 * نکند.
 *
 * مرزِ امنیت جای دیگری است و سرِ جایش می‌ماند: فقط آدرس‌هایی که در
 * `targets/*.config.js` نوشته شده‌اند، و فقط برای هدفی که در فهرست است.
 * هیچ آدرسی از خودِ درخواست خوانده نمی‌شود.
 */

/** مهلتِ کوتاه: نشانگر باید سریع جواب بدهد، نه دقیق. */
const TIMEOUT = 2500;

async function probe(url) {
  const raw = String(url || '').trim();
  if (!raw) return { configured: false };

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    /**
     * `GET` و نه `HEAD`.
     *
     * خیلی از سرورهای توسعه (ویت، بعضی فریم‌ورک‌های PHP) به `HEAD` جواب
     * ۴۰۵ یا اصلاً هیچ می‌دهند. یک `GET`ِ ساده همان را می‌گوید و دروغ
     * نمی‌گوید.
     */
    const response = await fetch(raw, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'manual',
    });
    return { configured: true, ok: true, status: response.status, ms: Date.now() - started };
  } catch (cause) {
    /**
     * «جواب نداد» با «خطا داد» فرق دارد و هر دو «بالا نیست» نیستند.
     *
     * سروری که ۵۰۰ می‌دهد **بالاست** — فقط خراب است، و آن را خودِ بررسی
     * پیدا می‌کند. چیزی که نشانگر باید بگوید این است: آیا اصلاً کسی آن‌طرف
     * هست؟
     */
    return {
      configured: true,
      ok: false,
      ms: Date.now() - started,
      why: cause?.name === 'AbortError' ? 'جواب نداد' : 'وصل نشد',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(event) {
  try {
    assertLoopbackRequest(event);

    const key = String(event.url.searchParams.get('target') ?? '').trim();
    const projects = await listProjects();
    const project = projects.find((one) => one.key === key);
    if (!project) throw new Error('هدف نامعتبر است');

    const [front, back] = await Promise.all([probe(project.baseURL), probe(project.settings?.apiURL)]);

    return json({
      target: key,
      at: new Date().toISOString(),
      front: { ...front, url: project.baseURL || '' },
      back: { ...back, url: project.settings?.apiURL || '' },
    });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}

/**
 * تستِ یک آدرس که **هنوز پروژه نشده**.
 *
 * ── چرا `POST` و چرا جدا از `GET` ──
 *
 * فرمِ «پروژهٔ تازه» باید پیش از ذخیره بگوید این آدرس بالاست یا نه — و در
 * آن لحظه هیچ پروژه‌ای در `targets/` نیست که آدرسش را از آن بخوانیم.
 *
 * پس اینجا آدرس از خودِ درخواست می‌آید، و همان‌جا محدود می‌شود: فقط
 * `http`/`https`. بیشتر از این لازم نیست — این سرور روی loopback گوش
 * می‌دهد و درخواستش از همان فرمی می‌آید که کاربر خودش آدرس را در آن
 * نوشته.
 */
export async function POST(event) {
  try {
    assertLoopbackRequest(event);
    const body = await event.request.json();

    const check = async (raw) => {
      const url = String(raw || '').trim();
      if (!url) return { configured: false };
      if (!/^https?:\/\//i.test(url)) return { configured: true, ok: false, why: 'آدرس باید با http شروع شود' };
      return probe(url);
    };

    const [front, back] = await Promise.all([check(body?.baseURL), check(body?.apiURL)]);
    return json({ at: new Date().toISOString(), front, back });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
