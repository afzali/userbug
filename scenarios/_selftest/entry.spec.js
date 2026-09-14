/**
 * خودآزمای ساختِ «مسیرِ ورود».
 *
 * ── چرا این یکی گران‌ترین خطا را می‌گیرد ──
 *
 * مسیرِ ورودِ غلط شبیه خطا نیست: خزش تمام می‌شود، نقشه ساخته می‌شود، و
 * گزارش «موفق» می‌گوید — با دو گرهِ `/login`. کاربری که در تنظیمات حساب
 * ساخته بود، حق داشت فکر کند کارش را کرده. دقیقاً همین روی nepi افتاد.
 *
 * سه چیزی که اینجا سنجیده می‌شود و هیچ‌کدام در اجرا دیده نمی‌شوند:
 *
 *   ۱. مقدارها واقعاً به حساب بسته شوند — وگرنه با رمزِ هویتِ موقت وارد
 *      می‌شود و پیامش «رمز اشتباه» است، نه «سناریو غلط».
 *   ۲. همه‌چیز زیر `when` برود — وگرنه اجرای دومِ خزش می‌شکند.
 *   ۳. تکهٔ ورود کوتاه بماند — وگرنه نیمِ اپ داخلِ «مسیرِ ورود» می‌افتد.
 */
import { test, expect } from '@playwright/test';
import { buildEntry, entryYaml, textOf, triggerOf } from '../../src/scenario/entry.js';

const RECORDED = [
  { clearState: true },
  { go: '/' },
  { click: { role: 'button', name: 'نشان نده', exact: true, visible: true } },
  { fill: { label: 'ایمیل', visible: true }, value: 'a@a.a' },
  { fill: { label: 'رمز عبور', visible: true }, value: '{{identity.password}}' },
  { click: { role: 'button', name: 'ورود / ثبت‌نام', exact: true, visible: true } },
  { check: { label: 'کد بازیابی را در جای مطمئنی ذخیره کردم.', visible: true } },
  { click: { role: 'button', name: 'ادامه', exact: true, visible: true } },
  { click: { role: 'button', name: 'افزودن کتاب', exact: true, visible: true } },
  { fill: { label: 'عنوان', visible: true }, value: 'کتابِ من' },
];

test('مقدارها به حسابِ ذخیره‌شده بسته می‌شوند', () => {
  const built = buildEntry({ steps: RECORDED, accountId: 'a' });
  const form = built.steps.find((step) => step.when)?.then || [];

  expect(form[0].value).toBe('{{account.a.email}}');
  expect(form[1].value).toBe('{{account.a.password}}');
  // و صریح می‌گوید چه چیزی را عوض کرده؛ جایگزینیِ خاموشِ مقدار قابل قبول نیست
  expect(built.notes.join(' ')).toContain('a@a.a');
});

test('بی حساب، هویتِ تازهٔ هر اجرا', () => {
  const form = buildEntry({ steps: RECORDED }).steps.find((step) => step.when).then;
  expect(form[0].value).toBe('{{identity.email}}');
  expect(form[1].value).toBe('{{identity.password}}');
});

test('همه‌چیز زیر when می‌رود، وگرنه اجرای دوم می‌شکند', () => {
  // خزش ده‌ها بار به خانه برمی‌گردد و بارِ دوم فرمِ ورود اصلاً وجود ندارد
  const built = buildEntry({ steps: RECORDED, accountId: 'a' });
  const bare = built.steps.filter((step) => !step.when && !step.go && !step.dismissBlockers);
  expect(bare).toEqual([]);
});

test('تأییدِ پس از ورود شرطِ خودش را می‌گیرد، نه شرطِ فرم', () => {
  // «کد بازیابی» فقط بارِ اولِ هر حساب می‌آید؛ هم‌خانه بودنش با فرم یعنی
  // اجرای دوم یا همه را می‌پرد یا روی نبودنش می‌شکند
  const whens = buildEntry({ steps: RECORDED, accountId: 'a' }).steps.filter((step) => step.when);
  expect(whens).toHaveLength(2);
  expect(JSON.stringify(whens[1].when.visible)).toContain('کد بازیابی');
});

test('تکهٔ ورود همان‌جا تمام می‌شود، نه وسطِ اپ', () => {
  const built = buildEntry({ steps: RECORDED, accountId: 'a' });
  const all = JSON.stringify(built.steps);
  expect(all).not.toContain('افزودن کتاب');
  expect(all).not.toContain('کتابِ من');
});

test('پنجرهٔ مزاحم پیش از فرم بسته می‌شود', () => {
  // نپی دو پنجره دارد که با بارگذاری می‌آیند و نخستین کلیک را می‌خورند
  const steps = buildEntry({ steps: RECORDED }).steps;
  expect(steps[0]).toEqual({ go: '/' });
  expect(steps[1]).toEqual({ dismissBlockers: { wait: 5000 } });
});

test('قدم‌هایی که فرمِ ورود ندارند، صریح رد می‌شوند', () => {
  // سکوت اینجا یعنی فایلِ ورودی که هیچ‌وقت وارد نمی‌شود
  const built = buildEntry({ steps: [{ go: '/' }, { click: 'یک دکمه' }] });
  expect(built.found).toBe(false);
  expect(built.steps).toEqual([]);
  expect(built.notes.join(' ')).toContain('ایمیل');
});

test('نام کاربری هم شناسه است، نه فقط ایمیل', () => {
  const built = buildEntry({
    steps: [
      { fill: { label: 'نام کاربری' }, value: 'ali' },
      { fill: { label: 'گذرواژه' }, value: 'x' },
      { click: { role: 'button', name: 'Sign in' } },
    ],
    accountId: 'admin',
  });
  const form = built.steps.find((step) => step.when).then;
  expect(form[0].value).toBe('{{account.admin.email}}');
  expect(form[1].value).toBe('{{account.admin.password}}');
});

test('شرط از خودِ قدم برداشته می‌شود، نه از سلکتورِ جدا', () => {
  expect(triggerOf({ fill: { label: 'ایمیل' } })).toEqual({ label: 'ایمیل', visible: true });
  expect(triggerOf({ click: { role: 'button', name: 'ورود', exact: true } })).toEqual({
    role: 'button',
    name: 'ورود',
    exact: true,
    visible: true,
  });
  expect(textOf({ click: 'یک متن' })).toBe('یک متن');
});

test('سرصفحه می‌گوید از کجا آمده و با کدام حساب', () => {
  const built = buildEntry({ steps: RECORDED, accountId: 'a' });
  const yaml = entryYaml({ ...built, accountId: 'a', source: '_drafts/x.yml' });
  expect(yaml).toContain('_drafts/x.yml');
  expect(yaml).toContain('«a»');
  expect(yaml).toContain('status: draft');
});
