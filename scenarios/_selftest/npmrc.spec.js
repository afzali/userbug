/**
 * خودآزمای `.npmrc`ِ پروژه.
 *
 * ── چرا این چند خط اهمیت دارند ──
 *
 * بی `install-links=true`، npm بستهٔ `file:` را symlink می‌کند و Node
 * ماژول‌ها را از مسیرِ **واقعیِ** userbug حل می‌کند. آن‌وقت `fixtures.js`
 * پلی‌رایتِ userbug را بار می‌کند و رانر پلی‌رایتِ پروژه را — دو نسخه، و
 * این پیام:
 *
 *     Error: Playwright Test did not expect test() to be called here.
 *     Error: No tests found
 *
 * فایل سرِ جایش است، ایمپورتش حل می‌شود، و پیام هیچ نمی‌گوید که چرا. این
 * دقیقاً همان شکستی است که خواندنِ کد پیدایش نمی‌کند.
 *
 * ── چرا بازنویسی نمی‌کنیم ──
 *
 * `.npmrc` ممکن است registry، proxy یا توکنِ کاربر داشته باشد. بازنویسیِ
 * بی‌صدایش یعنی نصبِ بعدی به جای دیگری وصل شود و کسی نفهمد چرا.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { ensureNpmrc, NPMRC_LINE } from '../../src/emit/workspace.js';

const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ub-npmrc-'));
const read = (root) => fs.readFileSync(path.join(root, '.npmrc'), 'utf8');

test('نبودِ فایل: ساخته می‌شود', () => {
  const root = temporary();
  try {
    expect(ensureNpmrc(root)).toBe('written');
    expect(read(root)).toBe(`${NPMRC_LINE}\n`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('فایلِ موجود: خط افزوده می‌شود و بقیه دست نمی‌خورد', () => {
  const root = temporary();
  try {
    fs.writeFileSync(path.join(root, '.npmrc'), 'registry=https://example.test\nengine-strict=true\n');

    expect(ensureNpmrc(root)).toBe('appended');

    const after = read(root);
    expect(after).toContain('registry=https://example.test');
    expect(after).toContain('engine-strict=true');
    expect(after).toContain(NPMRC_LINE);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('فایلِ بی خطِ پایانی هم درست می‌شود', () => {
  // بی این، دو تنظیم به هم می‌چسبند و npm خطِ ترکیبی را نمی‌فهمد
  const root = temporary();
  try {
    fs.writeFileSync(path.join(root, '.npmrc'), 'engine-strict=true');
    ensureNpmrc(root);
    expect(read(root)).toBe(`engine-strict=true\n${NPMRC_LINE}\n`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('اگر از قبل هست، دست نمی‌خورد', () => {
  const root = temporary();
  try {
    // حتی با فاصله و مقدارِ دیگر — تصمیمِ کاربر است، نه ما
    fs.writeFileSync(path.join(root, '.npmrc'), '  install-links = false\n');
    expect(ensureNpmrc(root)).toBe('kept');
    expect(read(root)).toBe('  install-links = false\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
