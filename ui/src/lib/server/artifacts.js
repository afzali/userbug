import fsp from 'node:fs/promises';
import path from 'node:path';
import { dedupe } from '../../../../src/observe/oracle.js';
import { healthOf } from '../../../../src/runs/health.js';
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

/**
 * «کدام سفر سالم است، و از کی؟» — برای یک هدف.
 *
 * منطقش در `src/runs/health.js` است، نه اینجا: خط فرمان همان جدول را
 * می‌دهد و دو تعریف از «سبز» یعنی روزی CI و رابط دو حرفِ متفاوت بزنند.
 *
 * @param {string} target
 * @param {{known?: string[]}} [options] نامِ سناریوهای روی دیسک، تا آن‌هایی
 *   که هرگز اجرا نشده‌اند هم ردیف بگیرند
 */
export async function healthFor(target, { known = [] } = {}) {
  const entries = await loadRunIndex();
  const runs = entries
    .filter((entry) => entry.run?.target === target)
    .map((entry) => ({ ...entry.run, runId: entry.run.runId || entry.runId }));
  return healthOf(runs, { known });
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
      // اجرا، گشت، یا خزشِ نقشه — بی این، صفحهٔ گشت نمی‌تواند گشت‌های
      // پیشینش را از اجراهای معمولی جدا کند
      kind: run.kind || 'run',
      // اسمی که آدم روی این بار گذاشته؛ خالی برای اجراهایی که پیش از بنچ بودند
      bench: run.bench || '',
      /**
       * خطایی که اجرا را کشت.
       *
       * بی این، اجرایی با صفر قدم در فهرست می‌نشیند و هیچ نمی‌گوید چرا —
       * و کاربر باید ترمینالی را به یاد بیاورد که بسته شده.
       */
      error: run.error || '',
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
  // رخدادِ «وضعیتِ جمع‌کننده‌ها» خودش خطِ لاگ نیست؛ شمردنش عدد را باد می‌کند
  const serverLines = events.filter(
    (event) => event.kind !== 'collectors' && event.source === 'server'
  ).length;
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

  /**
   * بنچِ یک یافته فقط از اجرا می‌آید، نه از خودش.
   *
   * یافته نمی‌داند در کدام بار دیده شده — همان یافته می‌تواند در سه بنچ
   * تکرار شود. پس اینجا **جمع** می‌شود: «این هنوز در بنچِ پس از اصلاح هم
   * هست» حرفِ متفاوتی است با «فقط یک بار، آن اول، دیده شد».
   */
  const addBench = (list, run) => {
    const name = run.bench || '';
    if (name && !list.includes(name)) list.push(name);
    return list;
  };

  /**
   * «کجا دیده شد» — مکان، در کنارِ زمان و تکرار.
   *
   * ── چرا تا امروز گم می‌شد ──
   *
   * هر یافته از لحظهٔ ثبت `route` دارد (`fixtures.js`، `checks/contract.js`،
   * `checks/run.js`)، ولی این حلقهٔ ادغام کپی‌اش نمی‌کرد. پس تریاژ می‌دانست
   * یک نقص **چند بار** و **در کدام بنچ** دیده شده، و نمی‌دانست **کجا** —
   * و «چه ایرادهایی در بخشِ کتاب هست» بی‌جواب می‌ماند.
   *
   * ── چرا فهرست و نه یک رشته ──
   *
   * `route` جزئی از خودِ fingerprint است، پس معمولاً یکی بیشتر نیست. ولی
   * `checks/invariant.js` عمداً `route: ''` می‌گذارد (ناوردا به صفحه گره
   * نخورده) و هیچ قاعده‌ای تضمین نمی‌کند این برای همیشه بماند. همان الگوی
   * `devices` و `benches`: جمع کن، تا روزی که واگرا شد، دروغ نگوید.
   */
  const addRoute = (list, finding) => {
    const route = String(finding.route || '').trim();
    if (route && !list.includes(route)) list.push(route);
    return list;
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
        addBench(seen.benches, run);
        addRoute(seen.routes, finding);
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
          benches: addBench([], run),
          routes: addRoute([], finding),
          firstSeen: run.startedAt,
          lastSeen: run.startedAt,
          latest: finding,
        });
      }
    }
  }

  return [...grouped.values()]
    .map((item) => {
      const triage = state[item.fingerprint] || { status: 'open', note: '' };
      /**
       * فرضیهٔ «چرا این شد» کنارِ تریاژ می‌نشیند، نه داخلش.
       *
       * `triage` تصمیمِ **آدم** است و `explain` حدسِ **مدل**؛ قاطی کردنشان
       * همان چیزی است که قانونِ `by:` جلویش را می‌گیرد. یک ذخیره‌گاه، دو
       * کلید.
       */
      return { ...item, triage, explain: triage.explain || null, ...regressionOf(item, triage) };
    })
    /**
     * برگشته‌ها اول.
     *
     * ── چرا نه فقط «تازه‌ترین اول» ──
     *
     * نقصی که یک بار رفع اعلام شده و دوباره آمده، مهم‌ترین سطرِ این صفحه
     * است: یعنی یا اصلاح نگرفته یا برگشته. با مرتب‌سازیِ زمانی، همان سطر
     * وسطِ چهل ردیفِ هم‌شکل گم می‌شد.
     */
    .sort(
      (a, b) =>
        Number(b.regressed) - Number(a.regressed) ||
        String(b.lastSeen || '').localeCompare(String(a.lastSeen || ''))
    );
}

/**
 * «گفتم رفع شده، دوباره آمد.»
 *
 * ── چرا این محاسبه لازم بود ──
 *
 * تا امروز تریاژ فقط «الان چه وضعی دارد» را نگه می‌داشت. اگر نقصی را
 * `resolved` می‌کردید و هفتهٔ بعد دوباره پیدا می‌شد، همان ردیفِ سبز سرِ
 * جایش می‌ماند و هیچ‌کس نمی‌فهمید — بدترین حالت، چون **دقیقاً همان چیزی
 * است که باید فریاد بزند**: اصلاح یا نگرفته یا برگشته.
 *
 * محاسبه‌اش ساده است چون داده‌اش از قبل بود: زمانِ آخرین تصمیم
 * (`updatedAt`) در برابر زمانِ آخرین دیده‌شدن.
 *
 * `ignored` هم حساب می‌شود ولی نرم‌تر: «نادیده» یعنی می‌دانیم هست، پس
 * دیده شدنش خبر نیست — مگر اینکه کسی بخواهد بداند هنوز زنده است.
 */
export function regressionOf(item, triage) {
  const decidedAt = Date.parse(triage?.updatedAt || '');
  const seenAt = Date.parse(item?.lastSeen || '');
  if (!Number.isFinite(decidedAt) || !Number.isFinite(seenAt)) return { regressed: false, seenAfterDecision: false };

  const seenAfterDecision = seenAt > decidedAt;
  return {
    seenAfterDecision,
    // فقط «رفع‌شده» برگشت شمرده می‌شود؛ بقیه وضعیت‌ها ادعای رفع ندارند
    regressed: seenAfterDecision && triage?.status === 'resolved',
  };
}

/**
 * ذخیرهٔ فرضیهٔ مدل، بی دست زدن به تصمیمِ آدم.
 *
 * ── چرا تابعِ جدا و نه پرچمی روی `saveTriage` ──
 *
 * `saveTriage` وضعیت و یادداشت و قضاوت را می‌نویسد — همه ساختهٔ آدم. اگر
 * فرضیهٔ مدل از همان در می‌آمد، یک اشتباهِ کوچک کافی بود تا یادداشتِ آدم
 * پاک شود. قانونِ «`by: user` را اتوماسیون بازنویسی نمی‌کند» اینجا به‌شکلِ
 * دو دروازهٔ جدا پیاده می‌شود، نه یک شرط.
 */
export async function saveExplain(target, fingerprint, explain) {
  const key = assertSafeSegment(target, 'هدف');
  const print = String(fingerprint || '');
  if (!/^[a-f0-9]{12}$/i.test(print)) throw new Error('اثرانگشت نامعتبر است');

  await fsp.mkdir(TRIAGE_DIR, { recursive: true });
  const file = path.join(TRIAGE_DIR, `${key}.json`);
  const state = (await readJson(file, {})) || {};
  state[print] = { status: 'open', note: '', ...(state[print] || {}), explain };

  const temporary = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await fsp.writeFile(temporary, JSON.stringify(state, null, 2) + '\n', 'utf8');
    await fsp.rename(temporary, file);
  } finally {
    await fsp.rm(temporary, { force: true }).catch(() => {});
  }
  return explain;
}

export async function saveTriage(target, fingerprint, patch) {
  const key = assertSafeSegment(target, 'هدف');
  const print = String(fingerprint || '');
  if (!/^[a-f0-9]{12}$/i.test(print)) throw new Error('اثرانگشت نامعتبر است');
  const allowed = new Set(['open', 'acknowledged', 'resolved', 'ignored']);
  const status = String(patch.status || 'open');
  if (!allowed.has(status)) throw new Error('وضعیت تریاژ نامعتبر است');
  const note = String(patch.note || '').slice(0, 4000);

  /**
   * برچسبِ قضاوت، جدا از وضعیت.
   *
   * ── چرا فیلدِ تازه و نه استفاده از `ignored` ──
   *
   * `ignored` امروز دو چیزِ متضاد را با هم قاطی می‌کند: «چک اشتباه کرد» و
   * «باگ واقعی است ولی الان کاری نمی‌کنیم». برای حلقهٔ یادگیری این دو
   * سیگنالِ مخالف‌اند — اولی باید چک را خاموش کند و دومی باید در شناخت
   * بماند.
   *
   * پس `status` دست‌نخورده ماند (تریاژِ موجود نباید معنایش عوض شود) و
   * `verdict` کنارش نشست، اختیاری.
   */
  const verdicts = new Set(['false-positive', 'real-bug', 'by-design', 'later']);
  const verdict = patch.verdict && verdicts.has(String(patch.verdict)) ? String(patch.verdict) : null;

  const locksKey = Symbol.for('userbug.ui.triage-locks');
  const locks = globalThis[locksKey] || new Map();
  globalThis[locksKey] = locks;
  const previous = locks.get(key) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    await fsp.mkdir(TRIAGE_DIR, { recursive: true });
    const file = path.join(TRIAGE_DIR, `${key}.json`);
    const state = (await readJson(file, {})) || {};
    const before = state[print] || null;
    const at = new Date().toISOString();
    // فرضیهٔ مدل با تصمیمِ تازهٔ آدم پاک نمی‌شود؛ دو چیزِ جدا در یک فایل‌اند
    const saved = { status, note, updatedAt: at, ...(before?.explain ? { explain: before.explain } : {}) };
    // برچسبِ قبلی می‌ماند مگر اینکه برچسبِ تازه‌ای داده شود
    const keptVerdict = verdict ?? before?.verdict ?? null;
    if (keptVerdict) saved.verdict = keptVerdict;

    /**
     * تاریخچهٔ تصمیم‌ها — افزودنی، نه جایگزین.
     *
     * ── چرا لازم شد ──
     *
     * «رفع شد» و بعد «دوباره پیدا شد» و بعد «این بار واقعاً رفع شد» سه
     * تصمیمِ متفاوت‌اند و هر سه معنا دارند. با نگه داشتنِ فقط آخری، هفتهٔ
     * بعد کسی نمی‌فهمد این نقص بار اول هم رفع اعلام شده بود — و همان است
     * که می‌گوید «به این یکی مشکوک باش».
     *
     * فقط **تغییر** ثبت می‌شود، نه هر ذخیره: کسی که فقط یادداشتش را
     * ویرایش می‌کند، تاریخچه را شلوغ نمی‌کند. و سقفِ بیست، چون این فایل
     * دستی هم خوانده می‌شود.
     */
    const changed =
      !before || before.status !== status || (before.note || '') !== note || (before.verdict || null) !== keptVerdict;
    const history = [...(before?.history || [])];
    if (changed) {
      history.push({ at, status, note: note || '', verdict: keptVerdict || '' });
    }
    if (history.length) saved.history = history.slice(-20);

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

/**
 * حذفِ یک اجرا.
 *
 * ── چرا تا امروز نبود، و چرا باید باشد ──
 *
 * تنها راهِ خلاص شدن از یک اجرای بی‌ارزش، حذفِ **کلِ پروژه** بود — که
 * همه‌چیزِ دیگر را هم می‌برد. یعنی کاربر یا با انبوهی اجرای آزمایشی زندگی
 * می‌کرد، یا چیزی را می‌برید که نمی‌خواست.
 *
 * ── سه محافظ ──
 *
 * شناسه از `resolveRunId` می‌گذرد (پس پیشوندِ مبهم حذف نمی‌کند)، مسیر از
 * `resolveInside` (پس `..` بیرون نمی‌زند)، و اجرای **در جریان** حذف نمی‌شود:
 * پاک کردنِ پوشه‌ای که همین حالا در آن نوشته می‌شود، اجرای زنده را با خطای
 * نامفهوم می‌شکند.
 *
 * وضعیتِ تریاژ دست نمی‌خورد. آن بر پایهٔ اثرانگشت است و به همهٔ اجراها تعلق
 * دارد، نه به این یکی؛ پاک کردنش با حذفِ یک اجرا یعنی از دست دادنِ قضاوتی
 * که روی اجراهای دیگر هم صدق می‌کرد.
 */
export async function deleteRun(input, { isActive } = {}) {
  const runId = await resolveRunId(input);
  if (isActive?.(runId)) throw new Error(`اجرای «${runId}» در جریان است؛ اول متوقفش کنید`);

  const dir = resolveInside(RUNS_DIR, runId);
  await fsp.rm(dir, { recursive: true, force: true });
  return { runId };
}
