/**
 * مخزن اجرا.
 *
 * داشبورد برای فاز ۳ است، ولی دیتای داشبورد از همین‌جا شروع می‌شود. ساختنش
 * ارزان است؛ اضافه کردنش شش ماه بعد یعنی بازنویسی. همین ساختار است که بعداً
 * `replay` و `resume` را ممکن می‌کند.
 *
 * فایل‌ها روی دیسک می‌مانند و هیچ‌چیز بزرگی داخل دیتابیس نمی‌رود.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../target.js';

const RUNS_DIR = path.join(ROOT, 'runs');
const CURRENT = path.join(RUNS_DIR, '.current');

export const GUI_RUN_MARKER = '@@USERBUG_GUI_RUN@@';

export function assertRunId(value) {
  const runId = String(value || '').trim();
  if (!/^[\p{L}\p{N}_.-]+$/u.test(runId) || runId === '.' || runId === '..') {
    throw new Error('شناسهٔ اجرا نامعتبر است');
  }
  return runId;
}

export function newRunId(targetName) {
  const target = assertRunId(targetName);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${stamp}_${target}_${randomBytes(4).toString('hex')}`;
}

export function runDir(runId) {
  const safe = assertRunId(runId);
  const root = path.resolve(RUNS_DIR);
  const candidate = path.resolve(root, safe);
  if (!candidate.startsWith(root + path.sep)) throw new Error('شناسهٔ اجرا بیرون از runs است');
  return candidate;
}

/**
 * UB_RUN_ID منبع هویت است. فایل `.current` فقط pointer سازگاری/آخرین اجراست و
 * هیچ worker یا reporter نباید برای تشخیص مالکیت artifact به آن تکیه کند.
 */
export function setCurrentRun(runId) {
  const safe = assertRunId(runId);
  process.env.UB_RUN_ID = safe;
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const temporary = `${CURRENT}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, safe, 'utf8');
    fs.renameSync(temporary, CURRENT);
  } finally {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      // pointer کمکی است؛ پاک‌سازی temp نباید هویت محیطی را خراب کند.
    }
  }
}

export function getCurrentRun() {
  if (process.env.UB_RUN_ID) return assertRunId(process.env.UB_RUN_ID);
  return assertRunId(fs.readFileSync(CURRENT, 'utf8'));
}

export class RunStore {
  constructor(runId) {
    this.runId = assertRunId(runId);
    this.dir = runDir(this.runId);
    this.shotsDir = path.join(this.dir, 'shots');
  }

  async init(meta) {
    // parent در checkout تازه وجود ندارد؛ فقط leaf باید برای تشخیص collision
    // بهصورت انحصاری ساخته شود.
    await fsp.mkdir(RUNS_DIR, { recursive: true });
    try {
      await fsp.mkdir(this.dir);
    } catch (cause) {
      if (cause?.code === 'EEXIST') throw new Error(`شناسهٔ اجرا از قبل وجود دارد: ${this.runId}`);
      throw cause;
    }
    await fsp.mkdir(this.shotsDir);
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
