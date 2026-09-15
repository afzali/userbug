import { readProjectFile } from '$lib/server/projects.js';

export async function load({ params, url }) {
  const kind = url.searchParams.get('kind') === 'scenario' ? 'scenario' : 'target';
  const relative = url.searchParams.get('relative') || '';

  let file = null;
  let fileError = '';
  try {
    file = await readProjectFile({ kind, target: params.target, relative });
  } catch (cause) {
    fileError = cause.message;
  }
  /**
   * متنِ آماده، از صفحهٔ «چه باید آزمود».
   *
   * پیشنهاد فقط جمله را می‌دهد؛ ساختنش از همین‌جا و از همان پنلی می‌گذرد که
   * کاربر خودش هم استفاده می‌کند. مسیرِ دومِ ساخت یعنی دو رفتار که به‌مرور
   * واگرا می‌شوند.
   */
  const compose = (url.searchParams.get('compose') || '').slice(0, 2000);
  // فقط شناسه؛ خودِ مقدمه را سرور از نقشه برمی‌دارد
  const proposalId = (url.searchParams.get('proposal') || '').slice(0, 80);

  /**
   * `?expect=1` پنلِ انتظار را باز می‌کند.
   *
   * از فهرستِ مأموریت‌ها می‌آید: آنجا نوشته «این سفر بی‌انتظار است» و دکمهٔ
   * کنارش باید همان‌جا که لازم است باز شود، نه صفحه‌ای که کاربر باید خودش
   * دنبالِ دکمه بگردد.
   */
  return { kind, relative, file, fileError, compose, proposalId, openExpect: url.searchParams.get('expect') === '1' };
}
