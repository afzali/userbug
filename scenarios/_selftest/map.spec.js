/**
 * خودآزمای نقشه — هویتِ حالت، و آنچه نباید در آن باشد.
 *
 * کلِ درستیِ نقشه به چند تابعِ خالص بند است، و دو خطای ممکنشان قابلِ دیدن
 * نیستند مگر با آزمون:
 *
 *   ۱. هویتِ **زیادی حساس** → هر یادداشت یک گرهِ تازه، و نقشه منفجر می‌شود.
 *   ۲. هویتِ **زیادی کر** → دو صفحهٔ متفاوت یکی خوانده می‌شوند و نیمی از اپ
 *      هرگز خزیده نمی‌شود.
 *
 * پس هر دو سو سنجیده می‌شوند، نه فقط سوی خوش‌بینانه.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';

import {
  actionKeyOf,
  actionsFrom,
  classifyAction,
  mergeActions,
  profileOf,
  routePatternOf,
  sampleActions,
  stateIdOf,
} from '../../src/map/state.js';
import { unsupportedVerbs, verbOf } from '../../src/map/replay.js';
import { renderMap, unreachedRoutes } from '../../src/map/render.js';

const item = (over = {}) => ({ ref: 0, role: 'button', name: 'دکمه', ...over });

test.describe('الگوی روت', () => {
  test('قطعهٔ شناسه‌مانند به [id] تبدیل می‌شود', () => {
    expect(routePatternOf('/content/6737f33d35')).toBe('/content/[id]');
    expect(routePatternOf('/book/42/page/7')).toBe('/book/[id]/page/[id]');
    expect(routePatternOf('/u/550e8400-e29b-41d4-a716-446655440000')).toBe('/u/[id]');
  });

  test('واژهٔ معمولی شناسه خوانده نمی‌شود', () => {
    expect(routePatternOf('/contents')).toBe('/contents');
    expect(routePatternOf('/settings/profile')).toBe('/settings/profile');
    // «abcdef» هگز است ولی کوتاه‌تر از آستانه نیست؛ این مرز عمدی است
    expect(routePatternOf('/library')).toBe('/library');
  });

  test('روتِ سورس بر حدسِ ما می‌چربد', () => {
    // بی روتِ سورس، «nepi» یک قطعهٔ معمولی است
    expect(routePatternOf('/p/nepi/edit')).toBe('/p/nepi/edit');
    // با روتِ سورس، همان قطعه پارامتر است
    expect(routePatternOf('/p/nepi/edit', ['/p/[slug]/edit'])).toBe('/p/[slug]/edit');
  });

  test('ریشه و اسلشِ پایانی و query یک چیز می‌شوند', () => {
    expect(routePatternOf('/')).toBe('/');
    expect(routePatternOf('/contents/')).toBe('/contents');
    expect(routePatternOf('/search?q=%D8%B1')).toBe('/search');
  });
});

test.describe('هویتِ حالت', () => {
  test('متن وارد هویت نمی‌شود — دو یادداشت یک گره‌اند', () => {
    const one = { items: [item({ name: 'یادداشت اول' }), item({ role: 'link', name: 'الف' })] };
    const two = { items: [item({ name: 'یادداشت دوم و عنوانِ بلندترش' }), item({ role: 'link', name: 'ب' })] };
    const id = (snapshot) =>
      stateIdOf({ route: '/content/[id]', view: '', profile: profileOf(snapshot.items) });
    expect(id(one)).toBe(id(two));
  });

  test('ولی ساختارِ متفاوت گرهِ متفاوت است', () => {
    const few = { items: [item()] };
    const many = { items: [item(), item({ role: 'link' }), item({ role: 'textbox' })] };
    const id = (snapshot) => stateIdOf({ route: '/x', view: '', profile: profileOf(snapshot.items) });
    expect(id(few)).not.toBe(id(many));
  });

  test('نما گره را جدا می‌کند', () => {
    const profile = 'button:2';
    expect(stateIdOf({ route: '/contents', view: '', profile })).not.toBe(
      stateIdOf({ route: '/contents', view: 'وارد کردن اطلاعات', profile })
    );
  });

  test('نمای نقش‌ها به ترتیبِ عناصر حساس نیست', () => {
    expect(profileOf([item(), item({ role: 'link' })])).toBe(profileOf([item({ role: 'link' }), item()]));
  });
});

test.describe('دسته‌بندیِ کنش', () => {
  test('برگشت‌ناپذیرها گرفته می‌شوند', () => {
    expect(classifyAction({ role: 'button', name: 'حذف کتاب' })).toBe('destructive');
    expect(classifyAction({ role: 'button', name: 'خروج' })).toBe('destructive');
    expect(classifyAction({ role: 'button', name: 'ریست کامل' })).toBe('destructive');
    expect(classifyAction({ role: 'button', name: 'Delete account' })).toBe('destructive');
  });

  test('«خروجی گرفتن» برگشت‌ناپذیر نیست', () => {
    // همان تلهٔ واقعی که در resolve.js ثبت شده: «خروج» در «خروجی» هست
    expect(classifyAction({ role: 'menuitem', name: 'خروجی گرفتن از اطلاعات' })).toBe('unknown');
  });

  test('نقشِ خبری کنش نیست — همان «در حال بارگذاری» که بودجه را سوزاند', () => {
    expect(classifyAction({ role: 'status', name: 'در حال بارگذاری نپی…' })).toBe('noise');
    expect(classifyAction({ role: 'progressbar', name: '' })).toBe('noise');
    // ولی نپی این دو را کلیک‌پذیر می‌کند و باید بمانند
    expect(classifyAction({ role: 'heading', name: 'بروزرسانی دیتابیس' })).toBe('unknown');
    expect(classifyAction({ role: 'presentation', name: 'متنِ کتاب' })).toBe('unknown');
  });

  test('قابِ مودال کنش نیست — هر مودال یک شکستِ ۵ ثانیه‌ای می‌داد', () => {
    expect(classifyAction({ role: 'dialog', name: 'افزودن کتاب جدید' })).toBe('noise');
    expect(classifyAction({ role: 'tablist', name: '' })).toBe('noise');
    expect(classifyAction({ role: 'navigation', name: 'اصلی' })).toBe('noise');
  });

  test('ورودی و پیوند از دکمهٔ نامعلوم جدا می‌شوند', () => {
    expect(classifyAction({ role: 'textbox', label: 'ایمیل' })).toBe('input');
    expect(classifyAction({ role: 'link', name: 'نماز' })).toBe('nav');
    expect(classifyAction({ role: 'button', name: 'فهرست' })).toBe('unknown');
  });
});

test.describe('فهرستِ کنش', () => {
  test('عنصرِ غیرفعال و عنصرِ بی‌توصیف کنش نیستند', () => {
    const actions = actionsFrom({
      items: [item({ ref: 0 }), item({ ref: 1, disabled: true, name: 'غیرفعال' }), { ref: 2 }],
    });
    expect(actions).toHaveLength(1);
  });

  test('عنصرِ پشتِ مودال کنشِ این حالت نیست', () => {
    // ۲۰ کلیک از ۳۸ در نخستین خزش به همین دلیل با timeout افتادند
    const actions = actionsFrom({
      items: [item({ ref: 0, name: 'ذخیره' }), item({ ref: 1, name: 'نوارِ کناری', blocked: true })],
    });
    expect(actions.map((action) => action.label)).toEqual(['ذخیره']);
  });

  test('کلیدِ کنش بین دو بازدید یکی است', () => {
    const first = actionsFrom({ items: [item({ ref: 0, name: 'فهرست' })] });
    const second = actionsFrom({ items: [item({ ref: 5, name: 'فهرست' })] });
    expect(first[0].key).toBe(second[0].key);
    expect(actionKeyOf({ role: 'button', name: 'الف' })).not.toBe(actionKeyOf({ role: 'button', name: 'ب' }));
  });

  test('سه نمونه از هر خانواده، نه صد تا', () => {
    const items = Array.from({ length: 100 }, (_, index) =>
      item({ ref: index, role: 'link', name: `یادداشت ${index}` })
    );
    const sampled = sampleActions(actionsFrom({ items }));
    expect(sampled.filter((action) => action.sampled)).toHaveLength(3);
    // بقیه حذف نمی‌شوند؛ هستند و شمرده می‌شوند
    expect(sampled).toHaveLength(100);
  });

  test('چند دکمهٔ متفاوت خانواده نیستند — همه امتحان می‌شوند', () => {
    // `/contents` نپی ۱۸ دکمهٔ متفاوت دارد؛ نسخهٔ اول فقط ۳ تا را می‌زد و
    // نقشه پوچ درآمد
    const items = Array.from({ length: 18 }, (_, index) =>
      item({ ref: index, name: `دکمهٔ ${index}` })
    );
    const sampled = sampleActions(actionsFrom({ items }));
    expect(sampled.filter((action) => action.sampled)).toHaveLength(18);
  });

  test('کنشِ امتحان‌شده در سهمیه می‌ماند', () => {
    const actions = Array.from({ length: 30 }, (_, index) => ({
      key: `k${index}`,
      role: 'link',
      kind: 'nav',
    }));
    actions[29].tried = true;
    const sampled = sampleActions(actions);
    expect(sampled.find((action) => action.key === 'k29').sampled).toBe(true);
    expect(sampled.filter((action) => action.sampled)).toHaveLength(3);
  });

  test('ورودی و ممنوع سهمیه نمی‌گیرند', () => {
    const actions = [
      { key: 'a', role: 'textbox', kind: 'input' },
      { key: 'b', role: 'button', kind: 'avoided' },
      { key: 'c', role: 'button', kind: 'unknown' },
    ];
    const sampled = sampleActions(actions);
    expect(sampled.filter((action) => action.sampled).map((action) => action.key)).toEqual(['c']);
  });

  test('`mutate` بعد از طبقه‌بندی از نقشه بیرون نمی‌افتد', () => {
    /**
     * پیش از فاز ۲ همه‌چیز `unknown` بود و سهمیه می‌گرفت. اگر `mutate` اینجا
     * نیاید، طبقه‌بندی — که قرار بود کمک کند — خزشِ بعدی را کم‌عمق‌تر می‌کند.
     */
    const actions = [
      { key: 'a', role: 'button', kind: 'mutate' },
      { key: 'b', role: 'button', kind: 'inert' },
      { key: 'c', role: 'button', kind: 'nav' },
    ];
    const sampled = sampleActions(actions);
    expect(sampled.filter((action) => action.sampled).map((action) => action.key)).toEqual(['a', 'c']);
  });
});

test.describe('ادغامِ بازدیدها', () => {
  test('نتیجهٔ امتحان با بازدیدِ تازه پاک نمی‌شود', () => {
    const before = [{ key: 'a', kind: 'unknown', by: 'rule', tried: true, to: 'x9', seenIn: 1 }];
    const merged = mergeActions(before, [{ key: 'a', kind: 'unknown', by: 'rule', descriptor: {} }]);
    expect(merged[0].tried).toBe(true);
    expect(merged[0].to).toBe('x9');
    expect(merged[0].seenIn).toBe(2);
  });

  test('دستِ آدم را قاعده عوض نمی‌کند', () => {
    const before = [{ key: 'a', kind: 'destructive', by: 'user', seenIn: 1 }];
    const merged = mergeActions(before, [{ key: 'a', kind: 'unknown', by: 'rule' }]);
    expect(merged[0].kind).toBe('destructive');
    expect(merged[0].by).toBe('user');
  });

  test('کنشِ تازه اضافه می‌شود، قدیمی نمی‌رود', () => {
    const merged = mergeActions([{ key: 'a', kind: 'unknown', seenIn: 3 }], [{ key: 'b', kind: 'nav' }]);
    expect(merged.map((action) => action.key).sort()).toEqual(['a', 'b']);
  });
});

test.describe('بازپخش', () => {
  test('فعلِ ناشناس بلند می‌شکند، نه بی‌صدا', () => {
    expect(unsupportedVerbs([{ go: '/' }, { click: {} }])).toEqual([]);
    expect(unsupportedVerbs([{ upload: {} }, { query: 'select 1' }])).toEqual(['upload', 'query']);
  });

  test('`as` برچسب است نه فعل', () => {
    expect(verbOf({ as: '/login', click: { role: 'button' } })).toBe('click');
    expect(verbOf({ fill: { label: 'ایمیل' }, value: 'a@b.c' })).toBe('fill');
  });
});

test.describe('نما و تفاضلِ سورس', () => {
  const map = {
    target: 'demo',
    caps: { states: 60, actionsPerState: 25, minutes: 20 },
    entry: null,
    states: [
      { id: '1', route: '/contents', view: '', profile: 'button:2', actions: [{ key: 'a', kind: 'unknown', tried: true }] },
      { id: '2', route: '/content/[id]', view: 'واژه‌نامه', profile: 'button:5', actions: [] },
    ],
    edges: [{ from: '1', action: 'a', to: '2' }],
    frontier: [],
    stats: { tried: 1 },
  };

  test('روتِ سورس که نرسیدیم پیدا می‌شود', () => {
    expect(unreachedRoutes(map, ['/contents', '/settings', '/content/[id]'])).toEqual(['/settings']);
  });

  test('الگوی پویا با الگو مقایسه می‌شود، نه با آدرس', () => {
    expect(unreachedRoutes(map, ['/content/[id]'])).toEqual([]);
  });

  test('نما گروه‌بندی‌شده و بی‌کرش است', () => {
    const text = renderMap(map, { knownRoutes: ['/contents', '/settings'] });
    expect(text).toContain('/content/[id]');
    expect(text).toContain('واژه‌نامه');
    expect(text).toContain('/settings');
  });

  test('نقشهٔ خالی هم متن می‌دهد', () => {
    const empty = { ...map, states: [], edges: [], stats: {} };
    expect(renderMap(empty)).toContain('خالی است');
  });
});

test.describe('انبار', () => {
  test('نقشه روی دیسک رفت‌وبرگشت می‌کند و خرابی‌اش «نداریم» است', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-map-'));
    const previous = process.env.USERBUG_ROOT;
    process.env.USERBUG_ROOT = root;
    try {
      const { emptyMap, readMap, writeMap, upsertState, addEdge, pushFrontier, takeFrontier } =
        await import('../../src/map/store.js');

      const map = emptyMap('demo', { baseURL: 'http://x' });
      upsertState(map, { id: 'a', route: '/', view: '', profile: 'button:1', path: [], actions: [] });
      upsertState(map, { id: 'b', route: '/x', view: '', profile: 'button:2', path: [{ click: {} }], actions: [] });
      addEdge(map, { from: 'a', action: 'k', to: 'b' });
      pushFrontier(map, [{ state: 'b', action: 'k2', depth: 2 }, { state: 'a', action: 'k1', depth: 1 }]);

      await writeMap('demo', map);
      const back = readMap('demo');
      expect(back.states).toHaveLength(2);
      expect(back.stats.edges).toBe(1);
      // سطحی‌ترین اول
      expect(takeFrontier(back).action).toBe('k1');

      fs.writeFileSync(path.join(root, 'knowledge', 'demo', 'map.json'), '{ نیمه', 'utf8');
      expect(readMap('demo').states).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.USERBUG_ROOT;
      else process.env.USERBUG_ROOT = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * نقشه → پیشنهاد.
   *
   * ── چرا این آزمون از بقیه مهم‌تر است ──
   *
   * تا وقتی نقشه به پیشنهاد وصل نشود، فقط یک فایلِ قشنگ است. و دو چیزی که
   * اینجا سنجیده می‌شود، همان دو چیزی‌اند که اگر بشکنند کسی متوجه نمی‌شود:
   * مودال پیشنهاد بگیرد (چون آدرس ندارد و هیچ بندِ دیگری سراغش نمی‌رود)، و
   * منو **نگیرد** (چون نامش از دادهٔ همان اجرا می‌آید و فهرست را آلوده
   * می‌کند).
   */
  test('مودالِ نقشه پیشنهاد می‌شود، با مسیرِ رسیدنش — ولی منو نه', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-propose-'));
    const previous = process.env.USERBUG_ROOT;
    process.env.USERBUG_ROOT = root;
    try {
      const { emptyMap, writeMap } = await import('../../src/map/store.js');
      const { proposalsFor } = await import('../../src/knowledge/propose.js');

      const map = emptyMap('demo');
      map.edges = [{ from: 'c', action: 'k0', to: 'a' }];
      map.states = [
        {
          id: 'a',
          route: '/contents',
          view: 'افزودن کتاب جدید',
          viewKind: 'dialog',
          path: [{ click: { role: 'button', name: 'کتاب تازه' } }],
          actions: [
            { key: 'k1', kind: 'unknown', label: 'ذخیره', tried: true },
            { key: 'k2', kind: 'input', label: 'نام کتاب' },
            // این یکی پشتِ مودال است، نه داخلش: از والد ارث رسیده
            { key: 'k0', kind: 'unknown', label: 'نوارِ کناری' },
          ],
        },
        {
          id: 'b',
          route: '/contents',
          view: 'منوی a@b.c کاربر',
          viewKind: 'menu',
          path: [],
          actions: [],
        },
        {
          id: 'c',
          route: '/contents',
          view: '',
          viewKind: '',
          path: [],
          actions: [{ key: 'k0', kind: 'unknown', label: 'نوارِ کناری' }],
        },
        /**
         * همان مودال، با یک تبِ دیگر باز.
         *
         * برای نقشه حالتِ جداست (نمای نقش‌هایش فرق دارد) ولی برای پیشنهاد
         * همان یکی است. نسخهٔ اول دو پیشنهاد با **یک شناسه** می‌ساخت و
         * رابط با `each_key_duplicate` می‌شکست: آدرس عوض می‌شد و صفحه
         * همان قبلی می‌ماند.
         */
        {
          id: 'd',
          route: '/contents',
          view: 'افزودن کتاب جدید',
          viewKind: 'dialog',
          path: [{ click: { role: 'button', name: 'کتاب تازه' } }, { click: { role: 'tab', name: 'پیشرفته' } }],
          actions: [{ key: 'k9', kind: 'unknown', label: 'آدرس فایل' }],
        },
      ];
      await writeMap('demo', map);

      const { proposals } = proposalsFor('demo');
      const fromMap = proposals.filter((item) => item.kind === 'state');

      // یک نما، یک پیشنهاد — هرچند نقشه دو حالت برایش دارد
      expect(fromMap).toHaveLength(1);
      expect(fromMap[0].title).toContain('افزودن کتاب جدید');
      // و شناسه‌ها یکتا می‌مانند، وگرنه فهرستِ رابط بلند می‌شکند
      expect(new Set(proposals.map((item) => item.id)).size).toBe(proposals.length);
      // کوتاه‌ترین مسیر برنده است، چون همان مقدمهٔ سناریو می‌شود
      expect(fromMap[0].preamble).toHaveLength(1);
      // ولی کنشِ حالتِ دوم هم گم نمی‌شود
      expect(fromMap[0].text).toContain('آدرس فایل');
      // مسیرِ رسیدن، همان‌طور که خزنده رفت
      expect(fromMap[0].preamble).toEqual([{ click: { role: 'button', name: 'کتاب تازه' } }]);
      // برچسبِ کنش‌ها در متن می‌آید تا مدل نامِ دکمه را حدس نزند
      expect(fromMap[0].text).toContain('ذخیره');
      // ولی آنچه پشتِ مودال است نه — آن مالِ این نما نیست
      expect(fromMap[0].text).not.toContain('نوارِ کناری');
      // و شناسه پایدار است، وگرنه هر «رد کردن» دفعهٔ بعد برمی‌گردد
      expect(proposalsFor('demo').proposals.find((item) => item.kind === 'state').id).toBe(fromMap[0].id);
    } finally {
      if (previous === undefined) delete process.env.USERBUG_ROOT;
      else process.env.USERBUG_ROOT = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('مقدمه پیش از قدم‌های مدل می‌نشیند و در سرصفحه اعلام می‌شود', async () => {
    const { toYaml } = await import('../../src/scenario/from-text.js');
    const yaml = toYaml(
      { name: 'آزمون', steps: [{ go: '/' }, { click: 'ذخیره' }], notes: '' },
      { text: 'یک کار بکن', preamble: 1 }
    );
    expect(yaml).toContain('مقدمهٔ نقشه');
    expect(yaml.indexOf('go')).toBeLessThan(yaml.indexOf('click'));
  });

  test('مسیرِ کوتاه‌تر جایگزینِ بلندتر می‌شود، نه برعکس', async () => {
    const { emptyMap, upsertState } = await import('../../src/map/store.js');
    const map = emptyMap('demo');
    upsertState(map, { id: 'a', route: '/', path: [{ click: 1 }, { click: 2 }, { click: 3 }], actions: [] });
    upsertState(map, { id: 'a', route: '/', path: [{ click: 9 }], actions: [] });
    expect(map.states[0].path).toHaveLength(1);
    upsertState(map, { id: 'a', route: '/', path: [{ click: 1 }, { click: 2 }], actions: [] });
    expect(map.states[0].path).toHaveLength(1);
  });
});
