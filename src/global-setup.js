import { loadTarget } from './target.js';
import { RunStore, newRunId, setCurrentRun } from './store/run-store.js';

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
  console.log(`  هدف: ${target.baseURL}  ·  محیط: ${target.environment}\n`);
}
