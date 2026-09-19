import { readProjectFile } from '$lib/server/projects.js';

export async function load({ params, url }) {
  const kind = url.searchParams.get('kind') === 'scenario' ? 'scenario' : 'target';
  const relative = url.searchParams.get('relative') || '';

  /**
   * آمدن برای **ساختن**، نه برای دیدنِ کانفیگ.
   *
   * `kind` بی پارامتر `target` می‌شود، پس `?new=1` صفحه را با
   * `<هدف>.config.js`ِ باز و عنوانِ «پیکربندیِ نپی» نشان می‌داد — برای کسی
   * که روی «خودم می‌نویسم» زده. پنلِ ساخت باز بود و عنوان چیزِ دیگری
   * می‌گفت.
   */
  const startNew = url.searchParams.get('new') === '1';

  let file = null;
  let fileError = '';
  if (!(startNew && !relative)) {
    try {
      file = await readProjectFile({ kind, target: params.target, relative });
    } catch (cause) {
      fileError = cause.message;
    }
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
   * `?revise=<خواسته>` پنلِ بازنویسی را باز و کادرش را پر می‌کند.
   *
   * ── چرا لازم شد ──
   *
   * تریاژ می‌گوید «این سناریو این ایراد را داد» و کارِ بعدی تقریباً همیشه
   * یکی است: همان سناریو را عوض کن. تا امروز آن حلقه بسته نبود — کاربر
   * باید نامِ سناریو را یادش می‌ماند، اینجا پیدایش می‌کرد، پنل را باز
   * می‌کرد، و متنِ یافته را دوباره تایپ می‌کرد.
   *
   * متن فقط در کادر می‌نشیند و هیچ‌چیز خودکار اجرا نمی‌شود: بازنویسی مدل
   * صدا می‌زند و پول خرج می‌کند، پس باید کسی دکمه‌اش را زده باشد.
   */
  const revise = (url.searchParams.get('revise') || '').slice(0, 2000);

  /**
   * `?new=1` پنلِ «سناریوی تازه» را باز می‌کند.
   *
   * چند پیوند با نامِ «خودم می‌نویسم» و «سناریوها» به `/files`ِ خالی
   * می‌رفتند و کانفیگِ پروژه را باز می‌کردند. `?compose=` هم جواب نمی‌داد:
   * آن برای متنِ آماده است و با رشتهٔ خالی پنل را باز نمی‌کند.
   */
  /**
   * `?expect=1` پنلِ انتظار را باز می‌کند.
   *
   * از فهرستِ مأموریت‌ها می‌آید: آنجا نوشته «این سفر بی‌انتظار است» و دکمهٔ
   * کنارش باید همان‌جا که لازم است باز شود، نه صفحه‌ای که کاربر باید خودش
   * دنبالِ دکمه بگردد.
   */

  return {
    kind,
    relative,
    file,
    fileError,
    compose,
    proposalId,
    revise,
    startNew,
    openExpect: url.searchParams.get('expect') === '1',
  };
}
