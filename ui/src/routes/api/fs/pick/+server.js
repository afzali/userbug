import { json } from '@sveltejs/kit';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

const run = promisify(execFile);

/**
 * پنجرهٔ انتخاب پوشه — پنجرهٔ واقعیِ سیستم‌عامل.
 *
 * ── چرا مرورگر نمی‌تواند این کار را بکند ──
 *
 * `showDirectoryPicker()` در مرورگر هست، ولی **مسیرِ مطلق را نمی‌دهد** — و
 * عمداً هم نمی‌دهد، چون افشای ساختار دیسک است. ما دقیقاً همان مسیرِ مطلق را
 * می‌خواهیم تا در کانفیگ بنویسیم.
 *
 * ── چرا این کار اینجا خطرناک نیست ──
 *
 * سرورِ رابط روی همان ماشینِ کاربر است و فقط از loopback پاسخ می‌دهد
 * (`assertMutationRequest`). پس «باز کردن یک پنجره روی دسکتاپِ کاربر» همان
 * کاری است که یک اپ دسکتاپ می‌کند، نه یک سایت.
 *
 * و مهم‌تر: این فقط یک **مسیر** برمی‌گرداند. هیچ فایلی خوانده نمی‌شود.
 * خواندن کارِ `source-access.js` است و قاعده‌های خودش را دارد — از جمله
 * اینکه بدون اعلامِ صریح در کانفیگ، هیچ چیز خوانده نمی‌شود.
 *
 * ── چرا با شکست، خطا نمی‌دهد ──
 *
 * روی سروری بی‌دسکتاپ (SSH، داکر) هیچ پنجره‌ای باز نمی‌شود. آن حالت خرابی
 * نیست: کاربر مسیر را دستی می‌نویسد، همان‌طور که تا دیروز می‌نوشت. پس
 * `{ ok: false }` برمی‌گردد و رابط ورودی متنی را نگه می‌دارد.
 */

/**
 * ویندوز: FolderBrowserDialog.
 *
 * `-STA` لازم است — بدون آن دیالوگ‌های ویندوزفرم اصلاً باز نمی‌شوند و
 * پروسه بی‌صدا برمی‌گردد.
 *
 * `TopMost` هم لازم است: پنجره پشتِ مرورگر باز می‌شد و کاربر فکر می‌کرد
 * دکمه کار نمی‌کند.
 */
const WINDOWS_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'پوشهٔ سورس پروژه را انتخاب کنید'
$dialog.ShowNewFolderButton = $false
$top = New-Object System.Windows.Forms.Form
$top.TopMost = $true
if ($dialog.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.Write($dialog.SelectedPath)
}
$top.Dispose()
`;

const MAC_SCRIPT = 'try\nPOSIX path of (choose folder with prompt "Source folder")\nend try';

async function ask() {
  if (process.platform === 'win32') {
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-Command', WINDOWS_SCRIPT],
      { timeout: 180_000, windowsHide: false }
    );
    return stdout.trim();
  }

  if (process.platform === 'darwin') {
    const { stdout } = await run('osascript', ['-e', MAC_SCRIPT], { timeout: 180_000 });
    return stdout.trim();
  }

  const { stdout } = await run('zenity', ['--file-selection', '--directory'], { timeout: 180_000 });
  return stdout.trim();
}

export async function POST(event) {
  try {
    assertMutationRequest(event);

    let picked = '';
    try {
      picked = await ask();
    } catch (cause) {
      // انصرافِ کاربر هم اینجا می‌افتد (کد خروجیِ غیرصفر) و خطا نیست.
      return json({ ok: false, reason: cause?.code === 'ENOENT' ? 'no-dialog' : 'cancelled' });
    }

    if (!picked) return json({ ok: false, reason: 'cancelled' });

    // در کانفیگ همیشه اسلشِ رو به جلو می‌نویسیم؛ بک‌اسلش در رشتهٔ جاوااسکریپت
    // باید escape شود و یک بار همان جا اشتباه شد.
    return json({ ok: true, path: picked.replace(/\\/g, '/') });
  } catch (error) {
    return jsonError(error);
  }
}
