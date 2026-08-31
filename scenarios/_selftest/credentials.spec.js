/**
 * خودآزمای حساب‌های ذخیره‌شده.
 *
 * ── چرا بیشترِ این تست‌ها دربارهٔ **نگفتن** است ──
 *
 * این تنها جای ابزار است که رمزِ **واقعیِ کاربر** را نگه می‌دارد. هر مسیری
 * که آن رمز بتواند از آن بیرون برود، یک نشتِ دائمی است: رمزی که یک بار در
 * transcript یک ارائه‌دهندهٔ مدل بنشیند، پس گرفته نمی‌شود.
 *
 * پس سه چیز سنجیده می‌شود و هر سه از «کار می‌کند» مهم‌ترند:
 *
 *   ۱. رمزِ متنی بدون تأییدِ صریح نوشته نمی‌شود
 *   ۲. رمز هرگز در فهرستی که به رابط می‌رود نمی‌آید
 *   ۳. رمز در ماسکِ رفتن به مدل هست
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { redactDeep, secretsOf } from '../../src/models/redact.js';

const ENV_NAME = 'UB_SELFTEST_ACCOUNT_PASSWORD';

async function withRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-cred-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'userbug', type: 'module' }), 'utf8');

  const previousRoot = process.env.USERBUG_ROOT;
  process.env.USERBUG_ROOT = root;
  try {
    await run(await import('../../src/knowledge/credentials.js'), root);
  } finally {
    if (previousRoot === undefined) delete process.env.USERBUG_ROOT;
    else process.env.USERBUG_ROOT = previousRoot;
    delete process.env[ENV_NAME];
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('راهِ پیشنهادی متغیر محیطی است و رمز روی دیسک نمی‌نشیند', async () => {
  await withRoot(async (cred, root) => {
    cred.saveAccount({
      target: 'demo',
      environment: 'local',
      id: 'admin',
      email: 'admin@x.test',
      passwordEnv: ENV_NAME,
    });

    const onDisk = fs.readFileSync(path.join(root, 'knowledge', 'demo', 'credentials.json'), 'utf8');
    expect(onDisk).toContain(ENV_NAME);
    expect(onDisk).not.toContain('راز');

    process.env[ENV_NAME] = 'راز-واقعی';
    expect(cred.accountsFor('demo').accounts.admin.password).toBe('راز-واقعی');
  });
});

test('رمزِ متنی بدون تأییدِ صریح رد می‌شود', async () => {
  await withRoot(async (cred) => {
    /**
     * این پروژه حاضر نیست `.env` را بخواند تا به مدل بدهد. نوشتنِ رمزِ متنی
     * روی دیسک با همان موضع نمی‌خواند — پس ممکن است، ولی با انتخابِ صریح.
     */
    expect(() =>
      cred.saveAccount({ target: 'demo', environment: 'local', id: 'a', email: 'a@x.c', password: 'p' })
    ).toThrow(/تأییدِ صریح/);

    const saved = cred.saveAccount({
      target: 'demo',
      environment: 'local',
      id: 'a',
      email: 'a@x.c',
      password: 'p',
      allowPlain: true,
    });
    expect(saved.source).toBe('plain');
  });
});

test('روی محیط تولیدی، ذخیره تأییدِ جدا می‌خواهد', async () => {
  await withRoot(async (cred) => {
    // همان موضعِ guard.js: روی تولید پیش‌فرض «نه» است
    expect(() =>
      cred.saveAccount({ target: 'demo', environment: 'production', id: 'a', email: 'a@x.c', passwordEnv: ENV_NAME })
    ).toThrow(/تولیدی/);

    expect(
      cred.saveAccount({
        target: 'demo',
        environment: 'production',
        id: 'a',
        email: 'a@x.c',
        passwordEnv: ENV_NAME,
        allowProduction: true,
      }).id
    ).toBe('a');
  });
});

test('فهرستِ رابط رمز را برنمی‌گرداند، فقط وضعیتش را', async () => {
  await withRoot(async (cred) => {
    cred.saveAccount({
      target: 'demo',
      environment: 'local',
      id: 'a',
      email: 'a@x.c',
      password: 'رمزِ-متنی',
      allowPlain: true,
    });

    const [account] = cred.listAccounts('demo');
    // صفحه‌ای که برای مدیریتِ حساب ساخته شده نباید خودش راهِ تازه‌ای برای
    // لو رفتن باشد
    expect(JSON.stringify(account)).not.toContain('رمزِ-متنی');
    expect(account.hasPassword).toBe(true);
    expect(account.source).toBe('plain');
  });
});

test('رمزِ حساب در ماسکِ رفتن به مدل هست', async () => {
  await withRoot(async (cred) => {
    process.env[ENV_NAME] = 'رمزِ-حسابِ-واقعی';
    cred.saveAccount({ target: 'demo', environment: 'local', id: 'a', email: 'a@x.c', passwordEnv: ENV_NAME });

    /**
     * بدون این، نخستین snapshot که به مدل می‌رود رمز را با خودش می‌برد و در
     * transcript ارائه‌دهنده می‌ماند — جایی که پس گرفتنش ممکن نیست.
     */
    const secrets = secretsOf({ password: 'x', email: 'y@z.c' }, cred.accountSecrets('demo'));
    const snapshot = { items: [{ value: 'رمزِ حسابِ واقعی است: رمزِ-حسابِ-واقعی' }] };

    expect(JSON.stringify(redactDeep(snapshot, secrets))).not.toContain('رمزِ-حسابِ-واقعی');
    expect(secrets).toContain('a@x.c');
  });
});

test('متغیر محیطیِ تنظیم‌نشده، حساب را حذف نمی‌کند — گزارشش می‌کند', async () => {
  await withRoot(async (cred) => {
    cred.saveAccount({ target: 'demo', environment: 'local', id: 'a', email: 'a@x.c', passwordEnv: ENV_NAME });

    const { accounts, missing } = cred.accountsFor('demo');
    /**
     * حذفش یعنی سناریو با «متغیر ناشناخته: {{account.a.email}}» می‌شکند —
     * پیامی که آدم را می‌فرستد سراغ سناریو، در حالی که مسئله یک متغیر
     * محیطیِ تنظیم‌نشده است.
     */
    expect(accounts.a.email).toBe('a@x.c');
    expect(accounts.a.password).toBe('');
    expect(missing).toEqual([{ id: 'a', env: ENV_NAME }]);
  });
});

test('ورودی نامعتبر بلند می‌شکند', async () => {
  await withRoot(async (cred) => {
    const base = { target: 'demo', environment: 'local', email: 'a@x.c', passwordEnv: ENV_NAME };
    expect(() => cred.saveAccount({ ...base, id: '../escape' })).toThrow(/شناسه/);
    expect(() => cred.saveAccount({ ...base, id: 'a', email: '', username: '' })).toThrow(/ایمیل یا نام کاربری/);
    expect(() => cred.saveAccount({ ...base, id: 'a', passwordEnv: '' })).toThrow(/رمز/);
    // نامِ متغیر باید شکلِ متغیر محیطی داشته باشد، وگرنه هرگز خوانده نمی‌شود
    expect(() => cred.saveAccount({ ...base, id: 'a', passwordEnv: 'lower case' })).toThrow(/متغیر محیطی/);
  });
});

test('متغیر محیطی بر رمزِ متنی می‌چربد و متنی اصلاً نوشته نمی‌شود', async () => {
  await withRoot(async (cred, root) => {
    cred.saveAccount({
      target: 'demo',
      environment: 'local',
      id: 'a',
      email: 'a@x.c',
      passwordEnv: ENV_NAME,
      password: 'متنیِ-ناخواسته',
      allowPlain: true,
    });

    const onDisk = fs.readFileSync(path.join(root, 'knowledge', 'demo', 'credentials.json'), 'utf8');
    expect(onDisk).not.toContain('متنیِ-ناخواسته');
  });
});

test('حذف کار می‌کند و حسابِ نبوده false می‌دهد', async () => {
  await withRoot(async (cred) => {
    cred.saveAccount({ target: 'demo', environment: 'local', id: 'a', email: 'a@x.c', passwordEnv: ENV_NAME });
    expect(cred.removeAccount('demo', 'a')).toBe(true);
    expect(cred.removeAccount('demo', 'a')).toBe(false);
    expect(cred.listAccounts('demo')).toEqual([]);
  });
});

test('پروژهٔ بی‌حساب، خالی می‌دهد نه خطا', async () => {
  await withRoot(async (cred) => {
    expect(cred.listAccounts('ghost')).toEqual([]);
    expect(cred.accountSecrets('ghost')).toEqual([]);
    expect(cred.accountsFor('ghost')).toEqual({ accounts: {}, missing: [] });
  });
});
