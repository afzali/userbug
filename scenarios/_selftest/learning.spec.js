/**
 * خودآزمای حلقهٔ یادگیری.
 *
 * ── ادعایی که در آزمون است ──
 *
 * «این ساختار به مرور بهتر می‌شود.» ادعایی که سنجه نداشته باشد قابلِ رد کردن
 * هم نیست، و چیزی که نشود ردش کرد نشان‌دهندهٔ هیچ نیست. پس سه حلقه سنجیده
 * می‌شود، و هر سه باید **بسته** باشند:
 *
 *   ۱. اجرا → شناخت      مسیرِ تازه‌ای که دیده شد، وارد پرونده می‌شود
 *   ۲. تریاژ → چک        «قلابی» چکِ پرسروصدا را می‌شمارد و در نهایت خاموش می‌کند
 *   ۳. تریاژ → خطرها     «باگ واقعی» در شناخت می‌ماند، با `by: user`
 *
 * و یک قاعده که هرگز نباید بشکند: **هیچ حلقهٔ خودکاری حرفِ `by: user` را عوض
 * نمی‌کند.** سیستمی که به‌مرور یاد می‌گیرد، به‌مرور می‌تواند اشتباهِ خودش را
 * روی حقیقت بنویسد — و آن لحظه دیگر هیچ‌کس به پرونده اعتماد نمی‌کند.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';

async function withRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-learn-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'userbug', type: 'module' }), 'utf8');

  const previous = process.env.USERBUG_ROOT;
  process.env.USERBUG_ROOT = root;
  try {
    await run({
      root,
      absorb: await import('../../src/knowledge/absorb.js'),
      feedback: await import('../../src/knowledge/feedback.js'),
      store: await import('../../src/knowledge/store.js'),
      checks: await import('../../src/checks/config.js'),
      history: await import('../../src/knowledge/history.js'),
    });
  } finally {
    if (previous === undefined) delete process.env.USERBUG_ROOT;
    else process.env.USERBUG_ROOT = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const eventsFor = (routes) => routes.map((route) => ({ kind: 'step', route, scenario: 's' }));

test('مسیرِ تازه از اجرا وارد شناخت می‌شود، با by: run', async () => {
  await withRoot(async ({ absorb, store }) => {
    const result = await absorb.absorbRun({ target: 'demo', events: eventsFor(['/', '/library']), runId: 'r1' });

    expect(result.routes).toBe(2);
    const dossier = store.readDossier('demo');
    expect(dossier.routes.map((r) => r.path).sort()).toEqual(['/', '/library']);
    // `run` پایین‌تر از هر منبعِ انسانی است، پس هیچ‌وقت روی حرفِ آدم نمی‌نشیند
    expect(dossier.routes.every((r) => r.by === 'run')).toBe(true);
  });
});

test('هر مسیرِ تازه یک پرسش می‌سازد، نه یک حدس', async () => {
  await withRoot(async ({ absorb, store }) => {
    await absorb.absorbRun({ target: 'demo', events: eventsFor(['/settings']), runId: 'r1' });

    const open = store.readDossier('demo').openQuestions.filter((item) => !item.answer);
    expect(open.map((item) => item.q)).toContain('صفحهٔ /settings برای چیست؟');
  });
});

test('مسیرِ تکراری تاریخچه را پر نمی‌کند', async () => {
  await withRoot(async ({ absorb, store, root, history }) => {
    await absorb.absorbRun({ target: 'demo', events: eventsFor(['/a']), runId: 'r1' });
    const after = await absorb.absorbRun({ target: 'demo', events: eventsFor(['/a']), runId: 'r2' });

    expect(after.routes).toBe(0);
    // هر اجرا یک «update» برای هر روت، تاریخچه را بی‌معنا می‌کرد
    const rows = history.readHistory(store.knowledgeDir('demo'));
    expect(rows.filter((row) => row.ref === 'r2')).toEqual([]);
    expect(fs.existsSync(path.join(root, 'knowledge', 'demo', 'history.ndjson'))).toBe(true);
  });
});

test('اجرا حرفِ کاربر را عوض نمی‌کند', async () => {
  await withRoot(async ({ absorb, store }) => {
    await store.writeDossier('demo', { routes: [{ path: '/library', purpose: 'جملهٔ کاربر', by: 'user' }] });
    await absorb.absorbRun({ target: 'demo', events: eventsFor(['/library']), runId: 'r1' });

    const route = store.readDossier('demo').routes[0];
    expect(route.purpose).toBe('جملهٔ کاربر');
    expect(route.by).toBe('user');
  });
});

test('«قلابی» سروصدا را می‌شمارد و از آستانه چک را خاموش می‌کند', async () => {
  await withRoot(async ({ feedback, checks }) => {
    const finding = { checkId: 'empty-page', fingerprint: 'aaaaaaaaaaaa', message: 'صفحهٔ / خالی است' };

    for (let i = 1; i <= 2; i++) {
      const result = await feedback.applyVerdict({ target: 'demo', finding, verdict: 'false-positive' });
      // یک قلابی ممکن است اشتباهِ تریاژ باشد؛ دو تا هنوز تصادف است
      expect(result.disabled).toBeNull();
      expect(checks.modeOf(checks.readChecksConfig('demo'), 'empty-page')).toBe('watch');
    }

    const third = await feedback.applyVerdict({ target: 'demo', finding, verdict: 'false-positive' });
    expect(third.disabled).toBe('empty-page');

    const config = checks.readChecksConfig('demo');
    expect(checks.modeOf(config, 'empty-page')).toBe('off');
    // خاموشیِ بی‌دلیل همان allowlistِ بلندی می‌شود که README دربارهٔ آن هشدار می‌دهد
    expect(config.checks['empty-page'].why).toContain('خودکار');
    expect(config.checks['empty-page'].noise).toBe(3);
  });
});

test('خاموشیِ خودکار در تاریخچه ثبت می‌شود', async () => {
  await withRoot(async ({ feedback, store, history }) => {
    const finding = { checkId: 'nan-text', fingerprint: 'bbbbbbbbbbbb', message: 'NaN روی صفحه' };
    for (let i = 0; i < 3; i++) {
      await feedback.applyVerdict({ target: 'demo', finding, verdict: 'false-positive' });
    }

    // «چرا این چک خاموش است؟» باید جواب داشته باشد
    const rows = history.readHistory(store.knowledgeDir('demo'));
    expect(rows.some((row) => row.op === 'disable' && row.path === 'checks[nan-text]')).toBe(true);
  });
});

test('«باگ واقعی» به خطرهای شناخت می‌رود، با by: user', async () => {
  await withRoot(async ({ feedback, store }) => {
    await feedback.applyVerdict({
      target: 'demo',
      finding: { fingerprint: 'cccccccccccc', message: 'ذخیره دو بار درخواست می‌فرستد' },
      verdict: 'real-bug',
    });

    const [risk] = store.readDossier('demo').risks;
    expect(risk.label).toBe('ذخیره دو بار درخواست می‌فرستد');
    // by: user یعنی هیچ اجرای بعدی و هیچ هضمِ سورسی پاکش نمی‌کند
    expect(risk.by).toBe('user');
  });
});

test('«رفتار درست است» فقط ثبت می‌شود و چیزی را خاموش نمی‌کند', async () => {
  await withRoot(async ({ feedback, checks, store, history }) => {
    await feedback.applyVerdict({
      target: 'demo',
      finding: { checkId: 'undefined-text', fingerprint: 'dddddddddddd', message: 'undefined روی صفحه' },
      verdict: 'by-design',
    });

    // چک اشتباه نکرده؛ خاموش کردنش یعنی از دست دادنِ موردِ بعدی
    expect(checks.modeOf(checks.readChecksConfig('demo'), 'undefined-text')).toBe('watch');
    expect(history.readHistory(store.knowledgeDir('demo')).some((row) => row.op === 'note')).toBe(true);
  });
});

test('«بعداً» هیچ کاری نمی‌کند', async () => {
  await withRoot(async ({ feedback, checks, store }) => {
    const result = await feedback.applyVerdict({
      target: 'demo',
      finding: { checkId: 'stack-trace', fingerprint: 'eeeeeeeeeeee', message: 'x' },
      verdict: 'later',
    });

    expect(result.applied).toEqual([]);
    expect(checks.readChecksConfig('demo').checks['stack-trace']).toBeUndefined();
    expect(store.readDossier('demo').risks).toEqual([]);
  });
});

test('برچسبِ نامعتبر بلند می‌شکند', async () => {
  await withRoot(async ({ feedback }) => {
    await expect(
      feedback.applyVerdict({ target: 'demo', finding: {}, verdict: 'چیزِ ناشناخته' })
    ).rejects.toThrow(/برچسب/);
  });
});

test('یافتهٔ بی‌checkId چکی را خاموش نمی‌کند', async () => {
  await withRoot(async ({ feedback, checks }) => {
    // یافته‌های داور (خطای کنسول، ۵۰۰) چک ندارند؛ «قلابی» بودنشان
    // دربارهٔ allowlist است نه دربارهٔ چک
    const result = await feedback.applyVerdict({
      target: 'demo',
      finding: { source: 'console', fingerprint: 'ffffffffffff', message: 'x' },
      verdict: 'false-positive',
    });

    expect(result.applied).toEqual([]);
    expect(Object.keys(checks.readChecksConfig('demo').checks)).toEqual([]);
  });
});

test('سنجهٔ شناخت با افزودنِ هدف بالا می‌رود', async () => {
  await withRoot(async ({ store }) => {
    const { coverageOf } = await import('../../src/knowledge/coverage.js');

    await store.writeDossier('demo', { routes: [{ path: '/a', by: 'run' }, { path: '/b', by: 'run' }] });
    const before = coverageOf('demo').score;

    await store.writeDossier('demo', {
      routes: [
        { path: '/a', purpose: 'الف', by: 'user' },
        { path: '/b', purpose: 'ب', by: 'user' },
      ],
    });

    /**
     * بدون سنجه، «به مرور بهتر می‌شود» یک ادعاست نه یک واقعیت. این عدد باید
     * بالا برود؛ اگر نرفت، طرح شکست خورده و باید بدانیم.
     */
    expect(coverageOf('demo').score).toBeGreaterThan(before);
  });
});
