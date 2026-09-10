import net from 'node:net';

/**
 * پورتی که واقعاً می‌شود رویش نشست.
 *
 * ── چرا «آیا باز است؟» جوابِ این سؤال نیست ──
 *
 * راهِ رایج این است که وصل شویم و اگر وصل نشد بگوییم پورت آزاد است. آن روش
 * `EADDRINUSE` را می‌گیرد و `EACCES` را نه — و روی ویندوز مشکلِ واقعی
 * همین دومی است.
 *
 * ویندوز بازه‌هایی از پورت‌ها را برای Hyper-V و WSL و Docker کنار می‌گذارد
 * (`netsh interface ipv4 show excludedportrange protocol=tcp`). این بازه‌ها
 * **در هر بوت جابه‌جا می‌شوند**. پورتی که دیروز کار می‌کرد امروز
 * `EACCES: permission denied` می‌دهد، بی‌آنکه چیزی رویش نشسته باشد — و
 * `netstat` هم چیزی نشان نمی‌دهد، که پیدا کردنش را سخت‌تر می‌کند.
 *
 * پس تنها آزمونِ معتبر، خودِ نشستن است.
 *
 * ── چرا پورتِ ثابتِ دیگری انتخاب نشد ──
 *
 * ۴۱۷۴ داخل بازهٔ ۴۱۶۸–۴۲۶۷ افتاده بود. عوض کردنش به یک عددِ ثابتِ دیگر،
 * همین باگ را به تعویق می‌اندازد نه اینکه حلش کند: بوتِ بعدی بازه را جای
 * دیگری می‌برد.
 */
export function tryListen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * از `preferred` شروع می‌کند و اولین پورتِ قابل‌نشستن را برمی‌گرداند.
 *
 * گام ۱۰۰ است نه ۱: بازه‌های رزروشدهٔ ویندوز صد‌تایی‌اند، پس ۴۱۷۵ و ۴۱۷۶ و
 * … همه در همان بازه‌اند و صد بار آزمودنشان فقط وقت تلف کردن است.
 *
 * @param {number} preferred پورتِ دلخواه
 * @param {{host?: string, tries?: number}} [options]
 */
export async function pickPort(preferred, { host = '127.0.0.1', tries = 12 } = {}) {
  if (await tryListen(preferred, host)) return preferred;

  for (let step = 1; step < tries; step += 1) {
    const port = preferred + step * 100;
    if (port > 65000) break;
    if (await tryListen(port, host)) return port;
  }

  throw new Error(
    `هیچ پورتی از ${preferred} تا ${preferred + (tries - 1) * 100} قابل استفاده نبود.\n` +
      '  روی ویندوز این را ببینید: netsh interface ipv4 show excludedportrange protocol=tcp'
  );
}
