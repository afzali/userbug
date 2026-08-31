/**
 * خودآزمای مستنداتِ بیرونی.
 *
 * ── چرا بیشترِ این تست‌ها دربارهٔ **وصل نشدن** است ──
 *
 * این تنها جای ابزار است که به شبکه وصل می‌شود. تا امروز هر چیزی که وارد
 * شناخت می‌شد از دیسکِ خودِ کاربر می‌آمد یا از خودِ کاربر. اینجا **محتوای یک
 * صفحهٔ وب** وارد می‌شود، با آدرسی که کاربر تایپ کرده.
 *
 * آدرسی که کاربر تایپ می‌کند می‌تواند `http://localhost:8080/admin` باشد —
 * و آن‌وقت ابزار به سرویسی وصل می‌شود که فقط از این ماشین دیده می‌شود. این
 * SSRF است، حتی وقتی کاربر خودش آدرس را داده و نیت بدی نداشته.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { assertDocUrl, docSlug, htmlToText } from '../../src/knowledge/docs.js';

test('آدرسِ محلی و شبکهٔ خصوصی واکشی نمی‌شوند', () => {
  for (const bad of [
    'http://localhost:8080/admin',
    'http://127.0.0.1/',
    'http://192.168.1.1/router',
    'http://10.0.0.5/',
    'http://172.16.3.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://service.internal/keys',
  ]) {
    expect(() => assertDocUrl(bad), bad).toThrow();
  }
});

test('طرح‌های غیر HTTP رد می‌شوند', () => {
  // برای فایلِ محلی، محصورسازیِ سورس هست
  expect(() => assertDocUrl('file:///etc/passwd')).toThrow(/http/);
  expect(() => assertDocUrl('ftp://x.test/doc')).toThrow(/http/);
  expect(() => assertDocUrl('javascript:alert(1)')).toThrow();
  expect(() => assertDocUrl('')).toThrow();
  expect(() => assertDocUrl('نه یک آدرس')).toThrow();
});

test('آدرسِ عمومی پذیرفته می‌شود', () => {
  expect(assertDocUrl('https://example.com/docs/api').hostname).toBe('example.com');
  expect(assertDocUrl('http://example.com').protocol).toBe('http:');
});

test('HTML به متنِ خواندنی تبدیل می‌شود', () => {
  const html = `<html><head><title>راهنما</title>
    <style>.x{color:red}</style>
    <script>var secret = 'نباید بیاید';</script></head>
    <body><h1>ورود</h1><p>برای ورود ایمیل خود را بزنید.</p>
    <ul><li>گام یک</li><li>گام دو</li></ul>
    <p>قیمت &lt;۱۰۰&gt; &amp; مالیات</p></body></html>`;

  const text = htmlToText(html);

  // کدِ اسکریپت و استایل نباید بودجهٔ مدل را بخورد
  expect(text).not.toContain('secret');
  expect(text).not.toContain('color:red');

  expect(text).toContain('ورود');
  expect(text).toContain('برای ورود ایمیل خود را بزنید.');
  expect(text).toContain('- گام یک');
  expect(text).toContain('<۱۰۰> & مالیات');
});

test('نامِ فایل خوانا می‌ماند و از پوشه بیرون نمی‌زند', () => {
  expect(docSlug(new URL('https://example.com/docs/api/'))).toBe('example.com-docs-api.md');
  const slug = docSlug(new URL('https://example.com/a/../../b?x=1'));
  expect(slug).not.toContain('/');
  expect(slug).not.toContain('..');
});

/* ───────────────── واکشیِ واقعی، روی سرورِ محلیِ خودمان ───────────────── */

/**
 * سرورِ ساختگی روی loopback است، ولی `assertDocUrl` آن را رد می‌کند — که
 * درست است. پس این تست‌ها `fetchDoc` را با میزبانی صدا می‌زنند که به
 * loopback حل می‌شود ولی نامش محلی نیست... و چون چنین چیزی بدون DNS ممکن
 * نیست، به‌جایش خودِ لایهٔ تبدیل و ذخیره سنجیده می‌شود با تزریقِ fetch.
 *
 * ── چرا شبکهٔ واقعی زده نمی‌شود ──
 *
 * خودآزمایی که به اینترنت وصل شود، در CI بی‌شبکه قرمز می‌شود و آن قرمزی
 * دربارهٔ کد چیزی نمی‌گوید. تستِ ناپایدار بدتر از تستِ نبوده است.
 */
async function withRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-docs-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'userbug', type: 'module' }), 'utf8');
  const previous = process.env.USERBUG_ROOT;
  process.env.USERBUG_ROOT = root;
  try {
    await run({ root, docs: await import('../../src/knowledge/docs.js') });
  } finally {
    if (previous === undefined) delete process.env.USERBUG_ROOT;
    else process.env.USERBUG_ROOT = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** `fetch` را موقتاً جایگزین کن، بی‌آنکه شبکه‌ای در کار باشد. */
async function withFetch(reply, run) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => reply(String(url));
  try {
    await run();
  } finally {
    globalThis.fetch = real;
  }
}

const ok = (body, type = 'text/html') => ({
  ok: true,
  status: 200,
  url: 'https://example.com/doc',
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? type : null) },
  text: async () => body,
});

test('سند واکشی و ذخیره می‌شود، با سرصفحهٔ منبع', async () => {
  await withRoot(async ({ root, docs }) => {
    await withFetch(
      () => ok('<html><head><title>API</title></head><body><p>راهنمای API</p></body></html>'),
      async () => {
        const saved = await docs.fetchDoc({ target: 'demo', url: 'https://example.com/doc', note: 'مرجع' });
        expect(saved.title).toBe('API');

        const file = path.join(root, 'knowledge', 'demo', 'docs', saved.relative);
        const raw = fs.readFileSync(file, 'utf8');

        // شش ماه بعد باید بشود فهمید این فایل چیست و از کجا آمده
        expect(raw).toContain('منبع: https://example.com/doc');
        expect(raw).toContain('یادداشت: مرجع');
        expect(raw).toContain('داده است، نه دستور');
        expect(raw).toContain('راهنمای API');
      }
    );
  });
});

test('سرصفحهٔ ما به مدل نمی‌رود', async () => {
  await withRoot(async ({ docs }) => {
    await withFetch(
      () => ok('<body><p>محتوای واقعی</p></body>'),
      async () => {
        await docs.fetchDoc({ target: 'demo', url: 'https://example.com/doc' });
        const text = await docs.readDocs('demo');

        // سرصفحه برای آدم نوشته شده؛ فرستادنش فقط بودجه می‌خورد
        expect(text).not.toContain('واکشی:');
        expect(text).toContain('محتوای واقعی');
      }
    );
  });
});

test('تغییرمسیر به آدرسِ محلی گرفته می‌شود', async () => {
  await withRoot(async ({ docs }) => {
    /**
     * بدون بررسیِ مقصدِ نهایی، یک تغییرمسیر از `https://example.com` به
     * `http://127.0.0.1` همهٔ بررسی‌های ورودی را دور می‌زد — و ابزار به
     * سرویسِ محلی وصل می‌شد.
     */
    await withFetch(
      () => ({ ...ok('<p>x</p>'), url: 'http://127.0.0.1:9000/internal' }),
      async () => {
        await expect(docs.fetchDoc({ target: 'demo', url: 'https://example.com/doc' })).rejects.toThrow(/محلی|خصوصی/);
      }
    );
  });
});

test('محتوای غیرمتنی رد می‌شود', async () => {
  await withRoot(async ({ docs }) => {
    await withFetch(
      () => ok('%PDF-1.4 binary', 'application/pdf'),
      async () => {
        await expect(docs.fetchDoc({ target: 'demo', url: 'https://example.com/a.pdf' })).rejects.toThrow(/متن نیست/);
      }
    );
  });
});

test('پاسخ خطا و سند خالی، هر دو پیامِ روشن می‌دهند', async () => {
  await withRoot(async ({ docs }) => {
    await withFetch(
      () => ({ ...ok(''), ok: false, status: 404 }),
      async () => {
        await expect(docs.fetchDoc({ target: 'demo', url: 'https://example.com/x' })).rejects.toThrow(/404/);
      }
    );

    await withFetch(
      () => ok('   '),
      async () => {
        await expect(docs.fetchDoc({ target: 'demo', url: 'https://example.com/x' })).rejects.toThrow(/خالی/);
      }
    );
  });
});

test('فهرست و حذف کار می‌کنند، و حذف از پوشه بیرون نمی‌زند', async () => {
  await withRoot(async ({ docs }) => {
    await withFetch(
      () => ok('<p>یک</p>'),
      async () => {
        const saved = await docs.fetchDoc({ target: 'demo', url: 'https://example.com/doc' });
        expect((await docs.listDocs('demo')).map((d) => d.relative)).toEqual([saved.relative]);

        await expect(docs.removeDoc('demo', '../../../etc/passwd')).rejects.toThrow(/نامعتبر/);

        await docs.removeDoc('demo', saved.relative);
        expect(await docs.listDocs('demo')).toEqual([]);
      }
    );
  });
});

test('پروژهٔ بی‌مستند، خالی می‌دهد نه خطا', async () => {
  await withRoot(async ({ docs }) => {
    expect(await docs.listDocs('ghost')).toEqual([]);
    expect(await docs.readDocs('ghost')).toBe('');
  });
});

test('سقفِ بودجه در خواندن رعایت می‌شود', async () => {
  await withRoot(async ({ docs }) => {
    await withFetch(
      () => ok('<p>' + 'الف '.repeat(3000) + '</p>'),
      async () => {
        await docs.fetchDoc({ target: 'demo', url: 'https://example.com/big' });
        const text = await docs.readDocs('demo', { budget: 500 });
        // مستند نباید بودجهٔ prompt را ببلعد
        expect(text.length).toBeLessThanOrEqual(600);
      }
    );
  });
});

test('سرورِ محلیِ واقعی هم رد می‌شود، نه فقط در تئوری', async () => {
  const server = http.createServer((_, res) => res.end('<p>محرمانه</p>'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    await withRoot(async ({ docs }) => {
      // این سرور واقعاً بالاست و پاسخ می‌دهد؛ تنها چیزی که جلویش را
      // می‌گیرد همان دروازه است
      await expect(
        docs.fetchDoc({ target: 'demo', url: `http://127.0.0.1:${port}/secret` })
      ).rejects.toThrow(/محلی|خصوصی/);
    });
  } finally {
    server.close();
  }
});
