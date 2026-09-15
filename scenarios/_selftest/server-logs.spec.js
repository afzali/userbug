/**
 * خودآزمای رصدِ لاگ سرور.
 *
 * ── چرا این یکی بی‌صدا خراب می‌شود ──
 *
 * لاگی که نمی‌آید، خطا نمی‌دهد. گزارش می‌گوید «۰ خط لاگ سرور» و آدم آن را
 * «سرور ساکت بود» می‌خواند — در حالی که معنیِ دیگرش این است که اصلاً گوش
 * نمی‌دادیم، و هر ۵۰۰ که سرور داده و UI پنهانش کرده، از گزارش بیرون مانده.
 *
 * روی پروژهٔ واقعی دقیقاً همین بود: `serverCollectors: ["front"]` و یک خط
 * لاگ در کلِ اجرا.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  collectorWarning,
  createServerCollectors,
  describeCollectors,
  drainAll,
  startAll,
  stopAll,
} from '../../src/observe/server.js';

/** فرمانی که روی هر سیستمی هست: خودِ نودی که این تست را می‌برد. */
const NODE = process.execPath;

test('لاگِ فایل از انتها شروع می‌کند، نه از اولِ تاریخ', async () => {
  /**
   * وگرنه نخستین اجرا کلِ تاریخِ لاگِ ماشین را به‌عنوان یافتهٔ امروز گزارش
   * می‌کند — فهرستی که هیچ‌کس دو بار نگاهش نمی‌کند.
   */
  const file = path.join(os.tmpdir(), `ub-log-${Date.now()}.log`);
  fs.writeFileSync(file, 'خطای دیروز\n', 'utf8');

  const [collector] = await startAll(createServerCollectors([{ type: 'file', name: 'x', path: file }]));
  expect(await collector.drain()).toEqual([]);

  fs.appendFileSync(file, 'PHP Fatal error: امروز\n', 'utf8');
  const lines = await collector.drain();
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ source: 'server', collector: 'x', severity: 'error' });

  fs.rmSync(file, { force: true });
});

test('فایلی که نیست، «در دسترس نبود» علامت می‌خورد — نه سکوت', async () => {
  const collectors = await startAll(
    createServerCollectors([{ type: 'file', name: 'gone', path: path.join(os.tmpdir(), 'ub-nope.log') }])
  );
  expect(describeCollectors(collectors)[0]).toMatchObject({ name: 'gone', available: false });
  expect(collectorWarning(collectors)).toContain('gone');
});

test('نبودِ هر جمع‌کننده، خودش یک هشدار است', () => {
  // اپی که لاگ سرورش تنظیم نشده، نیمی از رصد را ندارد و باید بداند
  expect(collectorWarning([])).toContain('هیچ لاگ سروری');
});

test('لاگِ فرمانی خروجیِ فرآیند را می‌گیرد', async () => {
  /**
   * ── چرا این جنس لازم شد ──
   *
   * اپِ امروزی معمولاً فایلِ لاگ ندارد: `npm run dev` روی stdout می‌نویسد و
   * داکر در `docker logs`. با فقط `type: 'file'`، رصدِ سرور روی چنین پروژه‌ای
   * عملاً خاموش بود.
   */
  const script = "setTimeout(() => { console.log('سالم'); console.error('ERROR: خراب'); }, 30);";
  const collectors = await startAll(
    createServerCollectors([{ type: 'command', name: 'proc', command: NODE, args: ['-e', script] }])
  );

  await new Promise((resolve) => setTimeout(resolve, 400));
  const lines = await drainAll(collectors);

  expect(lines.map((one) => one.message)).toEqual(expect.arrayContaining(['سالم', 'ERROR: خراب']));
  // شدت از خودِ متن می‌آید، نه از اینکه روی stdout بود یا stderr
  expect(lines.find((one) => one.message.includes('خراب')).severity).toBe('error');

  await stopAll(collectors);
});

test('فرمانی که می‌میرد، «در دسترس» نمی‌ماند', async () => {
  /**
   * `docker logs` روی کانتینری که وجود ندارد بلافاصله می‌میرد. بی این،
   * `available` تا آخرِ اجرا `true` می‌ماند و گزارش می‌گوید «لاگ داشتیم و
   * خطایی نبود» — بدترین ترکیب.
   */
  const collectors = await startAll(
    createServerCollectors([{ type: 'command', name: 'dead', command: NODE, args: ['-e', 'process.exit(3)'] }])
  );
  expect(describeCollectors(collectors)[0].available).toBe(false);
  expect(collectorWarning(collectors)).toContain('dead');
  await stopAll(collectors);
});

test('فرمانِ ناموجود هم صریح گزارش می‌شود', async () => {
  const collectors = await startAll(
    createServerCollectors([{ type: 'command', name: 'nope', command: 'ub-command-that-does-not-exist' }])
  );
  // چند لحظه تا رخدادِ `error` برسد
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(describeCollectors(collectors)[0].available).toBe(false);
  await stopAll(collectors);
});

test('جنسِ جمع‌کننده از شکلِ تنظیمات حدس زده می‌شود', () => {
  // کانفیگِ قدیمی `type` نداشت؛ نباید بشکند
  const [file, command] = createServerCollectors([{ name: 'a', path: '/x.log' }, { name: 'b', command: 'echo' }]);
  expect(file.kind).toBe('file');
  expect(command.kind).toBe('command');
  expect(() => createServerCollectors([{ type: 'مرموز', name: 'c' }])).toThrow(/ناشناخته/);
});
