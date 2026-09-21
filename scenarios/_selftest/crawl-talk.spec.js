/**
 * خودآزمای حرف زدن وسطِ خزش.
 *
 * ── چرا این کانال لازم بود ──
 *
 * گشت از روزِ اول REPL داشت: آدم می‌دید، می‌گفت، و حرفش یافته می‌شد. خزش
 * این را نداشت — فقط رویداد بیرون می‌داد. یعنی وقتی چیزی می‌دیدید که ماشین
 * نمی‌فهمد، تنها کارتان تماشا بود.
 *
 * ── چرا «بس است» پرچم است، نه قطعِ فوری ──
 *
 * خزش وسطِ یک کنش است: صفحه در حالِ رندر، قراردادی در حالِ نوشتن. قطعِ
 * همان‌جا یعنی نقشه‌ای نیمه‌نوشته. پس پرچم می‌نشیند و حلقه در نخستین مرزِ
 * امن تمیز بیرون می‌آید.
 */
import { test, expect } from '@playwright/test';
import { MapSession } from '../../src/map/session.js';

/** نمونهٔ کمینه: بی مرورگر، فقط همان حالتی که این دو متد لمس می‌کنند. */
function stub() {
  const session = Object.create(MapSession.prototype);
  session.stopRequested = '';
  session.findings = [];
  session.seenFindings = new Map();
  session.events = [];
  session.store = { appendFinding: async () => {} };
  session.target = { device: 'desktop' };
  session.deviceName = 'desktop';
  session.page = { url: () => 'http://localhost:5173/contents' };
  session.map = { states: [{}, {}], caps: { states: 100, minutes: 10 } };
  session.queue = [{}, {}, {}];
  session.deadline = Date.now() + 600_000;
  session.emit = () => {};
  return session;
}

test('«بس است» پیش از سقف‌ها می‌نشیند', () => {
  const session = stub();
  expect(session.capExceeded()).toBe('');

  session.requestStop('خواستهٔ کاربر');
  expect(session.capExceeded()).toBe('خواستهٔ کاربر');
});

test('سقف‌ها سرِ جایشان می‌مانند', () => {
  const session = stub();

  session.map.caps.states = 2; // به سقف رسیدیم
  expect(session.capExceeded()).toBe('سقفِ حالت');

  session.map.caps.states = 100;
  session.deadline = Date.now() - 1;
  expect(session.capExceeded()).toBe('سقفِ زمان');
});

test('یادداشتِ کاربر یافتهٔ واقعی می‌شود، با مسیرِ همان لحظه', async () => {
  const session = stub();
  const finding = await session.note('این مودال با Escape بسته نمی‌شود');

  expect(finding.message).toBe('این مودال با Escape بسته نمی‌شود');
  expect(finding.route).toBe('/contents');
  expect(finding.source).toBe('crawl-note');
  expect(finding.fingerprint).toBeTruthy();

  // و واقعاً در فهرستِ یافته‌ها نشست، نه فقط برگشت
  expect(session.findings).toHaveLength(1);
});

test('یادداشتِ خالی یافته نمی‌سازد', async () => {
  // وگرنه یک Enterِ اشتباهی، گزارش را با یافتهٔ بی‌متن آلوده می‌کند
  const session = stub();
  expect(await session.note('   ')).toBeNull();
  expect(await session.note('')).toBeNull();
  expect(session.findings).toHaveLength(0);
});

test('`where` می‌گوید الان کجاست', () => {
  const session = stub();
  expect(session.where()).toEqual({ route: '/contents', states: 2, queued: 3, findings: 0 });
});
