/**
 * استخراجِ ناوردا از schema — با قاعده، نه با مدل.
 *
 * ── چرا این کار ارزش دارد ──
 *
 * کاوشگر و چکِ همگانی هر دو در یک چیز ناتوان‌اند: **باگ منطقی**. صفحه سالم
 * رندر می‌شود، هیچ خطایی نمی‌آید، و دیتابیس دو کاربر با یک ایمیل دارد. از
 * بیرون هیچ نشانه‌ای ندارد.
 *
 * ولی خودِ پروژه از قبل گفته که این نباید بشود — در `UNIQUE(email)`. آن یک
 * جمله، یک ناوردای آمادهٔ اجراست که فقط کسی نخوانده بودش.
 *
 * ── چرا مدل اینجا کاری ندارد ──
 *
 * `UNIQUE`، `NOT NULL` و `CHECK` نحوِ ثابت دارند. سپردنشان به مدل یعنی پول
 * دادن برای چیزی که یک regex جواب می‌دهد، و گرفتنِ جوابی که گاهی ناوردایی
 * می‌سازد که در schema نیست — و ناوردای ساختگی بدترین نوعِ یافتهٔ قلابی است،
 * چون به‌نامِ «قاعدهٔ خودِ پروژه» ثبت می‌شود.
 *
 * ── محدودهٔ صادقانه ──
 *
 * این ماژول SQL می‌فهمد و بس. پروژه‌ای که schema را در مهاجرت‌های ORM دارد
 * (Prisma، Sequelize، Eloquent) از اینجا چیزی نمی‌گیرد. آن‌ها آشکارسازِ خودشان
 * را می‌خواهند و اضافه کردنشان همین‌جاست — ولی ادعا کردنِ پشتیبانی‌شان پیش از
 * نوشتنشان، بدتر از نداشتنشان است.
 */

/** بندهایی که در تعریفِ ستون معنا دارند. */
const COLUMN_UNIQUE = /\bUNIQUE\b/i;
const COLUMN_NOT_NULL = /\bNOT\s+NULL\b/i;

/**
 * فایلی که ممکن است schema داشته باشد.
 *
 * ── چرا فقط `.sql` کافی نبود ──
 *
 * نخستین آزمون روی یک پروژهٔ واقعی صفر ناوردا داد: نپی هیچ فایل `.sql` ندارد
 * و schema را داخل جاوااسکریپت نگه می‌دارد (`src/lib/db/database.js`). این
 * الگو در اپ‌های SQLite-in-browser و در مهاجرت‌های دستی رایج است، پس
 * محدود کردن به پسوند یعنی خاموش ماندن روی کلاسی از پروژه‌ها.
 *
 * ── چرا فایلِ تست کنار می‌رود، و چرا این مهم‌ترین خطِ این تابع است ──
 *
 * همان پروژه سه فایلِ تست دارد که `CREATE TABLE books (...)` دارند — ولی
 * آن‌ها **fixture** هستند: schemaی ساده‌شده برای یک تست، نه schemaی واقعی.
 * استخراج از آن‌ها یعنی ناوردایی دربارهٔ جدولی که در تولید آن شکل را ندارد.
 *
 * و ناوردای ساختگی بدترین نوعِ یافتهٔ قلابی است: به‌نامِ «قاعدهٔ خودِ پروژه»
 * ثبت می‌شود، پس کسی به آن شک نمی‌کند.
 */
export function isSchemaFile(relative) {
  const lower = String(relative).toLowerCase();

  // fixture و seed، قاعده نیستند
  if (/\.(test|spec)\.[jt]sx?$/.test(lower) || lower.includes('__tests__') || lower.includes('/tests/')) return false;
  if (/(seed|fixture|dump|sample|mock)[./_-]/.test(lower)) return false;

  if (lower.endsWith('.sql')) return true;

  /**
   * سورسی که ممکن است SQL در خود داشته باشد.
   *
   * محدود به فایل‌هایی که نامشان بوی دیتابیس می‌دهد، نه هر فایلی: پیمایشِ
   * کلِ پروژه برای یک regex، روی هفتصد فایل هفتصد بار خواندن است.
   */
  if (!/\.(js|mjs|ts|php|py|rb|go)$/.test(lower)) return false;
  return /(schema|migration|migrate|database|\bdb\b|models?)/.test(lower);
}

/**
 * بدنهٔ `CREATE TABLE`ها.
 *
 * تجزیهٔ کاملِ SQL کارِ این فایل نیست و لازم هم نیست: چیزی که می‌خواهیم بین
 * نخستین پرانتزِ باز و پرانتزِ بستهٔ متناظرش است.
 */
/**
 * کامنت‌های SQL برداشته می‌شوند، ولی طولِ متن حفظ می‌شود.
 *
 * ── چرا لازم شد ──
 *
 * نخستین استخراج از یک پروژهٔ واقعی ناوردایی به نام `users----not-null`
 * ساخت: بندِ `-- توضیح` به‌عنوان یک ستون خوانده شده بود. ناوردایی دربارهٔ
 * ستونی که وجود ندارد، در نخستین اجرا با «چنین ستونی نیست» می‌شکند و
 * فهرست را از خطاهای بی‌معنا پر می‌کند.
 *
 * جای‌گزینی با فاصله (نه حذف) عمدی است: شمارهٔ خط باید درست بماند، چون
 * ناوردا می‌گوید از کجای سورس آمده و آن ارجاع باید قابل دنبال کردن باشد.
 */
function stripComments(sql) {
  return String(sql)
    .replace(/--[^\n]*/g, (match) => ' '.repeat(match.length))
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '));
}

function tables(rawSql) {
  const sql = stripComments(rawSql);
  const out = [];
  const rx = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?(\w+)[`"\]]?\s*\(/gi;

  let match;
  while ((match = rx.exec(sql))) {
    let depth = 1;
    let i = rx.lastIndex;
    while (i < sql.length && depth > 0) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') depth--;
      i++;
    }
    out.push({ name: match[1], body: sql.slice(rx.lastIndex, i - 1), at: match.index });
  }
  return out;
}

/** خطِ تقریبیِ یک جایگاه در متن — برای اینکه ناوردا بگوید از کجا آمده. */
function lineAt(sql, index) {
  return sql.slice(0, index).split(/\r?\n/).length;
}

/**
 * بندهای سطحِ اولِ بدنهٔ جدول.
 *
 * `split(',')` کافی نیست: `CHECK(a IN (1,2))` و `DECIMAL(10,2)` کاما دارند.
 */
function clauses(body) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

const RESERVED = new Set(['primary', 'unique', 'foreign', 'constraint', 'check', 'key', 'index']);

/**
 * یک فایل SQL → ناوردا.
 *
 * ── چرا `NOT NULL` هم می‌آید ولی پیش‌فرضش `off` است ──
 *
 * ستونی که `NOT NULL` است، دیتابیس خودش نگهش می‌دارد: درج با `NULL` رد
 * می‌شود. پس این ناوردا معمولاً چیزی پیدا نمی‌کند و فقط پرس‌وجو اضافه می‌کند.
 * ولی گاهی اپ رشتهٔ خالی می‌نویسد به‌جای `NULL` — و آن را هیچ‌کس نمی‌گیرد. پس
 * می‌ماند، خاموش، برای کسی که لازمش دارد.
 *
 * `UNIQUE` برعکس است: باگِ «دو ردیف با یک ایمیل» واقعاً رخ می‌دهد، چون
 * بسیاری از پروژه‌ها یکتایی را در کد نگه می‌دارند نه در schema، و آن کد
 * شرطِ رقابتی دارد.
 */
export function invariantsFromSql(sql, { file = '' } = {}) {
  const found = [];

  for (const table of tables(String(sql))) {
    /**
     * جدولِ موقتِ مهاجرت، قاعده نیست.
     *
     * الگوی «جدول تازه بساز، داده را کپی کن، قدیمی را بینداز» در SQLite
     * رایج است، و `tags_new` فقط چند ثانیه وجود دارد. ناوردایش در هر اجرا
     * با «no such table» می‌شکند — یعنی یک ردیفِ همیشه‌خراب در فهرست.
     */
    if (/_(new|old|tmp|temp|backup|copy)$/i.test(table.name)) continue;

    const line = lineAt(sql, table.at);

    for (const clause of clauses(table.body)) {
      const head = clause.split(/\s+/)[0]?.replace(/[`"[\]]/g, '') || '';

      // بندِ جدولی: UNIQUE(a, b)
      const tableUnique = clause.match(/^UNIQUE\s*\(([^)]+)\)/i);
      if (tableUnique) {
        const columns = tableUnique[1].split(',').map((c) => c.trim().replace(/[`"[\]]/g, ''));
        found.push(unique(table.name, columns, file, line));
        continue;
      }

      const namedUnique = clause.match(/^CONSTRAINT\s+\S+\s+UNIQUE\s*\(([^)]+)\)/i);
      if (namedUnique) {
        const columns = namedUnique[1].split(',').map((c) => c.trim().replace(/[`"[\]]/g, ''));
        found.push(unique(table.name, columns, file, line));
        continue;
      }

      if (RESERVED.has(head.toLowerCase())) continue;

      // بندِ ستونی: `email TEXT UNIQUE NOT NULL`
      const rest = clause.slice(head.length);
      if (COLUMN_UNIQUE.test(rest)) found.push(unique(table.name, [head], file, line));
      if (COLUMN_NOT_NULL.test(rest) && !/PRIMARY\s+KEY/i.test(rest)) {
        found.push(notNull(table.name, head, file, line));
      }
    }
  }

  return found;
}

function unique(table, columns, file, line) {
  const cols = columns.filter(Boolean);
  const list = cols.join('، ');
  return {
    id: `${table}-${cols.join('-')}-unique`,
    kind: 'unique',
    statement: `دو ردیف در «${table}» نمی‌توانند «${list}» یکسان داشته باشند`,
    table,
    columns: cols,
    from: `${file}:${line}`,
    by: 'source',
    mode: 'watch',
    /**
     * پرس‌وجو فقط خواندنی است، پس روی هر محیطی مجاز است (`assertMayQuery`).
     * `HAVING` تخلف را مستقیم می‌دهد؛ شمردنِ کل و مقایسه، همان کار را با یک
     * پرس‌وجوی بیشتر می‌کرد.
     */
    query: `SELECT ${cols.join(', ')}, COUNT(*) AS ub_count FROM ${table} GROUP BY ${cols.join(', ')} HAVING COUNT(*) > 1`,
    expect: 'empty',
  };
}

function notNull(table, column, file, line) {
  return {
    id: `${table}-${column}-not-null`,
    kind: 'not-null',
    statement: `ستون «${column}» در «${table}» نباید خالی بماند`,
    table,
    columns: [column],
    from: `${file}:${line}`,
    by: 'source',
    // دیتابیس خودش NULL را رد می‌کند؛ این فقط رشتهٔ خالی را می‌گیرد
    mode: 'off',
    query: `SELECT COUNT(*) AS ub_count FROM ${table} WHERE ${column} IS NULL OR TRIM(${column}) = ''`,
    expect: 'zero',
  };
}

/**
 * همهٔ ناورداهای یک پروژه، از سورس.
 *
 * @param {object} o
 * @param {string[]} o.files خروجی `listSourceFiles`
 * @param {(relative: string) => Promise<string>} o.read
 */
export async function mineInvariants({ files, read }) {
  const out = [];
  const seen = new Set();

  for (const file of files.filter(isSchemaFile).slice(0, 40)) {
    const content = await read(file);
    if (!content) continue;
    for (const invariant of invariantsFromSql(content, { file })) {
      // یک قاعده در چند مهاجرت تکرار می‌شود؛ نخستین جایی که دیده شد می‌ماند
      if (seen.has(invariant.id)) continue;
      seen.add(invariant.id);
      out.push(invariant);
    }
  }

  return out;
}
