/**
 * ساخت فایل بازتولید برای هر یافته.
 *
 * ── چرا این لازم است ──
 *
 * قانون سوم پروژه می‌گوید «یافته بدون بازتولید، یافته نیست». تا امروز این فقط
 * یک شعار بود: یافته‌ها متن داشتند و مسیرشان در سرِ کسی که سناریو را نوشته
 * بود می‌ماند. شش ماه بعد، همان یافته یک پاراگراف است و کسی نمی‌داند چطور
 * دوباره ببیندش.
 *
 * حالا هر یافته یک فایل YAML می‌گیرد: همان قدم‌هایی که تا لحظهٔ دیده‌شدنش
 * اجرا شدند، نه یکی بیشتر. اجرایش دقیقاً همان‌جا می‌ایستد.
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { dedupe } from './observe/oracle.js';

export async function writeRepros({ ub, scenario, ctx }) {
  const mine = ub.findings.filter((f) => !f.synthetic);
  if (!mine.length) return;

  const dir = path.join(ub.store.dir, 'repro');
  fs.mkdirSync(dir, { recursive: true });

  for (const finding of dedupe(mine)) {
    // یافته در کدام گروه دیده شد؟ قدم‌های تا همان‌جا کافی‌اند.
    const at = ctx.groups.findIndex((g) => g.title === finding.step);
    const upTo = at < 0 ? ctx.groups : ctx.groups.slice(0, at + 1);
    const steps = upTo.flatMap((g) => g.raw);
    if (!steps.length) continue;

    const doc = {
      name: `[بازتولید] ${finding.normalized.slice(0, 50)}`,
      status: 'draft',
      persona: scenario.persona || 'novice',
      ...(scenario.timeout ? { timeout: scenario.timeout } : {}),
      steps,
    };

    const header = [
      `# بازتولیدِ یک یافته از سناریوی «${scenario.name}».`,
      '#',
      `# یافته: ${finding.message.replace(/\s+/g, ' ').slice(0, 150)}`,
      `# منبع: ${finding.source} · دیده‌شده در قدم: ${finding.step}`,
      '#',
      '# اجرا: این فایل را در scenarios/<هدف>/ بگذارید، یا:',
      '#   node bin/userbug.js repro <runId> ' + finding.fingerprint,
      '',
    ].join('\n');

    fs.writeFileSync(path.join(dir, `${finding.fingerprint}.yml`), header + YAML.stringify(doc), 'utf8');
  }
}
