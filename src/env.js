/**
 * خواندن `.env` — بدون وابستگی.
 *
 * چیزی که لازم است چند خط `KEY=value` است، و یک وابستگی کمتر یعنی یک چیز
 * کمتر برای شکستن. متغیرهایی که از قبل در محیط هستند دست نمی‌خورند: محیط
 * واقعی همیشه بر فایل می‌چربد.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './target.js';

let loaded = false;

export function loadEnv() {
  if (loaded) return;
  loaded = true;

  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // نقل‌قول اختیاری است؛ اگر بود برداشته می‌شود
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}
