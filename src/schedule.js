/**
 * زمان‌بندی اجرا — روی زمان‌بندِ خودِ سیستم.
 *
 * ── چرا داخل رابط زمان‌بندی نمی‌کنیم ──
 *
 * یک `setInterval` در پروسهٔ رابط فقط تا وقتی کار می‌کند که رابط باز باشد.
 * «هر شب ساعت دو اجرا کن» یعنی چیزی باید بی‌رابط هم بیدار شود، و آن چیز
 * Task Scheduler ویندوز است که CLI را صدا می‌زند. رابط فقط ورودی‌ها را
 * می‌سازد و مدیریت می‌کند.
 *
 * ── چرا سه فایل به‌جای یک فرمانِ طولانی در Task Scheduler ──
 *
 *   `schedules/<کلید>.json`  تعریفِ زمان‌بندی (UTF-8، فارسی هم می‌پذیرد)
 *   `schedules/<کلید>.cmd`   راه‌اندازِ **ASCII-only** که زمان‌بند صدا می‌زند
 *   `schedules/<کلید>.log`   چه وقت اجرا شد و نتیجه‌اش چه بود
 *
 * گذاشتنِ خودِ فرمان در `/TR` سه مشکل داشت که هر سه در همین مخزن قبلاً دیده
 * شده‌اند: نقل‌قولِ تودرتو، تزریقِ فرمان از راه مقدارِ `--grep`، و مخدوش شدنِ
 * فارسی در `cmd` (همان درسی که `start.bat` را ASCII-only نگه داشت). راه‌انداز
 * فقط یک خط ASCII است که یک اسکریپت Node را با کلید صدا می‌زند؛ آن اسکریپت
 * JSON را می‌خواند و CLI را با **آرایهٔ آرگومان** اجرا می‌کند، نه با رشتهٔ
 * shell.
 *
 * ── چرا خروجی `schtasks` تفسیر نمی‌شود ──
 *
 * روی ویندوزِ فارسی، ستون‌ها و مقادیرِ `schtasks /Query` ترجمه‌شده‌اند. پس تنها
 * چیزی که از آن می‌خوانیم **کد خروج** است: صفر یعنی هست. تعریفِ زمان‌بندی در
 * فایل خودمان می‌ماند، همان قاعدهٔ «فایل، نه دیتابیس».
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { ROOT } from './target.js';
import { assertProjectKey } from './target-template.js';
import { assertModelSlug } from './models/config.js';

const execFileAsync = promisify(execFile);

export const SCHEDULES_DIR = path.join(ROOT, 'schedules');

/**
 * پیشوندِ نامِ تسک.
 *
 * بدون آن، یک `schtasks /Delete` با کلیدِ اشتباه می‌توانست تسکِ سیستمیِ کسِ
 * دیگری را ببرد. هر عملیاتی که این ابزار روی زمان‌بند انجام می‌دهد، فقط روی
 * نام‌هایی با این پیشوند مجاز است.
 */
export const TASK_PREFIX = 'userbug-';

export const FREQUENCIES = ['daily', 'weekly'];
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function taskName(key) {
  return `${TASK_PREFIX}${key}`;
}

/** کلیدِ زمان‌بندی: نامِ فایل و بخشی از نامِ تسک، پس محدود و ASCII. */
export function assertScheduleKey(value) {
  const key = String(value ?? '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,48}$/.test(key)) {
    throw new Error(
      `کلید زمان‌بندی نامعتبر است: «${value}». فقط حرف لاتین، عدد، خط تیره و زیرخط، ` +
        'چون هم نام فایل می‌شود و هم نام تسک در زمان‌بند ویندوز.'
    );
  }
  return key;
}

function assertTime(value) {
  const time = String(value ?? '').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error(`ساعت باید به شکل HH:MM و ۲۴ساعته باشد؛ «${value}» نبود`);
  }
  return time;
}

/**
 * متنی که به‌عنوان آرگومان به CLI می‌رود.
 *
 * راه‌انداز از آرایهٔ آرگومان استفاده می‌کند نه shell، پس تزریق ممکن نیست؛ ولی
 * نویسهٔ کنترلی و خط تازه هنوز رد می‌شوند چون در فایل و لاگ خرابی می‌سازند.
 */
function assertArgText(value, label, max = 300) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length > max) throw new Error(`${label} بیش از ${max} نویسه است`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${label} نویسهٔ کنترلی دارد`);
  return text;
}

/**
 * فیلدهای زمان‌بندی را بسنج و نرمال کن.
 *
 * پرچم‌ها همان‌هایی هستند که `userbug run` می‌شناسد، با همان اعتبارسنجی — تا
 * زمان‌بندی نتواند چیزی بسازد که دستی اجرا نمی‌شد.
 */
export function assertScheduleFields(input = {}) {
  const key = assertScheduleKey(input.key);
  const target = assertProjectKey(input.target);

  const frequency = String(input.frequency ?? 'daily').trim().toLowerCase();
  if (!FREQUENCIES.includes(frequency)) {
    throw new Error(`تکرار باید یکی از ${FREQUENCIES.join('، ')} باشد`);
  }

  const time = assertTime(input.time);

  let days = [];
  if (frequency === 'weekly') {
    days = (Array.isArray(input.days) ? input.days : String(input.days ?? '').split(','))
      .map((day) => String(day).trim().toUpperCase())
      .filter(Boolean);
    for (const day of days) {
      if (!WEEKDAYS.includes(day)) throw new Error(`روز هفته نامعتبر است: «${day}»`);
    }
    if (!days.length) throw new Error('برای تکرار هفتگی، دست‌کم یک روز لازم است');
    days = [...new Set(days)];
  }

  const depth = input.depth === '' || input.depth === undefined || input.depth === null ? null : Number(input.depth);
  if (depth !== null && (!Number.isInteger(depth) || depth < 1 || depth > 100)) {
    throw new Error(`عمق باید عددی صحیح بین ۱ و ۱۰۰ باشد؛ «${input.depth}» نبود`);
  }

  const repeat = input.repeat === '' || input.repeat === undefined || input.repeat === null ? null : Number(input.repeat);
  if (repeat !== null && (!Number.isInteger(repeat) || repeat < 1 || repeat > 10)) {
    throw new Error(`تکرار هر سناریو باید عددی صحیح بین ۱ و ۱۰ باشد؛ «${input.repeat}» نبود`);
  }

  const persona = assertArgText(input.persona, 'رفتار کاربر', 40);
  if (persona && !['novice', 'pro'].includes(persona)) {
    throw new Error(`رفتار کاربر باید novice یا pro باشد؛ «${persona}» نبود`);
  }

  return {
    key,
    target,
    frequency,
    time,
    days,
    grep: assertArgText(input.grep, 'فیلتر سناریو'),
    device: assertArgText(input.device, 'دستگاه', 100),
    persona,
    model: input.model ? assertModelSlug(input.model) : '',
    depth,
    repeat,
    createdAt: new Date().toISOString(),
  };
}

/** آرگومان‌های `userbug run` برای این زمان‌بندی. */
export function scheduleArgs(schedule) {
  const args = ['run', schedule.target];
  if (schedule.grep) args.push('--grep', schedule.grep);
  if (schedule.device) args.push('--device', schedule.device);
  if (schedule.persona) args.push('--persona', schedule.persona);
  if (schedule.model) args.push('--model', schedule.model);
  if (schedule.depth) args.push('--depth', String(schedule.depth));
  if (schedule.repeat) args.push('--repeat', String(schedule.repeat));
  return args;
}

/**
 * راه‌اندازِ ASCII.
 *
 * هیچ فارسی و هیچ پارامتری داخلش نیست — همه در JSON می‌مانند. `cmd` روی این
 * ماشین رشتهٔ فارسی را می‌شکند و قطعه‌قطعه اجرا می‌کند؛ همان دلیلی که
 * `start.bat` هم ASCII-only ماند.
 */
export function renderLauncher(key) {
  return [
    '@echo off',
    'rem Generated by userbug. Do not add non-ASCII text here:',
    'rem cmd mangles it and may execute fragments.',
    `cd /d "${ROOT}"`,
    `"${process.execPath}" "${path.join(ROOT, 'scripts', 'run-schedule.mjs')}" ${key}`,
    '',
  ].join('\r\n');
}

export function scheduleFile(key) {
  return path.join(SCHEDULES_DIR, `${key}.json`);
}

export function launcherFile(key) {
  return path.join(SCHEDULES_DIR, `${key}.cmd`);
}

export function logFile(key) {
  return path.join(SCHEDULES_DIR, `${key}.log`);
}

function assertWindows() {
  if (process.platform !== 'win32') {
    throw new Error(
      'زمان‌بندی فعلاً فقط روی ویندوز (schtasks) پیاده شده است.\n' +
        '  روی لینوکس و مک، همان فایل `schedules/<کلید>.json` را با cron صدا بزنید:\n' +
        '  node scripts/run-schedule.mjs <کلید>'
    );
  }
}

/** آیا تسک در زمان‌بندِ سیستم هست؟ فقط کد خروج خوانده می‌شود، نه خروجی. */
export async function taskExists(key) {
  if (process.platform !== 'win32') return false;
  try {
    await execFileAsync('schtasks.exe', ['/Query', '/TN', taskName(key)], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * زمان‌بندی‌های ثبت‌شده، با وضعیتشان در زمان‌بندِ سیستم.
 *
 * `installed: false` یعنی فایل هست ولی تسک نیست — مثلاً کسی دستی پاکش کرده، یا
 * فایل از ماشین دیگری آمده. پنهان کردنش بدترین کار بود: کاربر فکر می‌کرد هر
 * شب اجرا می‌شود.
 */
export async function listSchedules() {
  let entries;
  try {
    entries = await fsp.readdir(SCHEDULES_DIR);
  } catch (cause) {
    if (cause?.code === 'ENOENT') return [];
    throw cause;
  }

  const rows = [];
  for (const entry of entries.filter((name) => name.endsWith('.json')).sort()) {
    const key = entry.replace(/\.json$/, '');
    let schedule;
    try {
      schedule = JSON.parse(await fsp.readFile(path.join(SCHEDULES_DIR, entry), 'utf8'));
    } catch (cause) {
      rows.push({ key, broken: cause.message, installed: false });
      continue;
    }

    rows.push({
      ...schedule,
      key,
      taskName: taskName(key),
      installed: await taskExists(key),
      lastLog: await tailLog(key),
    });
  }
  return rows;
}

/** آخرین خط لاگ. بدون آن، «اجرا شد یا نه» فقط حدس بود. */
async function tailLog(key) {
  try {
    const text = await fsp.readFile(logFile(key), 'utf8');
    const lines = text.trim().split(/\r?\n/);
    return lines[lines.length - 1] || '';
  } catch {
    return '';
  }
}

/**
 * ساختِ زمان‌بندی: سه فایل، بعد یک تسک.
 *
 * اگر ساختِ تسک شکست بخورد، فایل‌ها پاک می‌شوند — وگرنه فهرست، زمان‌بندی‌ای را
 * نشان می‌داد که هیچ‌وقت اجرا نمی‌شود.
 */
export async function createSchedule(input) {
  assertWindows();
  const schedule = assertScheduleFields(input);

  await fsp.mkdir(SCHEDULES_DIR, { recursive: true });

  // بازنویسیِ بی‌صدا بدترین حالت است: زمان‌بندیِ دیگری با همان کلید می‌رفت.
  try {
    await fsp.writeFile(scheduleFile(schedule.key), JSON.stringify(schedule, null, 2), {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (cause) {
    if (cause?.code === 'EEXIST') {
      const error = new Error(`زمان‌بندی «${schedule.key}» از قبل وجود دارد`);
      error.status = 409;
      throw error;
    }
    throw cause;
  }

  await fsp.writeFile(launcherFile(schedule.key), renderLauncher(schedule.key), 'utf8');

  const args = [
    '/Create',
    '/TN',
    taskName(schedule.key),
    '/TR',
    launcherFile(schedule.key),
    '/SC',
    schedule.frequency === 'weekly' ? 'WEEKLY' : 'DAILY',
    '/ST',
    schedule.time,
    '/F',
  ];
  if (schedule.frequency === 'weekly') args.push('/D', schedule.days.join(','));

  try {
    await execFileAsync('schtasks.exe', args, { windowsHide: true });
  } catch (cause) {
    await fsp.rm(scheduleFile(schedule.key), { force: true });
    await fsp.rm(launcherFile(schedule.key), { force: true });
    throw new Error(`ساخت تسک در زمان‌بند ویندوز ناموفق بود: ${cause.stderr || cause.message}`);
  }

  return { ...schedule, taskName: taskName(schedule.key), installed: true };
}

/** حذف زمان‌بندی: تسک، بعد فایل‌ها. لاگ می‌ماند تا تاریخ از دست نرود. */
export async function removeSchedule(key) {
  const safe = assertScheduleKey(key);

  if (process.platform === 'win32' && (await taskExists(safe))) {
    await execFileAsync('schtasks.exe', ['/Delete', '/TN', taskName(safe), '/F'], { windowsHide: true });
  }

  const existed = fs.existsSync(scheduleFile(safe));
  await fsp.rm(scheduleFile(safe), { force: true });
  await fsp.rm(launcherFile(safe), { force: true });

  if (!existed) throw new Error(`زمان‌بندی «${safe}» وجود نداشت`);
  return { key: safe, removed: true };
}

/** اجرای دستیِ همان تسک — تنها راهِ اثباتِ اینکه زمان‌بندی واقعاً کار می‌کند. */
export async function runScheduleNow(key) {
  assertWindows();
  const safe = assertScheduleKey(key);
  if (!(await taskExists(safe))) throw new Error(`تسک «${taskName(safe)}» در زمان‌بند نیست`);

  await execFileAsync('schtasks.exe', ['/Run', '/TN', taskName(safe)], { windowsHide: true });
  return { key: safe, started: true };
}
