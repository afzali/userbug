# راهنمای دستی

«می‌خواهم خودم این کار را بکنم — چه اجرا کنم و کجا چه بنویسم؟»

---

## ۱. پیش از هر چیز: دو سرور

userbug هیچ اپی را بالا نمی‌آورد. فقط آدرس می‌گیرد. پس اول:

**سرور توسعهٔ نپی** (لازم برای همه‌چیز) — در پوشهٔ `D:\Projects\nepi`:

```bash
npm run dev
```

**سرور API نپی** (فقط برای سناریوهای سمت سرور):

```bash
C:/xampp/php/php.exe -d log_errors=1 -d error_log=D:/Projects/nepi/nepi-data/php-error.log -S 127.0.0.1:8081 -t D:/Projects/nepi/server/public
```

بررسی سلامتش: `http://127.0.0.1:8081/health` باید `{"ok":true}` بدهد.

> هر دو در `.claude/launch.json` نپی هم هستند: `nepi-dev` و `nepi-api-local`.

---

## ۲. رابط گرافیکی یا خط فرمان

### رابط گرافیکی

از `D:\Projects\userbug`، در checkout تازه ابتدا dependencyهای ریشه و بستهٔ
مستقل UI را نصب کنید (مرحلهٔ دوم را `postinstall` خودکار انجام می‌دهد):

```bash
npm install
```

اگر فقط dependencyهای UI باید از lockfile بازسازی شوند، `npm run ui:deps` را
بزنید. سپس رابط را اجرا کنید:

```bash
npm run ui
```

رابط روی `http://127.0.0.1:4174` بالا می‌آید و مرورگر را خودش باز می‌کند. از
همان‌جا می‌توانید اجرا را شروع کنید، قدم و عکس و خطا را زنده ببینید، فایل
سناریو/کانفیگ را ویرایش کنید، یافته‌ها را تریاژ کنید و دو run را مقایسه کنید.
داده‌ها همچنان فایل‌اند: `runs/` برای اجراها و `triage/` برای تصمیم‌های تریاژ.

### خط فرمان

همهٔ دستورها از `D:\Projects\userbug` اجرا می‌شوند.

```bash
node bin/userbug.js run nepi
```

### پرکاربردترین‌ها

```bash
# فقط یک سناریو، با نامش
node bin/userbug.js run nepi --grep "رفرش روی صفحهٔ کد بازیابی"

# دیدن مرورگر حین اجرا
node bin/userbug.js run nepi --grep "کاوش آزاد" --headed

# روی موبایل و دسکتاپ، دو اجرای جدا
node bin/userbug.js run nepi --device "desktop,Pixel 7"

# سه بار پشت سر هم — برای سنجیدن اینکه یافته تصادفی نیست
node bin/userbug.js run nepi --grep "دوبار کلیک" --repeat 3

# کاربر تند به‌جای کاربر آهسته
node bin/userbug.js run nepi --persona pro
```

### بعد از اجرا

```bash
node bin/userbug.js list                    # تاریخچه
node bin/userbug.js report latest            # ساخت دوبارهٔ گزارش، بدون اجرا
node bin/userbug.js repro latest             # یافته‌های قابل بازتولید
node bin/userbug.js repro latest 682cb011    # اجرای دوبارهٔ یک یافتهٔ مشخص
node bin/userbug.js diff <اجرای‌قدیم> <اجرای‌نو>
node bin/userbug.js models --free            # مدل‌های رایگان OpenRouter
```

`<runId>` همیشه می‌تواند `latest` یا چند حرف اولش باشد.

---

## ۳. سناریوی تازه: کجا و چطور

فایل YAML در `scenarios/nepi/` بگذارید. همین. خودکار پیدا و اجرا می‌شود.

```yaml
# scenarios/nepi/my-test.yml
name: عنوانی که در گزارش می‌بینید
persona: novice
status: approved

steps:
  - as: پاکسازی و باز کردن اپ
    clearState: true
  - go: /
  - expect: { url: "/login" }
  - wait: 2000
  - dismissBlockers: true

  - as: ثبت‌نام
    fill:
      ایمیل: "{{identity.email}}"
      رمز عبور: "{{identity.password}}"
  - click: { role: button, name: "ورود / ثبت‌نام" }
  - expect: { visible: { role: heading, name: "کد بازیابی شما" }, timeout: 30000 }
```

اجرا:

```bash
node bin/userbug.js run nepi --grep "عنوانی که در گزارش می‌بینید"
```

### چهار قاعده که همه‌چیز را روشن می‌کند

**۱. `as:` سرِ گروه است، نه برچسب.** قدم‌های بعدی تا `as:` بعدی زیر همان گروه
می‌آیند و **یک** قدم در گزارش می‌شوند — با یک عکس و یک بازهٔ لاگ سرور. بدون
آن، هر فعل یک ردیف می‌شود و گزارش از خواندن می‌افتد.

**۲. `expect` می‌شکند، `assert` یافته ثبت می‌کند.**

```yaml
- expect: { url: "/contents" }        # اگر نشد، سناریو تمام
- assert: { hidden: { role: heading, name: "کد بازیابی شما" } }
  finding: "حساب دومی ساخته شد"       # اگر نشد، یافته ثبت و ادامه
  detail: "توضیح برای کسی که بعداً می‌خواندش"
```

بیشتر باگ‌ها جایی‌اند که اپ **به کارش ادامه می‌دهد** و فقط چیزِ غلطی انجام
می‌دهد. اگر همه‌چیز `expect` بود، اولین یافته بقیهٔ مسیر را قطع می‌کرد.

**۳. لازم نیست همه‌چیز را assert کنید.** داورِ خودکار در پس‌زمینه هر خطای
جاوااسکریپت، هر `console.error`، هر ۵۰۰ و هر خطِ لاگ سرور را می‌گیرد — حتی
اگر سناریو یک سنجش هم نداشته باشد.

**۴. هدف را دقیق توصیف کنید.** `exact: true` پیش‌فرض است، و دلیل دارد: یک بار
`{role: menuitem, name: "خروج"}` هم به «خروج» خورد و هم به «خروجی گرفتن از
اطلاعات».

### فعل‌هایی که بیشتر لازم می‌شوند

| کار | نوشتن |
|---|---|
| رفتن به آدرس | `- go: /contents` |
| کلیک | `- click: { role: button, name: "ادامه" }` |
| پر کردن | `- fill: { ایمیل: "{{identity.email}}" }` |
| پر کردن با selector | `- fill: { selector: "#blank-title" }` + خط بعد `value: "..."` |
| تیک زدن | `- check: { role: checkbox }` |
| صبر | `- wait: 2000` |
| بستن پنجره‌های مزاحم | `- dismissBlockers: true` |
| گرفتن متن در متغیر | `- set: { name: code, from: { text: { selector: "code.select-all" } } }` |
| دانلود فایل | `- download: { click: {...}, saveAs: file, line: 2 }` |
| خواندن دیتابیس اپ | `- query: { sql: "SELECT ...", params: [...], saveAs: rows }` |
| درخواست به API | `- request: { method: POST, path: /auth/register, json: {...}, saveAs: res }` |
| شرط | `- when: { hidden: {...} }` + `then: [ ... ]` |
| حلقه | `- forEach: { var: t, in: [...] }` + `then: [ ... ]` |
| رفرش / back | `- reload: true` · `- back: true` |
| دوبار کلیک | `- dblclick: { role: button, name: "..." }` |
| چسباندن (نه تایپ) | `- paste: { into: {...}, value: "..." }` |
| قطع شبکه | `- offline: true` |

فهرست کامل: [`scenarios/README.md`](scenarios/README.md)

### متغیرها

```
{{identity.email}}     ایمیلِ تصادفیِ همین اجرا
{{identity.password}}  رمزِ تصادفیِ همین اجرا
{{identity.local}}     بخشِ پیش از @
{{nasty.zwnj}}         نیم‌فاصله · {{nasty.arabicYaKaf}} · {{nasty.persianDigits}}
{{vars.<نام>}}         هرچه با set یا query یا download گرفته‌اید
```

فیلتر: `{{identity.email | upperFirst}}` · `upper` · `lower` · `trim` · `localPart`

---

## ۴. قدم به زبان طبیعی

```yaml
- do: دکمهٔ ورود یا ثبت‌نام را بزن
- do: ایمیل حساب را وارد کن
  value: "{{identity.email}}"
```

بار اول مدل حل می‌کند و در `scenarios/nepi/_learned/<سناریو>.json` می‌نویسد.
**دفعه‌های بعد بدون هیچ تماسی با مدل اجرا می‌شود** — حتی بدون کلید.

مدل فقط دو وقت صدا زده می‌شود: نیت تازه است، یا امضای ساختاری عنصر عوض شده.

پوشهٔ `_learned/` را پاک نکنید و در گیت نگهش دارید؛ مسیرِ یادگرفته‌شده سرمایه
است نه فایل موقت.

---

## ۵. کاوش آزاد

```yaml
name: کاوش
timeout: 600000            # کاوش ذاتاً بلند است
steps:
  - as: ورود
    # ... قدم‌های رسیدن به نقطهٔ شروع
  - explore:
      goal: صفحهٔ فهرست را بگرد و ببین کجا چیزی خراب می‌شود
      maxSteps: 10
```

```bash
node bin/userbug.js run nepi --grep "کاوش" --author
```

با `--author` از آنچه کشف کرد یک پیش‌نویس سناریو در
`scenarios/nepi/_drafts/` می‌نویسد. پیش‌نویس‌ها **خودکار اجرا نمی‌شوند**.
برای رسمی کردنشان: بازبینی کنید، `assert` اضافه کنید، فایل را یک سطح بالاتر
بیاورید.

پیش‌نویس عمداً هیچ `assert`ی ندارد: کاوشگر نمی‌داند چه چیزی *باید* می‌شد، فقط
می‌داند چه شد.

---

## ۶. خواندن نتیجه

```
قدم: 55 · یافتهٔ یکتا: 8 · خط لاگ سرور: 1
10 failed
```

**«failed» یعنی یافته پیدا شد، نه اینکه ابزار خراب باشد.** رنگ را نخوانید،
فهرست یافته‌ها را بخوانید. سبزِ کامل یعنی هیچ ایرادی پیدا نشد.

```
• [server] درخواست ثبت‌نام با فیلد نامعتبر — PHP Warning: Undefined variable... (1×)
   ↑منبع     ↑قدم‌هایی که در آن دیده شد        ↑پیام                            ↑تکرار
```

| منبع | یعنی |
|---|---|
| `console` / `pageerror` | خطای جاوااسکریپت یا promise رهاشده |
| `http` / `network` | پاسخ ۴xx/۵xx یا درخواستی که نرسید |
| `server` | خطی که **سرور** در لاگ نوشت، چسبیده به همان قدم |
| `blocker` | پنجره‌ای که روی مسیر کاربر نشسته بود |
| `scenario` | `assert`ی که نخورد |

گزارش کامل: `runs/<runId>/report.html` — **از همان پوشه بازش کنید** تا عکس‌ها
بیایند.

برای CI همان نتیجه در `runs/<runId>/junit.xml` هم هست و با
`--junit <مسیر>` جای ثابتی کپی می‌شود. نگاشت و کدهای خروج در
[README](README.md#ci).

---

## ۷. یک چرخهٔ کامل، عملی

```bash
# ۱. سناریو را بنویس
#    scenarios/nepi/my-test.yml

# ۲. اجرا کن
node bin/userbug.js run nepi --grep "عنوان سناریو"

# ۳. گزارش را ببین
#    runs/<آخرین>/report.html

# ۴. اگر یافته‌ای بود، مطمئن شو تصادفی نیست
node bin/userbug.js run nepi --grep "عنوان سناریو" --repeat 3

# ۵. فایل بازتولیدش را بردار و به نپی گزارش بده
node bin/userbug.js repro latest
```

---

## ۸. چند تلهٔ شناخته‌شده

**`--scenario` مسیر فایل است، `--grep` عنوان تست.** اشتباه گرفتنشان «صفر تست
اجرا شد» می‌دهد بدون هیچ خطایی.

**سناریوی کاوش `timeout` می‌خواهد.** بدون آن وسط کار قطع می‌شود.

**سنجش آفلاین روی سرور توسعه معنا ندارد.** ویت ماژول‌ها را در لحظه از شبکه
می‌دهد، پس اپِ dev ذاتاً آفلاین کار نمی‌کند. بیلد تولیدی لازم است.

**پیش از گزارش دادن یک یافته، سورس را نگاه کنید.** دو بار در همین پروژه
سنجشِ غلط نوشتیم و «یافته» گرفتیم: یک بار نرمال‌سازی عمدیِ عنوان‌ها، یک بار
خطاهای آفلاینِ سرور توسعه. **یافتهٔ اشتباه از نبودِ یافته بدتر است.**
