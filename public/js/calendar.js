import { state, blocksOn, sessionsOn, blockStarted } from './store.js';
import { openBlockModal } from './blockModal.js';
import { elapsedMs } from './timer.js';
import { $, addDays, dateKey, dowName, escapeHtml, fmtShort, minToTime, monthName, startOfWeek, timeToMin } from './utils.js';

const HOUR_PX = 52;
let weekStart = startOfWeek(new Date());

/** Assigns lanes to overlapping items: { s, e } → adds lane / lanes. */
function layout(items) {
  items.sort((a, b) => a.s - b.s || b.e - a.e);
  const clusters = [];
  let cur = [];
  let curEnd = -1;
  for (const it of items) {
    if (cur.length && it.s >= curEnd) {
      clusters.push(cur);
      cur = [];
      curEnd = -1;
    }
    cur.push(it);
    curEnd = Math.max(curEnd, it.e);
  }
  if (cur.length) clusters.push(cur);
  for (const c of clusters) {
    const lanes = [];
    for (const it of c) {
      let i = lanes.findIndex((end) => end <= it.s);
      if (i < 0) {
        i = lanes.length;
        lanes.push(it.e);
      } else lanes[i] = it.e;
      it.lane = i;
    }
    c.forEach((it) => (it.lanes = lanes.length));
  }
  return items;
}

export function renderCalendar() {
  const root = $('#view-calendar');
  const prevScroll = root.querySelector('.cal-scroll')?.scrollTop;
  const { dayStartHour: h0, dayEndHour: h1 } = state.settings;
  const hours = Math.max(1, h1 - h0);
  const today = dateKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const last = days[6];
  const label = weekStart.getMonth() === last.getMonth()
    ? `${monthName(last)} ${weekStart.getDate()} – ${last.getDate()}, ${last.getFullYear()}`
    : `${monthName(weekStart)} ${weekStart.getDate()} – ${monthName(last)} ${last.getDate()}, ${last.getFullYear()}`;

  const yFor = (min) => ((min - h0 * 60) / 60) * HOUR_PX;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const cols = days.map((d) => {
    const dk = dateKey(d);
    const blocks = layout(blocksOn(dk).map((b) => ({ ...b, s: timeToMin(b.start), e: timeToMin(b.end) })));
    const past = dk < today;

    const blockHtml = blocks.map((b) => {
      const top = Math.max(0, yFor(b.s));
      const bottom = Math.min(hours * HOUR_PX, yFor(b.e));
      if (bottom <= 0 || top >= hours * HOUR_PX) return '';
      const missed = !b.done && !blockStarted(b) && b.endTs < Date.now();
      const w = 100 / b.lanes;
      return `<button class="cal-block cat-${b.category} ${b.done ? 'is-done' : ''} ${missed ? 'is-missed' : ''}"
        style="top:${top}px;height:${Math.max(18, bottom - top - 2)}px;left:calc(${b.lane * w}% + 2px);width:calc(${w}% - 12px)"
        data-id="${b.id}" data-date="${dk}" title="${escapeHtml(b.title)} · ${b.start}–${b.end}">
        <span class="cal-block-title">${b.done ? '✓ ' : ''}${escapeHtml(b.title)}</span>
        <span class="cal-block-time">${b.start}–${b.end}</span>
      </button>`;
    }).join('');

    // Right-hand strip: actual focus time (what you did vs. what you planned).
    const sessions = sessionsOn(dk).map((s) => ({ s: s.start, e: s.end, cat: s.category, eff: s.effectiveMs, title: s.title }));
    if (state.timer?.mode === 'focus' && dateKey(new Date(state.timer.sessionStart)) === dk) {
      sessions.push({ s: state.timer.sessionStart, e: Date.now(), cat: state.timer.category, eff: elapsedMs(), title: state.timer.title, live: true });
    }
    const sessionHtml = sessions.map((s) => {
      const sd = new Date(s.s);
      const ed = new Date(s.e);
      const sm = sd.getHours() * 60 + sd.getMinutes();
      const em = dateKey(ed) === dk ? ed.getHours() * 60 + ed.getMinutes() : 24 * 60;
      const top = Math.max(0, yFor(sm));
      const bottom = Math.min(hours * HOUR_PX, yFor(Math.max(em, sm + 2)));
      if (bottom <= 0 || top >= hours * HOUR_PX) return '';
      return `<div class="cal-session cat-${s.cat} ${s.live ? 'is-live' : ''}" style="top:${top}px;height:${Math.max(3, bottom - top)}px"
        title="Actual focus: ${escapeHtml(s.title)} · ${fmtShort(s.eff)}"></div>`;
    }).join('');

    const nowLine = dk === today && nowMin >= h0 * 60 && nowMin <= h1 * 60
      ? `<div class="cal-now" style="top:${yFor(nowMin)}px"></div>` : '';

    return `<div class="cal-col ${dk === today ? 'is-today' : ''} ${past ? 'is-past' : ''}">
      <div class="cal-col-body" data-date="${dk}" style="height:${hours * HOUR_PX}px;--hour:${HOUR_PX}px">
        ${blockHtml}${sessionHtml}${nowLine}
      </div>
    </div>`;
  }).join('');

  const heads = days.map((d) => {
    const dk = dateKey(d);
    return `<div class="cal-head ${dk === today ? 'is-today' : ''}"><span>${dowName(d)}</span><strong>${d.getDate()}</strong></div>`;
  }).join('');

  const gutter = Array.from({ length: hours }, (_, i) =>
    `<div class="cal-hour" style="height:${HOUR_PX}px"><span>${minToTime((h0 + i) * 60)}</span></div>`).join('');

  root.innerHTML = `
    <div class="cal-toolbar">
      <div class="btn-group">
        <button class="btn btn-sm" data-nav="-1" aria-label="Previous week">‹</button>
        <button class="btn btn-sm" data-nav="0">Today</button>
        <button class="btn btn-sm" data-nav="1" aria-label="Next week">›</button>
      </div>
      <h2 class="cal-label">${label}</h2>
      <div class="cal-legend"><span class="legend-plan"></span>Plan <span class="legend-real"></span>Actual focus</div>
      <button class="btn btn-primary btn-sm" data-new>+ Block</button>
    </div>
    <div class="cal-scroll">
      <div class="cal-grid">
        <div class="cal-corner"></div>${heads}
        <div class="cal-gutter">${gutter}</div>${cols}
      </div>
    </div>
    <p class="hint">Click an empty slot to create a block. The thin strip on the right of each day shows your actual focus time.</p>`;

  root.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => {
    const n = Number(b.dataset.nav);
    weekStart = n === 0 ? startOfWeek(new Date()) : addDays(weekStart, n * 7);
    renderCalendar();
  }));
  root.querySelector('[data-new]').onclick = () => openBlockModal();
  root.querySelectorAll('.cal-block').forEach((el) => (el.onclick = (e) => {
    e.stopPropagation();
    openBlockModal({ id: el.dataset.id, date: el.dataset.date });
  }));
  root.querySelectorAll('.cal-col-body').forEach((col) => (col.onclick = (e) => {
    if (e.target !== col) return;
    const min = h0 * 60 + Math.floor((e.offsetY / HOUR_PX) * 2) * 30;
    openBlockModal({ date: col.dataset.date, start: minToTime(Math.min(min, 23 * 60)) });
  }));

  // Keep the scroll position across re-renders; the first time, jump to the current hour.
  root.querySelector('.cal-scroll').scrollTop = prevScroll || Math.max(0, yFor(nowMin) - 120);
}
