/**
 * خودآزمای تنظیماتِ هوش مصنوعی.
 *
 * ── چرا این فایل هست ──
 *
 * پیش‌فرضِ نقشِ `analyze` روزی رایگان بودنش تمام شد و ارائه‌دهنده ۴۰۴ داد.
 * پیامِ خامش وسطِ صفحهٔ شناخت به کاربر رسید — یعنی وقتی معلوم شد که کار
 * شکسته بود. سه چیز از آن درآمد و هر سه اینجا سنجیده می‌شوند:
 *
 *   ۱. پیامِ ارائه‌دهنده باید به جمله‌ای تبدیل شود که بشود با آن کاری کرد،
 *      شاملِ اسلاگی که خودش پیشنهاد داده.
 *   ۲. لایه‌ها باید درست بچربند، و «چه چیزی را پوشاند» درست گزارش شود —
 *      نسخهٔ اول هر مقدار را «پوشانده‌شده توسط خودش» می‌گفت.
 *   ۳. نوشتنِ کلید نباید بقیهٔ `.env` را ببرد.
 *
 * همه با ریشهٔ موقت اجرا می‌شوند: این ماژول‌ها **نویسنده**اند و اگر ریشه را
 * اشتباه بگیرند، روی `.env` واقعیِ کاربر می‌نویسند. همان درسی که
 * `knowledge/store.js` نوشته و همین فایل یک بار بیرونش کشید.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';

import { explainModelError, suggestedSlug } from '../../src/models/provider.js';

/** ریشهٔ موقت، و برگرداندنِ همه‌چیز سرِ جایش. */
async function withRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-ai-'));
  const previousRoot = process.env.USERBUG_ROOT;
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.USERBUG_ROOT = root;

  const settings = await import('../../src/models/settings.js');
  const config = await import('../../src/models/config.js');
  config.clearGlobalConfigCache();

  try {
    return await run({ root, settings, config });
  } finally {
    if (previousRoot === undefined) delete process.env.USERBUG_ROOT;
    else process.env.USERBUG_ROOT = previousRoot;
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
    config.clearGlobalConfigCache();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test.describe('پیامِ ارائه‌دهنده', () => {
  const REAL_404 =
    '{"error":{"message":"This model is unavailable for free. The paid version is available now - ' +
    'use this slug instead: z-ai/glm-5.2","code":404},"user_id":"user_x"}';

  test('اسلاگِ پیشنهادی بیرون کشیده می‌شود', () => {
    expect(suggestedSlug(REAL_404)).toBe('z-ai/glm-5.2');
  });

  test('جمله از JSON درمی‌آید، نه کلِ بدنه', () => {
    expect(explainModelError(REAL_404)).toContain('unavailable for free');
    expect(explainModelError(REAL_404)).not.toContain('user_id');
  });

  test('بدنهٔ غیرِ JSON هم چیزی می‌دهد، و پیشنهادِ الکی نمی‌سازد', () => {
    expect(explainModelError('502 Bad Gateway')).toBe('502 Bad Gateway');
    expect(suggestedSlug('502 Bad Gateway')).toBe('');
    expect(suggestedSlug(undefined)).toBe('');
  });
});

test.describe('لایه‌ها', () => {
  test('تنظیمات بر پیش‌فرض می‌چربد، و بقیهٔ نقش‌ها دست‌نخورده می‌مانند', async () => {
    await withRoot(async ({ settings }) => {
      const before = await settings.effectiveModels();
      expect(before.roles.find((item) => item.role === 'analyze').from).toBe('default');

      await settings.setModel({ role: 'analyze', slug: 'vendor/model:free' });
      const after = await settings.effectiveModels();

      const analyze = after.roles.find((item) => item.role === 'analyze');
      expect(analyze.slug).toBe('vendor/model:free');
      expect(analyze.from).toBe('settings');
      expect(after.roles.find((item) => item.role === 'resolve').from).toBe('default');
    });
  });

  test('«پوشانده شد» فقط وقتی گزارش می‌شود که واقعاً لایهٔ دیگری مقدار دارد', async () => {
    const { pickModel } = await import('../../src/models/settings.js');

    // فقط کانفیگِ دست‌نویس: چیزی پوشانده نشده، چون پیش‌فرضِ ابزار شمرده نمی‌شود
    const onlyConfig = pickModel('analyze', { config: { roles: { analyze: 'old/model:free' } } });
    expect(onlyConfig.slug).toBe('old/model:free');
    expect(onlyConfig.from).toBe('config');
    expect(onlyConfig.shadowed).toEqual([]);

    // حالا تنظیماتِ رابط رویش می‌نشیند و باید صریح بگوید چه چیزی را پوشاند
    const covered = pickModel('analyze', {
      settings: { roles: { analyze: 'new/model:free' } },
      config: { roles: { analyze: 'old/model:free' } },
    });
    expect(covered.slug).toBe('new/model:free');
    expect(covered.from).toBe('settings');
    expect(covered.shadowed).toEqual([{ from: 'config', slug: 'old/model:free' }]);

    // `default`ِ یک لایه به همهٔ نقش‌ها می‌خورد، ولی نقشِ صریح بر آن می‌چربد
    expect(pickModel('resolve', { settings: { default: 'a/b' } }).slug).toBe('a/b');
    expect(
      pickModel('resolve', { settings: { default: 'a/b', roles: { resolve: 'c/d' } } }).slug
    ).toBe('c/d');
  });

  test('خالی کردن یعنی برگشت به لایهٔ زیرین، نه اسلاگِ خالی', async () => {
    await withRoot(async ({ settings }) => {
      await settings.setModel({ role: 'analyze', slug: 'vendor/model:free' });
      await settings.setModel({ role: 'analyze', slug: null });
      const view = await settings.effectiveModels();
      expect(view.roles.find((item) => item.role === 'analyze').from).toBe('default');
      expect(settings.readSettings().models?.roles?.analyze).toBeUndefined();
    });
  });

  test('اسلاگِ بی‌شکل و نقشِ ناشناخته بلند می‌شکنند', async () => {
    await withRoot(async ({ settings }) => {
      await expect(settings.setModel({ role: 'analyze', slug: 'bad' })).rejects.toThrow(/اسلاگ/);
      await expect(settings.setModel({ role: 'nope', slug: 'a/b' })).rejects.toThrow(/نقش/);
      await expect(settings.setBudget('-1')).rejects.toThrow(/بودجه/);
      await expect(settings.setBudget('abc')).rejects.toThrow(/بودجه/);
    });
  });
});

test.describe('کلید', () => {
  test('در .env می‌نشیند بی آنکه بقیهٔ خطوط برود', async () => {
    await withRoot(async ({ root, settings }) => {
      const env = path.join(root, '.env');
      fs.writeFileSync(env, 'OTHER_SECRET=keep-me\nOPENROUTER_API_KEY=old-key\n', 'utf8');

      await settings.setApiKey('new-key-1234');
      const text = fs.readFileSync(env, 'utf8');

      expect(text).toContain('OTHER_SECRET=keep-me');
      expect(text).toContain('OPENROUTER_API_KEY=new-key-1234');
      expect(text).not.toContain('old-key');
    });
  });

  test('نبودِ فایل یعنی ساخته می‌شود', async () => {
    await withRoot(async ({ root, settings }) => {
      await settings.setApiKey('first-key-9876');
      expect(fs.readFileSync(path.join(root, '.env'), 'utf8')).toContain('OPENROUTER_API_KEY=first-key-9876');
    });
  });

  test('وضعیت فقط نشانه می‌دهد، نه خودِ کلید', async () => {
    await withRoot(async ({ settings }) => {
      await settings.setApiKey('super-secret-abcd');
      const status = settings.keyStatus();
      expect(status.present).toBe(true);
      expect(status.tail).toBe('abcd');
      expect(JSON.stringify(status)).not.toContain('super-secret');
    });
  });

  test('کلیدِ خالی یا دارای فاصله رد می‌شود', async () => {
    await withRoot(async ({ settings }) => {
      await expect(settings.setApiKey('')).rejects.toThrow();
      await expect(settings.setApiKey('has space')).rejects.toThrow();
    });
  });

  test('بی‌کلید، سنجش درخواستی نمی‌فرستد', async () => {
    await withRoot(async ({ settings }) => {
      delete process.env.OPENROUTER_API_KEY;
      const result = await settings.checkModel('vendor/model:free');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('کلید');
    });
  });
});
