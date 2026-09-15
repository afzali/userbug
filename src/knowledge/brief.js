/**
 * «این پروژه چیست» — به زبانِ خودِ آدم.
 *
 * ── چرا این جای خالی بود ──
 *
 * پروندهٔ شناخت پر است از چیزهایی که **ماشین** فهمیده: روت از سورس، واژه از
 * گشت، خلاصه از مدل. ولی جایی نبود که خودِ آدم بنویسد «این اپ چیست، استکش
 * چیست، این اصطلاح در اینجا یعنی چه».
 *
 * و همان چیزی است که مدل از سورس درنمی‌آورد. روی نپی، `summary` پرونده
 * خالی بود و هر prompt بی آن می‌رفت؛ مدل نمی‌دانست «کتاب» و «پاراگراف» و
 * «هایلایت» در این اپ یعنی چه، پس از نامِ دکمه‌ها حدس می‌زد.
 *
 * ── چرا فایلِ markdown و نه فیلدی در پرونده ──
 *
 * `dossier.json` را اتوماسیون بازنویسی می‌کند — `learn` و گشت و تریاژ همه
 * در آن می‌نویسند. متنی که آدم نوشته نباید در فایلی بنشیند که ماشین هر روز
 * دست می‌زند؛ همان قانونِ «`by: user` بازنویسی نمی‌شود»، این بار به‌شکلِ
 * یک فایلِ جدا.
 *
 * و markdown چون آدم می‌نویسدش و آدم می‌خواندش — با دست، در هر ویرایشگری.
 */
import fs from 'node:fs';
import path from 'node:path';
import { knowledgeDir } from './store.js';

/** سقفِ متن. بلندتر از این در هر prompt جا نمی‌شود و بقیه را بیرون می‌راند. */
export const MAX_BRIEF = 4000;

export function briefFile(target) {
  return path.join(knowledgeDir(target), 'brief.md');
}

export function readBrief(target) {
  try {
    return fs.readFileSync(briefFile(target), 'utf8');
  } catch {
    return '';
  }
}

export function writeBrief(target, text) {
  const clean = String(text ?? '').slice(0, MAX_BRIEF);
  const file = briefFile(target);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  // متنِ خالی یعنی «پاکش کن»، نه فایلی با یک خطِ سفید
  if (!clean.trim()) {
    fs.rmSync(file, { force: true });
    return '';
  }

  fs.writeFileSync(file, clean.endsWith('\n') ? clean : clean + '\n', 'utf8');
  return clean;
}

/**
 * متنی که بالای هر prompt می‌نشیند.
 *
 * ── چرا **بالا** ──
 *
 * بقیهٔ شناخت فهرست است: روت‌ها، واژه‌ها، خطرها. این یکی زمینه است، و
 * زمینه باید پیش از فهرست بیاید وگرنه مدل فهرست را بی‌چارچوب می‌خواند.
 *
 * برچسبِ «نوشتهٔ صاحبِ پروژه» عمدی است: مدل باید بداند این حدس نیست.
 */
export function briefFor(target, { budget = 1500 } = {}) {
  const text = readBrief(target).trim();
  if (!text) return '';
  return `این اپ، به زبانِ صاحبِ پروژه (معتبرتر از حدسِ سورس):\n${text.slice(0, budget)}`;
}
