/**
 * نمای فشردهٔ صفحه برای مدل.
 *
 * ── چرا HTML خام نمی‌فرستیم ──
 *
 * صفحهٔ نپی چند صد کیلوبایت HTML است که بیشترش کلاس‌های تیلویند و شناسه‌های
 * تولیدی است. فرستادنش هم گران است هم مدل را در نویز غرق می‌کند.
 *
 * پس فقط چیزی می‌رود که کاربر با آن کار دارد: عناصرِ تعاملی و متن‌های
 * عنوان‌گونه، با همان اطلاعاتی که سناریو هم می‌تواند با آن هدف را توصیف کند
 * (`role` و `name` و `testid`). این تقارن عمدی است: خروجی مدل باید مستقیماً
 * به یک توصیفِ هدفِ معتبر تبدیل شود.
 */

export const SNAPSHOT_FN = () => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  };

  const nameOf = (el) =>
    (
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      (el.labels && el.labels[0]?.textContent) ||
      el.textContent ||
      ''
    )
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 80);

  const items = [];

  const INTERACTIVE = 'button, a[href], input, select, textarea, [role], [contenteditable="true"]';
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (!visible(el)) continue;
    const role = el.getAttribute('role') || el.tagName.toLowerCase();
    const name = nameOf(el);
    if (!name && !el.getAttribute('data-testid')) continue;

    items.push({
      role,
      name,
      testid: el.getAttribute('data-testid') || undefined,
      type: el.getAttribute('type') || undefined,
      disabled: el.disabled || el.getAttribute('aria-disabled') === 'true' || undefined,
    });
    if (items.length >= 120) break;
  }

  const headings = [...document.querySelectorAll('h1, h2, h3')]
    .filter(visible)
    .map((h) => h.textContent.trim().replace(/\s+/g, ' ').slice(0, 80))
    .slice(0, 10);

  return { url: location.pathname, title: document.title, headings, items };
};

export async function snapshotPage(page) {
  return page.evaluate(SNAPSHOT_FN);
}
