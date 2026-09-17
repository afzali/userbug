/**
 * خودآزمای هم‌زبانیِ دو مفسر.
 *
 * ── چرا این فایل هست ──
 *
 * `src/scenario/run.js` سناریو را اجرا می‌کند و `src/map/replay.js` همان
 * سناریو را برای خزش بازپخش می‌کند. مقدمهٔ `replay.js` از روز اول هشدار
 * داده بود: «دو مسیرِ اجرا که دیر یا زود واگرا می‌شوند».
 *
 * واگرا شدند — و با رفتنِ کلِ حلقه روی نپی پیدا شد، نه با خواندنِ کد. یک
 * سناریوی ورود که در اجراگر سبز بود، در خزش پشتِ سرِ هم می‌مرد:
 *
 *   `fill` شکلِ کوتاه       {fill: {«ایمیل»: «a@b.c»}}  ← «توصیف هدف نامفهوم»
 *   `wait` شکلِ شرطی        {wait: {visible: …}}         ← بی‌صدا صفر ثانیه
 *   `expect` و `assert`     اصلاً                        ← کلِ فایل رد می‌شد
 *   `then` داخلِ `when`      هر دو                        ← بی‌صدا هیچ
 *
 * سه‌تای اول یک‌طرفه بودند و چهارمی در هر دو. این فایل هر چهار را قفل
 * می‌کند — روی **متنِ** هر دو ماژول، چون اجرای واقعی‌شان مرورگر می‌خواهد.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { REPLAY_VERBS, unsupportedVerbs, verbOf } from '../../src/map/replay.js';
import { KNOWN_VERBS } from '../../src/scenario/verbs.js';

const read = (relative) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

test('سنجش‌ها دیگر کلِ مسیرِ ورود را رد نمی‌کنند', () => {
  /**
   * پیش‌تر `expect` در فهرست نبود، پس `unsupportedVerbs` کلِ سناریو را
   * رد می‌کرد: «فعلی که خزش اجرا نمی‌کند: expect». یعنی کاربر باید یا
   * سناریوی ورودِ بی‌ادعا می‌نوشت، یا دو فایلِ تقریباً یکسان نگه می‌داشت.
   */
  expect(REPLAY_VERBS).toContain('expect');
  expect(REPLAY_VERBS).toContain('assert');

  expect(
    unsupportedVerbs([{ go: '/login' }, { expect: { url: '/contents' } }, { assert: { visible: 'x' } }])
  ).toEqual([]);
});

test('فعلِ واقعاً ناشناس هنوز بلند می‌شکند', () => {
  /**
   * سکوت در برابر فعلی که اجرا نشده یعنی مسیری که فکر می‌کنیم طی شده و
   * نشده — و بعد از آن هر یالی که ثبت شود دروغ است. این قاعده نباید با
   * باز کردنِ جا برای `expect` شل شود.
   */
  expect(unsupportedVerbs([{ go: '/' }, { request: { path: '/x' } }])).toEqual(['request']);
});

test('`then` هم کنارِ `when` کار می‌کند هم داخلش — در هر دو مفسر', () => {
  /**
   * تورفتگیِ YAML این را آسان اشتباه می‌کند. پیش‌تر شکلِ تودرتو در **هر
   * دو** مفسر بی‌صدا هیچ کاری نمی‌کرد: شرط درست ارزیابی می‌شد، `then`
   * خالی بود، و کلِ بلوک رد می‌شد بی هیچ خطایی.
   *
   * سناریوی ورودِ نپی دقیقاً همین را داشت: سبز بود و هرگز وارد نمی‌شد.
   */
  expect(read('src/scenario/run.js')).toContain('raw.then || body?.then');
  expect(read('src/map/replay.js')).toContain('step.then || body?.then');
});

test('`fill` کوتاه در بازپخش هم فهمیده می‌شود', () => {
  /**
   * `{fill: {«ایمیل»: «a@b.c»}}` همان شکلی است که ضبط‌کنندهٔ گشت و مدل
   * هر دو می‌سازند — یعنی شکلِ غالبِ سناریوهای واقعی.
   */
  const source = read('src/map/replay.js');
  expect(source).toContain("verb === 'fill' || verb === 'type'");
  expect(source).toContain('resolveTarget(page, { label })');
});

test('`wait` شرطی در بازپخش واقعاً صبر می‌کند', () => {
  /**
   * بدترین شکلِ ممکن: `Number({})` صفر می‌شد و بازپخش **اصلاً** صبر
   * نمی‌کرد، بی هیچ خطایی. یعنی انتظاری که کاربر صریح نوشته بود در مسیرِ
   * خزش وجود نداشت.
   */
  const source = read('src/map/replay.js');
  expect(source).toContain("case 'wait': {");
  expect(source).toContain('انتظارِ مسیرِ ورود نخورد');
});

test('هر فعلی که بازپخش می‌شناسد، مفسرِ سناریو هم می‌شناسد', () => {
  /**
   * جهتِ دیگرِ هم‌زبانی: بازپخش نباید فعلی بسازد که سناریو نمی‌فهمد،
   * وگرنه فایلی که خزش می‌پذیرد در اجراگر می‌شکند.
   */
  const unknown = REPLAY_VERBS.filter((verb) => !KNOWN_VERBS.has(verb));
  expect(unknown).toEqual([]);
});

test('`verbOf` کلیدهای غیرفعل را فعل نمی‌شمارد', () => {
  expect(verbOf({ when: { visible: 'x' }, then: [] })).toBe('when');
  expect(verbOf({ fill: { label: 'ایمیل' }, value: 'a' })).toBe('fill');
  expect(verbOf({ as: 'عنوان', click: 'x' })).toBe('click');
});

test('پیامِ شکستِ مسیرِ ورود می‌گوید کجا ایستادیم', () => {
  /**
   * «سنجش نخورد: {url: /contents}» فقط می‌گوید نشد. آنچه لازم است این
   * است که به‌جایش کجا رفتیم — همان یک کلمه تفاوتِ «حدس بزن» و «فهمیدم».
   */
  expect(read('src/map/replay.js')).toContain('الان اینجاییم');
});
