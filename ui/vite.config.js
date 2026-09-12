import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/**
 * هیچ ترفندی برای پلی‌رایت اینجا نیست — و این عمدی است.
 *
 * صفحهٔ گشت روی بیلد با `ERR_MODULE_NOT_FOUND: chromium-bidi` می‌افتاد.
 * چهار راه اینجا امتحان شد و هیچ‌کدام نگرفت: `ssr.external`،
 * `build.rollupOptions.external`، `resolve.alias`، و یک پلاگینِ `resolveId`
 * با `enforce: 'pre'`. هر بار همان چانکِ ۷.۵ مگابایتی با همان هش ساخته شد.
 *
 * علتش این است که پلی‌رایت بیرونِ ریشهٔ `ui/` نصب است و ویت آن را
 * «وابستگیِ پیوندی» می‌بیند، که یعنی اجباراً باندل می‌شود.
 *
 * پس جواب در پیکربندیِ باندلر نبود: `ui/src/lib/server/tours.js` ماژولِ
 * گشت را در **زمان اجرا** بارگذاری می‌کند. توضیحِ کاملش همان‌جاست.
 */
export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
  },
  build: {
    target: 'esnext',
  },
});
