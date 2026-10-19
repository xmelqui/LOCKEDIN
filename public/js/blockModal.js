import { state, save, CATEGORIES, REPEATS, findBlock, toggleDone } from './store.js';
import { startFocus } from './timer.js';
import { $, dateKey, escapeHtml, minToTime, timeToMin, uid } from './utils.js';

let current = null; // { id?, date } — block being edited

/**
 * Opens the editor. `opts`: { id, date } to edit an existing instance,
 * or { date, start } to create a new one.
 */
export function openBlockModal(opts = {}) {
  const dlg = $('#block-dialog');
  const existing = opts.id ? findBlock(opts.id) : null;
  const date = opts.date || dateKey();
  current = { id: existing?.id, date };

  const start = existing?.start ?? opts.start ?? minToTime(Math.min(Math.ceil((new Date().getHours() * 60 + new Date().getMinutes()) / 30) * 30, 23 * 60));
  const end = existing?.end ?? minToTime(Math.min(timeToMin(start) + 60, 24 * 60 - 1));
  const repeat = existing?.repeat ?? 'none';
  const done = existing?.doneDates?.includes(date);

  dlg.innerHTML = `
    <form method="dialog" class="modal" id="block-form">
      <header class="modal-head">
        <h2>${existing ? 'Edit block' : 'New block'}</h2>
        <button type="button" class="btn btn-ghost btn-sm" data-close aria-label="Close">✕</button>
      </header>
      <label class="field">
        <span>What are you going to do?</span>
        <input name="blockTitle" required maxlength="80" placeholder="e.g. Write the quarterly report" value="${escapeHtml(existing?.title ?? '')}" />
      </label>
      <div class="row-3">
        <label class="field"><span>Date</span><input type="date" name="date" required value="${existing && repeat !== 'none' ? existing.date : date}" /></label>
        <label class="field"><span>From</span><input type="time" name="start" required value="${start}" /></label>
        <label class="field"><span>To</span><input type="time" name="end" required value="${end}" /></label>
      </div>
      <div class="row-3">
        <label class="field"><span>Category</span>
          <select name="category">${CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === (existing?.category ?? 'work') ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Repeat</span>
          <select name="repeat">${REPEATS.map((r) => `<option value="${r.id}" ${r.id === repeat ? 'selected' : ''}>${r.name}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Remind me (min before)</span>
          <input type="number" name="reminder" min="0" max="240" placeholder="${state.settings.reminderMin}" value="${existing?.reminder ?? ''}" />
        </label>
      </div>
      <label class="field">
        <span>Concrete first step <small>(what you'll do in the first 2 minutes)</small></span>
        <textarea name="notes" rows="2" placeholder="e.g. Open the document and write the title">${escapeHtml(existing?.notes ?? '')}</textarea>
      </label>
      <p class="form-error" hidden></p>
      <footer class="modal-foot">
        ${existing ? `
          <div class="foot-left">
            <button type="button" class="btn btn-danger btn-sm" data-delete>${repeat === 'none' ? 'Delete' : 'Delete series'}</button>
            ${repeat !== 'none' ? '<button type="button" class="btn btn-ghost btn-sm" data-skip>Skip this day only</button>' : ''}
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-done>${done ? 'Mark as not done' : 'Mark as done ✓'}</button>
          <button type="button" class="btn btn-sm" data-focus>▶ Focus</button>` : ''}
        <button type="submit" class="btn btn-primary">Save</button>
      </footer>
    </form>`;

  const form = $('#block-form', dlg);
  form.addEventListener('submit', onSubmit);
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  dlg.querySelector('[data-delete]')?.addEventListener('click', () => {
    if (!confirm(repeat === 'none' ? 'Delete this block?' : 'Delete every occurrence of this block?')) return;
    state.blocks = state.blocks.filter((b) => b.id !== current.id);
    save();
    dlg.close();
  });
  dlg.querySelector('[data-skip]')?.addEventListener('click', () => {
    const b = findBlock(current.id);
    b.skipDates = [...(b.skipDates || []), current.date];
    save();
    dlg.close();
  });
  dlg.querySelector('[data-done]')?.addEventListener('click', () => {
    toggleDone(`${current.id}@${current.date}`);
    dlg.close();
  });
  dlg.querySelector('[data-focus]')?.addEventListener('click', () => {
    const b = findBlock(current.id);
    startFocus({ title: b.title, category: b.category, blockKey: `${b.id}@${current.date}` });
    dlg.close();
    location.hash = '#today';
  });

  dlg.showModal();
  form.blockTitle.focus();
}

function onSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const err = $('.form-error', f);
  if (timeToMin(f.end.value) <= timeToMin(f.start.value)) {
    err.textContent = 'The end time must be after the start time.';
    err.hidden = false;
    return;
  }
  const data = {
    title: f.blockTitle.value.trim(),
    date: f.date.value,
    start: f.start.value,
    end: f.end.value,
    category: f.category.value,
    repeat: f.repeat.value,
    reminder: f.reminder.value === '' ? null : Number(f.reminder.value),
    notes: f.notes.value.trim(),
  };
  if (current.id) {
    Object.assign(findBlock(current.id), data);
  } else {
    state.blocks.push({ id: uid(), doneDates: [], skipDates: [], ...data });
  }
  save();
  $('#block-dialog').close();
}
