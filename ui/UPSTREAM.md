# منبع رابط کاربری

کامپوننت‌های پایهٔ این پوشه به‌صورت گزینشی از رابط محلی نپی کپی شده‌اند:

- مخزن: `D:\Projects\nepi`
- commit: `39967f4698cba3734b17aae189876a916c47843f`
- مسیر: `src/lib/components/ui`
- پشتهٔ منبع: Svelte 5، Tailwind CSS 4 و shadcn-svelte

نسخه‌های runtime رابط عین lockfile آن commit نمانده‌اند: SvelteKit، Svelte و Vite
تا نخستین نسخه‌های بدون advisory گزارش‌شده توسط `npm audit` جلو آورده و دقیق pin
شده‌اند. خود source کامپوننت‌ها همان snapshot بالاست.

فقط closure موردنیاز (`button`، `badge`، `card`، `input` و `textarea`) کپی شده
تا رابط userbug به درخت نپی وابستگی runtime نداشته باشد. توکن‌های عمومی روشن/تیره و
الگوی RTL نیز از `src/app.css` نپی گرفته شده‌اند؛ styleهای مخصوص کتاب و ویرایشگر
عمداً منتقل نشده‌اند.

مخزن `https://github.com/afzali/shadcn-rtl` فقط برای audit رفتار RTL بررسی شد و
هیچ فایل یا وابستگی runtime از آن وارد این پروژه نشده است.
