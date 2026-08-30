/**
 * اجرای یک زمان‌بندی. این چیزی است که زمان‌بندِ سیستم واقعاً صدا می‌زند.
 *
 * ── چرا این لایه هست و فرمان مستقیم در Task Scheduler نیست ──
 *
 * پارامترها اینجا از JSON خوانده می‌شوند و با **آرایهٔ آرگومان** به CLI
 * می‌رسند، نه با رشتهٔ shell. یعنی مقدارِ `--grep` نمی‌تواند فرمان تزریق کند، و
 * فارسی هم سالم می‌ماند — که در یک فایل `.cmd` نمی‌ماند.
 *
 * روی لینوکس و مک هم همین فایل با cron قابل صدا زدن است:
 *
 *   node scripts/run-schedule.mjs <کلید>
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scheduleArgs, scheduleFile, logFile, assertScheduleKey } from '../src/schedule.js';

const ROOT = path.resolve(import.meta.dirname, '..');

function log(key, line) {
  const stamp = new Date().toISOString();
  try {
    fs.appendFileSync(logFile(key), `${stamp}  ${line}\n`, 'utf8');
  } catch {
    // نبودِ لاگ نباید اجرا را بشکند
  }
}

const key = assertScheduleKey(process.argv[2]);
const file = scheduleFile(key);

if (!fs.existsSync(file)) {
  console.error(`زمان‌بندی «${key}» پیدا نشد: ${file}`);
  process.exit(2);
}

const schedule = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = scheduleArgs(schedule);

log(key, `شروع · userbug ${args.join(' ')}`);

/**
 * محیط پاک می‌شود از `UB_RUN_ID`.
 *
 * اگر جامانده باشد، اجرا با «شناسهٔ اجرا از قبل وجود دارد» می‌شکند — و در یک
 * اجرای زمان‌بندی‌شده هیچ‌کس آن پیام را نمی‌بیند.
 */
const result = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'userbug.js'), ...args], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, UB_RUN_ID: '' },
});

const outcome =
  result.status === 0 ? 'بدون یافته' : result.status === 1 ? 'یافته دارد' : `خطای اجراگر (${result.status})`;

log(key, `پایان · ${outcome}`);
process.exit(result.status ?? 2);
