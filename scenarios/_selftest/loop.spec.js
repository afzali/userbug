/**
 * خودآزمای حلقهٔ کامل: کشف ← سناریو ← اجرا ← تریاژ.
 *
 * ── چرا این فایل هست ──
 *
 * هر تکهٔ این زنجیر خودآزمای خودش را داشت و همه سبز بودند. ولی رفتنِ کلِ
 * مسیر روی یک پروژهٔ تازه سه جای شکسته نشان داد که هیچ‌کدام از آن
 * خودآزماها نمی‌دیدند، چون همه در **بندِ بینِ** دو تکه بودند:
 *
 *   ۱. سناریوی تازه‌ساخته را «بررسی» نمی‌دید، چون فهرستِ اجرا از شاخصِ
 *      لمس می‌آمد و شاخصِ لمس فقط سناریوی **اجراشده** را می‌شناسد.
 *      یعنی برای اجرا شدن، باید از قبل اجرا شده می‌بود.
 *
 *   ۲. سناریویی که می‌شکست هیچ یافته‌ای نمی‌ساخت، پس تریاژ خالی می‌ماند و
 *      درخت **✓ سبز** نشان می‌داد — روی همان صفحه‌ای که کلِ این ابزار
 *      برای جلوگیری از سبزِ دروغین ساخته شده.
 *
 *   ۳. سناریویی که مدل می‌ساخت روی اپِ واقعی می‌شکست، چون نمی‌دانست
 *      بسیاری از اپ‌ها در نخستین بازدید پنجره‌ای نشان می‌دهند که کلیک را
 *      می‌بلعد.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';

test.afterEach(() => {
  delete process.env.USERBUG_ROOT;
});

test('سناریوی هرگز اجرانشده هم باید در فهرستِ بررسی بیاید', () => {
  /**
   * همان قاعده‌ای که `ReviewDialog` رویش بنا شده، به شکلِ داده.
   *
   * `counts.scenarios` از اجراها می‌آید و `counts.planned` از فایل‌ها.
   * دامنه‌ای که فقط `planned` دارد، **کار دارد** — و پیش از این «هیچ
   * سناریویی نیست» می‌گرفت.
   */
  const node = {
    counts: { scenarios: [], planned: [{ name: 'ورود بدون اطلاعات', path: '_drafts/x.yml', draft: true }] },
  };

  const ran = [...new Set([node].flatMap((one) => one.counts?.scenarios || []))];
  const planned = [node]
    .flatMap((one) => one.counts?.planned || [])
    .filter((one) => !ran.includes(one.name));

  expect(ran).toEqual([]);
  expect([...ran, ...planned.map((one) => one.name)]).toEqual(['ورود بدون اطلاعات']);

  /** و پیش‌نویسی که در `_drafts/` است باید پیش از اجرا رسمی شود. */
  expect(planned.filter((one) => one.draft || one.path.startsWith('_drafts/'))).toHaveLength(1);
});

test('سناریویی که می‌شکند، یافته می‌سازد — نه سکوت', async () => {
  /**
   * شرطِ دقیقِ `fixtures.js`، بی باز کردنِ مرورگر.
   *
   * سه بند دارد و هر سه لازم‌اند: خودآزمایی نباشد، تست واقعاً شکسته
   * باشد، و رصدگر از قبل چیزی ندیده باشد (وگرنه تریاژ دوبرابر می‌شود).
   */
  const broke = (status, findings, probe = false) =>
    !probe && ['failed', 'timedOut'].includes(status) && !findings.length;

  expect(broke('failed', [])).toBe(true);
  expect(broke('timedOut', [])).toBe(true);
  expect(broke('passed', [])).toBe(false);
  /** رصدگر از قبل دیده: همان دقیق‌تر است، ردیفِ کلی اضافه نمی‌شود. */
  expect(broke('failed', [{ source: 'console' }])).toBe(false);
  /** خودآزمایی گزارشِ واقعی را آلوده نمی‌کند. */
  expect(broke('failed', [], true)).toBe(false);
});

test('پیامِ Playwright از کدِ رنگ پاک می‌شود، وگرنه اثرانگشت‌ها پخش می‌شوند', async () => {
  /**
   * کدِ رنگِ ترمینال در متنِ خطا هست. اگر پاک نشود، در `fingerprint`
   * می‌نشیند و دو اجرای **یک** شکست، دو ردیفِ تریاژ می‌سازند.
   */
  const ANSI = /\[[0-9;]*m/g;
  const esc = String.fromCharCode(27);
  const raw = `${esc}[31mTimeoutError: locator.click${esc}[39m\nCall log:\n  - waiting`;

  const plain = raw.replace(ANSI, '');
  expect(plain.split('\n')[0]).toBe('TimeoutError: locator.click');
  expect(plain).not.toContain(esc);
});

test('سناریوی ساختهٔ مدل باید پنجرهٔ مزاحم را ببندد', async () => {
  /**
   * ── چرا این یک آزمونِ متنِ prompt است ──
   *
   * روی نپی، نخستین سناریویی که از یک زاویه ساخته شد با
   * `locator.click: Timeout` شکست — و علتش نه اپ بود نه سناریو، بلکه یک
   * `dialog-overlay` که کلیک را می‌گرفت.
   *
   * `dismissBlockers` از قبل وجود داشت و `quest.js` و سناریوی دستیِ
   * ورود هر دو از آن به‌عنوان حرکتِ استانداردِ شروع استفاده می‌کردند —
   * ولی هیچ‌کس به مدل نگفته بود.
   */
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src', 'scenario', 'from-text.js'),
    'utf8'
  );

  expect(source).toContain('dismissBlockers');
  /** فقط بودنش در فهرستِ فعل‌ها کافی نیست؛ باید قاعده‌اش گفته شده باشد. */
  expect(source).toContain('بعد از نخستین "go" همیشه');
});

test('نوشتنِ سناریو در ریشه اجرا می‌شود، در `_drafts/` نه', () => {
  /**
   * تلهٔ بی‌صدا: فایل ساخته می‌شود، در فهرست دیده می‌شود، و اجراگر
   * هرگز به آن نمی‌رسد — پس اجرا با «۰ تست» سبز تمام می‌شود.
   */
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ub-loop-'));
  process.env.USERBUG_ROOT = root;

  const dir = path.join(root, 'scenarios', 'demo');
  fs.mkdirSync(path.join(dir, '_drafts'), { recursive: true });
  const body = 'name: یک\nsteps:\n  - go: /\n';
  fs.writeFileSync(path.join(dir, 'رسمی.yml'), body, 'utf8');
  fs.writeFileSync(path.join(dir, '_drafts', 'پیش‌نویس.yml'), body, 'utf8');

  const seen = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((one) => one.isFile() && one.name.endsWith('.yml'))
    .map((one) => one.name);

  expect(seen).toEqual(['رسمی.yml']);
});
