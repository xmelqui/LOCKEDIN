import { state, subscribe, toggleDone, STORAGE_KEY } from './store.js';
import { desktop, initNotifications, onNotificationClick, permission, requestPermission } from './notify.js';
import { tick, startFocus, startBreak, pause, resume, finish, elapsedMs } from './timer.js';
import { checkSchedule } from './scheduler.js';
import { renderToday, updateLive, startBlock } from './today.js';
import { renderCalendar } from './calendar.js';
import { renderStats } from './stats.js';
import { renderSettings } from './settings.js';
import { $, $$ } from './utils.js';

const VIEWS = {
  today: renderToday,
  calendar: renderCalendar,
  stats: renderStats,
  settings: renderSettings,
};

const currentView = () => {
  const v = location.hash.slice(1);
  return VIEWS[v] ? v : 'today';
};

const isTyping = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

function render() {
  const v = currentView();
  $$('.view').forEach((el) => (el.hidden = el.id !== `view-${v}`));
  $$('.tabs a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${v}`));
  // Don't re-render while the user is editing a settings field (it would lose focus).
  if (v === 'settings' && $('#view-settings').contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  VIEWS[v]();
  $('#perm-banner').hidden = permission() !== 'default';
}

// Actions from notifications (system buttons or in-app toasts).
onNotificationClick(({ action, data = {} }) => {
  switch (action) {
    case 'start':
    case 'start5':
      if (data.blockKey) startBlock(data.blockKey, action === 'start5' ? 5 : undefined);
      location.hash = '#today';
      break;
    case 'done':
      if (data.blockKey) toggleDone(data.blockKey, true);
      break;
    case 'break':
      startBreak();
      break;
    case 'again':
      startFocus({ title: data.title, category: data.category, blockKey: data.blockKey });
      location.hash = '#today';
      break;
    case 'focus':
      location.hash = '#today';
      break;
    case 'plan':
      location.hash = '#calendar';
      break;
    default:
      if (data.blockKey) location.hash = '#today';
  }
});

// Actions from the tray icon menu (desktop only).
desktop?.onTrayAction((action) => {
  const t = state.timer;
  if (action === 'quick-focus' && !t) {
    location.hash = '#today';
    startFocus({ title: 'Quick session' });
  } else if (action === 'toggle-pause' && t) {
    t.segmentStart ? pause() : resume();
  } else if (action === 'stop' && t) {
    finish();
  }
});

/** Reports the timer state to the taskbar / tray. */
function reportTimer() {
  if (!desktop) return;
  const t = state.timer;
  desktop.timerStatus({
    running: !!t,
    paused: !!t && !t.segmentStart,
    mode: t?.mode ?? null,
    text: t ? document.title : 'LockedIn · no active session',
    progress: t?.targetMs ? Math.min(1, elapsedMs(t) / t.targetMs) : t ? 2 : null, // 2 = indeterminate
  });
}

subscribe(render);
window.addEventListener('hashchange', render);
$('#perm-banner button').addEventListener('click', async () => {
  await requestPermission();
  render();
});

// If another tab changes the data, reload so we don't overwrite it.
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) location.reload();
});

let lastMinute = -1;
setInterval(() => {
  tick();
  updateLive();
  reportTimer();
  const now = new Date();
  // Re-render every minute (block status, "now" line, day change).
  if (now.getMinutes() !== lastMinute) {
    lastMinute = now.getMinutes();
    if (currentView() !== 'settings' && !document.querySelector('dialog[open]') && !isTyping()) render();
  }
}, 1000);

setInterval(checkSchedule, 20_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    tick();
    checkSchedule();
  }
});

await initNotifications();
render();
tick();
checkSchedule();

// Exposed for debugging from the console.
window.lockedin = { state };
