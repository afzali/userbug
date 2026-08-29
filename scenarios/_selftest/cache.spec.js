/**
 * خودآزمای کش و امضا — هستهٔ اقتصادیِ فاز ۲.
 *
 * ── دو شکستِ متقابل ──
 *
 * امضا باید دقیقاً بین دو خطا بایستد:
 *
 *   بیش از حد حساس  →  هر رندر امضا را عوض می‌کند، کش هر بار باطل می‌شود، و
 *                       «AI فقط بار اول» به «AI هر بار» تبدیل می‌شود.
 *   بیش از حد شل     →  عنصری که معنایش عوض شده باز هم پذیرفته می‌شود، تست
 *                       سبز می‌ماند و باگ رد می‌شود.
 *
 * نپی برای سنجیدنِ حساسیت هدفِ خوبی است: شناسه‌هایش (`bits-c105`) با هر رندر
 * عوض می‌شوند و کلاس‌هایش تیلویندِ طولانی‌اند. اگر امضا به آن‌ها وابسته بود،
 * همین تست می‌شکست.
 */
import { test, expect } from '../../src/fixtures.js';
import { SIGNATURE_FN, hashSignature } from '../../src/steps/signature.js';
import { redact } from '../../src/models/redact.js';
import { resolveModel, DEFAULTS } from '../../src/models/config.js';

test.use({ probe: true });

test('امضا بین دو رندر پایدار می‌ماند', async ({ page, ub }) => {
  let first;

  await ub.step('امضای دکمهٔ ورود', async () => {
    await page.goto('/');
    await page.waitForURL(/\/login/, { timeout: 20_000 });
    await page.waitForTimeout(2000);
    await ub.dismissBlockers();

    const button = page.getByRole('button', { name: 'ورود / ثبت‌نام' });
    first = hashSignature(await button.evaluate(SIGNATURE_FN));
    expect(first).toMatch(/^[0-9a-f]{8}$/);
  });

  await ub.step('پس از رفرش باید همان باشد', async () => {
    await page.reload();
    await page.waitForTimeout(2000);
    await ub.dismissBlockers();

    const button = page.getByRole('button', { name: 'ورود / ثبت‌نام' });
    const second = hashSignature(await button.evaluate(SIGNATURE_FN));

    // اگر این بشکند، کش عملاً کار نمی‌کند: هر اجرا همه‌چیز را دوباره از مدل
    // می‌پرسد و هزینه هرگز پایین نمی‌آید.
    expect(second, 'امضا نباید با رندر دوباره عوض شود').toBe(first);
  });
});

test('امضا تغییرِ ساختاری را می‌گیرد', async ({ page, ub }) => {
  await ub.step('امضا پیش و پس از جابه‌جایی عنصر', async () => {
    await page.goto('/');
    await page.waitForURL(/\/login/, { timeout: 20_000 });
    await page.waitForTimeout(2000);
    await ub.dismissBlockers();

    const button = page.getByRole('button', { name: 'ورود / ثبت‌نام' });
    const before = hashSignature(await button.evaluate(SIGNATURE_FN));

    // همان دکمه، همان متن، همان نقش — ولی یک لایه‌ی تازه دورش. selector هنوز
    // پیدایش می‌کند؛ این دقیقاً همان حالتِ خطرناکی است که امضا باید بگیرد.
    await button.evaluate((el) => {
      const wrapper = document.createElement('section');
      el.parentElement.insertBefore(wrapper, el);
      wrapper.appendChild(el);
    });

    const after = hashSignature(await button.evaluate(SIGNATURE_FN));
    expect(after, 'جابه‌جایی ساختاری باید امضا را عوض کند').not.toBe(before);
  });
});

test('ماسک: رمز و توکن از prompt بیرون می‌مانند', async ({ ub }) => {
  await ub.step('سنجش', async () => {
    const password = 'Ab1!SuperSecret';
    const text = `کاربر با رمز ${password} وارد شد. کلید sk-abcdef0123456789abcdef و Bearer eyJhbGciOiJIUzI1NiJ9xxxxxxxxxxxx`;

    const masked = redact(text, [password]);

    expect(masked).not.toContain(password);
    expect(masked).not.toContain('sk-abcdef0123456789abcdef');
    expect(masked).toContain('<حذف‌شده>');
    expect(masked).toContain('<api-key>');
  });
});

test('لایه‌بندی مدل: تک‌درخواست بر هدف، هدف بر پیش‌فرض', async ({ ub }) => {
  await ub.step('سنجش', async () => {
    const global = { models: { roles: { resolve: 'g/resolve' } } };
    const target = { models: { roles: { analyze: 't/analyze' } } };

    // نقشی که فقط پیش‌فرض داردش
    expect(resolveModel({ global: {}, target: {}, role: 'author' }).model).toBe(DEFAULTS.roles.author);

    // کلی بر پیش‌فرض می‌چربد
    expect(resolveModel({ global, target: {}, role: 'resolve' }).model).toBe('g/resolve');

    // هدف بر کلی
    expect(resolveModel({ global, target, role: 'analyze' }).model).toBe('t/analyze');

    // تک‌درخواست بر همه
    expect(resolveModel({ global, target, role: 'analyze', model: 'x/one-off' }).model).toBe('x/one-off');
  });
});
