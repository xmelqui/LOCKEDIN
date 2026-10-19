import { state } from './store.js';
import { escapeHtml } from './utils.js';

let swReg = null;
const clickHandlers = new Set();

/** Bridge to the desktop app (Electron); `undefined` in the browser. */
export const desktop = window.lockedinDesktop;

export async function initNotifications() {
  if (desktop) {
    desktop.onNotificationClick((msg) => clickHandlers.forEach((fn) => fn(msg)));
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register('sw.js');
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'notification-click') clickHandlers.forEach((fn) => fn(e.data));
    });
  } catch (e) {
    console.warn('Service worker unavailable', e);
  }
}

/** Called when the user clicks a notification (or one of its buttons). */
export const onNotificationClick = (fn) => clickHandlers.add(fn);

export const permission = () => {
  if (desktop) return 'granted';
  return 'Notification' in window ? Notification.permission : 'unsupported';
};

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

/**
 * Shows an in-app toast and, when allowed, a system notification.
 * `actions`: [{ action, title }] — shown as buttons where the platform supports them.
 */
export function notify(title, body = '', { tag, actions = [], data = {}, urgent = false } = {}) {
  toast(title, body, actions, data);
  if (desktop) {
    // Native Windows notification (with its own sound).
    desktop.notify({ title, body, data, urgent, sound: state.settings.sound, actions: actions.slice(0, 2) });
    return;
  }
  if (state.settings.sound) beep(urgent);
  if (permission() !== 'granted') return;
  const opts = {
    body,
    tag,
    renotify: !!tag,
    icon: 'icon.svg',
    requireInteraction: urgent,
    data,
    actions: actions.slice(0, 2),
  };
  if (swReg) {
    swReg.showNotification(title, opts).catch(() => new Notification(title, opts));
  } else {
    const { actions: _a, ...plain } = opts;
    const n = new Notification(title, plain);
    n.onclick = () => {
      window.focus();
      clickHandlers.forEach((fn) => fn({ action: '', data }));
    };
  }
}

/* ---------- In-app toasts ---------- */

function toast(title, body, actions, data) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `
    <div class="toast-text"><strong>${escapeHtml(title)}</strong>${body ? `<span>${escapeHtml(body)}</span>` : ''}</div>
    <div class="toast-actions">
      ${actions.map((a) => `<button class="btn btn-sm" data-action="${escapeHtml(a.action)}">${escapeHtml(a.title)}</button>`).join('')}
      <button class="btn btn-sm btn-ghost" data-close aria-label="Close">✕</button>
    </div>`;
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.action) clickHandlers.forEach((fn) => fn({ action: btn.dataset.action, data }));
    el.remove();
  });
  box.prepend(el);
  setTimeout(() => el.remove(), actions.length ? 30000 : 8000);
}

/* ---------- Sound ---------- */

let audioCtx = null;
// Browsers only allow audio after a user interaction.
window.addEventListener('pointerdown', () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}, { passive: true });

export function beep(urgent = false) {
  if (!audioCtx) return;
  const notes = urgent ? [880, 660, 880] : [660, 880];
  notes.forEach((freq, i) => {
    const t = audioCtx.currentTime + i * 0.18;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.17);
  });
}
