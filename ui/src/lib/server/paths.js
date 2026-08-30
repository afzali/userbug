import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

function findRoot() {
  if (process.env.USERBUG_ROOT) return path.resolve(process.env.USERBUG_ROOT);
  const cwd = process.cwd();
  const candidates = [cwd, path.resolve(cwd, '..')];
  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(candidate, 'package.json'), 'utf8'));
      if (pkg.name === 'userbug') return candidate;
    } catch {
      // نامزد بعدی را امتحان کن.
    }
  }
  throw new Error('ریشهٔ userbug پیدا نشد؛ USERBUG_ROOT را تنظیم کنید');
}

export const ROOT = findRoot();
export const RUNS_DIR = path.join(ROOT, 'runs');
export const TARGETS_DIR = path.join(ROOT, 'targets');
export const SCENARIOS_DIR = path.join(ROOT, 'scenarios');
export const TRIAGE_DIR = path.join(ROOT, 'triage');
export const TRACE_VIEWER_DIR = path.join(ROOT, 'node_modules', 'playwright-core', 'lib', 'vite', 'traceViewer');

function comparable(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function assertResolvedInside(root, candidate) {
  const rootKey = comparable(root);
  const candidateKey = comparable(candidate);
  if (candidateKey !== rootKey && !candidateKey.startsWith(rootKey + path.sep)) {
    throw new Error('پیوند نمادین از محدودهٔ مجاز بیرون می‌رود');
  }
}

export function assertSafeSegment(value, label = 'نام') {
  const text = String(value || '');
  if (!/^[\p{L}\p{N}_.-]+$/u.test(text) || text === '.' || text === '..') {
    throw new Error(`${label} نامعتبر است`);
  }
  return text;
}

export function resolveInside(base, ...parts) {
  const root = path.resolve(base);
  const candidate = path.resolve(root, ...parts);
  const rootKey = comparable(root);
  const candidateKey = comparable(candidate);
  if (candidateKey !== rootKey && !candidateKey.startsWith(rootKey + path.sep)) {
    throw new Error('مسیر بیرون از محدودهٔ مجاز است');
  }
  return candidate;
}

export async function existingFileInside(base, ...parts) {
  const root = await fsp.realpath(path.resolve(base));
  const candidate = resolveInside(root, ...parts);
  const real = await fsp.realpath(candidate);
  assertResolvedInside(root, real);
  const stat = await fsp.stat(real);
  if (!stat.isFile()) throw new Error('مسیر، فایل نیست');
  return { file: real, stat };
}

export async function existingDirectoryInside(base, ...parts) {
  const root = await fsp.realpath(path.resolve(base));
  const candidate = resolveInside(root, ...parts);
  const dir = await fsp.realpath(candidate);
  assertResolvedInside(root, dir);
  const stat = await fsp.stat(dir);
  if (!stat.isDirectory()) throw new Error('مسیر، پوشه نیست');
  return { dir, stat };
}

export async function ensureWritableInside(base, ...parts) {
  const root = await fsp.realpath(path.resolve(base));
  const candidate = resolveInside(root, ...parts);
  const relativeParent = path.relative(root, path.dirname(candidate));
  let realParent = root;

  for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
    const next = path.join(realParent, segment);
    try {
      await fsp.mkdir(next);
    } catch (cause) {
      if (cause?.code !== 'EEXIST') throw cause;
    }

    const linkStat = await fsp.lstat(next);
    if (linkStat.isSymbolicLink()) throw new Error('پوشهٔ مقصد نباید پیوند نمادین باشد');
    if (!linkStat.isDirectory()) throw new Error('والد مقصد، پوشه نیست');

    const realNext = await fsp.realpath(next);
    assertResolvedInside(root, realNext);
    realParent = realNext;
  }

  return path.join(realParent, path.basename(candidate));
}
