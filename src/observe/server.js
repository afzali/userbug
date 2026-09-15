/**
 * رصد سرور.
 *
 * این همان چیزی است که هیچ ابزار تستِ مرورگری نمی‌بیند: خطایی که سرور در فایل
 * لاگ می‌نویسد و کاربر فقط یک پیام عمومی از آن می‌بیند. بدون این، اپی که سرورش
 * ۵۰۰ می‌دهد و UI‌اش سالم به نظر می‌رسد، «پاس» شمرده می‌شود.
 *
 * هر جمع‌کننده فقط باید بگوید از آخرین بار چه خطوط تازه‌ای آمده. چسباندنشان به
 * قدمِ کاربر کارِ correlate است.
 *
 * ── چرا فقط «فایل» کافی نبود ──
 *
 * تا امروز تنها جمع‌کننده `FileLogCollector` بود، یعنی سرور باید روی دیسک
 * می‌نوشت. ولی اپِ امروزی معمولاً این کار را نمی‌کند: `npm run dev` روی
 * stdout می‌نویسد، داکر در `docker logs` نگه می‌دارد، و هیچ‌کدام فایلی
 * ندارند که بشود tail کرد.
 *
 * نتیجه‌اش روی پروژهٔ واقعی این بود: `serverCollectors: ["front"]` و **یک**
 * خط لاگ در کلِ اجرا. یعنی نیمی از آن چیزی که این ابزار برایش ساخته شده،
 * عملاً خاموش بود.
 *
 * ── و چرا «نبودِ لاگ» باید بلند گفته شود ──
 *
 * جمع‌کننده‌ای که فایلش نیست، بی‌صدا ساکت می‌ماند و گزارش می‌گوید «۰ خط لاگ
 * سرور» — که از «همه‌چیز خوب بود» قابل تشخیص نیست. همان شکستِ خاموشی که کلِ
 * این ابزار برای شکارش ساخته شده، در خودش.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

/** خطی که به نظر خطا می‌آید. عمداً سخت‌گیر نیست؛ داور با allowlist نرمش می‌کند. */
const ERROR_HINT = /PHP (Fatal|Parse|Recoverable) error|PHP Warning|Uncaught|exception|\[error\]|\bERROR\b/i;

/** سقفِ خطوطی که میانِ دو `drain` نگه داشته می‌شود. */
const MAX_BUFFER = 5000;

function toEvent(name, line) {
  return {
    source: 'server',
    collector: name,
    severity: ERROR_HINT.test(line) ? 'error' : 'info',
    message: line,
  };
}

class FileLogCollector {
  /** @param {{name?: string, path: string}} spec */
  constructor(spec) {
    this.name = spec.name || 'file';
    this.kind = 'file';
    this.path = spec.path;
    this.offset = 0;
    this.available = false;
    this.why = '';
  }

  /**
   * از انتهای فایل شروع کن، نه از اول.
   *
   * وگرنه اولین اجرا کل تاریخِ لاگِ ماشین را به‌عنوان یافتهٔ امروز گزارش می‌کند.
   */
  async start() {
    try {
      const st = await fs.stat(this.path);
      this.offset = st.size;
      this.available = true;
    } catch (cause) {
      // نبودن فایل خطا نیست: شاید این هدف اصلاً سرور ندارد. ولی سکوتش هم
      // نباید با «هیچ خطایی نبود» اشتباه شود، پس در گزارش علامت می‌خورد.
      this.available = false;
      this.why = `فایل خوانده نشد: ${cause.code || cause.message}`;
    }
  }

  /** خطوط تازه از آخرین فراخوانی. */
  async drain() {
    if (!this.available) return [];
    let st;
    try {
      st = await fs.stat(this.path);
    } catch {
      return [];
    }
    // چرخش لاگ: فایل کوچک‌تر شده، یعنی از نو شروع شده
    if (st.size < this.offset) this.offset = 0;
    if (st.size === this.offset) return [];

    const fh = await fs.open(this.path, 'r');
    try {
      const len = st.size - this.offset;
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, this.offset);
      this.offset = st.size;
      return buf
        .toString('utf8')
        .split(/\r?\n/)
        .filter((l) => l.trim() !== '')
        .map((line) => toEvent(this.name, line));
    } finally {
      await fh.close();
    }
  }

  async stop() {}
}

/**
 * لاگی که از **خروجیِ یک فرمان** می‌آید.
 *
 * `docker logs -f`، `kubectl logs -f`، `journalctl -f`، یا حتی `tail -f` —
 * هر چیزی که روی stdout/stderr خط می‌ریزد.
 *
 * ── چرا `shell: false` و آرایهٔ آرگومان ──
 *
 * همان درسی که `schedule.js` نوشت و این مخزن یک بار با `shell: true` خورد:
 * رشتهٔ فرمان یعنی هر مقداری که از کانفیگ بیاید می‌تواند فرمانِ دیگری اجرا
 * کند. اینجا فرمان و آرگومان‌ها جدا می‌مانند و هیچ shellی وسط نیست.
 *
 * ── چرا خروجی بافر می‌شود و بلافاصله مصرف نمی‌شود ──
 *
 * قرارداد جمع‌کننده‌ها «از آخرین بار چه آمد» است، تا هر بسته به **قدمِ**
 * همان لحظه بچسبد. پس خطوط تا `drain` بعدی در حافظه می‌مانند — با سقف، چون
 * سروری که در حلقه لاگ می‌ریزد نباید حافظهٔ اجرا را بخورد.
 */
class CommandLogCollector {
  /** @param {{name?: string, command: string, args?: string[], cwd?: string}} spec */
  constructor(spec) {
    this.name = spec.name || 'command';
    this.kind = 'command';
    this.command = spec.command;
    this.args = Array.isArray(spec.args) ? spec.args : [];
    this.cwd = spec.cwd || undefined;
    this.available = false;
    this.why = '';
    this.lines = [];
    this.dropped = 0;
    this.child = null;
    this.rest = { stdout: '', stderr: '' };
  }

  push(stream, chunk) {
    const combined = this.rest[stream] + chunk.toString('utf8');
    const parts = combined.split(/\r?\n/);
    this.rest[stream] = parts.pop() || '';
    for (const line of parts) {
      if (!line.trim()) continue;
      if (this.lines.length >= MAX_BUFFER) {
        this.dropped++;
        continue;
      }
      this.lines.push(line);
    }
  }

  async start() {
    try {
      this.child = spawn(this.command, this.args, {
        cwd: this.cwd,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (cause) {
      this.available = false;
      this.why = `اجرا نشد: ${cause.message}`;
      return;
    }

    this.child.stdout.on('data', (chunk) => this.push('stdout', chunk));
    this.child.stderr.on('data', (chunk) => this.push('stderr', chunk));

    /**
     * مرگِ زودهنگام یعنی این جمع‌کننده دروغ می‌گفت.
     *
     * `docker logs` روی کانتینری که وجود ندارد، بلافاصله با کد غیرصفر
     * می‌میرد. بی این، `available` تا آخرِ اجرا `true` می‌ماند و گزارش
     * می‌گوید «لاگ داشتیم و خطایی نبود».
     */
    this.child.once('error', (cause) => {
      this.available = false;
      this.why = `اجرا نشد: ${cause.message}`;
    });
    this.child.once('exit', (code) => {
      if (this.stopping) return;
      this.available = false;
      this.why = `فرمان زودتر تمام شد (کد ${code})`;
    });

    /**
     * یک لحظه صبر، تا شکستِ فوری پیش از نخستین قدم معلوم شود.
     *
     * بی این، «فرمان اجرا نشد» تازه در پایانِ اجرا گزارش می‌شد — وقتی که
     * دیگر هیچ کاری نمی‌شود کرد.
     */
    this.available = true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  async drain() {
    const lines = this.lines;
    this.lines = [];
    const out = lines.map((line) => toEvent(this.name, line));

    if (this.dropped) {
      // سکوت اینجا یعنی گزارشی که ناقص است و خودش نمی‌داند
      out.push({
        source: 'server',
        collector: this.name,
        severity: 'info',
        message: `${this.dropped} خط لاگ به‌خاطر سقفِ بافر کنار گذاشته شد`,
      });
      this.dropped = 0;
    }
    return out;
  }

  async stop() {
    this.stopping = true;
    if (!this.child || this.child.exitCode !== null) return;
    try {
      this.child.kill();
    } catch {
      // فرآیندی که خودش مرده، کشتن نمی‌خواهد
    }
  }
}

export function createServerCollectors(specs = []) {
  return specs.map((spec) => {
    const type = spec.type || (spec.command ? 'command' : 'file');
    if (type === 'file') return new FileLogCollector(spec);
    if (type === 'command') return new CommandLogCollector(spec);
    throw new Error(`نوع جمع‌کنندهٔ لاگ ناشناخته: ${spec.type}`);
  });
}

export async function startAll(collectors) {
  await Promise.all(collectors.map((c) => c.start()));
  return collectors;
}

export async function drainAll(collectors) {
  const batches = await Promise.all(collectors.map((c) => c.drain()));
  return batches.flat();
}

export async function stopAll(collectors = []) {
  await Promise.all(collectors.map((c) => c.stop?.().catch(() => {})));
}

/**
 * وضعیتِ جمع‌کننده‌ها — برای گزارش، نه برای تصمیم.
 *
 * ── چرا لازم است ──
 *
 * «۰ خط لاگ سرور» دو معنی کاملاً متفاوت دارد: یا سرور ساکت بود (خبرِ خوب)،
 * یا اصلاً گوش نمی‌دادیم (خبرِ بد). تا امروز گزارش این دو را یک‌شکل نشان
 * می‌داد.
 */
export function describeCollectors(collectors = []) {
  return collectors.map((one) => ({
    name: one.name,
    kind: one.kind || 'file',
    available: Boolean(one.available),
    why: one.why || '',
  }));
}

/** جمله‌ای که به کاربر گفته می‌شود، یا رشتهٔ خالی اگر همه‌چیز سرِ جایش است. */
export function collectorWarning(collectors = []) {
  if (!collectors.length) {
    return 'هیچ لاگ سروری تنظیم نشده: خطایی که سرور می‌نویسد و UI نشانش نمی‌دهد، دیده نمی‌شود.';
  }
  const dead = describeCollectors(collectors).filter((one) => !one.available);
  if (!dead.length) return '';
  return `لاگ سرور نمی‌آید — ${dead.map((one) => `«${one.name}» ${one.why || 'در دسترس نبود'}`).join('، ')}`;
}
