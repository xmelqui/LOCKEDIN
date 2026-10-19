# LockedIn

A desktop app to beat procrastination: a time-block calendar, a focus timer and reminders that nudge you to actually start. It also tracks your **effective time**, meaning real focus time with pauses left out.

## Install (Windows desktop app)

**[Download LockedIn-Setup.exe](https://github.com/xmelqui/LOCKEDIN/releases/latest/download/LockedIn-Setup.exe)** and run it. It creates shortcuts on the desktop and in the Start menu.

The installer is rebuilt and published automatically to [Releases](https://github.com/xmelqui/LOCKEDIN/releases) on every push to `main`. To publish a new version instead of updating the current one, bump `version` in `package.json`.

- **Closing the window** keeps LockedIn running in the **system tray** (next to the clock), where it keeps reminding you. To quit completely: right-click the icon → *Quit*.
- From the tray icon you can start a quick focus session, pause, log a distraction or finish the session.
- It uses native Windows notifications. Urgent ones **flash the taskbar icon**, and the taskbar icon shows the timer's progress.
- With *Settings → Launch LockedIn when Windows starts*, the app starts minimized to the tray when you turn on your PC.

## Development

```bash
npm install
npm start        # run the desktop app (Electron)
npm run dist     # build the Windows installer locally into dist/
npm run web      # web version at http://localhost:4321 (no Electron)
```

> If `npm start` behaves oddly from a VS Code terminal, make sure the `ELECTRON_RUN_AS_NODE` environment variable is not set.

## Features

- **Today**: suggests the block you should be working on *right now*, with its concrete first step. Includes a focus timer (5/25/50/90 min or open-ended) with pause, a "Got distracted" counter, automatic breaks and a long break every N blocks.
- **Weekly calendar**: planned blocks with a category, recurrence (daily, weekdays or weekly), a reminder and a "first step". A thin strip on each day shows your **actual focus** next to your **plan**. Blocks you never started are shown hatched.
- **Notifications**:
  - a reminder X minutes before each block;
  - "It's time" when a block starts, with *Start now* and *Just 5 min* buttons;
  - **"Procrastinating?"** every N minutes (up to 3 times) if a block is in progress and you haven't started;
  - at the end of a block, so you can mark it as done;
  - when a focus block or a break ends;
  - a plan-your-day reminder if you have no blocks, and an evening summary with your progress toward the daily goal.
- **Stats** (7, 30 or 90 days): effective focus per day against your goal, streak, plan adherence, distractions per hour, breakdown by category, and the hours of the day when you're most productive.
- **Settings and data**: everything is stored locally. You can export and import a JSON backup.

## Limitations

- Reminders only work while LockedIn is running (even if only in the tray). Turn on "Launch when Windows starts" so you don't forget.
- Windows *Do not disturb* can silence notifications.
- Data lives on your computer, in the app's profile. The desktop and web versions **don't share data**: use Export/Import in Settings to move it between them.
- The installer isn't code-signed, so Windows SmartScreen may warn you the first time: *More info → Run anyway*.

## Project structure

```
.github/workflows/   CI: builds the installer and publishes it as a GitHub Release
electron/main.cjs    desktop app: window, tray, native notifications, launch at login
electron/preload.cjs secure bridge between the UI and Windows
server.js            static server for the web version (localhost:4321)
public/
  index.html, styles.css, sw.js, manifest.webmanifest, icon.svg
  js/app.js          bootstrap, routing, notification actions
  js/store.js        state + persistence, recurring blocks
  js/timer.js        focus/break timer and effective time
  js/scheduler.js    reminders and anti-procrastination nudges
  js/notify.js       system notifications, in-app toasts and sound
  js/today.js        Today view
  js/calendar.js     Calendar view
  js/blockModal.js   block editor
  js/stats.js        Stats view
  js/settings.js     Settings view
```
