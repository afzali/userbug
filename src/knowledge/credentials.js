/**
 * حساب‌های ذخیره‌شده — `knowledge/<کلید>/credentials.json`.
 *
 * ── چرا لازم شد ──
 *
 * `identity` امروز فقط `fresh-signup` است: هر اجرا یک کاربرِ تصادفی. برای
 * اپی که ثبت‌نامش باز نیست، یا برای آزمودنِ حسابی که **داده دارد** (سبدِ پر،
 * سندِ قدیمی، نقشِ ادمین)، این کافی نیست.
 *
 * ── چرا پیش‌فرض `passwordEnv` است و نه `password` ──
 *
 * این پروژه حاضر نیست `.env` را بخواند تا به مدل بدهد (`SECRET_PATTERNS` در
 * `source-access.js`). نوشتنِ رمزِ متنی روی دیسک با همان موضع نمی‌خواند.
 *
 * پس پیش‌فرض این است که فایل فقط **نامِ متغیر محیطی** را نگه دارد. رمزِ متنی
 * ممکن است، ولی با انتخابِ صریح و با هشدار — چون گاهی کاربر یک حسابِ تستیِ
 * بی‌ارزش دارد و اجبار به تنظیمِ متغیر محیطی فقط باعث می‌شود کلاً استفاده
 * نکند.
 *
 * ── چرا فایل در `.gitignore` است ──
 *
 * حتی نامِ متغیر و ایمیل هم داده‌ای است که مالِ همان ماشین است. و اگر روزی
 * کسی گزینهٔ متنی را بزند، آن فایل نباید ناگهان در تاریخچهٔ گیت بنشیند.
 */
import fs from 'node:fs';
import path from 'node:path';
import { knowledgeDir } from './store.js';

function file(target) {
  return path.join(knowledgeDir(target), 'credentials.json');
}

/** شناسهٔ حساب — همان قاعدهٔ نامِ فایل، چون در سناریو هم نوشته می‌شود. */
export function assertAccountId(value) {
  const id = String(value ?? '').trim();
  if (!/^[\p{L}\p{N}_-]+$/u.test(id) || id.length > 40) {
    throw new Error(`شناسهٔ حساب نامعتبر است: «${value}». حرف، عدد، خط تیره و زیرخط مجاز است`);
  }
  return id;
}

function normalize(raw) {
  const id = String(raw?.id ?? '').trim();
  if (!id) return null;
  return {
    id,
    email: String(raw?.email ?? '').trim(),
    username: String(raw?.username ?? '').trim(),
    passwordEnv: String(raw?.passwordEnv ?? '').trim(),
    password: typeof raw?.password === 'string' ? raw.password : '',
    note: String(raw?.note ?? '').slice(0, 300),
    at: String(raw?.at ?? ''),
  };
}

/** خواندنِ خام. نبودِ فایل یعنی «حسابی نیست»، نه خطا. */
export function readAccounts(target) {
  try {
    const raw = JSON.parse(fs.readFileSync(file(target), 'utf8'));
    return (Array.isArray(raw?.accounts) ? raw.accounts : []).map(normalize).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * فهرست برای رابط و CLI — **بدون رمز**.
 *
 * رمزِ متنی هرگز به کلاینت برنمی‌گردد؛ فقط «تنظیم شده / نشده». وگرنه صفحه‌ای
 * که برای مدیریتِ حساب ساخته شده، خودش راهِ تازه‌ای برای لو رفتن می‌شود.
 */
export function listAccounts(target) {
  return readAccounts(target).map((account) => ({
    id: account.id,
    email: account.email,
    username: account.username,
    note: account.note,
    at: account.at,
    source: account.passwordEnv ? 'env' : account.password ? 'plain' : 'none',
    passwordEnv: account.passwordEnv,
    hasPassword: Boolean(account.passwordEnv ? process.env[account.passwordEnv] : account.password),
  }));
}

function write(target, accounts) {
  const dir = knowledgeDir(target);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(target), JSON.stringify({ version: 1, accounts }, null, 2) + '\n', 'utf8');
}

/**
 * ذخیرهٔ یک حساب.
 *
 * @param {object} o
 * @param {string} o.target کلید پروژه
 * @param {object} o.target_ کانفیگ هدف — فقط برای دروازهٔ محیط
 * @param {string} o.id
 * @param {string} [o.email] @param {string} [o.username]
 * @param {string} [o.passwordEnv] نامِ متغیر محیطی (راهِ پیشنهادی)
 * @param {string} [o.password] رمزِ متنی — فقط با `allowPlain`
 * @param {boolean} [o.allowPlain] تأییدِ صریحِ ذخیرهٔ متنی
 * @param {boolean} [o.allowProduction] تأییدِ جداگانه برای محیط تولیدی
 */
export function saveAccount({
  target,
  environment,
  id,
  email = '',
  username = '',
  passwordEnv = '',
  password = '',
  note = '',
  allowPlain = false,
  allowProduction = false,
}) {
  const accountId = assertAccountId(id);
  if (!email && !username) throw new Error('حساب باید ایمیل یا نام کاربری داشته باشد');

  /**
   * دروازهٔ محیط.
   *
   * همان موضعِ `guard.js` برای قلاب‌های مخرب: روی تولید، پیش‌فرض «نه» است.
   * ذخیرهٔ اعتبارِ یک حسابِ واقعیِ تولیدی روی دیسک، تصمیمی است که باید
   * جداگانه گرفته شود — نه چیزی که وسط یک گشت اتفاق بیفتد.
   */
  if (environment === 'production' && !allowProduction) {
    throw new Error(
      'این هدف روی محیط تولیدی است.\n' +
        '  ذخیرهٔ اعتبارِ حسابِ تولیدی تأییدِ جداگانه می‌خواهد.'
    );
  }

  if (password && !allowPlain) {
    throw new Error(
      'ذخیرهٔ رمزِ متنی روی دیسک تأییدِ صریح می‌خواهد.\n' +
        '  راهِ پیشنهادی: رمز را در یک متغیر محیطی بگذارید و نامش را در `passwordEnv` بنویسید.'
    );
  }
  if (!passwordEnv && !password) {
    throw new Error('حساب بدون رمز معنا ندارد؛ `passwordEnv` یا `password` لازم است');
  }
  if (passwordEnv && !/^[A-Z][A-Z0-9_]*$/.test(passwordEnv)) {
    throw new Error(`نامِ متغیر محیطی نامعتبر است: «${passwordEnv}»`);
  }

  const accounts = readAccounts(target).filter((item) => item.id !== accountId);
  accounts.push({
    id: accountId,
    email,
    username,
    passwordEnv,
    // اگر متغیر محیطی داده شده، رمزِ متنی اصلاً نوشته نمی‌شود
    password: passwordEnv ? '' : password,
    note,
    at: new Date().toISOString(),
  });

  write(target, accounts);
  return listAccounts(target).find((item) => item.id === accountId);
}

export function removeAccount(target, id) {
  const accountId = assertAccountId(id);
  const accounts = readAccounts(target);
  const next = accounts.filter((item) => item.id !== accountId);
  if (next.length === accounts.length) return false;
  write(target, next);
  return true;
}

/**
 * حساب‌های حل‌شده برای فضای‌نامِ `{{account.*}}` سناریو.
 *
 * ── چرا حسابِ بی‌رمز حذف نمی‌شود ──
 *
 * اگر متغیر محیطی تنظیم نشده باشد، حساب با رمزِ خالی می‌آید. حذفش یعنی
 * سناریو با «متغیر ناشناخته در سناریو: {{account.admin.email}}» می‌شکند —
 * پیامی که آدم را می‌فرستد سراغ سناریو، در حالی که مسئله یک متغیر محیطیِ
 * تنظیم‌نشده است. با ماندنش، شکست در همان `fill` می‌افتد و روشن‌تر است.
 *
 * پیامِ صریح هم می‌آید: `missing` می‌گوید کدام متغیر نبود.
 */
export function accountsFor(target) {
  const out = {};
  const missing = [];

  for (const account of readAccounts(target)) {
    const password = account.passwordEnv ? process.env[account.passwordEnv] || '' : account.password;
    if (account.passwordEnv && !password) missing.push({ id: account.id, env: account.passwordEnv });

    out[account.id] = {
      email: account.email,
      username: account.username || account.email,
      password,
      // بخشِ پیش از @، همان چیزی که `identity.local` هم می‌دهد
      local: account.email ? account.email.split('@')[0] : account.username,
    };
  }

  return { accounts: out, missing };
}

/**
 * رمزها و ایمیل‌های همهٔ حساب‌ها، برای ماسک کردن.
 *
 * ── چرا این تابع حیاتی است ──
 *
 * بدون آن، نخستین snapshot که به مدل می‌رود رمزِ حسابِ واقعیِ کاربر را با
 * خودش می‌برد — و در transcript ارائه‌دهنده می‌ماند، جایی که دیگر کنترلی
 * رویش نداریم. `secretsOf` در `redact.js` تا امروز فقط `identity` را
 * می‌شناخت، چون تا امروز رمزِ دیگری وجود نداشت.
 */
export function accountSecrets(target) {
  const out = [];
  for (const account of readAccounts(target)) {
    const password = account.passwordEnv ? process.env[account.passwordEnv] : account.password;
    if (password) out.push(password);
    if (account.email) out.push(account.email);
  }
  return out;
}
