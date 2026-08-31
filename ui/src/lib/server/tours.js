import { EventEmitter } from 'node:events';
import { TourSession } from '../../../../src/tour/session.js';
import { emitTour } from '../../../../src/tour/emit.js';

/**
 * گشت‌های زنده، در پروسهٔ رابط.
 *
 * ── چرا مثل `jobs.js` زیرپروسه نیست ──
 *
 * `jobs.js` پلی‌رایت را با `spawn` صدا می‌زند چون اجرای تست یک فرمان است:
 * شروع می‌شود، خروجی می‌دهد، تمام می‌شود. گشت یک **شیءِ زنده** است که باید
 * دستور بگیرد — «این صفحه را ثبت کن»، «ضبط را خاموش کن» — و زیرپروسه یعنی
 * ساختنِ یک پروتکلِ دوطرفه روی stdio برای چیزی که یک فراخوانی تابع است.
 *
 * بهایش این است که کرشِ مرورگر می‌تواند پروسهٔ رابط را هم بلرزاند. برای همین
 * هر مرزِ ناهمگام اینجا `catch` دارد.
 *
 * ── چرا یک گشت در هر لحظه ──
 *
 * دو مرورگرِ باز روی یک پروژه یعنی دو نفر هم‌زمان دارند شناخت می‌سازند و
 * `pages/` را روی هم می‌نویسند. تا وقتی کسی این را نخواسته، محدودیتِ ساده
 * بهتر از ادغامِ پیچیده است.
 */
const KEY = Symbol.for('userbug.ui.tours');
const state = globalThis[KEY] || { sessions: new Map() };
globalThis[KEY] = state;

/** رخدادهای هر گشت، برای SSE و برای کسی که دیر رسیده. */
class TourHandle extends EventEmitter {
  constructor(session) {
    super();
    this.session = session;
    this.history = [];
    session.on('event', (event) => {
      this.history.push(event);
      if (this.history.length > 800) this.history.splice(0, this.history.length - 800);
      this.emit('event', event);
    });
  }
}

export function getTour(target) {
  return state.sessions.get(target) || null;
}

export function tourState(target) {
  const handle = getTour(target);
  if (!handle) return { running: false };
  return { running: handle.session.status === 'running', ...handle.session.snapshotState() };
}

export async function startTour({ target, device }) {
  const existing = getTour(target);
  if (existing && existing.session.status === 'running') {
    throw new Error('یک گشت روی این پروژه در حال اجراست');
  }

  const session = new TourSession({ target, device });
  const handle = new TourHandle(session);
  state.sessions.set(target, handle);

  try {
    await session.start();
  } catch (cause) {
    state.sessions.delete(target);
    throw cause;
  }
  return handle;
}

/** یک دستور به گشتِ در حال اجرا. */
export async function tourAction(target, action, body = {}) {
  const handle = getTour(target);
  if (!handle || handle.session.status !== 'running') throw new Error('گشتی در حال اجرا نیست');
  const { session } = handle;

  switch (action) {
    case 'note-page':
      await session.notePage({ purpose: body.purpose || '' });
      return tourState(target);
    case 'note':
      await session.note(body.message || '');
      return tourState(target);
    case 'recording':
      session.setRecording(Boolean(body.on));
      return tourState(target);
    case 'remove-step':
      session.removeStep(Number(body.index));
      return tourState(target);
    default:
      throw new Error(`کنشِ ناشناختهٔ گشت: «${action}»`);
  }
}

/**
 * پایان، و نوشتنِ خروجی.
 *
 * ── چرا نوشتن اینجاست و نه در `stop()` ──
 *
 * `TourSession.stop()` مرورگر را می‌بندد و همین. نوشتنِ فایل تصمیمِ لایهٔ
 * بالاتر است: کاربر ممکن است گشتی را بی‌خروجی رها کند (اشتباه شروع کرده)، و
 * جلسه‌ای که همیشه بنویسد، پیش‌نویسِ بی‌ارزش در مخزن جا می‌گذارد.
 */
export async function stopTour(target, { name, discard = false } = {}) {
  const handle = getTour(target);
  if (!handle) throw new Error('گشتی نیست');

  const result = await handle.session.stop('پایان از رابط');
  state.sessions.delete(target);

  if (discard) return { discarded: true, state: result };

  const landing = !name;
  const written = await emitTour({ target, state: result, name, landing });
  return { written, state: result };
}
