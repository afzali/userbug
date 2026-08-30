import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import YAML from 'yaml';
import {
  ROOT,
  SCENARIOS_DIR,
  TARGETS_DIR,
  assertSafeSegment,
  ensureWritableInside,
  existingDirectoryInside,
  existingFileInside,
} from './paths.js';

const execFileAsync = promisify(execFile);
const SCENARIO_EXTENSIONS = ['.yml', '.yaml', '.js'];

async function walk(dir, base = dir) {
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (cause) {
    if (cause?.code === 'ENOENT') return [];
    throw cause;
  }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'fa'))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full, base)));
    } else if (entry.isFile()) {
      files.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return files;
}

function sourceField(source, field) {
  const match = source.match(new RegExp(`\\b${field}\\s*:\\s*['\"]([^'\"]+)['\"]`));
  return match?.[1] || '';
}

async function scenarioMetadata(directory, relative) {
  const { file } = await existingFileInside(directory, relative);
  const source = await fsp.readFile(file, 'utf8');
  const extension = path.extname(relative).toLowerCase();
  if (extension === '.yml' || extension === '.yaml') {
    try {
      const doc = YAML.parse(source);
      const status = String(doc?.status || (relative.startsWith('_drafts/') ? 'draft' : 'approved'));
      return {
        path: relative,
        kind: 'yaml',
        name: String(doc?.name || relative),
        status,
        runnable: status !== 'draft' && Boolean(doc?.name) && Array.isArray(doc?.steps),
        persona: String(doc?.persona || 'novice'),
        steps: Array.isArray(doc?.steps) ? doc.steps.length : 0,
      };
    } catch (cause) {
      return {
        path: relative,
        kind: 'yaml',
        name: relative,
        status: 'invalid',
        runnable: false,
        persona: '',
        steps: 0,
        error: cause.message,
      };
    }
  }
  const title = source.match(/\b(?:test|scenario)\s*\(\s*['"`]([^'"`]+)/)?.[1];
  return {
    path: relative,
    kind: 'javascript',
    name: title || relative,
    status: 'approved',
    runnable: relative.toLowerCase().endsWith('.spec.js') && Boolean(title),
    persona: '',
    steps: null,
  };
}

export async function listScenarios(target) {
  const key = assertSafeSegment(target, 'هدف');
  let directory;
  try {
    ({ dir: directory } = await existingDirectoryInside(SCENARIOS_DIR, key));
  } catch (cause) {
    if (cause?.code === 'ENOENT') return [];
    throw cause;
  }

  const files = (await walk(directory)).filter((relative) => {
    const lower = relative.toLowerCase();
    return SCENARIO_EXTENSIONS.some((extension) => lower.endsWith(extension));
  });
  return Promise.all(files.map((relative) => scenarioMetadata(directory, relative)));
}

export async function listProjects() {
  let entries = [];
  try {
    entries = await fsp.readdir(TARGETS_DIR, { withFileTypes: true });
  } catch (cause) {
    if (cause?.code === 'ENOENT') return [];
    throw cause;
  }

  const projects = [];
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith('.config.js')).sort((a, b) => a.name.localeCompare(b.name))) {
    const key = entry.name.replace(/\.config\.js$/, '');
    const source = await fsp.readFile(path.join(TARGETS_DIR, entry.name), 'utf8');
    const scenarios = await listScenarios(key);
    projects.push({
      key,
      name: sourceField(source, 'name') || key,
      baseURL: sourceField(source, 'baseURL'),
      environment: sourceField(source, 'environment') || 'production',
      device: sourceField(source, 'device') || 'desktop',
      configFile: entry.name,
      scenarios,
    });
  }
  return projects;
}

function assertScenarioPath(relative) {
  const normalized = String(relative || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('مسیر سناریو نامعتبر است');
  }
  const lower = normalized.toLowerCase();
  if (!SCENARIO_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
    throw new Error('فقط فایل YAML یا JavaScript سناریو قابل ویرایش است');
  }
  return normalized;
}

export async function readProjectFile({ kind, target, relative }) {
  const key = assertSafeSegment(target, 'هدف');
  if (kind === 'target') {
    const name = `${key}.config.js`;
    const { file } = await existingFileInside(TARGETS_DIR, name);
    return { kind, target: key, relative: name, content: await fsp.readFile(file, 'utf8') };
  }
  if (kind === 'scenario') {
    const safeRelative = assertScenarioPath(relative);
    const { file } = await existingFileInside(SCENARIOS_DIR, key, safeRelative);
    return { kind, target: key, relative: safeRelative, content: await fsp.readFile(file, 'utf8') };
  }
  throw new Error('نوع فایل نامعتبر است');
}

async function validateJavaScript(file, targetConfig) {
  await execFileAsync(process.execPath, ['--check', file], { cwd: ROOT, windowsHide: true, timeout: 15_000 });
  if (!targetConfig) return;
  const check = [
    "import { pathToFileURL } from 'node:url';",
    'const mod = await import(pathToFileURL(process.argv[1]).href + `?check=${Date.now()}`);',
    "if (!mod.default || !mod.default.baseURL) throw new Error('default export با baseURL لازم است');",
  ].join(' ');
  await execFileAsync(process.execPath, ['--input-type=module', '-e', check, file], {
    cwd: ROOT,
    windowsHide: true,
    timeout: 15_000,
  });
}

async function validateScenarioYaml(file) {
  const source = await fsp.readFile(file, 'utf8');
  const doc = YAML.parse(source);
  if (!doc || typeof doc !== 'object') throw new Error('سند YAML باید object باشد');
  if (!doc.name) throw new Error('سناریو «name» ندارد');
  if (!Array.isArray(doc.steps)) throw new Error('سناریو «steps» معتبر ندارد');
}

function fileExistsError() {
  const error = new Error('سناریو از قبل وجود دارد');
  error.code = 'FILE_EXISTS';
  error.status = 409;
  return error;
}

export async function writeProjectFile({ kind, target, relative, content, createOnly = false }) {
  const key = assertSafeSegment(target, 'هدف');
  const source = String(content ?? '');
  if (Buffer.byteLength(source, 'utf8') > 2_000_000) throw new Error('فایل بیش از حد بزرگ است');

  let file;
  let scenario = false;
  if (kind === 'target') {
    file = await ensureWritableInside(TARGETS_DIR, `${key}.config.js`);
  } else if (kind === 'scenario') {
    scenario = true;
    const safeRelative = assertScenarioPath(relative);
    file = await ensureWritableInside(SCENARIOS_DIR, key, safeRelative);
  } else {
    throw new Error('نوع فایل نامعتبر است');
  }

  const extension = path.extname(file);
  const temporary = path.join(
    path.dirname(file),
    `${path.basename(file, extension)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp${extension}`
  );
  await fsp.writeFile(temporary, source, { encoding: 'utf8', flag: 'wx' });
  try {
    if (file.endsWith('.yml') || file.endsWith('.yaml')) await validateScenarioYaml(temporary);
    else await validateJavaScript(temporary, !scenario);

    if (createOnly === true) {
      try {
        await fsp.link(temporary, file);
      } catch (cause) {
        if (cause?.code === 'EEXIST') throw fileExistsError();
        throw cause;
      }
    } else {
      await fsp.rename(temporary, file);
    }
  } finally {
    await fsp.rm(temporary, { force: true }).catch(() => {});
  }
  return { kind, target: key, relative: kind === 'target' ? `${key}.config.js` : assertScenarioPath(relative), savedAt: new Date().toISOString() };
}
