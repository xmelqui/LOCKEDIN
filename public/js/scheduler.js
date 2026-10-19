// Checks the schedule periodically and fires reminders / anti-procrastination nudges.
import { state, persist, blocksOn, blockStarted } from './store.js';
import { notify } from './notify.js';
import { effectiveOn, elapsedMs } from './timer.js';
import { atTime, dateKey, fmtDuration } from './utils.js';

const MIN = 60_000;
const MAX_NUDGES = 3;

/** Runs `fn` only once per `key` (survives reloads). */
function once(key, fn) {
  if (state.notified[key]) return;
  state.notified[key] = Date.now();
  persist();
  fn();
}

function prune() {
  const limit = Date.now() - 3 * 24 * 60 * MIN;
  for (const [k, ts] of Object.entries(state.notified)) if (ts < limit) delete state.notified[k];
}

export function checkSchedule() {
  const now = Date.now();
  const dk = dateKey();
  const s = state.settings;
  const timer = state.timer;
  const focusing = timer?.mode === 'focus' && !!timer.segmentStart;
  const blocks = blocksOn(dk);

  for (const b of blocks) {
    if (b.done) continue;
    const data = { blockKey: b.key };
    const reminder = (b.reminder ?? s.reminderMin) * MIN;

    if (reminder > 0 && now >= b.startTs - reminder && now < b.startTs) {
      once(`pre:${b.key}`, () =>
        notify(`In ${Math.ceil((b.startTs - now) / MIN)} min: ${b.title}`, `${b.start}–${b.end}. Get what you need ready.`, {
          tag: b.key,
          data,
        }));
    }

    if (now >= b.startTs && now < b.startTs + 5 * MIN && !blockStarted(b)) {
      once(`start:${b.key}`, () =>
        notify(`It's time: ${b.title}`, 'Start, even if just for 5 minutes. Getting going is the hard part.', {
          tag: b.key,
          urgent: true,
          data,
          actions: [{ action: 'start', title: 'Start now' }, { action: 'start5', title: 'Just 5 min' }],
        }));
    }

    // Repeated nudges while the block is in progress and you haven't started.
    if (s.nudgeMin > 0 && now >= b.startTs + s.nudgeMin * MIN && now < b.endTs && !blockStarted(b) && !focusing) {
      const n = Math.floor((now - b.startTs) / (s.nudgeMin * MIN));
      if (n <= MAX_NUDGES) {
        const late = Math.round((now - b.startTs) / MIN);
        once(`nudge${n}:${b.key}`, () =>
          notify('Procrastinating?', `"${b.title}" started ${late} min ago. Open it and take the smallest possible first step.`, {
            tag: b.key,
            urgent: true,
            data,
            actions: [{ action: 'start', title: 'Start now' }, { action: 'start5', title: 'Just 5 min' }],
          }));
      }
    }

    if (now >= b.endTs && now < b.endTs + 15 * MIN) {
      once(`end:${b.key}`, () =>
        notify(`Finished: ${b.title}`, 'Did you get it done? Mark it as done to keep track.', {
          tag: b.key,
          data,
          actions: [{ action: 'done', title: 'Done ✓' }],
        }));
    }
  }

  // Plan your day.
  const planTs = atTime(dk, s.planTime);
  if (now >= planTs && now < planTs + 2 * 60 * MIN && blocks.length === 0) {
    once(`plan:${dk}`, () =>
      notify('Plan your day', "You don't have any blocks today. Reserve at least one for what matters most.", {
        actions: [{ action: 'plan', title: 'Open calendar' }],
      }));
  }

  // Evening summary.
  const sumTs = atTime(dk, s.summaryTime);
  if (now >= sumTs && now < sumTs + 2 * 60 * MIN) {
    once(`summary:${dk}`, () => {
      const eff = effectiveOn(dk);
      const goal = s.dailyGoalMin * MIN;
      const pct = Math.round((eff / goal) * 100);
      notify(
        pct >= 100 ? 'Daily goal reached!' : 'Daily summary',
        `${fmtDuration(eff)} of effective focus (${pct}% of your ${fmtDuration(goal)} goal).`,
      );
    });
  }

  // Forgotten open-ended stopwatch.
  if (timer?.mode === 'focus' && !timer.targetMs && timer.segmentStart && elapsedMs(timer) > 3 * 60 * MIN) {
    once(`stale:${timer.sessionStart}`, () =>
      notify('Still there?', "The stopwatch has been running for over 3 hours. Stop it if you're no longer working.", { urgent: true }));
  }

  prune();
}
