/**
 * رصد سرور.
 *
 * این همان چیزی است که هیچ ابزار تستِ مرورگری نمی‌بیند: خطایی که سرور در فایل
 * لاگ می‌نویسد و کاربر فقط یک پیام عمومی از آن می‌بیند. بدون این، اپی که سرورش
 * ۵۰۰ می‌دهد و UI‌اش سالم به نظر می‌رسد، «پاس» شمرده می‌شود.
 *
 * هر جمع‌کننده فقط باید بگوید از آخرین بار چه خطوط تازه‌ای آمده. چسباندنشان به
 * قدمِ کاربر کارِ correlate است.
 */
import fs from 'node:fs/promises';

/** خطی که به نظر خطا می‌آید. عمداً سخت‌گیر نیست؛ داور با allowlist نرمش می‌کند. */
const ERROR_HINT = /PHP (Fatal|Parse|Recoverable) error|PHP Warning|Uncaught|exception|\[error\]|\bERROR\b/i;

class FileLogCollector {
  /** @param {{name?: string, path: string}} spec */
  constructor(spec) {
    this.name = spec.name || 'file';
    this.path = spec.path;
    this.offset = 0;
    this.available = false;
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
    } catch {
      // نبودن فایل خطا نیست: شاید این هدف اصلاً سرور ندارد. ولی سکوتش هم
      // نباید با «هیچ خطایی نبود» اشتباه شود، پس در گزارش علامت می‌خورد.
      this.available = false;
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
        .map((line) => ({
          source: 'server',
          collector: this.name,
          severity: ERROR_HINT.test(line) ? 'error' : 'info',
          message: line,
        }));
    } finally {
      await fh.close();
    }
  }
}

export function createServerCollectors(specs = []) {
  return specs.map((spec) => {
    if (spec.type === 'file') return new FileLogCollector(spec);
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
