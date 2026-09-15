/**
 * خودآزمای «مأموریت».
 *
 * ── چرا این یکی بی‌صدا خراب می‌شود ──
 *
 * نقشهٔ کارِ غلط خطا نمی‌دهد؛ **یک خزشِ بی‌فایده** می‌دهد. دامنه‌ای که مدل
 * اختراع کرده به هیچ حالتی نمی‌خورد، پس هیچ کنشی امتحان نمی‌شود و گزارش
 * می‌گوید «صف تمام شد» — یعنی شبیهِ موفقیت. همان شکستِ خاموشی که این ابزار
 * برای شکارش ساخته شده.
 *
 * پس هرچه مدل گفته و ما نمی‌شناسیم باید بیفتد، و افتادنش باید **دیده شود**.
 */
import { test, expect } from '@playwright/test';
import { assertMission, buildUser, missionSlug, missionToJob } from '../../src/map/mission.js';

const WORLD = {
  routes: ['/contents', '/content/[id_book]'],
  views: ['ویرایشِ برچسب'],
  accounts: ['a'],
  scenarios: ['ورود.yml'],
  hasSession: true,
};

test('دامنه‌ای که در نقشه و سورس نبود می‌افتد، و افتادنش نوشته می‌شود', () => {
  const mission = assertMission(
    { goal: 'ابزارهای متن', scope: ['/content/[id_book]', '/جای-خیالی'] },
    WORLD
  );
  expect(mission.scope).toEqual(['/content/[id_book]']);
  // سکوت اینجا یعنی کاربر فکر می‌کند دو جا گشته شد
  expect(mission.dropped.join(' ')).toContain('جای-خیالی');
});

test('حساب و سناریوی ناموجود هم می‌افتند', () => {
  const mission = assertMission(
    { goal: 'x', start: { mode: 'account', account: 'ب', entry: 'نیست.yml' } },
    WORLD
  );
  expect(mission.start.account).toBe('a'); // به تنها حسابِ موجود برمی‌گردد
  expect(mission.start.entry).toBe('');
  expect(mission.dropped).toHaveLength(2);
});

test('«ادامهٔ نشست» وقتی نشستی نیست، به حساب برمی‌گردد — نه به مرورگرِ خالی', () => {
  /**
   * اگر این نمی‌افتاد، خزش روی مرورگرِ تازه شروع می‌شد و پشتِ صفحهٔ ورود
   * می‌ماند: همان نقشهٔ چهار گره‌ای که «موفق» گزارش می‌شود.
   */
  const mission = assertMission({ goal: 'x', start: { mode: 'session' } }, { ...WORLD, hasSession: false });
  expect(mission.start.mode).toBe('account');
  expect(mission.start.account).toBe('a');
  expect(mission.dropped[0]).toContain('نشست');
});

test('در حالتِ نشست، سناریوی ورود پاک می‌شود', () => {
  // بازپخشِ فرمِ ورود روی مرورگری که از قبل وارد است، در هر برگشت به خانه
  // یک شکستِ بی‌دلیل می‌سازد
  const mission = assertMission(
    { goal: 'x', start: { mode: 'session', entry: 'ورود.yml' } },
    WORLD
  );
  expect(mission.start.entry).toBe('');
});

test('بی هدف، نقشهٔ کاری نیست', () => {
  expect(() => assertMission({ scope: ['/contents'] }, WORLD)).toThrow(/goal/);
  expect(() => assertMission(null, WORLD)).toThrow();
});

test('نقشهٔ کار به زبانِ خزش ترجمه می‌شود — یک ترجمه، نه دو تا', () => {
  const job = missionToJob(
    assertMission(
      {
        goal: 'ابزارهای متن',
        start: { mode: 'account', account: 'a', entry: 'ورود.yml' },
        scope: ['/content/[id_book]', 'ویرایشِ برچسب'],
        look: ['هایلایت', 'برچسب'],
      },
      WORLD
    ),
    { target: 'nepi' }
  );
  expect(job).toMatchObject({
    kind: 'map',
    from: 'scenarios/nepi/ورود.yml',
    profile: false,
    remember: 'a',
    scope: '/content/[id_book],ویرایشِ برچسب',
    focus: 'هایلایت برچسب',
  });
});

test('در حالتِ نشست، پرچمِ مرورگر می‌رود و مسیرِ ورود نمی‌رود', () => {
  const job = missionToJob(assertMission({ goal: 'x', start: { mode: 'session' } }, WORLD), {
    target: 'nepi',
  });
  expect(job.profile).toBe(true);
  expect(job.from).toBe('');
  expect(job.remember).toBe('');
});

test('ورودیِ مدل فهرست‌ها را می‌برد — چیزی که ندادیم، اختراع می‌شود', () => {
  const user = buildUser({ text: 'برو داخل کتاب', ...WORLD, knowledge: 'نپی یک کتاب‌خوان است' });
  expect(user).toContain('برو داخل کتاب');
  expect(user).toContain('/content/[id_book]');
  expect(user).toContain('ویرایشِ برچسب');
  expect(user).toContain('نپی یک کتاب‌خوان است');
  expect(user).toContain('هست'); // نشستِ ذخیره‌شده
});

test('نامِ فایل از هدف درمی‌آید و فارسی می‌ماند', () => {
  // فهرستِ فایل‌ها را آدم می‌خواند، نه ماشین
  expect(missionSlug('ابزارهای متن در کتاب')).toBe('ابزارهای-متن-در-کتاب');
  expect(missionSlug('///')).toBe('ماموریت');
});
