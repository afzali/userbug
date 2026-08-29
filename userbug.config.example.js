/**
 * تنظیمات کلیِ userbug.
 *
 * این فایل را به `userbug.config.js` کپی کنید. آن نسخه در `.gitignore` است
 * چون کلید دارد.
 *
 * هیچ‌کدام اجباری نیست: بدون این فایل هم پیش‌فرض‌های `src/models/config.js`
 * کار می‌کنند. و مسیرهای کش‌شده اصلاً کلید نمی‌خواهند — کلید فقط برای قدمی
 * لازم است که هنوز یاد گرفته نشده.
 */
export default {
  models: {
    provider: 'openrouter',
    apiKey: process.env.OPENROUTER_API_KEY,

    // ارزان برای حل قدم، گران فقط برای تحلیل
    roles: {
      resolve: 'anthropic/claude-haiku-4.5',
      author: 'anthropic/claude-haiku-4.5',
      analyze: 'anthropic/claude-sonnet-5',
    },

    // رد شدن از سقف اجرا را متوقف می‌کند، نه اینکه بی‌صدا ادامه دهد
    budgetPerRun: 0.5,

    // از هر ۲۰ اجرا یکی کامل با مدل حل می‌شود، تا انحرافِ خاموشِ کش پیدا شود
    reverifyEvery: 20,
  },
};
