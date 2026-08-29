/**
 * گزارش تک‌فایلی.
 *
 * این «داشبورد» نیست و قرار هم نیست باشد. کارش یک چیز است: خطای کلاینت، خطای
 * سرور و عکسِ همان لحظه را کنار هم بگذارد تا بشود فهمید چه شد. داشبورد وقتی
 * ساخته می‌شود که مقایسهٔ چند تا از همین فایل‌ها دستی آزاردهنده شده باشد.
 */
import { dedupe } from '../observe/oracle.js';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const SEV = { error: '#c0392b', warn: '#a06a12', info: '#4a5a52' };

export function renderReport({ run, steps, findings, synthetic = [], events }) {
  const grouped = dedupe(findings).sort((a, b) => b.count - a.count);
  const synGrouped = dedupe(synthetic);
  const serverEvents = events.filter((e) => e.source === 'server');

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>userbug — ${esc(run.runId)}</title>
<style>
  :root{--bg:#f2f5f2;--card:#fff;--line:#d4dcd6;--ink:#15201b;--ink2:#45524b;--ink3:#6f7d75;--acc:#0e6e70}
  @media (prefers-color-scheme:dark){:root{--bg:#0f1512;--card:#161d19;--line:#2b3630;--ink:#e3eae5;--ink2:#a3b0a9;--ink3:#7c8a83;--acc:#45b9b2}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.9 Vazirmatn,Tahoma,system-ui,sans-serif;direction:rtl}
  .wrap{max-width:1080px;margin:0 auto;padding:32px 20px 80px}
  h1{font-size:1.5rem;margin:0 0 6px}
  h2{font-size:1.1rem;margin:36px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--line)}
  .meta{display:flex;flex-wrap:wrap;gap:8px 22px;color:var(--ink3);font-size:.84rem;margin-bottom:8px}
  .meta b{color:var(--ink2)}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:20px 0}
  .kpi{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:14px 16px}
  .kpi .n{font-size:1.7rem;font-weight:700;line-height:1.2}
  .kpi .l{font-size:.78rem;color:var(--ink3)}
  .card{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:16px 18px;margin-bottom:12px}
  .f-head{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
  .tag{font:600 .7rem/1.6 ui-monospace,monospace;padding:1px 7px;border-radius:3px;color:#fff}
  .count{font-size:.75rem;color:var(--ink3)}
  pre{direction:ltr;text-align:left;background:rgba(127,127,127,.09);border-radius:3px;padding:10px 12px;overflow-x:auto;font:12px/1.7 ui-monospace,monospace;color:var(--ink2);margin:10px 0 0;white-space:pre-wrap;word-break:break-word}
  .steps{display:grid;gap:10px}
  .step{display:grid;grid-template-columns:120px 1fr;gap:16px;align-items:start;background:var(--card);border:1px solid var(--line);border-radius:4px;padding:12px 14px}
  .step img{width:120px;border:1px solid var(--line);border-radius:3px;display:block}
  .step .nm{font-weight:600}
  .step .sub{font-size:.78rem;color:var(--ink3)}
  .bad{border-color:#c0392b}
  .empty{color:var(--ink3);font-size:.9rem}
  a{color:var(--acc)}
</style>
</head>
<body><div class="wrap">

<h1>userbug — گزارش اجرا</h1>
<div class="meta">
  <span>شناسه: <b>${esc(run.runId)}</b></span>
  <span>هدف: <b>${esc(run.target)}</b></span>
  <span>آدرس: <b>${esc(run.baseURL)}</b></span>
  <span>محیط: <b>${esc(run.environment)}</b></span>
  <span>دستگاه: <b>${esc(run.device)}</b></span>
  <span>شروع: <b>${esc(run.startedAt)}</b></span>
</div>

<div class="kpis">
  <div class="kpi"><div class="n">${steps.length}</div><div class="l">قدم اجراشده</div></div>
  <div class="kpi"><div class="n" style="color:${grouped.length ? SEV.error : 'inherit'}">${grouped.length}</div><div class="l">یافتهٔ یکتا</div></div>
  <div class="kpi"><div class="n">${findings.length}</div><div class="l">رخداد خطا (با تکرار)</div></div>
  <div class="kpi"><div class="n" style="color:${synGrouped.length ? '#6c757d' : 'inherit'}">${synGrouped.length}</div><div class="l">خودآزما</div></div>
  <div class="kpi"><div class="n">${serverEvents.length}</div><div class="l">خط لاگ سرور</div></div>
</div>

${
  run.ai
    ? `<h2>مدل</h2>
<div class="kpis">
  <div class="kpi"><div class="n">${run.ai.cache}</div><div class="l">از کش (رایگان)</div></div>
  <div class="kpi"><div class="n">${run.ai.model}</div><div class="l">حل تازه</div></div>
  <div class="kpi"><div class="n" style="color:${run.ai.healed ? SEV.warn : 'inherit'}">${run.ai.healed}</div><div class="l">heal</div></div>
  <div class="kpi"><div class="n">${run.ai.verified}</div><div class="l">بازبینی نمونه‌ای</div></div>
  <div class="kpi"><div class="n">$${run.ai.costUsd}</div><div class="l">هزینه · ${run.ai.calls} فراخوانی</div></div>
</div>
<p class="empty">نسبت «از کش» به «حل تازه» مهم‌ترین عدد اینجاست: اگر بالا نماند، یا کش کار نمی‌کند یا رابط مدام عوض می‌شود. عددِ heal بالا یعنی آن گوشهٔ رابط ناپایدار است.</p>`
    : ''
}

<h2>یافته‌ها</h2>
${
  grouped.length === 0
    ? '<p class="empty">هیچ خطای رصدشده‌ای بیرون از allowlist نبود.</p>'
    : grouped
        .map(
          (f) => `<div class="card bad">
  <div class="f-head">
    <span class="tag" style="background:${SEV[f.severity] || SEV.info}">${esc(f.source)}</span>
    <strong>${esc((f.steps || [f.step]).join(' · '))}</strong>
    <span class="count">${esc(f.route || '')} · ${f.count} بار · <code>${esc(f.fingerprint)}</code></span>
  </div>
  <pre>${esc(f.message)}</pre>
  ${f.detail ? `<pre>${esc(typeof f.detail === 'string' ? f.detail : JSON.stringify(f.detail))}</pre>` : ''}
</div>`
        )
        .join('\n')
}

<h2>خودآزما</h2>
${
  synGrouped.length === 0
    ? '<p class="empty">خودآزمایی انجام نشد.</p>'
    : synGrouped
        .map(
          (f) => `<div class="card">
  <div class="f-head">
    <span class="tag" style="background:#6c757d">${esc(f.source)}</span>
    <strong>${esc((f.steps || [f.step]).join(' · '))}</strong>
    <span class="count">${f.count} بار · <code>${esc(f.fingerprint)}</code></span>
  </div>
  <pre>${esc(f.message)}</pre>
</div>`
        )
        .join('\n')
}

<h2>خط زمانی قدم‌ها</h2>
<div class="steps">
${
  steps.length === 0
    ? '<p class="empty">قدمی ثبت نشد.</p>'
    : steps
        .map(
          (s) => `<div class="step${s.errorCount ? ' bad' : ''}">
  <div>${s.shot ? `<a href="${esc(s.shot)}"><img src="${esc(s.shot)}" alt=""></a>` : '<span class="sub">بدون عکس</span>'}</div>
  <div>
    <div class="nm">${esc(s.step)}</div>
    <div class="sub">${s.ms} میلی‌ثانیه${s.errorCount ? ` · <span style="color:${SEV.error}">${s.errorCount} خطا</span>` : ''}</div>
  </div>
</div>`
        )
        .join('\n')
}
</div>

<h2>لاگ سرور</h2>
${
  serverEvents.length === 0
    ? '<p class="empty">در بازهٔ این اجرا، سرور چیزی ننوشت.</p>'
    : `<pre>${esc(serverEvents.map((e) => `[${e.step}] ${e.message}`).join('\n'))}</pre>`
}

</div></body></html>`;
}
