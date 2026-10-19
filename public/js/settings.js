import { state, save, replaceState, resetState } from './store.js';
import { desktop, notify, permission, requestPermission } from './notify.js';
import { $, dateKey } from './utils.js';

const FIELDS = [
  { key: 'dailyGoalMin', label: 'Daily effective focus goal', unit: 'min', type: 'number', min: 15, max: 960, step: 15 },
  { key: 'focusMin', label: 'Focus block length', unit: 'min', type: 'number', min: 5, max: 180 },
  { key: 'breakMin', label: 'Short break', unit: 'min', type: 'number', min: 1, max: 60 },
  { key: 'longBreakMin', label: 'Long break', unit: 'min', type: 'number', min: 5, max: 90 },
  { key: 'longBreakEvery', label: 'Long break every', unit: 'blocks', type: 'number', min: 2, max: 10 },
  { key: 'autoBreak', label: 'Start breaks automatically', type: 'checkbox' },
  { key: 'reminderMin', label: 'Remind me before each block', unit: 'min', type: 'number', min: 0, max: 240 },
  { key: 'nudgeMin', label: "Nudge me if I haven't started, every", unit: 'min (0 = never)', type: 'number', min: 0, max: 60 },
  { key: 'planTime', label: 'Plan-your-day reminder', type: 'time' },
  { key: 'summaryTime', label: 'Daily summary', type: 'time' },
  { key: 'dayStartHour', label: 'Calendar starts at', unit: 'h', type: 'number', min: 0, max: 23 },
  { key: 'dayEndHour', label: 'Calendar ends at', unit: 'h', type: 'number', min: 1, max: 24 },
  { key: 'sound', label: 'Notification sound', type: 'checkbox' },
];

export function renderSettings() {
  const root = $('#view-settings');
  const s = state.settings;
  const perm = permission();
  const permText = {
    granted: 'Enabled',
    denied: 'Blocked: enable them in your browser site settings (padlock icon).',
    default: 'Not enabled',
    unsupported: "This browser doesn't support notifications.",
  }[perm];

  root.innerHTML = `
    <h2>Settings</h2>
    <section class="card">
      <h3 class="card-title">Notifications</h3>
      ${desktop ? `
        <p>Status: <b>Windows notifications enabled</b></p>
        <label class="setting check"><input type="checkbox" data-autostart /> <span>Launch LockedIn when Windows starts (in the background, in the tray)</span></label>
        <div class="btn-row"><button class="btn" data-test>Send test notification</button></div>
        <p class="hint">Closing the window doesn't quit the app: it keeps running in the system tray and keeps reminding you. To quit completely, right-click its icon → <i>Quit</i>. If notifications don't show up, make sure Windows <i>Do not disturb</i> is off.</p>` : `
        <p>Status: <b>${permText}</b></p>
        <div class="btn-row">
          ${perm === 'default' ? '<button class="btn btn-primary" data-perm>Enable notifications</button>' : ''}
          <button class="btn" data-test>Send test notification</button>
        </div>
        <p class="hint">Keep the app open (it can be minimized or in another tab). On Windows, make sure <i>Focus assist / Do not disturb</i> isn't silencing your browser.</p>`}
    </section>
    <section class="card">
      <h3 class="card-title">Preferences</h3>
      <form class="settings-form" id="settings-form">
        ${FIELDS.map((f) => f.type === 'checkbox'
          ? `<label class="setting check"><input type="checkbox" name="${f.key}" ${s[f.key] ? 'checked' : ''}/> <span>${f.label}</span></label>`
          : `<label class="setting"><span>${f.label}</span>
              <span class="setting-input"><input type="${f.type}" name="${f.key}" value="${s[f.key]}" ${f.min != null ? `min="${f.min}" max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''} required/>${f.unit ? `<small>${f.unit}</small>` : ''}</span>
            </label>`).join('')}
        <p class="saved-msg" hidden>Saved ✓</p>
      </form>
    </section>
    <section class="card">
      <h3 class="card-title">Your data</h3>
      <p class="hint">Everything is stored only on ${desktop ? 'this computer' : 'this browser'}. Export a backup every now and then.</p>
      <div class="btn-row">
        <button class="btn" data-export>Export backup (.json)</button>
        <label class="btn">Import backup<input type="file" accept="application/json" data-import hidden/></label>
        <button class="btn btn-danger" data-reset>Delete everything</button>
      </div>
    </section>`;

  const form = $('#settings-form', root);
  form.addEventListener('change', (e) => {
    const el = e.target;
    const f = FIELDS.find((x) => x.key === el.name);
    if (!f) return;
    if (f.type === 'checkbox') s[f.key] = el.checked;
    else if (f.type === 'number') {
      if (!el.checkValidity()) return el.reportValidity();
      s[f.key] = Number(el.value);
    } else s[f.key] = el.value;
    if (s.dayEndHour <= s.dayStartHour) s.dayEndHour = Math.min(24, s.dayStartHour + 1);
    save();
    const msg = $('.saved-msg', root);
    msg.hidden = false;
    setTimeout(() => (msg.hidden = true), 1500);
  });

  const auto = root.querySelector('[data-autostart]');
  if (auto) {
    desktop.getAutostart().then((v) => (auto.checked = v));
    auto.onchange = async () => (auto.checked = await desktop.setAutostart(auto.checked));
  }

  root.querySelector('[data-perm]')?.addEventListener('click', async () => {
    await requestPermission();
    renderSettings();
  });
  root.querySelector('[data-test]').onclick = () =>
    notify("This is what your reminders look like", desktop ? "If you see this in the corner of your screen, you're all set." : "If you also see this outside the browser, you're all set.", {
      actions: [{ action: 'noop', title: 'Got it' }],
    });

  root.querySelector('[data-export]').onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lockedin-backup-${dateKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  root.querySelector('[data-import]').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.blocks) || !Array.isArray(data.sessions)) throw new Error('Invalid format');
      if (!confirm('This will replace your current data. Continue?')) return;
      replaceState(data);
      notify('Backup imported', `${data.blocks.length} blocks and ${data.sessions.length} sessions.`);
    } catch (err) {
      alert(`Could not import: ${err.message}`);
    }
  };
  root.querySelector('[data-reset]').onclick = () => {
    if (confirm('Delete ALL blocks, sessions and settings? This cannot be undone.')) resetState();
  };
}
