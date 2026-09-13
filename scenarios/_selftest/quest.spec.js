/**
 * خودآزمای کاوشِ هدف‌دار.
 *
 * ارزشِ quest در یک ادعاست: «نقشه رایگان می‌بردت آنجا، مدل فقط همان‌جا فکر
 * می‌کند». دو چیز می‌توانند بی‌صدا این ادعا را باطل کنند و هیچ‌کدام در اجرا
 * پیدا نیستند — اجرا در هر دو حالت سبز تمام می‌شود:
 *
 *   ۱. انتخابِ نمای بی‌ربط. کاربر می‌بیند رفت جایی، و باور می‌کند رفتنش
 *      درست بوده. پس «هیچ‌کدام» باید واقعاً `null` بدهد.
 *   ۲. جابه‌جاییِ ترتیب. اگر `explore` پیش از قدم‌های ناوبری بنشیند،
 *      پیش‌نویسِ خروجی مقدمه نمی‌گیرد و دیگر قابل اجرا نیست — و این تنها
 *      وقتی معلوم می‌شود که کسی هفته‌ها بعد پیش‌نویس را اجرا کند.
 */
import { test, expect } from '@playwright/test';
import { pickState, questScenario, questSlug } from '../../src/map/quest.js';

const MAP = {
  states: [
    { id: 'a', route: '/books', view: '', path: [{ go: '/books' }], actions: [{ label: 'افزودن' }] },
    {
      id: 'b',
      route: '/books',
      view: 'گفت‌وگوی آپلودِ فایل',
      path: [{ go: '/books' }, { click: 'آپلود' }],
      actions: [{ label: 'انتخاب فایل' }, { label: 'تأیید' }],
    },
    { id: 'c', route: '/settings', view: '', path: [{ go: '/settings' }], actions: [{ label: 'ذخیره' }] },
  ],
};

test('نامِ نما از برچسبِ کنش قوی‌تر است', () => {
  const found = pickState(MAP, 'آپلود فایل تکراری چه می‌کند');
  expect(found.state.id).toBe('b');
  expect(found.depth).toBe(2);
});

test('هدفِ بی‌ربط هیچ نمایی برنمی‌دارد، نه نزدیک‌ترین نمای بی‌ربط', () => {
  expect(pickState(MAP, 'پرداختِ آنلاین با درگاهِ بانکی')).toBeNull();
});

test('حرفِ اضافه نما انتخاب نمی‌کند', () => {
  // «خروج از حساب» یک بار به نمای «تنظیمات هوش مصنوعی» رسید، فقط به‌خاطرِ
  // «از». هدفی که هیچ واژهٔ معنادارِ مشترکی ندارد باید «هیچ» بگیرد.
  const map = { states: [{ id: 'x', route: '/settings', view: 'تنظیماتِ هوش مصنوعی', path: [], actions: [] }] };
  expect(pickState(map, 'خروج از حساب')).toBeNull();
  expect(pickState(map, 'بررسی کن که این چه می‌کند')).toBeNull();
});

test('نقشهٔ خالی هم null می‌دهد، نه استثنا', () => {
  expect(pickState({ states: [] }, 'آپلود')).toBeNull();
  expect(pickState(null, 'آپلود')).toBeNull();
});

test('در امتیازِ برابر، مسیرِ کوتاه‌تر برنده است', () => {
  const map = {
    states: [
      { id: 'دور', route: '/x', view: 'ذخیره', path: [{}, {}, {}], actions: [] },
      { id: 'نزدیک', route: '/y', view: 'ذخیره', path: [{}], actions: [] },
    ],
  };
  expect(pickState(map, 'ذخیره کردن').state.id).toBe('نزدیک');
});

test('کاوش آخرین قدم است، وگرنه پیش‌نویس مقدمه نمی‌گیرد', () => {
  const scenario = questScenario({
    goal: 'آپلودِ فایلِ تکراری',
    entrySteps: [{ go: '/login' }],
    path: [{ go: '/books' }, { click: 'آپلود' }],
    depth: 6,
  });

  expect(scenario.steps).toHaveLength(4);
  expect(scenario.steps.slice(0, -1).some((step) => step.explore)).toBe(false);
  // سناریوی ورودِ کاربر دست‌نخورده می‌ماند: قدمی تویش تزریق نمی‌شود
  expect(scenario.steps.some((step) => step.dismissBlockers)).toBe(false);
  expect(scenario.steps.at(-1).explore).toMatchObject({ goal: 'آپلودِ فایلِ تکراری', maxSteps: 6, author: true });
  expect(scenario.steps[0]).toEqual({ go: '/login' });
});

test('بی سناریوی ورود، مبدأ ریشه است نه هیچ‌جا', () => {
  // مسیرهای نقشه نسبت به ورود ضبط شده‌اند. بی مبدأ، نخستین کلیک روی
  // about:blank می‌نشیند — که یک بار واقعاً شد.
  const scenario = questScenario({ goal: 'آپلود', path: [{ click: 'آپلود' }] });
  expect(scenario.steps[0]).toEqual({ go: '/' });
  // پنجره‌ای که با بارگذاری می‌آید، وگرنه نخستین کلیک را می‌خورد
  expect(scenario.steps[1]).toEqual({ dismissBlockers: { wait: 5000 } });
  expect(scenario.steps).toHaveLength(4);
});

test('رانندهٔ کاوش پیش‌نویس است و باید بماند', () => {
  expect(questScenario({ goal: 'هرچه' }).status).toBe('draft');
});

test('مهلت با سقفِ کاوش بزرگ می‌شود و از پیش‌فرضِ پلی‌رایت بیشتر است', () => {
  // یک بار با مهلتِ ۱۲۰ ثانیه اجرا شد و صفر قدم نوشت: قدم‌های قطعی وقت
  // بردند و کاوش نرسید شروع کند.
  expect(questScenario({ goal: 'هرچه' }).timeout).toBeGreaterThan(120_000);
  expect(questScenario({ goal: 'هرچه', depth: 20 }).timeout).toBeGreaterThan(
    questScenario({ goal: 'هرچه', depth: 4 }).timeout
  );
});

test('بی سقفِ عمق، سقفِ پیش‌فرضِ explore می‌ماند', () => {
  expect(questScenario({ goal: 'هرچه' }).steps.at(-1).explore.maxSteps).toBeUndefined();
});

test('نامِ فایل از هدف ساخته می‌شود و فارسی می‌ماند', () => {
  // اعرابِ «آپلودِ» می‌افتد: علامت است نه حرف. نامِ فایل باید یکتا و
  // تایپ‌شدنی باشد، و کسره‌ای که دیده نمی‌شود هیچ‌کدام نیست.
  expect(questSlug('آپلودِ فایل تکراری!')).toBe('کاوش-آپلود-فایل-تکراری');
  expect(questSlug('   ')).toBe('کاوش-بی‌نام');
});
