/**
 * مخزن اجرا.
 *
 * داشبورد برای فاز ۳ است، ولی دیتای داشبورد از همین‌جا شروع می‌شود. ساختنش
 * ارزان است؛ اضافه کردنش شش ماه بعد یعنی بازنویسی. همین ساختار است که بعداً
 * `replay` و `resume` را ممکن می‌کند.
 *
 * فایل‌ها روی دیسک می‌مانند و هیچ‌چیز بزرگی داخل دیتابیس نمی‌رود.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../target.js';

const RUNS_DIR = path.join(ROOT, 'runs');
const CURRENT = path.join(RUNS_DIR, '.current');

export function newRunId(targetName) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${stamp}_${targetName}`;
}

export function runDir(runId) {
  return path.join(RUNS_DIR, runId);
}

/**
 * شناسهٔ اجرای جاری.
 *
 * روی دیسک نوشته می‌شود چون کارگرهای Playwright فرآیندهای جدایی‌اند و متغیر
 * محیطیِ ساخته‌شده در globalSetup به آن‌ها نمی‌رسد.
 */
export function setCurrentRun(runId) {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.writeFileSync(CURRENT, runId, 'utf8');
}

export function getCurrentRun() {
  return fs.readFileSync(CURRENT, 'utf8').trim();
}

export class RunStore {
  constructor(runId) {
    this.runId = runId;
    this.dir = runDir(runId);
    this.shotsDir = path.join(this.dir, 'shots');
  }

  async init(meta) {
    await fsp.mkdir(this.shotsDir, { recursive: true });
    await this.writeJson('run.json', {
      runId: this.runId,
      startedAt: new Date().toISOString(),
      status: 'running',
      ...meta,
    });
  }

  async writeJson(name, data) {
    await fsp.writeFile(path.join(this.dir, name), JSON.stringify(data, null, 2), 'utf8');
  }

  async readJson(name, fallback = null) {
    try {
      return JSON.parse(await fsp.readFile(path.join(this.dir, name), 'utf8'));
    } catch {
      return fallback;
    }
  }

  /** رخدادها فقط اضافه می‌شوند — تا چند کارگر هم‌زمان بتوانند بنویسند. */
  async appendEvent(event) {
    const line = JSON.stringify({ at: new Date().toISOString(), ...event });
    await fsp.appendFile(path.join(this.dir, 'events.ndjson'), line + '\n', 'utf8');
  }

  async appendFinding(finding) {
    const line = JSON.stringify(finding);
    await fsp.appendFile(path.join(this.dir, 'findings.ndjson'), line + '\n', 'utf8');
  }

  async readNdjson(name) {
    try {
      const raw = await fsp.readFile(path.join(this.dir, name), 'utf8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }

  /** عکس هر قدم. نام فایل مرتب می‌ماند تا ترتیب در گزارش حفظ شود. */
  async saveShot(index, name, buffer) {
    const safe = String(name).replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60);
    const file = `${String(index).padStart(2, '0')}-${safe}.png`;
    await fsp.writeFile(path.join(this.shotsDir, file), buffer);
    return `shots/${file}`;
  }

  async finish(patch) {
    const run = (await this.readJson('run.json')) || {};
    await this.writeJson('run.json', {
      ...run,
      finishedAt: new Date().toISOString(),
      ...patch,
    });
  }
}
