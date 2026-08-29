/**
 * خواندن سناریوهای YAML.
 *
 * سناریوها فایل‌اند و — طبق قانون ۵ — کنار پروژهٔ تحت تست زندگی می‌کنند. برای
 * نپی این یعنی `scenarios/nepi/*.yml` تا وقتی که ریپوی خودِ نپی میزبانشان شود.
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ROOT } from '../target.js';

const REQUIRED = ['name', 'steps'];

export function scenarioDir(targetName) {
  return path.join(ROOT, 'scenarios', targetName);
}

export function loadScenarios(targetName) {
  const dir = scenarioDir(targetName);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort()
    .map((file) => loadScenario(path.join(dir, file)));
}

export function loadScenario(file) {
  const doc = YAML.parse(fs.readFileSync(file, 'utf8'));

  for (const key of REQUIRED) {
    if (doc?.[key] === undefined) throw new Error(`${path.basename(file)}: «${key}» ندارد`);
  }
  if (!Array.isArray(doc.steps)) throw new Error(`${path.basename(file)}: steps باید فهرست باشد`);

  return {
    file,
    id: path.basename(file).replace(/\.ya?ml$/, ''),
    name: doc.name,
    /**
     * سناریوی پیش‌نویس هرگز رگرسیون شمرده نمی‌شود.
     *
     * در فاز ۲ که مدل سناریو می‌نویسد، این تنها چیزی است که جلوی رسمی شدنِ
     * باگِ امروز به‌عنوان «انتظارِ درست» را می‌گیرد.
     */
    status: doc.status || 'approved',
    persona: doc.persona || 'novice',
    device: doc.device || null,
    steps: doc.steps,
  };
}
