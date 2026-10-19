import { state, blocksOn, blockStarted, CATEGORIES, catName } from './store.js';
import { effectiveOn } from './timer.js';
import { $, addDays, dateKey, dowName, escapeHtml, fmtDuration, fmtShort, parseDateKey } from './utils.js';

let range = 7;

function compute(days) {
  const today = new Date();
  const keys = Array.from({ length: days }, (_, i) => dateKey(addDays(today, i - days + 1)));
  const goal = state.settings.dailyGoalMin * 60_000;
  const daily = keys.map((dk) => ({ dk, ms: effectiveOn(dk) }));
  const inRange = state.sessions.filter((s) => s.date >= keys[0] && s.date <= keys[keys.length - 1]);

  const total = daily.reduce((a, d) => a + d.ms, 0);
  const metDays = daily.filter((d) => d.ms >= goal).length;

  // Streak: consecutive days meeting the goal (today counts once it's met).
  let streak = 0;
  for (let i = 0, d = new Date(); i < 3650; i++, d = addDays(d, -1)) {
    const ms = effectiveOn(dateKey(d));
    if (ms >= goal) streak++;
    else if (i > 0) break;
  }

  // Plan adherence: of the blocks that have already ended, how many you started or finished.
  let past = 0;
  let kept = 0;
  for (const dk of keys) {
    for (const b of blocksOn(dk)) {
      if (b.endTs > Date.now()) continue;
      past++;
      if (b.done || blockStarted(b)) kept++;
    }
  }

  const distractions = inRange.reduce((a, s) => a + s.distractions, 0);
  const focusHours = inRange.reduce((a, s) => a + s.effectiveMs, 0) / 3_600_000;

  const byCat = CATEGORIES.map((c) => ({
    ...c,
    ms: inRange.filter((s) => s.category === c.id).reduce((a, s) => a + s.effectiveMs, 0),
  })).filter((c) => c.ms > 0).sort((a, b) => b.ms - a.ms);

  // Hourly profile: spreads each session's effective time across the hours it spans.
  const byHour = Array(24).fill(0);
  for (const s of inRange) {
    const span = s.end - s.start;
    if (span <= 0) continue;
    const ratio = s.effectiveMs / span;
    let t = s.start;
    while (t < s.end) {
      const d = new Date(t);
      const next = Math.min(s.end, new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime());
      byHour[d.getHours()] += (next - t) * ratio;
      t = next;
    }
  }

  return { goal, daily, total, metDays, streak, past, kept, distractions, focusHours, byCat, byHour };
}

function dailyChart(daily, goal) {
  const W = 960, H = 220, P = { l: 44, r: 8, t: 12, b: 28 };
  const maxMs = Math.max(goal * 1.15, ...daily.map((d) => d.ms), 60 * 60_000);
  const maxH = Math.ceil(maxMs / 3_600_000);
  const y = (ms) => P.t + (H - P.t - P.b) * (1 - ms / (maxH * 3_600_000));
  const slot = (W - P.l - P.r) / daily.length;
  const bw = Math.max(4, Math.min(36, slot - 4));
  const step = maxH > 8 ? 2 : 1;
  const grid = [];
  for (let h = 0; h <= maxH; h += step) {
    grid.push(`<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(h * 3_600_000)}" y2="${y(h * 3_600_000)}"/>
      <text class="axis" x="${P.l - 8}" y="${y(h * 3_600_000) + 4}" text-anchor="end">${h}h</text>`);
  }
  const labelEvery = daily.length > 14 ? 5 : 1;
  const bars = daily.map((d, i) => {
    const x = P.l + i * slot + (slot - bw) / 2;
    const top = y(d.ms);
    const h = Math.max(0, y(0) - top);
    const date = parseDateKey(d.dk);
    const r = Math.min(4, bw / 2, h);
    const path = h > 0
      ? `M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y(0)} Z`
      : '';
    return `<g class="bar-g" data-tip="${dowName(date)} ${date.getDate()}: ${fmtDuration(d.ms)}${d.ms >= goal ? ' · goal ✓' : ''}">
      <rect class="hit" x="${P.l + i * slot}" y="${P.t}" width="${slot}" height="${H - P.t - P.b}" />
      ${path ? `<path class="bar-mark ${d.ms >= goal ? 'met' : ''}" d="${path}"/>` : ''}
      ${i % labelEvery === 0 || i === daily.length - 1 ? `<text class="axis" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${daily.length > 7 ? date.getDate() : dowName(date)}</text>` : ''}
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Effective focus per day">
    ${grid.join('')}
    <line class="baseline" x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}"/>
    ${bars}
    <line class="goal" x1="${P.l}" x2="${W - P.r}" y1="${y(goal)}" y2="${y(goal)}"/>
    <text class="goal-label" x="${W - P.r}" y="${y(goal) - 6}" text-anchor="end">Goal ${fmtShort(goal)}</text>
  </svg>`;
}

function hourChart(byHour) {
  const W = 720, H = 160, P = { l: 8, r: 8, t: 8, b: 24 };
  const max = Math.max(...byHour, 1);
  const slot = (W - P.l - P.r) / 24;
  const bw = slot - 4;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Focus by hour of day">
    <line class="baseline" x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}"/>
    ${byHour.map((ms, h) => {
      const bh = ((H - P.t - P.b) * ms) / max;
      const x = P.l + h * slot + 2;
      return `<g class="bar-g" data-tip="${h}:00–${h + 1}:00 · ${fmtDuration(ms)}">
        <rect class="hit" x="${P.l + h * slot}" y="${P.t}" width="${slot}" height="${H - P.t - P.b}" />
        ${ms > 0 ? `<rect class="bar-mark hour" x="${x}" y="${H - P.b - bh}" width="${bw}" height="${bh}" rx="3" style="opacity:${0.35 + 0.65 * (ms / max)}"/>` : ''}
        ${h % 3 === 0 ? `<text class="axis" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${h}h</text>` : ''}
      </g>`;
    }).join('')}
  </svg>`;
}

export function renderStats() {
  const root = $('#view-stats');
  const d = compute(range);
  const avg = d.total / range;
  const adherence = d.past ? Math.round((d.kept / d.past) * 100) : null;
  const dph = d.focusHours > 0 ? (d.distractions / d.focusHours).toFixed(1) : '—';
  const maxCat = Math.max(...d.byCat.map((c) => c.ms), 1);
  const bestHour = d.byHour.some((x) => x > 0) ? d.byHour.indexOf(Math.max(...d.byHour)) : null;

  root.innerHTML = `
    <div class="stats-toolbar">
      <h2>Stats</h2>
      <div class="btn-group" role="radiogroup" aria-label="Range">
        ${[7, 30, 90].map((n) => `<button class="btn btn-sm ${n === range ? 'on' : ''}" data-range="${n}">${n} days</button>`).join('')}
      </div>
    </div>
    <div class="tiles">
      <div class="tile"><span>Total effective focus</span><b>${fmtDuration(d.total)}</b></div>
      <div class="tile"><span>Daily average</span><b>${fmtDuration(avg)}</b></div>
      <div class="tile"><span>Days goal met</span><b>${d.metDays}<small>/${range}</small></b></div>
      <div class="tile"><span>Current streak</span><b>${d.streak} ${d.streak === 1 ? 'day' : 'days'} ${d.streak >= 3 ? '🔥' : ''}</b></div>
      <div class="tile"><span>Plan adherence</span><b>${adherence == null ? '—' : `${adherence}%`}</b><small>${d.kept}/${d.past} blocks started</small></div>
      <div class="tile"><span>Distractions per hour</span><b>${dph}</b></div>
    </div>
    <section class="card">
      <h3 class="card-title">Effective focus per day</h3>
      <div class="chart-wrap">${dailyChart(d.daily, d.goal)}</div>
      <details class="table-view"><summary>View as table</summary>
        <table><thead><tr><th>Day</th><th>Effective focus</th><th>Goal</th></tr></thead><tbody>
        ${d.daily.slice().reverse().map((x) => `<tr><td>${x.dk}</td><td>${fmtDuration(x.ms)}</td><td>${x.ms >= d.goal ? '✓' : ''}</td></tr>`).join('')}
        </tbody></table>
      </details>
    </section>
    <div class="stats-grid">
      <section class="card">
        <h3 class="card-title">By category</h3>
        ${d.byCat.length ? `<ul class="hbars">${d.byCat.map((c) => `
          <li><span class="hb-label"><span class="cat-dot cat-${c.id}"></span>${escapeHtml(catName(c.id))}</span>
          <span class="hb-track"><span class="hb-fill cat-${c.id}" style="width:${(c.ms / maxCat) * 100}%"></span></span>
          <b>${fmtDuration(c.ms)}</b></li>`).join('')}</ul>` : '<p class="empty">No data yet.</p>'}
      </section>
      <section class="card">
        <h3 class="card-title">When are you most productive?</h3>
        <div class="chart-wrap">${hourChart(d.byHour)}</div>
        <p class="hint">${bestHour != null ? `Your best window is around <b>${bestHour}:00</b>. Save your hardest tasks for then.` : 'Log a few sessions to discover your best hours.'}</p>
      </section>
    </div>
    <div class="chart-tip" hidden></div>`;

  root.querySelectorAll('[data-range]').forEach((b) => (b.onclick = () => {
    range = Number(b.dataset.range);
    renderStats();
  }));

  const tip = $('.chart-tip', root);
  root.querySelectorAll('.bar-g').forEach((g) => {
    g.addEventListener('pointerenter', () => {
      tip.textContent = g.dataset.tip;
      tip.hidden = false;
      g.classList.add('hover');
    });
    g.addEventListener('pointermove', (e) => {
      tip.style.left = `${e.clientX + 12}px`;
      tip.style.top = `${e.clientY - 36}px`;
    });
    g.addEventListener('pointerleave', () => {
      tip.hidden = true;
      g.classList.remove('hover');
    });
  });
}
