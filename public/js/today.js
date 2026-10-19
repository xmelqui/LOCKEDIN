import { state, save, blocksOn, sessionsOn, blockStarted, toggleDone, CATEGORIES, catName } from './store.js';
import { openBlockModal } from './blockModal.js';
import { startFocus, startBreak, pause, resume, finish, logDistraction, elapsedMs, remainingMs, effectiveOn, pomodorosToday } from './timer.js';
import { $, dateKey, escapeHtml, fmtClock, fmtDuration, fmtHour, fmtDayLong } from './utils.js';

const DURATIONS = [
  { min: 5, label: '5 min', hint: 'Just get started' },
  { min: 25, label: '25 min' },
  { min: 50, label: '50 min' },
  { min: 90, label: '90 min' },
  { min: 0, label: 'Open' },
];

// Quick-start form state (survives re-renders).
const quick = { title: '', category: 'work', minutes: null };

const RING_R = 88;
const RING_C = 2 * Math.PI * RING_R;

function blockStatus(b) {
  const now = Date.now();
  if (b.done) return { id: 'done', label: 'Done' };
  if (state.timer?.blockKey === b.key) return { id: 'active', label: 'Focusing' };
  if (now < b.startTs) return { id: 'pending', label: 'Upcoming' };
  if (now < b.endTs) return blockStarted(b) ? { id: 'started', label: 'Started' } : { id: 'late', label: 'Not started' };
  return blockStarted(b) ? { id: 'started', label: 'Worked on' } : { id: 'missed', label: 'Missed' };
}

function timerHtml() {
  const t = state.timer;
  const s = state.settings;
  const n = pomodorosToday();
  const filled = n % s.longBreakEvery || (n ? s.longBreakEvery : 0);
  const dots = Array.from({ length: s.longBreakEvery }, (_, i) => `<span class="dot ${i < filled ? 'on' : ''}"></span>`).join('');

  if (!t) {
    const now = Date.now();
    const blocks = blocksOn(dateKey()).filter((b) => !b.done);
    const currentB = blocks.find((b) => now >= b.startTs && now < b.endTs);
    const nextB = blocks.find((b) => b.startTs > now);
    const minutes = quick.minutes ?? s.focusMin;
    const suggest = currentB
      ? `<div class="suggest is-now">
          <span class="eyebrow">Up now · ${currentB.start}–${currentB.end}</span>
          <strong>${escapeHtml(currentB.title)}</strong>
          ${currentB.notes ? `<p>First step: ${escapeHtml(currentB.notes)}</p>` : ''}
          <div class="btn-row">
            <button class="btn btn-primary" data-start-block="${currentB.key}">▶ Start ${s.focusMin} min</button>
            <button class="btn" data-start-block="${currentB.key}" data-min="5">Just 5 min</button>
          </div>
        </div>`
      : nextB
        ? `<div class="suggest"><span class="eyebrow">Next · ${nextB.start}</span><strong>${escapeHtml(nextB.title)}</strong>
            <div class="btn-row"><button class="btn btn-sm" data-start-block="${nextB.key}">Start it early</button></div></div>`
        : '';

    return `
      <h2 class="card-title">What's the one thing you'll do right now?</h2>
      ${suggest}
      <form class="quick" id="quick-form">
        <input name="task" placeholder="Type a specific task…" maxlength="80" value="${escapeHtml(quick.title)}" autocomplete="off" />
        <div class="quick-row">
          <select name="category" aria-label="Category">${CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === quick.category ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
          <div class="chips" role="radiogroup" aria-label="Duration">
            ${DURATIONS.map((d) => `<button type="button" class="chip ${d.min === minutes ? 'on' : ''}" data-dur="${d.min}" title="${d.hint ?? ''}">${d.label}</button>`).join('')}
          </div>
        </div>
        <button class="btn btn-primary btn-lg" type="submit">▶ Start focusing</button>
        <p class="hint">Struggling to start? Pick <b>5 min</b> and commit only to starting. You'll almost always keep going.</p>
      </form>
      <div class="pomos" title="Blocks completed today">${dots}<span>${n} today</span></div>`;
  }

  const paused = !t.segmentStart;
  const modeLabel = paused ? 'Paused' : t.mode === 'focus' ? 'Focus' : t.title;
  return `
    <div class="timer ${t.mode} ${paused ? 'paused' : ''}">
      <span class="mode-chip">${modeLabel}</span>
      <div class="ring">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle class="ring-track" cx="100" cy="100" r="${RING_R}" />
          <circle class="ring-fill" cx="100" cy="100" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}" data-live="ring" />
        </svg>
        <div class="ring-center">
          <span class="clock" data-live="clock">00:00</span>
          <span class="clock-sub" data-live="clock-sub"></span>
        </div>
      </div>
      ${t.mode === 'focus' ? `<h3 class="timer-title">${escapeHtml(t.title)}</h3>` : '<h3 class="timer-title">Get up, stretch, drink some water. No screens.</h3>'}
      ${t.mode === 'focus' ? `<p class="timer-meta">Distractions: <b>${t.distractions}</b> · Pauses: <b>${t.pauses}</b></p>` : ''}
      <div class="btn-row center">
        ${paused ? '<button class="btn btn-primary" data-act="resume">▶ Resume</button>' : '<button class="btn" data-act="pause">❚❚ Pause</button>'}
        ${t.mode === 'focus' ? '<button class="btn" data-act="distraction" title="Log that you got distracted and get back to the task">Got distracted</button>' : ''}
        ${t.mode === 'focus' ? '<button class="btn btn-ghost" data-act="stop">■ Finish</button>' : '<button class="btn btn-ghost" data-act="skip">Skip break</button>'}
      </div>
      <div class="pomos">${dots}<span>${n} today</span></div>
    </div>`;
}

function progressHtml(dk) {
  const s = state.settings;
  const goal = s.dailyGoalMin * 60_000;
  const eff = effectiveOn(dk);
  const blocks = blocksOn(dk);
  const planned = blocks.reduce((a, b) => a + (b.endTs - b.startTs), 0);
  const doneN = blocks.filter((b) => b.done).length;
  const sessions = sessionsOn(dk);
  const distractions = sessions.reduce((a, x) => a + x.distractions, 0) + (state.timer?.distractions ?? 0);
  const pct = Math.min(100, (eff / goal) * 100);
  return `
    <h2 class="card-title">Effective focus today</h2>
    <div class="hero-num"><span data-live="eff">${fmtDuration(eff)}</span><small>of ${fmtDuration(goal)}</small></div>
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}">
      <div class="bar-fill" data-live="bar" style="width:${pct}%"></div>
    </div>
    <div class="kpis">
      <div><span>Planned</span><b>${fmtDuration(planned)}</b></div>
      <div><span>Blocks done</span><b>${doneN}/${blocks.length}</b></div>
      <div><span>Sessions</span><b>${sessions.length}</b></div>
      <div><span>Distractions</span><b>${distractions}</b></div>
    </div>`;
}

function agendaHtml(dk) {
  const blocks = blocksOn(dk);
  const items = blocks.map((b) => {
    const st = blockStatus(b);
    return `<li class="agenda-item status-${st.id}">
      <span class="agenda-time">${b.start}<br><small>${b.end}</small></span>
      <span class="cat-dot cat-${b.category}" title="${catName(b.category)}"></span>
      <button class="agenda-title" data-edit="${b.id}">${escapeHtml(b.title)}</button>
      <span class="status-chip">${st.label}</span>
      <span class="agenda-actions">
        ${!b.done && st.id !== 'active' ? `<button class="btn btn-sm btn-ghost" data-start-block="${b.key}" title="Start focusing">▶</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-toggle="${b.key}" title="${b.done ? 'Mark as not done' : 'Mark as done'}">${b.done ? '↺' : '✓'}</button>
      </span>
    </li>`;
  }).join('');
  return `
    <div class="card-head"><h2 class="card-title">Today's agenda</h2><button class="btn btn-sm" data-new-block>+ Block</button></div>
    ${blocks.length ? `<ul class="agenda">${items}</ul>` : '<p class="empty">No blocks yet. Planning your day in concrete blocks is one of the best ways to beat procrastination.</p>'}`;
}

function sessionsHtml(dk) {
  const list = sessionsOn(dk).slice().reverse();
  return `
    <h2 class="card-title">Today's sessions</h2>
    ${list.length ? `<ul class="sessions">${list.map((s) => `
      <li>
        <span class="cat-dot cat-${s.category}"></span>
        <span class="s-title">${escapeHtml(s.title)}${s.completed ? ' <span title="Block completed">✓</span>' : ''}</span>
        <span class="s-time">${fmtHour(s.start)}–${fmtHour(s.end)}</span>
        <b class="s-eff">${fmtDuration(s.effectiveMs)}</b>
        <button class="btn btn-sm btn-ghost" data-del-session="${s.id}" title="Delete session" aria-label="Delete session">✕</button>
      </li>`).join('')}</ul>` : '<p class="empty">No sessions yet. The first one is always the hardest.</p>'}`;
}

export function renderToday() {
  const root = $('#view-today');
  const dk = dateKey();
  root.innerHTML = `
    <p class="date-line">${fmtDayLong(new Date())}</p>
    <div class="today-grid">
      <section class="card timer-card">${timerHtml()}</section>
      <section class="card">${progressHtml(dk)}</section>
      <section class="card">${agendaHtml(dk)}</section>
      <section class="card">${sessionsHtml(dk)}</section>
    </div>`;
  bind(root);
  updateLive();
}

function bind(root) {
  const form = $('#quick-form', root);
  if (form) {
    form.task.addEventListener('input', (e) => (quick.title = e.target.value));
    form.category.addEventListener('change', (e) => (quick.category = e.target.value));
    form.querySelectorAll('[data-dur]').forEach((b) => (b.onclick = () => {
      quick.minutes = Number(b.dataset.dur);
      form.querySelectorAll('[data-dur]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!quick.title.trim()) {
        form.task.focus();
        form.task.classList.add('shake');
        setTimeout(() => form.task.classList.remove('shake'), 400);
        return;
      }
      startFocus({ title: quick.title, category: quick.category, minutes: quick.minutes ?? state.settings.focusMin });
      quick.title = '';
    };
  }

  root.querySelectorAll('[data-start-block]').forEach((b) => (b.onclick = () => startBlock(b.dataset.startBlock, b.dataset.min ? Number(b.dataset.min) : undefined)));
  root.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = () => toggleDone(b.dataset.toggle)));
  root.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => openBlockModal({ id: b.dataset.edit, date: dateKey() })));
  root.querySelector('[data-new-block]')?.addEventListener('click', () => openBlockModal());
  root.querySelectorAll('[data-del-session]').forEach((b) => (b.onclick = () => {
    if (!confirm('Delete this session from your log?')) return;
    state.sessions = state.sessions.filter((s) => s.id !== b.dataset.delSession);
    save();
  }));

  const acts = { pause, resume, distraction: logDistraction, stop: () => finish(), skip: () => finish() };
  root.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => acts[b.dataset.act]()));
}

export function startBlock(key, minutes) {
  const [id, dk] = key.split('@');
  const b = blocksOn(dk).find((x) => x.id === id);
  if (!b) return;
  startFocus({ title: b.title, category: b.category, blockKey: key, minutes: minutes ?? state.settings.focusMin });
}

export { startBreak };

/** Updates only the numbers that change every second (no full re-render). */
export function updateLive() {
  const t = state.timer;
  const root = $('#view-today');
  const clock = $('[data-live="clock"]', root);
  if (t && clock) {
    const rem = remainingMs(t);
    const el = elapsedMs(t);
    clock.textContent = fmtClock(rem ?? el);
    $('[data-live="clock-sub"]', root).textContent = rem == null ? 'open-ended' : `of ${fmtDuration(t.targetMs)}`;
    const frac = rem == null ? (el % 3_600_000) / 3_600_000 : Math.min(1, el / t.targetMs);
    $('[data-live="ring"]', root).setAttribute('stroke-dashoffset', String(RING_C * (1 - frac)));
  }
  const effEl = $('[data-live="eff"]', root);
  if (effEl) {
    const eff = effectiveOn(dateKey());
    effEl.textContent = fmtDuration(eff);
    $('[data-live="bar"]', root).style.width = `${Math.min(100, (eff / (state.settings.dailyGoalMin * 60_000)) * 100)}%`;
  }
  document.title = t ? `${fmtClock(remainingMs(t) ?? elapsedMs(t))} · ${t.mode === 'focus' ? t.title : 'Break'}` : 'LockedIn';
}
