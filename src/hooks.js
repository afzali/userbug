/**
 * قلاب‌های ریست.
 *
 * موتور نمی‌داند اپ چطور بالا می‌آید یا دیتابیسش کجاست — و نباید بداند. فقط
 * دستوری را که خودِ پروژه در کانفیگش اعلام کرده صدا می‌زند.
 *
 * هر قلاب از دروازهٔ ایمنی رد می‌شود. اینها دستور پاک کردن‌اند؛ روی محیطی که
 * تولیدی علامت خورده — یا اصلاً علامت نخورده — اجرا نمی‌شوند.
 */
import { spawnSync } from 'node:child_process';
import { assertMayMutate } from './guard.js';

/**
 * @param {object} target
 * @param {'beforeRun'|'beforeScenario'|'afterRun'} phase
 * @returns {Promise<Array<{type: string, ok: boolean, note: string}>>}
 */
export async function runHooks(target, phase) {
  const hooks = target.isolation?.reset?.[phase] || [];
  const results = [];

  for (const hook of hooks) {
    // قلاب مرورگری در fixture اجرا می‌شود، چون به صفحه نیاز دارد
    if (hook.type === 'browser') continue;

    assertMayMutate(target, `قلاب ${hook.type} در ${phase}`);

    if (hook.type === 'shell') results.push(runShell(hook));
    else if (hook.type === 'http') results.push(await runHttp(hook));
    else throw new Error(`نوع قلاب ناشناخته: ${hook.type}`);
  }

  return results;
}

function runShell(hook) {
  const r = spawnSync(hook.run, { shell: true, encoding: 'utf8', timeout: hook.timeout ?? 30_000 });
  const ok = r.status === 0;
  return {
    type: 'shell',
    ok,
    // خروجی خطا را نگه می‌داریم: قلابی که بی‌صدا شکست بخورد، اجرا را روی
    // وضعیتِ اشتباه می‌برد و هیچ‌کس نمی‌فهمد چرا نتیجه‌ها عجیب‌اند.
    note: ok ? (r.stdout || '').trim().slice(0, 200) : `کد ${r.status}: ${(r.stderr || '').trim().slice(0, 200)}`,
  };
}

async function runHttp(hook) {
  try {
    const res = await fetch(hook.url, {
      method: hook.method || 'POST',
      headers: { 'content-type': 'application/json', ...(hook.headers || {}) },
      body: hook.body ? JSON.stringify(hook.body) : undefined,
    });
    return { type: 'http', ok: res.ok, note: `${res.status} ${hook.url}` };
  } catch (e) {
    return { type: 'http', ok: false, note: e.message };
  }
}
