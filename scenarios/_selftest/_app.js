/**
 * «اپِ هدف بالاست؟»
 *
 * ── چرا لازم شد ──
 *
 * بیشترِ فایل‌های این پوشه خودآزمای خالص‌اند: ریشهٔ موقتِ خودشان را می‌سازند
 * و هیچ اپی لازم ندارند. ولی سه‌تایشان — `cache`، `dialog` و `observer` —
 * رصدگرِ واقعیِ مرورگر را روی یک صفحهٔ واقعی می‌سنجند، پس `page.goto('/')`
 * می‌زنند و به `baseURL` وابسته‌اند.
 *
 * نتیجه‌اش این بود: هر بار که اپ بالا نبود، سوییت چهار شکستِ قرمز می‌داد که
 * هیچ‌کدام دربارهٔ کدِ userbug چیزی نمی‌گفتند. و قرمزی که معنا ندهد، بقیهٔ
 * قرمزها را هم بی‌اثر می‌کند — همان چیزی که این ابزار برای نبودنش نوشته شد.
 *
 * ── چرا رد کردن، و نه ساختنِ صفحهٔ قلابی ──
 *
 * وسوسه‌اش هست: `page.setContent()` و تمام. ولی آنچه این سه می‌سنجند دقیقاً
 * رفتارِ **اپِ واقعی** است — پنجرهٔ واقعی، خطای واقعیِ کنسول، امضای واقعیِ
 * رندر. صفحهٔ قلابی سبزشان می‌کند بی آنکه چیزی را آزموده باشد.
 *
 * پس وقتی اپ نیست، رد می‌شوند با دلیلِ روشن؛ و وقتی هست، واقعاً اجرا
 * می‌شوند.
 */
import { request } from '@playwright/test';

/** یک بار پرسیده می‌شود، نه به‌ازای هر بند. */
let cached;

/**
 * @param {string} baseURL
 * @returns {Promise<boolean>}
 */
export async function appIsUp(baseURL) {
  if (cached !== undefined) return cached;
  if (!baseURL) return (cached = false);

  try {
    const context = await request.newContext();
    const response = await context.get(baseURL, { timeout: 3000 });
    await context.dispose();
    cached = response.ok();
  } catch {
    // وصل نشد، مهلت تمام شد، یا آدرس بی‌معنا بود — همه یعنی «نیست»
    cached = false;
  }
  return cached;
}

/**
 * این فایل بی اپ معنا ندارد.
 *
 * @param {import('@playwright/test').TestType<any, any>} test
 */
export function skipWithoutApp(test) {
  test.beforeEach(async ({ baseURL }) => {
    test.skip(
      !(await appIsUp(baseURL)),
      `اپِ هدف روی ${baseURL || '؟'} بالا نیست — این بند رفتارِ اپِ واقعی را می‌سنجد`
    );
  });
}
