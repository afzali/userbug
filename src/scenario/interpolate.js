/**
 * جای‌گذاری متغیر در متن سناریو.
 *
 *   {{identity.email}}            هویتِ همین اجرا
 *   {{identity.email | upper}}    با فیلتر
 *   {{nasty.zwnj}}                دادهٔ بدخیم فارسی
 *   {{vars.recoveryCode}}         چیزی که قدم `set` گرفته
 *
 * فیلترها عمداً کم‌اند. هر فیلترِ تازه یعنی یک زبانِ کوچکِ تازه، و زبانِ کوچک
 * همیشه بزرگ می‌شود.
 */

const FILTERS = {
  upper: (v) => String(v).toUpperCase(),
  lower: (v) => String(v).toLowerCase(),
  trim: (v) => String(v).trim(),
  /** حرف اول بزرگ — برای سنجیدن نرمال‌سازیِ ایمیل لازم است */
  upperFirst: (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1),
  /** بخشِ پیش از @ */
  localPart: (v) => String(v).split('@')[0],
};

function readPath(ctx, dotted) {
  return dotted.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), ctx);
}

/**
 * @param {*} value رشته، آرایه یا شیء — همه‌جا جای‌گذاری می‌شود
 * @param {object} ctx مثل `{identity, nasty, vars}`
 */
export function interpolate(value, ctx) {
  if (typeof value === 'string') return interpolateString(value, ctx);
  if (Array.isArray(value)) return value.map((v) => interpolate(v, ctx));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolate(v, ctx)]));
  }
  return value;
}

function interpolateString(text, ctx) {
  return text.replace(/\{\{([^}]+)\}\}/g, (whole, body) => {
    const [pathPart, ...filterParts] = body.split('|').map((s) => s.trim());
    let out = readPath(ctx, pathPart);

    if (out === undefined) {
      // خطای صریح بهتر از رشتهٔ «undefined» است که بی‌صدا در فرم می‌نشیند
      throw new Error(`متغیر ناشناخته در سناریو: {{${body.trim()}}}`);
    }

    for (const f of filterParts) {
      const fn = FILTERS[f];
      if (!fn) throw new Error(`فیلتر ناشناخته: «${f}» در {{${body.trim()}}}`);
      out = fn(out);
    }
    return String(out);
  });
}
