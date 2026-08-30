/**
 * دروازهٔ ایمنی — قانون ۸.
 *
 * ── چرا این فایل تا امروز لازم نبود و حالا هست ──
 *
 * تا وقتی ابزار فقط مرورگر را می‌راند، بدترین کارِ ممکن روی یک هدفِ اشتباه،
 * ساختن چند حساب زائد بود. با آمدنِ فعل `request` و قلاب‌های `shell`، حالا
 * می‌شود با یک اشتباه تایپی در `apiURL` روی دادهٔ واقعیِ کاربران نوشت.
 *
 * پس هر کارِ نویسنده از اینجا رد می‌شود، و پیش‌فرضِ ندانستن «نه» است:
 * هدفی که `environment` اعلام نکرده، تولیدی فرض می‌شود.
 */

const SAFE = new Set(['local', 'staging']);
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * SQL فقط‌خواندنی.
 *
 * دو شرط، چون هیچ‌کدام تنها کافی نیست: باید با فعلِ خواندن شروع شود، **و**
 * هیچ‌جایش فعلِ نوشتن نداشته باشد. شرط دوم برای `WITH x AS (…) DELETE FROM …`
 * است که با فعلِ خواندن شروع می‌شود ولی می‌نویسد.
 *
 * سخت‌گیری‌اش عمدی است: `SELECT … WHERE msg = 'delete'` هم روی محیط تولیدی رد
 * می‌شود. جهتِ اشتباه اینجا ارزان است — پیام خطا می‌گوید چه شد — ولی جهتِ
 * دیگر یعنی پاک شدن دادهٔ واقعی.
 */
const READ_ONLY_SQL_START = /^(select|with|explain)\b/i;
const WRITE_SQL = /\b(insert|update|delete|drop|alter|create|replace|truncate|attach|detach|vacuum|reindex|pragma)\b/i;

export function isSafeEnvironment(target) {
  return SAFE.has(target?.environment);
}

/**
 * آیا این کارِ نویسنده مجاز است؟ اگر نه، با پیام روشن می‌شکند.
 *
 * @param {object} target
 * @param {string} what توصیف کاری که می‌خواست انجام شود — در پیام خطا می‌آید
 */
export function assertMayMutate(target, what) {
  if (isSafeEnvironment(target)) return;

  throw new Error(
    `${what} روی هدف «${target.name}» رد شد.\n` +
      `  محیط: ${target.environment}\n` +
      `  کارِ نویسنده فقط روی local و staging مجاز است.\n` +
      `  اگر این هدف واقعاً محیط توسعه است، environment را در کانفیگش تصحیح کنید.`
  );
}

/** درخواست HTTP: خواندن همیشه آزاد است، نوشتن نه. */
export function assertMayRequest(target, method, path) {
  if (READ_ONLY_METHODS.has(String(method).toUpperCase())) return;
  assertMayMutate(target, `درخواست ${method} به ${path}`);
}

/** جمله‌های SQL، بدون کامنت — تا `--` یا `/* *\/` نیتِ نوشتن را پنهان نکند. */
function sqlStatements(sql) {
  return String(sql ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

/**
 * داورِ وضعیت: خواندن آزاد، نوشتن فقط روی محیط توسعه.
 *
 * `query` تابعی را صدا می‌زند که خودِ هدف در کانفیگش گذاشته و همان ماژول
 * دیتابیسی را می‌راند که اپ استفاده می‌کند. یعنی یک `DELETE FROM books` در
 * سناریو، واقعاً پاک می‌کند. `request` از روز اول دروازه داشت؛ این یکی نداشت،
 * در حالی که خطرش کمتر نیست.
 *
 * چند جمله در یک رشته هم بررسی می‌شود، وگرنه
 * `SELECT 1; DELETE FROM users` از کنار شرطِ «با select شروع می‌شود» رد می‌شد.
 */
export function assertMayQuery(target, sql) {
  const statements = sqlStatements(sql);
  if (!statements.length) throw new Error('پرس‌وجوی خالی است');

  const readOnly = statements.every(
    (statement) => READ_ONLY_SQL_START.test(statement) && !WRITE_SQL.test(statement)
  );
  if (readOnly) return;

  assertMayMutate(target, `پرس‌وجوی نویسنده «${statements[0].slice(0, 60)}»`);
}
