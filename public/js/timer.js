import { state, save, sessionsOn } from './store.js';
import { notify } from './notify.js';
import { dateKey, fmtDuration, uid } from './utils.js';

const MIN_SESSION_MS = 60_000; // sessions shorter than 1 minute are not logged

export const isRunning = () => !!state.timer?.segmentStart;

export function elapsedMs(t = state.timer) {
  if (!t) return 0;
  return t.accumulatedMs + (t.segmentStart ? Date.now() - t.segmentStart : 0);
}

export function remainingMs(t = state.timer) {
  if (!t?.targetMs) return null;
  return t.targetMs - elapsedMs(t);
}

/** Effective time (real focus, excluding pauses) for a day, including the running session. */
export function effectiveOn(dk) {
  let ms = sessionsOn(dk).reduce((a, s) => a + s.effectiveMs, 0);
  const t = state.timer;
  if (t?.mode === 'focus' && dateKey(new Date(t.sessionStart)) === dk) ms += elapsedMs(t);
  return ms;
}

export const pomodorosToday = () =>
  sessionsOn(dateKey()).filter((s) => s.completed).length;

/**
 * Starts a focus session. `minutes` = 0/null → open-ended stopwatch.
 */
export function startFocus({ title, category = 'other', blockKey = null, minutes = state.settings.focusMin } = {}) {
  if (state.timer) finish({ silent: true });
  const now = Date.now();
  state.timer = {
    mode: 'focus',
    title: title?.trim() || 'Focus session',
    category,
    blockKey,
    sessionStart: now,
    segmentStart: now,
    accumulatedMs: 0,
    targetMs: minutes ? minutes * 60_000 : null,
    distractions: 0,
    pauses: 0,
  };
  save();
}

export function startBreak(minutes) {
  if (state.timer) finish({ silent: true });
  const long = (pomodorosToday() % state.settings.longBreakEvery === 0) && pomodorosToday() > 0;
  const mins = minutes ?? (long ? state.settings.longBreakMin : state.settings.breakMin);
  const now = Date.now();
  state.timer = {
    mode: 'break',
    title: long ? 'Long break' : 'Break',
    sessionStart: now,
    segmentStart: now,
    accumulatedMs: 0,
    targetMs: mins * 60_000,
    distractions: 0,
    pauses: 0,
  };
  save();
}

export function pause() {
  const t = state.timer;
  if (!t?.segmentStart) return;
  t.accumulatedMs = elapsedMs(t);
  t.segmentStart = null;
  t.pauses += 1;
  save();
}

export function resume() {
  const t = state.timer;
  if (!t || t.segmentStart) return;
  t.segmentStart = Date.now();
  save();
}

export function logDistraction() {
  if (state.timer?.mode !== 'focus') return;
  state.timer.distractions += 1;
  save();
}

/** Ends the current session and logs it (if it is a focus session long enough to count). */
export function finish({ completed = false, silent = false } = {}) {
  const t = state.timer;
  if (!t) return null;
  let session = null;
  if (t.mode === 'focus') {
    const effectiveMs = completed && t.targetMs ? t.targetMs : elapsedMs(t);
    if (effectiveMs >= MIN_SESSION_MS) {
      const end = Date.now();
      session = {
        id: uid(),
        title: t.title,
        category: t.category,
        blockKey: t.blockKey,
        date: dateKey(new Date(t.sessionStart)),
        start: t.sessionStart,
        end,
        effectiveMs,
        pausedMs: Math.max(0, end - t.sessionStart - effectiveMs),
        distractions: t.distractions,
        pauses: t.pauses,
        completed,
      };
      state.sessions.push(session);
    } else if (!silent) {
      notify('Session discarded', 'It lasted less than a minute. Make the next one count!');
    }
  }
  state.timer = null;
  save();
  return session;
}

/** Called every second: detects the end of a focus block or a break. */
export function tick() {
  const t = state.timer;
  if (!t?.targetMs || !t.segmentStart || elapsedMs(t) < t.targetMs) return;

  if (t.mode === 'focus') {
    const s = finish({ completed: true });
    const n = pomodorosToday();
    notify('Focus block complete! 🎉', `${fmtDuration(s?.effectiveMs ?? 0)} on "${t.title}". That's ${n} today. Time for a break.`, {
      tag: 'timer',
      urgent: true,
      actions: [{ action: 'break', title: 'Take a break' }, { action: 'again', title: 'Another block' }],
      data: { title: t.title, category: t.category, blockKey: t.blockKey },
    });
    if (state.settings.autoBreak) startBreak();
  } else {
    finish();
    notify('Break is over', 'Get back to it while you still have momentum.', {
      tag: 'timer',
      urgent: true,
      actions: [{ action: 'focus', title: 'Start focusing' }],
    });
  }
}
