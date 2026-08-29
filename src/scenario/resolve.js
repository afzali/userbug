/**
 * پیدا کردن عنصر از روی توصیفِ سناریو.
 *
 * ── نردبان ──
 *
 * ترتیبِ testid ← role ← label ← text عمدی است و از پایدارترین به شکننده‌ترین
 * می‌رود. رشتهٔ ساده هر چهار پله را از بالا امتحان می‌کند و اولین چیزی که
 * دقیقاً یکی پیدا شود برنده است.
 *
 * چرا «دقیقاً یکی»: در نپی سلکتور `getByRole('menuitem', {name: 'خروج'})` هم
 * به «خروج» می‌خورد و هم به «خروجی گرفتن از اطلاعات». اگر اولین تطبیق را
 * برمی‌داشتیم، سناریو کارِ اشتباه می‌کرد و هیچ‌کس نمی‌فهمید.
 */

/**
 * @param {import('@playwright/test').Page} page
 * @param {string|object} target رشته، یا `{testid|role|name|label|text|selector|exact|nth}`
 */
export function resolveTarget(page, target) {
  if (target == null) throw new Error('قدم بدون هدف');

  if (typeof target === 'string') return { locator: byLadder(page, target), described: target };

  const { testid, role, name, label, text, placeholder, selector, exact = true, nth } = target;
  let locator;

  if (selector) locator = page.locator(selector);
  else if (testid) locator = page.getByTestId(testid);
  else if (role) locator = page.getByRole(role, name ? { name, exact } : undefined);
  else if (label) locator = page.getByLabel(label, { exact });
  else if (placeholder) locator = page.getByPlaceholder(placeholder, { exact });
  else if (text) locator = page.getByText(text, { exact });
  else throw new Error(`توصیف هدف نامفهوم: ${JSON.stringify(target)}`);

  if (nth !== undefined) locator = locator.nth(nth);
  return { locator, described: JSON.stringify(target) };
}

/**
 * رشتهٔ ساده: نردبان را از بالا برو.
 *
 * `.or()` نمی‌سازیم چون می‌خواهیم بدانیم کدام پله جواب داد — برای فاز ۲ که
 * می‌خواهیم پلهٔ حل‌شده را کش کنیم، همین اطلاعات ارزش دارد.
 */
function byLadder(page, value) {
  return page
    .getByTestId(value)
    .or(page.getByRole('button', { name: value, exact: true }))
    .or(page.getByLabel(value, { exact: true }))
    .or(page.getByText(value, { exact: true }))
    .first();
}

/** همان نردبان، ولی می‌گوید کدام پله جواب داد. برای کشِ فاز ۲. */
export async function resolveWithStrategy(page, value) {
  const ladder = [
    ['testid', page.getByTestId(value)],
    ['role', page.getByRole('button', { name: value, exact: true })],
    ['label', page.getByLabel(value, { exact: true })],
    ['text', page.getByText(value, { exact: true })],
  ];
  for (const [strategy, locator] of ladder) {
    if ((await locator.count()) === 1) return { strategy, locator };
  }
  return { strategy: 'none', locator: byLadder(page, value) };
}
