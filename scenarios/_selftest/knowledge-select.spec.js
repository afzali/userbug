/**
 * خودآزمای انتخابِ شناخت.
 *
 * ── چرا این فایل مهم‌تر از آن است که به نظر می‌رسد ──
 *
 * سه مصرف‌کنندهٔ مدل از این تابع تغذیه می‌شوند، و `do:` پرتکرارترین فراخوانیِ
 * کلِ ابزار است. تابعی که سقفش را رعایت نکند، هزینهٔ هر اجرا را بالا می‌برد
 * بی‌آنکه کسی بفهمد چرا — چون خطایی رخ نمی‌دهد، فقط صورتحساب بزرگ‌تر می‌شود.
 *
 * و بدتر: prompt که نصفش بی‌ربط باشد کیفیت را پایین می‌آورد. یعنی شناختی که
 * قرار بود کمک کند، می‌تواند ضرر بزند.
 */
import { test, expect } from '@playwright/test';
import { avoidFrom, knowledgeFor } from '../../src/knowledge/select.js';
import { normalizeDossier } from '../../src/knowledge/schema.js';

const DOSSIER = normalizeDossier({
  target: 'demo',
  summary: 'یک ویرایشگر سند با کتابخانه و همگام‌سازی.',
  auth: { kind: 'form', loginPath: '/login', signupOpen: true, logoutLabel: 'خروج', by: 'source' },
  routes: [
    { path: '/', purpose: 'خانه', by: 'source' },
    { path: '/login', purpose: 'ورود و ثبت‌نام', by: 'source' },
    { path: '/library', purpose: 'فهرست اسناد کاربر', by: 'user' },
    { path: '/settings', purpose: 'تنظیمات حساب', by: 'source' },
    { path: '/reports', purpose: 'گزارش‌های ماهانه', by: 'source' },
  ],
  glossary: [
    { term: 'سند', meaning: 'واحد محتوا در کتابخانه', by: 'user' },
    { term: 'همگام‌سازی', meaning: 'انتقال داده به سرور', by: 'model' },
    { term: 'برچسب', meaning: 'دسته‌بندی اسناد', by: 'model' },
  ],
  risks: [
    { label: 'حذف حساب', why: 'برگشت‌ناپذیر', by: 'user' },
    { label: 'ریست کامل', why: 'دیتابیس را پاک می‌کند', by: 'model' },
  ],
});

/** پروندهٔ بزرگ، تا سقف معنا پیدا کند. */
const BIG = normalizeDossier({
  target: 'demo',
  ...DOSSIER,
  routes: [
    ...DOSSIER.routes,
    ...Array.from({ length: 20 }, (_, i) => ({ path: `/بایگانی-${i}`, purpose: `بخش ${i}`, by: 'source' })),
  ],
});

test('مسیرهای مرتبط بالا می‌آیند و بقیه نمی‌روند', () => {
  const text = knowledgeFor({ dossier: BIG, text: 'گزارش ماهانه را باز کن' });

  expect(text).toContain('/reports');
  // بیست بخشِ بایگانی به این جمله ربطی ندارند و بودجه را می‌خورند
  expect(text).not.toContain('/بایگانی-7');
});

test('حتی وقتی هیچ واژه‌ای نمی‌خورد، مدل بی‌نقشه نمی‌ماند', () => {
  /**
   * «سند» و «اسناد» برای `includes` دو رشتهٔ بی‌ربط‌اند — جمعِ مکسر فارسی
   * ریشهٔ مشترک ندارد. نخستین نسخه در این حالت **صفر مسیر** می‌داد، یعنی
   * دقیقاً جایی که باید کمک می‌کرد هیچ نمی‌داد.
   */
  const text = knowledgeFor({ dossier: BIG, text: 'سند تازه در کتابخانه بساز' });
  const lines = text.split('\n').filter((line) => line.startsWith('  /'));

  expect(lines.length).toBeGreaterThanOrEqual(4);
  expect(text).toContain('/login');
  expect(text).toContain('/');
});

test('سقفِ تعداد مسیر رعایت می‌شود', () => {
  const text = knowledgeFor({ dossier: BIG, text: 'بخش را باز کن', budget: 5000 });
  const lines = text.split('\n').filter((line) => line.startsWith('  /'));
  expect(lines.length).toBeLessThanOrEqual(8);
});

test('صفحهٔ فعلی همیشه می‌رود، حتی بی‌واژهٔ مشترک', () => {
  const text = knowledgeFor({ dossier: DOSSIER, text: 'دکمه را بزن', url: 'http://x.test/settings' });
  expect(text).toContain('/settings');
  expect(text).toContain('تنظیمات حساب');
});

test('خطرها همیشه می‌روند، حتی وقتی بودجه تنگ است', () => {
  const text = knowledgeFor({ dossier: DOSSIER, text: 'کاری بکن', budget: 20 });

  // ایمنی است نه کیفیت: کاوشی که خودش را بیرون بیندازد، کلِ اجرا را هدر می‌دهد
  expect(text).toContain('حذف حساب');
  expect(text).toContain('ریست کامل');
});

test('سقفِ بودجه واقعاً رعایت می‌شود', () => {
  const big = normalizeDossier({
    target: 'demo',
    summary: 'خ'.repeat(2000),
    routes: Array.from({ length: 60 }, (_, i) => ({ path: `/r${i}`, purpose: 'سند'.repeat(30), by: 'source' })),
    glossary: Array.from({ length: 40 }, (_, i) => ({ term: `سند${i}`, meaning: 'م'.repeat(200), by: 'model' })),
  });

  const text = knowledgeFor({ dossier: big, text: 'سند', budget: 600 });
  // خطرها بیرون از سقف‌اند و اینجا خطری نیست، پس سقف باید تقریباً دقیق باشد
  expect(text.length).toBeLessThanOrEqual(700);
});

test('واژه‌نامه فقط واژه‌های همان جمله را می‌دهد', () => {
  const text = knowledgeFor({ dossier: DOSSIER, text: 'سند را ذخیره کن' });
  expect(text).toContain('سند:');
  expect(text).not.toContain('برچسب:');
});

test('بی‌متن، چند واژهٔ اول می‌روند تا زبانِ اپ شناخته شود', () => {
  const text = knowledgeFor({ dossier: DOSSIER, text: '' });
  expect(text).toContain('سند:');
});

test('پروندهٔ خالی رشتهٔ خالی می‌دهد، نه سرصفحهٔ بی‌محتوا', () => {
  expect(knowledgeFor({ dossier: normalizeDossier({ target: 'x' }), text: 'کاری' })).toBe('');
});

test('پروژهٔ ناموجود می‌شکند نه اینکه پرتاب کند', () => {
  // مصرف‌کننده‌ها این را در مسیر داغ صدا می‌زنند؛ پرتاب یعنی اجرا می‌ایستد
  expect(knowledgeFor({ target: '../نامعتبر', text: 'کاری' })).toBe('');
  expect(avoidFrom('../نامعتبر')).toEqual([]);
});

test('ورود همیشه می‌رود چون همه‌جا لازم است', () => {
  const text = knowledgeFor({ dossier: DOSSIER, text: 'گزارش ماهانه را ببین' });
  expect(text).toContain('ورود: form');
  expect(text).toContain('/login');
});
