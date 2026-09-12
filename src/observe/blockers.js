/**
 * پنجره‌هایی که روی مسیر کاربر نشسته‌اند.
 *
 * کاربر واقعی می‌بنددشان و کارش را ادامه می‌دهد — پس ما هم. ولی هر کدام
 * گزارش می‌شود، چون «کاربر توانست ببندد» با «نباید آنجا می‌بود» یکی نیست.
 * بدون ثبت، این پنجره‌ها بی‌صدا در همهٔ اجراهای بعدی هم عبور می‌کردند.
 *
 * ── چرا از `fixtures.js` بیرون کشیده شد ──
 *
 * خزشِ نقشه هم به همین لازم دارد: نخستین اجرای واقعی‌اش پشتِ مودالِ «بروزرسانی
 * دیتابیس» ماند و اصلاً به فرمِ ورود نرسید. نوشتنِ نسخهٔ دوم یعنی دو تعریف از
 * «مزاحم چیست» که دیر یا زود واگرا می‌شوند — همان اشتباهی که این مخزن جای
 * دیگر با `verbs.js` و `route.js` از آن پرهیز کرده.
 *
 * ثبت اینجا انجام نمی‌شود، فقط **خبر** داده می‌شود (`onBlocker`): مصرف‌کننده
 * تصمیم می‌گیرد یافته بسازد یا نه. `ub` یافته می‌سازد؛ خزش در مسیرِ ورود فقط
 * می‌شمارد، چون مزاحمی که پیش از شروعِ کار بسته شود قدمِ کاربر را نشکسته.
 */

/** نامِ دکمه‌هایی که «ببند» معنی می‌دهند. */
const CLOSERS = /^(بستن|بعداً|نشان نده|انصراف|باشه|متوجه شدم|Close)$/;

/**
 * @param {import('@playwright/test').Page} page
 * @param {object} [o]
 * @param {RegExp[]} [o.expected] عنوان‌هایی که انتظارشان را داریم و خبر نمی‌خواهند
 * @param {(title: string) => Promise<void>|void} [o.onBlocker] یک بار به ازای هر عنوانِ تازه
 * @returns {Promise<string[]>} عنوانِ هر پنجره‌ای که دیده شد
 */
export async function dismissBlockers(page, { expected = [], onBlocker } = {}) {
  const found = [];
  const noted = new Set();

  for (let guard = 0; guard < 8; guard++) {
    // ترتیب مهم است: alertdialog لایهٔ بالاتری دارد و تا بسته نشود، کلیک روی
    // dialogِ زیرش را می‌گیرد. اولین باری که این را رعایت نکردیم، حلقه پنج بار
    // همان پنجره را «دید» و هیچ‌کدام بسته نشد.
    let top = page.locator('[role="alertdialog"]').first();
    let visible = (await top.count()) > 0 && (await top.isVisible().catch(() => false));
    if (!visible) {
      top = page.locator('[role="dialog"]').first();
      visible = (await top.count()) > 0 && (await top.isVisible().catch(() => false));
    }
    if (!visible) break;

    const title =
      ((await top.getByRole('heading').first().innerText().catch(() => '')) || '(بی‌عنوان)').trim();
    found.push(title);

    if (!noted.has(title) && !expected.some((rx) => rx.test(title))) {
      noted.add(title);
      await onBlocker?.(title);
    }

    const closer = top.getByRole('button', { name: CLOSERS });
    if (await closer.count()) {
      await closer.first().click({ timeout: 4000 }).catch(() => {});
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
    // اگر بسته نشد، حلقهٔ بعدی همان را دوباره می‌بیند — پس منتظر رفتنش می‌مانیم
    await top.waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
  }

  return found;
}
