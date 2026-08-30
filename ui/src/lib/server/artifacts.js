import fsp from 'node:fs/promises';
import path from 'node:path';
import { dedupe } from '../../../../src/observe/oracle.js';
import { RUNS_DIR, TRIAGE_DIR, assertSafeSegment, existingFileInside, resolveInside } from './paths.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function readJson(file, fallback = null) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return JSON.parse(await fsp.readFile(file, 'utf8'));
    } catch (cause) {
      if (cause?.code === 'ENOENT') return fallback;
      if (attempt === 2) return fallback;
      await sleep(20);
    }
  }
  return fallback;
}

export async function readNdjson(file) {
  let raw;
  try {
    raw = await fsp.readFile(file, 'utf8');
  } catch (cause) {
    if (cause?.code === 'ENOENT') return [];
    throw cause;
  }

  const rows = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // writer ممکن است هنوز خط آخر را کامل نکرده باشد؛ خطوط سالم حفظ می‌شوند.
    }
  }
  return rows;
}

function runStartedAtMs(runId, startedAt) {
  const metadataTime = Date.parse(String(startedAt || ''));
  if (Number.isFinite(metadataTime)) return metadataTime;

  const match = String(runId).match(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})/);
  if (!match) return Number.NEGATIVE_INFINITY;
  const idTime = Date.parse(`${match[1]}:${match[2]}:${match[3]}Z`);
  return Number.isFinite(idTime) ? idTime : Number.NEGATIVE_INFINITY;
}

function compareRunEntries(left, right) {
  const timeDifference = runStartedAtMs(left.runId, left.startedAt) - runStartedAtMs(right.runId, right.startedAt);
  if (timeDifference) return timeDifference;
  return left.runId === right.runId ? 0 : left.runId < right.runId ? -1 : 1;
}

export async function listRunIds() {
  try {
    return (await fsp.readdir(RUNS_DIR, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => (left === right ? 0 : left < right ? -1 : 1));
  } catch (cause) {
    if (cause?.code === 'ENOENT') return [];
    throw cause;
  }
}

async function loadRunIndex(ids = null) {
  const runIds = ids || (await listRunIds());
  const entries = await Promise.all(
    runIds.map(async (runId) => {
      const run = await readJson(path.join(RUNS_DIR, runId, 'run.json'));
      return { runId, run, startedAt: run?.startedAt || null };
    })
  );
  return entries.sort(compareRunEntries);
}

export async function resolveRunId(input) {
  const ids = await listRunIds();
  if (!ids.length) throw new Error('هیچ اجرایی در runs/ نیست');
  if (!input || input === 'latest') return (await loadRunIndex(ids)).at(-1).runId;
  const wanted = String(input);
  if (ids.includes(wanted)) return wanted;
  const matches = ids.filter((id) => id.startsWith(wanted));
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new Error(`اجرای «${wanted}» پیدا نشد`);
  throw new Error(`«${wanted}» به چند اجرا می‌خورد`);
}

export async function listRuns({ target, limit = 250 } = {}) {
  const entries = (await loadRunIndex()).reverse();
  const rows = [];
  for (const { runId, run } of entries) {
    if (!run) {
      rows.push({ runId, status: 'unreadable', startedAt: null, steps: 0, findings: 0, serverLines: 0 });
      continue;
    }
    if (target && run.target !== target) continue;
    rows.push({
      runId,
      startedAt: run.startedAt || null,
      finishedAt: run.finishedAt || null,
      target: run.target || '',
      device: run.device || '',
      environment: run.environment || '',
      status: run.status || 'finished',
      steps: run.steps ?? 0,
      findings: run.findings ?? 0,
      findingEvents: run.findingEvents ?? run.findings ?? 0,
      serverLines: run.serverLines ?? 0,
      scenarios: Array.isArray(run.scenarios) ? run.scenarios : [],
      ai: run.ai || null,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

function buildTimeline(events, findings) {
  const timeline = [];
  let pending = [];

  for (const event of events) {
    if (event.kind === 'step') {
      const attachedFindings = findings.filter((finding) => {
        if (finding.step !== event.step) return false;
        return !finding.scenario || !event.scenario || finding.scenario === event.scenario;
      });
      timeline.push({ ...event, events: pending, findings: attachedFindings });
      pending = [];
    } else {
      pending.push(event);
    }
  }

  return { timeline, orphanEvents: pending };
}

export async function readRunDetails(input) {
  const runId = await resolveRunId(input);
  const dir = resolveInside(RUNS_DIR, runId);
  const [storedRun, events, allFindings, traces] = await Promise.all([
    readJson(path.join(dir, 'run.json'), { runId, status: 'unreadable' }),
    readNdjson(path.join(dir, 'events.ndjson')),
    readNdjson(path.join(dir, 'findings.ndjson')),
    readNdjson(path.join(dir, 'traces.ndjson')),
  ]);

  const realFindings = allFindings.filter((finding) => !finding.synthetic);
  const synthetic = allFindings.filter((finding) => finding.synthetic);
  const unique = dedupe(realFindings);
  const steps = events.filter((event) => event.kind === 'step');
  const serverLines = events.filter((event) => event.source === 'server').length;
  const run = {
    runId,
    ...storedRun,
    steps: storedRun.steps ?? steps.length,
    findings: storedRun.findings ?? unique.length,
    findingEvents: storedRun.findingEvents ?? realFindings.length,
    serverLines: storedRun.serverLines ?? serverLines,
  };
  const grouped = buildTimeline(events, realFindings);

  return {
    run,
    events,
    findings: unique,
    findingEvents: realFindings,
    synthetic,
    traces,
    ...grouped,
  };
}

export async function compareRuns(firstId, secondId) {
  const [first, second] = await Promise.all([readRunDetails(firstId), readRunDetails(secondId)]);
  const a = new Map(first.findings.map((finding) => [finding.fingerprint, finding]));
  const b = new Map(second.findings.map((finding) => [finding.fingerprint, finding]));
  const scenariosA = new Set((first.run.scenarios || []).map((scenario) => scenario.name));
  const scenariosB = new Set((second.run.scenarios || []).map((scenario) => scenario.name));

  const warnings = [];
  const onlyA = [...scenariosA].filter((name) => !scenariosB.has(name));
  const onlyB = [...scenariosB].filter((name) => !scenariosA.has(name));
  if (onlyA.length || onlyB.length) warnings.push({ type: 'coverage', onlyA, onlyB });
  if (first.run.device !== second.run.device) warnings.push({ type: 'device', a: first.run.device, b: second.run.device });
  if (first.run.environment !== second.run.environment) warnings.push({ type: 'environment', a: first.run.environment, b: second.run.environment });
  if (first.run.target !== second.run.target) warnings.push({ type: 'target', a: first.run.target, b: second.run.target });

  return {
    first: first.run,
    second: second.run,
    warnings,
    added: [...b.values()].filter((finding) => !a.has(finding.fingerprint)),
    gone: [...a.values()].filter((finding) => !b.has(finding.fingerprint)),
    kept: [...b.values()].filter((finding) => a.has(finding.fingerprint)),
  };
}

async function readTriageState(target) {
  const key = assertSafeSegment(target, 'هدف');
  return (await readJson(path.join(TRIAGE_DIR, `${key}.json`), {})) || {};
}

export async function aggregateTriage(target) {
  const runs = await listRuns({ target, limit: 500 });
  const state = await readTriageState(target);
  const grouped = new Map();

  /**
   * دستگاهِ یک یافته: از خودش، وگرنه از اجرایی که در آن دیده شد.
   *
   * یافته‌های تازه `device` دارند. اجراهای قدیمی که پیش از این فیلد ثبت شده‌اند
   * ندارند، پس `run.device` جبرانش می‌کند — وگرنه تریاژِ تاریخ موجود یک‌شبه
   * «دستگاه نامعلوم» می‌شد.
   */
  const devicesOf = (finding, run) => {
    const own = (finding.devices || []).filter(Boolean);
    return own.length ? own : [run.device].filter(Boolean);
  };

  for (const run of [...runs].reverse()) {
    const detail = await readRunDetails(run.runId);
    for (const finding of detail.findings) {
      const seen = grouped.get(finding.fingerprint);
      if (seen) {
        seen.count += finding.count || 1;
        seen.runs.push(run.runId);
        seen.lastSeen = run.startedAt;
        seen.latest = finding;
        for (const device of devicesOf(finding, run)) {
          if (!seen.devices.includes(device)) seen.devices.push(device);
        }
      } else {
        grouped.set(finding.fingerprint, {
          fingerprint: finding.fingerprint,
          source: finding.source,
          message: finding.message,
          normalized: finding.normalized,
          detail: finding.detail,
          steps: finding.steps || [],
          devices: devicesOf(finding, run),
          count: finding.count || 1,
          runs: [run.runId],
          firstSeen: run.startedAt,
          lastSeen: run.startedAt,
          latest: finding,
        });
      }
    }
  }

  return [...grouped.values()]
    .map((item) => ({ ...item, triage: state[item.fingerprint] || { status: 'open', note: '' } }))
    .sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')));
}

export async function saveTriage(target, fingerprint, patch) {
  const key = assertSafeSegment(target, 'هدف');
  const print = String(fingerprint || '');
  if (!/^[a-f0-9]{12}$/i.test(print)) throw new Error('اثرانگشت نامعتبر است');
  const allowed = new Set(['open', 'acknowledged', 'resolved', 'ignored']);
  const status = String(patch.status || 'open');
  if (!allowed.has(status)) throw new Error('وضعیت تریاژ نامعتبر است');
  const note = String(patch.note || '').slice(0, 4000);

  const locksKey = Symbol.for('userbug.ui.triage-locks');
  const locks = globalThis[locksKey] || new Map();
  globalThis[locksKey] = locks;
  const previous = locks.get(key) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    await fsp.mkdir(TRIAGE_DIR, { recursive: true });
    const file = path.join(TRIAGE_DIR, `${key}.json`);
    const state = (await readJson(file, {})) || {};
    const saved = { status, note, updatedAt: new Date().toISOString() };
    state[print] = saved;
    const temporary = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    try {
      await fsp.writeFile(temporary, JSON.stringify(state, null, 2) + '\n', 'utf8');
      await fsp.rename(temporary, file);
    } finally {
      await fsp.rm(temporary, { force: true }).catch(() => {});
    }
    return saved;
  });
  locks.set(key, operation);

  try {
    return await operation;
  } finally {
    if (locks.get(key) === operation) locks.delete(key);
  }
}

export async function runAsset(runId, relative) {
  const resolved = await resolveRunId(runId);
  return existingFileInside(path.join(RUNS_DIR, resolved), relative);
}
