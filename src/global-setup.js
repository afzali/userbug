import { loadTarget } from './target.js';
import { RunStore, newRunId, setCurrentRun } from './store/run-store.js';
import { runHooks } from './hooks.js';

/** یک اجرا = یک فراخوانی. اینجا پوشه‌اش ساخته می‌شود و بقیه فقط داخلش می‌نویسند. */
export default async function globalSetup() {
  const targetName = process.env.UB_TARGET || 'nepi';
  const target = await loadTarget(targetName);
  const runId = newRunId(targetName);

  setCurrentRun(runId);

  const store = new RunStore(runId);
  await store.init({
    target: targetName,
    baseURL: target.baseURL,
    environment: target.environment,
    device: process.env.UB_DEVICE || target.device,
    isolation: target.isolation?.mode,
  });

  console.log(`\n  userbug — اجرای ${runId}`);
  console.log(`  هدف: ${target.baseURL}  ·  محیط: ${target.environment}`);

  // قلاب‌های `beforeRun` یک بار در ابتدای اجرا. اگر شکست بخورند، اجرا ادامه
  // پیدا می‌کند ولی در گزارش می‌ماند — چون وضعیتِ اولیه دیگر آنی نیست که
  // سناریو فرض کرده و نتیجه‌ها باید با احتیاط خوانده شوند.
  const results = await runHooks(target, 'beforeRun');
  for (const r of results) {
    console.log(`  قلاب ${r.type}: ${r.ok ? 'انجام شد' : 'ناموفق — ' + r.note}`);
  }
  await store.writeJson('hooks.json', { beforeRun: results });

  console.log('');
}
