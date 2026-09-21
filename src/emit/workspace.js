/**
 * پوشهٔ userbug **داخلِ** پروژهٔ هدف.
 *
 * ── چرا تست‌ها از این مخزن بیرون می‌روند ──
 *
 * تا دیروز خروجی YAML بود و مفسرش اینجا زندگی می‌کرد، پس طبیعی بود که
 * سناریو هم اینجا بماند. حالا خروجی کدِ پلی‌رایت است، و تستی که بیرون از
 * ریپویی باشد که تستش می‌کند، کارِ اصلی‌اش را نمی‌تواند بکند: بگوید کدام
 * کامیت شکستش. در PRِ خرابکار دیده نمی‌شود، در CI آن پروژه اجرا نمی‌شود،
 * و با کدی که می‌آزماید بازبینی نمی‌شود.
 *
 * پس تقسیم بر اساسِ **مالکیت** است، نه راحتی: تست و شناخت داراییِ اپ‌اند و
 * در ریپوی اپ می‌نشینند؛ آدرس و لاگ و مدل، تنظیماتِ این ابزار می‌مانند.
 *
 * ── چرا این فایل جدا از `source-access.js` است ──
 *
 * آن ماژول عمداً فقط می‌خوانَد: محصور، با تشخیصِ مسیرهای راز. باز کردنِ
 * نوشتن در همان‌جا یعنی یک مرزِ ایمنی که دو کار می‌کند — و مرزی که دو کار
 * می‌کند، دیر یا زود یکی‌شان را بد انجام می‌دهد. اینجا یک مرزِ باریکِ
 * دیگر است که **فقط** به همین یک پوشه می‌نویسد.
 *
 * ── چرا دو طبقه: کامیت‌شدنی و محلی ──
 *
 * بردنِ همه‌چیز به ریپوی اپ، چیزهایی را کامیت می‌کند که نباید: رازِ حساب،
 * نشستِ لاگین‌شدهٔ مرورگر، و نقشه‌ای که هر خزش عوض می‌شود و یک بار نامِ یک
 * گره‌اش شد «منوی ub-657c0be8@userbug.test» — یعنی ایمیلِ هویتِ موقتِ همان
 * اجرا. پس `.local/` هست و `.gitignore`اش همراهِ خودش می‌رود، تا قاعده
 * روی ماشینِ بعدی جا نماند.
 */
import fs from 'node:fs';
import path from 'node:path';

/** نامِ پوشه داخلِ پروژهٔ هدف، وقتی کانفیگ چیزی نگفته باشد. */
export const DEFAULT_WORKSPACE = path.join('tests', 'userbug');

/** آنچه در گیتِ پروژهٔ هدف می‌ماند. */
export const COMMITTED = {
  knowledge: 'knowledge',
  triage: 'triage',
  findings: 'findings.md',
};

/** آنچه مالِ همین ماشین است و کامیت نمی‌شود. */
export const LOCAL = {
  root: '.local',
  credentials: path.join('.local', 'credentials.json'),
  profile: path.join('.local', 'profile'),
  fixtures: path.join('.local', 'fixtures'),
  map: path.join('.local', 'map.json'),
  runs: path.join('.local', 'runs'),
};

/**
 * `.gitignore`ی که همراهِ پوشه می‌رود.
 *
 * هر خط دلیلش را با خود دارد. فهرستِ بی‌دلیل، روزی که کسی بخواهد چیزی را
 * از آن بیرون بیاورد، جرئتِ تصمیم نمی‌دهد.
 */
export const GITIGNORE = `# ساختهٔ userbug — این پوشه را با ریپوی همین پروژه نگه دارید.
#
# آنچه می‌ماند: تست‌ها، شناختِ اپ، یافته‌ها و قضاوتِ تریاژ. این‌ها دربارهٔ
# خودِ این پروژه‌اند و ارزشِ بازبینی‌شدن با کد را دارند.

# رازِ حساب — هرگز.
.local/

# چرا کلِ \`.local/\`، نه فهرستِ تک‌تک:
#
#   credentials.json  رازِ حسابِ آزمون
#   profile/          نشستِ لاگین‌شده و کشِ همین مرورگر
#   fixtures/         فایل‌های نمونهٔ آپلود — گاهی سنگین
#   map.json          هر خزش عوض می‌شود، پس دیفش بی‌معناست؛ و نامِ بعضی
#                     گره‌ها از دادهٔ همان اجرا می‌آید
#   runs/             خروجیِ اجراها، بازتولیدشدنی
#
# یک قاعدهٔ کلی از پنج قاعدهٔ جدا کم‌خطاتر است: چیزی که فردا به \`.local/\`
# اضافه شود، خودبه‌خود پوشیده است.

# خروجیِ خودِ پلی‌رایت.
test-results/
playwright-report/
`;

/**
 * `install-links=true` در `.npmrc`ِ پروژه — و چرا حیاتی است.
 *
 * ── مسئله ──
 *
 * userbug به‌صورت `file:` نصب می‌شود و npm پیش‌فرض **symlink** می‌سازد.
 * آن‌وقت Node ماژول‌ها را از مسیرِ **واقعیِ** userbug حل می‌کند، پس
 * `src/fixtures.js` پلی‌رایتِ خودِ userbug را بار می‌کند در حالی که رانر
 * پلی‌رایتِ پروژه را. دو نسخه، و نتیجه‌اش:
 *
 *     Error: Playwright Test did not expect test() to be called here.
 *     Error: No tests found
 *
 * فایل سرِ جایش است، ایمپورتش حل می‌شود، و پیام هیچ نمی‌گوید که چرا.
 *
 * ── چرا در `.npmrc` و نه به‌صورت پرچم ──
 *
 * `npm i --install-links` فقط همان یک دستور را عوض می‌کند. نخستین
 * `npm install`ِ بعدی — حتی برای بسته‌ای بی‌ربط — دوباره symlink می‌سازد و
 * همه‌چیز بی‌صدا می‌شکند. در `.npmrc` می‌ماند، و چون `.npmrc` در گیتِ
 * پروژه است، هم‌تیمی و CI هم همان رفتار را می‌گیرند.
 */
export const NPMRC_LINE = 'install-links=true';

/**
 * خطِ `install-links` را به `.npmrc`ِ پروژه اضافه کن، اگر نیست.
 *
 * فایلِ موجود بازنویسی نمی‌شود: ممکن است registry یا proxy یا توکنِ
 * کاربر در آن باشد.
 *
 * @param {string} projectRoot ریشهٔ پروژهٔ هدف، نه پوشهٔ userbug
 * @returns {'written'|'appended'|'kept'}
 */
export function ensureNpmrc(projectRoot) {
  const file = path.join(projectRoot, '.npmrc');

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `${NPMRC_LINE}\n`, 'utf8');
    return 'written';
  }

  const current = fs.readFileSync(file, 'utf8');
  if (/^\s*install-links\s*=/m.test(current)) return 'kept';

  fs.appendFileSync(file, `${current.endsWith('\n') ? '' : '\n'}${NPMRC_LINE}\n`);
  return 'appended';
}

/**
 * ریشهٔ پوشهٔ userbug در پروژهٔ هدف.
 *
 * `workspace` در کانفیگ بر همه‌چیز می‌چربد؛ وگرنه از `source.root` مشتق
 * می‌شود. نبودِ هر دو خطاست، نه پیش‌فرضِ خاموش: نوشتن در جایی که کاربر
 * نگفته، بدترین شکلِ کمک است.
 *
 * @param {object} target کانفیگِ هدف (پس از `loadTarget`)
 * @returns {string} مسیرِ مطلق
 */
export function workspaceRoot(target) {
  if (target?.workspace) return path.resolve(target.workspace);

  const root = target?.source?.root;
  if (!root) {
    throw new Error(
      `هدف «${target?.key ?? '؟'}»: نه \`workspace\` دارد نه \`source.root\`.\n` +
        `  userbug باید بداند تست‌ها را کجای پروژه بنویسد.\n` +
        `  یکی از این دو را در targets/${target?.key ?? '<هدف>'}.config.js بگذارید.`,
    );
  }

  return path.resolve(root, DEFAULT_WORKSPACE);
}

/**
 * مسیرِ محصور — همان قاعده‌ای که `source-access.js` برای خواندن دارد.
 *
 * `..` در نامِ یک قابلیت کافی است تا نوشتن از پوشه بیرون بزند. و چون این
 * نام‌ها گاهی از مدل می‌آیند، بررسی اختیاری نیست.
 *
 * @param {string} root ریشهٔ workspace
 * @param {string} relative مسیر نسبی
 * @returns {string} مسیرِ مطلق، اگر واقعاً داخل باشد
 */
export function contained(root, relative) {
  const base = path.resolve(root);
  const full = path.resolve(base, relative);

  // مقایسهٔ رشته‌ای با جداکننده انجام می‌شود وگرنه `tests/userbug-old` هم
  // «داخلِ» `tests/userbug` خوانده می‌شود.
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error(`مسیر بیرون از پوشهٔ userbug پروژه است: ${relative}`);
  }
  return full;
}

/**
 * پوشه را بساز و `.gitignore`اش را بگذار.
 *
 * `.gitignore` بازنویسی نمی‌شود اگر از قبل هست: ممکن است کاربر خطی به آن
 * افزوده باشد، و پاک کردنِ بی‌صدای آن یعنی فایلی که فکر می‌کرد پوشیده است
 * ناگهان کامیت شود.
 *
 * @param {string} root
 * @returns {{created: boolean, gitignore: 'written'|'kept'}}
 */
export function ensureWorkspace(root) {
  const created = !fs.existsSync(root);
  fs.mkdirSync(contained(root, LOCAL.root), { recursive: true });

  const ignore = contained(root, '.gitignore');
  if (fs.existsSync(ignore)) return { created, gitignore: 'kept' };

  fs.writeFileSync(ignore, GITIGNORE, 'utf8');
  return { created, gitignore: 'written' };
}

/**
 * نوشتنِ یک فایل داخلِ workspace.
 *
 * تنها راهِ نوشتنِ این ماژول است تا بررسیِ محصور بودن دور زده نشود.
 *
 * @param {string} root
 * @param {string} relative
 * @param {string} contents
 * @returns {string} مسیرِ نوشته‌شده
 */
export function writeInside(root, relative, contents) {
  const full = contained(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents, 'utf8');
  return full;
}
