# سناریوهای مهاجرت‌کرده به YAML

| بود | شد |
|---|---|
| `signup-chaos.spec.js` › رفرش روی صفحهٔ کد بازیابی | `refresh-recovery.yml` |
| `signup-chaos.spec.js` › ایمیل با حرف بزرگ | `email-case.yml` |
| `signup-chaos.spec.js` › ایمیل با فاصلهٔ اضافه | `email-whitespace.yml` |
| `signup-double-submit.spec.js` | `double-submit.yml` |
| `signup-recovery.spec.js` | `signup-recovery.yml` |

نگه داشتن هر دو نسخه یعنی یک باگ دو بار گزارش می‌شود و `replay` هر دو را
برمی‌دارد — همان چیزی که در اولین اجرای replay دیدیم. پس نسخهٔ اسکریپتی هر
سناریو با مهاجرتش حذف شد.

## چه چیزی هنوز اسکریپت است و چرا

`content-roundtrip.spec.js` — نوشتن در ویرایشگر tiptap و سنجیدن آنچه در
دیتابیس نشست. قدم‌های تایپ در ویرایشگرِ contenteditable هنوز فعلِ متناظری در
YAML ندارند. تا وقتی دارد، اسکریپت می‌ماند.

تنها فایل اسکریپتیِ باقی‌مانده همان یکی است.
