/**
 * خودآزمای «تنظیمی که زدی، همان شد».
 *
 * ── چرا این فایل هست ──
 *
 * جعبهٔ «پیشرفته» دقیقاً به‌اندازهٔ این زنجیر واقعی است: بدنهٔ درخواست ←
 * `jobOptions` ← `cliArgs` ← پرچمِ خط فرمان. چک‌باکسی که آخرِ این زنجیر
 * پرچم نسازد، کنترلی است که هیچ کاری نمی‌کند و کاربر فکر می‌کند کرد —
 * بدترین نوعِ ایراد، چون خطا نمی‌دهد و لاگ هم ندارد.
 *
 * و تا امروز کلِ این زنجیر داخلِ `spawn` بود، یعنی هیچ خودآزمایی نمی‌شد
 * دیدش بی آنکه واقعاً مرورگر باز شود.
 */
import { test, expect } from '@playwright/test';
import { cliArgs, jobOptions } from '../../ui/src/lib/server/jobs.js';

const build = (body) => cliArgs(jobOptions(body), 'demo');

test('خزش: هر ردیفِ «پیشرفته» یک پرچمِ واقعی می‌سازد', () => {
  const args = build({
    kind: 'map',
    from: 'ورود',
    profile: true,
    fresh: true,
    states: '40',
    minutes: '8',
    headed: true,
  });

  expect(args.slice(0, 2)).toEqual(['map', 'demo']);
  expect(args).toContain('--profile');
  expect(args).toContain('--fresh');
  expect(args).toContain('--headed');
  expect(args[args.indexOf('--from') + 1]).toBe('ورود');
  expect(args[args.indexOf('--states') + 1]).toBe('40');
  expect(args[args.indexOf('--minutes') + 1]).toBe('8');
});

test('کاوشِ محدود: هدف positional است، نه پرچم', () => {
  const args = build({ kind: 'quest', goal: 'تنظیمات را بگرد', depth: '12' });

  expect(args.slice(0, 3)).toEqual(['quest', 'demo', 'تنظیمات را بگرد']);
  expect(args[args.indexOf('--depth') + 1]).toBe('12');
});

test('تنظیمِ نزده پرچم نمی‌سازد', () => {
  /**
   * ── چرا این مهم‌تر از سرِ جایش بودنِ پرچم‌هاست ──
   *
   * پرچمِ خالی («--device ») رفتارِ پیش‌فرضِ سناریو را می‌شکند بی آنکه
   * کاربر چیزی خواسته باشد. «نزدن» باید واقعاً «نگفتن» باشد.
   */
  const args = build({ kind: 'map' });
  expect(args).toEqual(['map', 'demo']);

  const run = build({ kind: 'run' });
  expect(run).toEqual(['run', 'demo']);
});

test('تکرارِ یک، پرچمِ تکرار نمی‌سازد', () => {
  expect(build({ kind: 'run', repeat: 1 })).not.toContain('--repeat');
  expect(build({ kind: 'run', repeat: 3 })).toContain('--repeat');
});

test('مقدارِ بی‌معنا بی‌صدا رد می‌شود، نه اینکه به خط فرمان برسد', () => {
  /** `--states abc` را CLI رد می‌کند و اجرا اصلاً شروع نمی‌شود. */
  expect(build({ kind: 'map', states: 'abc' })).not.toContain('--states');
  expect(build({ kind: 'quest', goal: 'برو', depth: '0' })).not.toContain('--depth');
  /** اسلاگِ مدل همان شکلی سنجیده می‌شود که CLI می‌سنجد. */
  expect(build({ kind: 'quest', goal: 'برو', model: 'چرند' })).not.toContain('--model');
  expect(build({ kind: 'quest', goal: 'برو', model: 'openai/gpt-4o-mini' })).toContain('--model');
});

test('نامِ دور به هر سه نوعِ کار می‌چسبد', () => {
  for (const kind of ['map', 'quest', 'run']) {
    const args = build({ kind, goal: 'برو ببین', bench: 'دورِ پیش از انتشار' });
    expect(args[args.indexOf('--bench') + 1]).toBe('دورِ پیش از انتشار');
  }
});

test('پیشرفتهٔ بررسی سرِ جای خودش می‌نشیند', () => {
  const args = build({
    kind: 'run',
    only: ['ورود با رمزِ غلط'],
    device: 'iphone-13',
    persona: 'novice',
    repeat: 2,
    headed: true,
  });

  expect(args[args.indexOf('--device') + 1]).toBe('iphone-13');
  expect(args[args.indexOf('--persona') + 1]).toBe('novice');
  expect(args[args.indexOf('--repeat') + 1]).toBe('2');
  expect(args).toContain('--headed');
  /** نامِ آدم با `benchGrep` همان‌جا escape می‌شود که خط فرمان می‌کند. */
  expect(args[args.indexOf('--grep') + 1]).toContain('ورود با رمزِ غلط');
});

test('ردیفی که به این نوعِ کار ربط ندارد، پرچم نمی‌شود', () => {
  /**
   * جعبهٔ مشترک برای هر راه ردیف‌های خودش را نشان می‌دهد؛ ولی اگر روزی
   * یک ردیفِ اضافه از رابط رد شود، اینجا هم نباید به خط فرمان برسد —
   * `map --device` اصلاً پرچمی نیست و اجرا را می‌شکند.
   */
  expect(build({ kind: 'map', device: 'iphone', persona: 'pro', repeat: 5 })).toEqual(['map', 'demo']);
  expect(build({ kind: 'quest', goal: 'برو ببین', profile: true, fresh: true })).toEqual([
    'quest',
    'demo',
    'برو ببین',
  ]);
});
