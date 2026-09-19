/**
 * خواندنِ فایل‌های `.spec.js` از پوشهٔ userbugِ پروژه.
 *
 * ── جایگزینِ `scenario/load.js` برای سمتِ کد ──
 *
 * `loadScenarios` فایل‌های YAML را می‌خواند و ساختارشان را می‌دهد. حالا که
 * خروجی کد است، همان نقش را این ماژول دارد — ولی از **متن** می‌خواند، نه
 * از ساختار، چون فایل ممکن است دستی ویرایش شده باشد.
 *
 * ── چرا مسیرها را هم درمی‌آورد ──
 *
 * `knowledge/impact.js` می‌پرسد «کدام تست کدام صفحه را لمس می‌کند؟» تا
 * بگوید تغییرِ کد کدام تست‌ها را به هم می‌زند. در YAML جوابش فعلِ `go` بود؛
 * در کد، `page.goto(…)`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizeRoutePath } from '../knowledge/schema.js';
import { stepNames, testTitle } from './spec.js';

/** فقط `page.goto('…')` — آدرسِ مطلق هم مسیرش درمی‌آید. */
const GOTO = /page\s*\.\s*goto\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`$]*)`)/g;

/**
 * مسیرهایی که یک spec لمس می‌کند.
 *
 * `goto`ی که آدرسش از متغیر بیاید خوانده نمی‌شود و این پذیرفته است: نتیجه
 * «شاید لمس کند» می‌شود، نه «لمس نمی‌کند». بدترین حالتش یک تستِ اضافه در
 * فهرستِ پیشنهادی است، نه تستی که جا بماند.
 *
 * @param {string} source
 * @returns {Set<string>}
 */
export function routesOf(source) {
  const found = new Set();

  for (const match of String(source ?? '').matchAll(GOTO)) {
    const raw = match[1] ?? match[2] ?? match[3] ?? '';
    const routePath = normalizeRoutePath(raw.replace(/^https?:\/\/[^/]+/i, '') || '/');
    if (routePath) found.add(routePath);
  }
  return found;
}

/**
 * فهرستِ specهای یک پوشه.
 *
 * شکلِ خروجی عمداً همان چیزی است که `impactOf` از `loadScenarios` انتظار
 * داشت — `{id, name, file, steps}` — تا آن ماژول عوض نشود.
 *
 * @param {string} root ریشهٔ workspace
 * @returns {{id: string, name: string, file: string, routes: Set<string>, steps: string[]}[]}
 */
export function listSpecs(root) {
  if (!root || !fs.existsSync(root)) return [];

  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    // `.local/` و پوشه‌های دیگر کنار می‌روند: تست در ریشهٔ workspace است تا
    // `npx playwright test` بی تنظیمِ اضافه پیدایش کند.
    if (!entry.isFile() || !entry.name.endsWith('.spec.js')) continue;

    const file = path.join(root, entry.name);
    const source = fs.readFileSync(file, 'utf8');

    out.push({
      id: entry.name,
      name: testTitle(source) || entry.name.replace(/\.spec\.js$/, ''),
      file,
      routes: routesOf(source),
      steps: stepNames(source),
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id, 'fa'));
}
