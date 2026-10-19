import { atTime, dateKey, parseDateKey } from './utils.js';

export const STORAGE_KEY = 'lockedin.v1';
const LEGACY_KEY = 'foco.v1';

export const CATEGORIES = [
  { id: 'work', name: 'Work' },
  { id: 'study', name: 'Study' },
  { id: 'personal', name: 'Personal' },
  { id: 'health', name: 'Health' },
  { id: 'other', name: 'Other' },
];
export const catName = (id) => CATEGORIES.find((c) => c.id === id)?.name ?? 'Other';

// Category ids used by the first (Spanish) version of the app.
const LEGACY_CATEGORIES = { trabajo: 'work', estudio: 'study', salud: 'health', otro: 'other' };
const migrateCat = (id) => LEGACY_CATEGORIES[id] ?? id;

export const REPEATS = [
  { id: 'none', name: 'Does not repeat' },
  { id: 'daily', name: 'Every day' },
  { id: 'weekdays', name: 'Weekdays (Mon–Fri)' },
  { id: 'weekly', name: 'Every week' },
];

const DEFAULTS = {
  blocks: [],
  sessions: [],
  timer: null,
  notified: {},
  settings: {
    dailyGoalMin: 240,
    focusMin: 25,
    breakMin: 5,
    longBreakMin: 15,
    longBreakEvery: 4,
    autoBreak: true,
    reminderMin: 10,
    nudgeMin: 5,
    dayStartHour: 7,
    dayEndHour: 23,
    planTime: '09:00',
    summaryTime: '21:00',
    sound: true,
  },
};

function normalize(s) {
  const base = structuredClone(DEFAULTS);
  const out = { ...base, ...s, settings: { ...base.settings, ...s.settings } };
  out.blocks.forEach((b) => (b.category = migrateCat(b.category)));
  out.sessions.forEach((x) => (x.category = migrateCat(x.category)));
  if (out.timer?.category) out.timer.category = migrateCat(out.timer.category);
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    return raw ? normalize(JSON.parse(raw)) : structuredClone(DEFAULTS);
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const state = load();

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);

/** Saves without re-rendering (for internal changes such as the notification log). */
export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Could not save', e);
  }
}

/** Saves and re-renders the UI. */
export function save() {
  persist();
  listeners.forEach((fn) => fn());
}

export function replaceState(next) {
  Object.assign(state, normalize(next));
  save();
}

export function resetState() {
  replaceState(structuredClone(DEFAULTS));
}

/* ---------- Blocks (with recurrence) ---------- */

function occursOn(b, dk) {
  if (dk < b.date || b.skipDates?.includes(dk)) return false;
  if (b.repeat === 'none' || !b.repeat) return dk === b.date;
  if (b.repeat === 'daily') return true;
  const dow = parseDateKey(dk).getDay();
  if (b.repeat === 'weekdays') return dow >= 1 && dow <= 5;
  if (b.repeat === 'weekly') return dow === parseDateKey(b.date).getDay();
  return false;
}

/** Block instances that occur on day `dk`, sorted by time. */
export function blocksOn(dk) {
  return state.blocks
    .filter((b) => occursOn(b, dk))
    .map((b) => ({
      ...b,
      baseDate: b.date,
      date: dk,
      key: `${b.id}@${dk}`,
      done: (b.doneDates || []).includes(dk),
      startTs: atTime(dk, b.start),
      endTs: atTime(dk, b.end),
    }))
    .sort((a, b) => a.startTs - b.startTs);
}

export const findBlock = (id) => state.blocks.find((b) => b.id === id);

export function instanceByKey(key) {
  if (!key) return null;
  const [id, dk] = key.split('@');
  return blocksOn(dk).find((i) => i.id === id) || null;
}

export function toggleDone(key, value) {
  const [id, dk] = key.split('@');
  const b = findBlock(id);
  if (!b) return;
  const set = new Set(b.doneDates || []);
  const done = value ?? !set.has(dk);
  done ? set.add(dk) : set.delete(dk);
  b.doneDates = [...set];
  save();
}

/** Logged focus sessions that started on day `dk`. */
export function sessionsOn(dk) {
  return state.sessions.filter((s) => s.date === dk);
}

export const blockStarted = (inst) =>
  state.sessions.some((s) => s.blockKey === inst.key) ||
  (state.timer?.mode === 'focus' && state.timer.blockKey === inst.key);

export const todayKey = () => dateKey();
