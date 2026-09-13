import { loadTarget } from './target.js';
import { GUI_RUN_MARKER, RunStore, getCurrentRun, setCurrentRun } from './store/run-store.js';
import { runHooks } from './hooks.js';

/** یک اجرا = یک فراخوانی. اینجا پوشه‌اش ساخته می‌شود و بقیه فقط داخلش می‌نویسند. */
export default async function globalSetup() {
  const targetName = process.env.UB_TARGET || 'nepi';
  const target = await loadTarget(targetName);
  const runId = getCurrentRun();

  const store = new RunStore(runId);
  await store.init({
    target: targetName,
    baseURL: target.baseURL,
    environment: target.environment,
    device: process.env.UB_DEVICE || target.device,
    isolation: target.isolation?.mode,

    /**
     * نوعِ اجرا، برای آنکه فهرستِ اجراها بتواند بگوید این چه بوده.
     *
     * خزش و گشت چون اجراگرِ خودشان را دارند، `kind` را مستقیم می‌نویسند.
     * اجرایی که از `playwright test` رد می‌شود تنها از همین‌جا می‌گذرد، پس
     * تنها راهِ متمایز کردنش همین متغیر است. بی این، کاوشِ هدف‌دار در فهرست
     * از یک اجرای معمولی جدا نمی‌شد و کاربر نمی‌فهمید پیش‌نویس از کجا آمد.
     */
    kind: process.env.UB_RUN_KIND || 'run',
  });
  // فقط pointer «آخرین اجرا» را تازه می‌کند؛ هویت workerها از UB_RUN_ID است.
  setCurrentRun(runId);

  // marker پس از claim موفق پوشه چاپ می‌شود؛ در شکست config/setup لینک خیالی
  // به run ساخته‌نشده در GUI باقی نمی‌ماند.
  if (process.env.UB_GUI_JOB) {
    console.log(`${GUI_RUN_MARKER}${JSON.stringify({ job: process.env.UB_GUI_JOB, runId, target: targetName })}`);
  }

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
