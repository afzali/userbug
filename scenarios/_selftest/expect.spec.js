/**
 * خودآزمای «انتظار».
 *
 * ── چرا این یکی از همه خطرناک‌تر است ──
 *
 * انتظارِ غلط بدتر از نبودِ انتظار است. سناریو برای همیشه قرمز می‌ماند، و
 * آدم یاد می‌گیرد قرمزها را نادیده بگیرد — همان لحظه کلِ این ابزار بی‌اثر
 * شده. پس هر چیزی که مدل اختراع کند باید بیفتد، و افتادنش دیده شود.
 */
import { test, expect } from '@playwright/test';
import {
  applyExpectations,
  assertProposals,
  buildUser,
  countExpects,
  describeExpectation,
} from '../../src/scenario/expect.js';

const CANDIDATES = [
  { ref: 'e1', route: '/contents', view: '', label: 'دکمه «افزودن کتاب»', target: { role: 'button', name: 'افزودن کتاب' }, by: 'contract' },
  { ref: 'e2', route: '/login', view: '', label: '«ایمیل»', target: { label: 'ایمیل' }, by: 'contract' },
];

const scenario = {
  name: 'ورود',
  steps: [{ go: '/' }, { fill: { label: 'ایمیل' }, value: 'a@b.c' }, { click: { role: 'button', name: 'ورود' } }],
};

test('عنصری که در فهرست نبود، می‌افتد — و افتادنش نوشته می‌شود', () => {
  /**
   * همان درسِ `classify.js` و `explain.js` و `mission.js`: نامی که ندادیم،
   * از جوابِ مدل بیرون می‌رود. اینجا ولی هزینه‌اش بیشتر است — انتظارِ خیالی
   * یعنی یک سناریوی همیشه‌قرمز.
   */
  const result = assertProposals(
    { expectations: [{ after: 3, ref: 'e404', kind: 'visible', why: 'x' }] },
    { candidates: CANDIDATES, steps: 3 }
  );
  expect(result.expectations).toHaveLength(0);
  expect(result.dropped[0]).toContain('e404');
});

test('جای نامعتبر انتظار را نمی‌کشد، به پایان می‌بردش', () => {
  // «کجا سنجیده شود» را آدم در یک نگاه اصلاح می‌کند؛ ولی حرفِ درست نباید برود
  const result = assertProposals(
    { expectations: [{ after: 99, ref: 'e1', kind: 'visible', why: 'کتابخانه باز شد' }] },
    { candidates: CANDIDATES, steps: 3 }
  );
  expect(result.expectations[0].after).toBe(3);
  expect(result.dropped.join(' ')).toContain('نامعتبر');
});

test('انتظارِ تکراری یکی می‌شود', () => {
  const result = assertProposals(
    {
      expectations: [
        { after: 3, ref: 'e1', kind: 'visible', why: 'یک' },
        { after: 2, ref: 'e1', kind: 'visible', why: 'دو' },
      ],
    },
    { candidates: CANDIDATES, steps: 3 }
  );
  expect(result.expectations).toHaveLength(1);
  expect(result.dropped.join(' ')).toContain('تکراری');
});

test('اطمینانِ ناشناخته «کم» است، نه «زیاد»', () => {
  // پیش‌فرضِ خوش‌بینانه یعنی چیزی که مدل مطمئن نبوده، مثل قاعده نشان داده شود
  const result = assertProposals(
    { expectations: [{ after: 1, ref: 'e1', kind: 'visible', why: 'x', confidence: 'شاید' }] },
    { candidates: CANDIDATES, steps: 3 }
  );
  expect(result.expectations[0].confidence).toBe('low');
});

test('پیشنهادِ مدل `assert` می‌شود، نه `expect`', () => {
  /**
   * `expect` سخت می‌شکند و اجرا را همان‌جا تمام می‌کند. حرفِ نیازموده‌ی مدل
   * نباید بتواند بقیهٔ سناریو را از اجرا بیندازد — یافته ثبت می‌کند و
   * می‌گذرد.
   */
  const next = applyExpectations(scenario, [
    { after: 3, kind: 'visible', target: { role: 'button', name: 'افزودن کتاب' }, why: 'کتابخانه باز شد', label: 'ک' },
  ]);
  expect(next.steps).toHaveLength(4);
  expect(next.steps[3].assert).toEqual({ visible: { role: 'button', name: 'افزودن کتاب' } });
  expect(next.steps[3].finding).toBe('کتابخانه باز شد');
  expect(next.steps[3].expect).toBeUndefined();
});

test('تأییدِ آدم، همان بند را `expect` می‌کند', () => {
  const next = applyExpectations(scenario, [
    { after: 3, kind: 'visible', target: { label: 'ایمیل' }, hard: true, why: 'x', label: 'ی' },
  ]);
  expect(next.steps[3].expect).toEqual({ visible: { label: 'ایمیل' } });
  expect(next.steps[3].assert).toBeUndefined();
});

test('چند انتظار، هر کدام سرِ جای خودش', () => {
  /**
   * درج از اول به آخر، جای بندهای بعدی را یکی جلو می‌برد — خطایی که در
   * بازبینی دیده نمی‌شود چون سناریو هنوز معتبر است.
   */
  const next = applyExpectations(scenario, [
    { after: 1, kind: 'visible', target: { label: 'ایمیل' }, why: 'فرمِ ورود آمد', label: 'ی' },
    { after: 3, kind: 'hidden', target: { label: 'ایمیل' }, why: 'فرم رفت', label: 'ی' },
  ]);
  expect(next.steps).toHaveLength(5);
  expect(next.steps[1].assert).toEqual({ visible: { label: 'ایمیل' } });
  expect(next.steps[4].assert).toEqual({ hidden: { label: 'ایمیل' } });
});

test('ورودیِ مدل قدم‌ها را شماره‌دار و نامزدها را شناسه‌دار می‌دهد', () => {
  const user = buildUser({ scenario, candidates: CANDIDATES, knowledge: 'نپی کتاب‌خوان است' });
  expect(user).toContain('1. go /');
  expect(user).toContain('e1  /contents');
  expect(user).toContain('نپی کتاب‌خوان است');
});

test('جملهٔ فهرست، خواندنی است نه JSON', () => {
  // آدم باید در یک نگاه بفهمد دارد چه چیزی را تأیید می‌کند
  expect(describeExpectation({ after: 3, label: 'دکمه «افزودن کتاب»', kind: 'visible' })).toBe(
    'بعد از قدم 3: دکمه «افزودن کتاب» باید دیده شود'
  );
});

test('شمارشِ انتظار داخلِ `when` هم می‌شمارد', () => {
  /**
   * ── چرا این تست ──
   *
   * صفحهٔ مأموریت‌ها با همین عدد می‌گوید «این سفر بی‌انتظار است». شمارشِ کم
   * یعنی سناریویی که واقعاً انتظار دارد، هشدارِ زرد بگیرد و آدم برود
   * انتظاری اضافه کند که از قبل هست.
   *
   * و خطرش واقعی است: سناریوی ورودی که همین ابزار ساخت، **همهٔ** کارش زیرِ
   * `when` بود.
   */
  expect(countExpects([{ go: '/' }])).toBe(0);
  expect(countExpects([{ assert: { visible: 'x' } }, { expect: { visible: 'y' } }])).toBe(2);

  // داخلِ `when.then` و `when.else`
  expect(
    countExpects([
      { when: { visible: 'a' }, then: [{ assert: { visible: 'b' } }] },
      { when: { visible: 'c', then: [{ expect: { visible: 'd' } }] } },
    ])
  ).toBe(2);

  // و داخلِ حلقه
  expect(countExpects([{ forEach: { times: 3, steps: [{ assert: { visible: 'z' } }] } }])).toBe(1);
  expect(countExpects(null)).toBe(0);
});
