/**
 * نمای فشردهٔ صفحه برای مدل.
 *
 * ── چرا HTML خام نمی‌فرستیم ──
 *
 * صفحهٔ نپی چند صد کیلوبایت HTML است که بیشترش کلاس‌های تیلویند و شناسه‌های
 * تولیدی است. فرستادنش هم گران است هم مدل را در نویز غرق می‌کند.
 *
 * ── چرا مدل «توصیفِ هدف» نمی‌سازد، فقط «انتخاب» می‌کند ──
 *
 * نسخهٔ اول از مدل می‌خواست خودش `{role, name}` بسازد. مدل هم دقیقاً همان
 * چیزی را برگرداند که ما در snapshot داده بودیم: `role: "input"` — که نقشِ
 * ARIA نیست و هیچ locatorی پیدایش نمی‌کند. اشتباه از مدل نبود، از ما بود.
 *
 * حالا هر عنصر یک `ref` دارد و مدل فقط شماره را برمی‌گرداند. ساختنِ توصیفِ
 * پایدار کارِ ماست، جایی که می‌دانیم چه چیزی واقعاً resolve می‌شود. این یک
 * کلاسِ کاملِ خطا را حذف می‌کند.
 */

export const SNAPSHOT_FN = () => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  };

  /** نقشِ ARIA، نه نام تگ. */
  const roleOf = (el) => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;

    const tag = el.tagName.toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : null;
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'submit' || type === 'button') return 'button';
      if (['text', 'email', 'password', 'search', 'tel', 'url', 'number'].includes(type)) return 'textbox';
      return null;
    }
    return null;
  };

  const clean = (t) => (t || '').trim().replace(/\s+/g, ' ').slice(0, 80);

  /**
   * متنِ دیده‌شدنی، نه `textContent` خام.
   *
   * نپی برای واکنش‌گرایی دو نسخه از یک برچسب می‌گذارد و یکی را با تیلویند
   * پنهان می‌کند:
   *
   *   <span class="hidden sm:inline">فایل خالی جدید</span>
   *   <span class="sm:hidden">جدید</span>
   *
   * `textContent` هر دو را می‌چسباند و «فایل خالی جدید جدید» می‌دهد — نامی که
   * هیچ locatorی پیدایش نمی‌کند و کاوشگر دو بار رویش گیر کرد. مرورگر و
   * صفحه‌خوان فقط نسخهٔ دیده‌شدنی را می‌خوانند؛ ما هم باید همان کار را بکنیم.
   */
  const visibleText = (el) => {
    let out = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) out += node.textContent;
      else if (node.nodeType === Node.ELEMENT_NODE && visible(node)) out += visibleText(node);
    }
    return out;
  };

  const labelOf = (el) => {
    if (el.labels && el.labels[0]) return clean(visibleText(el.labels[0]));
    const id = el.getAttribute('id');
    if (id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (lbl) return clean(visibleText(lbl));
    }
    return '';
  };

  const items = [];
  let ref = 0;

  const INTERACTIVE = 'button, a[href], input, select, textarea, [role], [contenteditable="true"]';
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (!visible(el)) continue;

    const role = roleOf(el);
    const testid = el.getAttribute('data-testid') || undefined;
    const label = labelOf(el) || undefined;
    const placeholder = el.getAttribute('placeholder') || undefined;
    const name = clean(el.getAttribute('aria-label') || visibleText(el)) || undefined;

    // عنصری که هیچ راهی برای اشاره به آن نداریم، فرستادنش فقط نویز است
    if (!testid && !label && !placeholder && !name) continue;

    /**
     * وضعیتِ فعلی، نه فقط هویت.
     *
     * بدون این، مدل نمی‌داند چه چیزی از قبل انتخاب شده و دوباره همان را
     * می‌زند. کاوش در ویرایشگر دو بار روی تبِ فعال کلیک کرد و بعد به محافظِ
     * تکرار خورد — نه چون گیج بود، چون ما وضعیت را نگفته بودیم.
     */
    const state = {
      selected: el.getAttribute('aria-selected') === 'true' || undefined,
      checked: el.checked || el.getAttribute('aria-checked') === 'true' || undefined,
      expanded: el.getAttribute('aria-expanded') === 'true' || undefined,
      // مقدارِ فعلیِ ورودی — ماسک بعداً روی همین اعمال می‌شود
      value: el.value ? String(el.value).slice(0, 40) : undefined,
    };

    items.push({
      ref: ref++,
      role: role || undefined,
      name,
      label,
      placeholder,
      testid,
      disabled: el.disabled || el.getAttribute('aria-disabled') === 'true' || undefined,
      ...Object.fromEntries(Object.entries(state).filter(([, v]) => v !== undefined)),
    });
    if (items.length >= 120) break;
  }

  const headings = [...document.querySelectorAll('h1, h2, h3')]
    .filter(visible)
    .map((h) => clean(visibleText(h)))
    .slice(0, 10);

  return { url: location.pathname, headings, items };
};

/**
 * پایه‌ی توصیف، بدون رفع ابهام.
 *
 * همه‌شان `visible: true` می‌گیرند: این توصیف‌ها از snapshot می‌آیند و snapshot
 * فقط عناصرِ دیده‌شدنی را می‌بیند. بدون آن، توصیف به عنصرِ پنهانی هم می‌خورد که
 * مدل اصلاً ندیده بودش.
 */
function baseDescriptor(item) {
  if (item.testid) return { testid: item.testid, visible: true };
  if (item.label) return { label: item.label, visible: true };
  if (item.role && item.name) return { role: item.role, name: item.name, exact: true, visible: true };
  if (item.placeholder) return { placeholder: item.placeholder, visible: true };
  if (item.name) return { text: item.name, visible: true };
  return null;
}

/**
 * از یک عنصرِ snapshot، پایدارترین توصیفی که `resolveTarget` می‌فهمد.
 *
 * ترتیب همان نردبانِ همیشگی است: پایدارترین اول.
 *
 * ── چرا `nth` لازم شد ──
 *
 * نخستین کاوش آزاد روی «پوشه جدید» گیر کرد: دو دکمه با همان نام در صفحه بود و
 * `getByRole` هر دو را می‌گرفت. توصیفی که به بیش از یک عنصر بخورد، بی‌فایده
 * است — نه فقط الان، بلکه در کش هم، چون دفعهٔ بعد هم نمی‌شود اجرایش کرد.
 *
 * پس اگر چند عنصرِ snapshot توصیفِ یکسان بدهند، جایگاهشان هم در توصیف می‌آید.
 * ترتیب snapshot همان ترتیب سند است، پس با ترتیب locator می‌خواند.
 */
export function descriptorFor(item, allItems = null) {
  const base = baseDescriptor(item);
  if (!base || !allItems) return base;

  const key = JSON.stringify(base);
  const twins = allItems.filter((other) => JSON.stringify(baseDescriptor(other)) === key);
  if (twins.length < 2) return base;

  const index = twins.findIndex((t) => t.ref === item.ref);
  return { ...base, nth: index < 0 ? 0 : index };
}

export async function snapshotPage(page) {
  return page.evaluate(SNAPSHOT_FN);
}
