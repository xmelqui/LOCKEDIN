// Desktop app main process: window, system tray, native Windows
// notifications and launch at login.
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage, nativeTheme, protocol, net, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_ID = 'com.lockedin.app';
const PUBLIC = path.join(__dirname, '..', 'public');
const ICON = path.join(__dirname, 'icon.png');
const START_HIDDEN = process.argv.includes('--hidden');

// A stable, custom origin (app://lockedin) so localStorage persists across versions.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.setAppUserModelId(APP_ID);

let win = null;
let tray = null;
let quitting = false;
let trayHintShown = false;
let timerState = { running: false, paused: false, mode: null };
const liveNotifications = new Set(); // keeps visible notifications from being garbage-collected

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.flashFrame(false);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 560,
    title: 'LockedIn',
    icon: ICON,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121211' : '#f4f4f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      // Timers must stay accurate while the window is hidden in the tray.
      backgroundThrottling: false,
    },
  });
  win.removeMenu();
  win.loadURL('app://lockedin/index.html#today');
  win.once('ready-to-show', () => {
    if (!START_HIDDEN) win.show();
  });
  win.on('focus', () => win.flashFrame(false));
  // Closing the window hides it in the tray: the app keeps reminding you.
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!trayHintShown) {
      trayHintShown = true;
      showNotification({
        title: 'LockedIn is still running',
        body: "It's in the system tray and will keep reminding you. To quit completely: right-click the icon → Quit.",
      });
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

/* ---------- Tray ---------- */

const send = (channel, payload) => win?.webContents.send(channel, payload);

function autostartEnabled() {
  return app.getLoginItemSettings(loginItemOptions()).openAtLogin;
}

function loginItemOptions() {
  // In development, electron.exe needs the app path as an argument.
  const args = app.isPackaged ? ['--hidden'] : [path.resolve(process.argv[1] || '.'), '--hidden'];
  return { path: process.execPath, args };
}

function setAutostart(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, ...loginItemOptions() });
  updateTrayMenu();
  return autostartEnabled();
}

function updateTrayMenu() {
  if (!tray) return;
  const { running, paused, mode } = timerState;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open LockedIn', click: showWindow },
    { type: 'separator' },
    running
      ? { label: paused ? 'Resume' : 'Pause', click: () => send('tray-action', 'toggle-pause') }
      : { label: 'Start quick focus', click: () => { send('tray-action', 'quick-focus'); showWindow(); } },
    ...(running && mode === 'focus' ? [{ label: 'Got distracted (+1)', click: () => send('tray-action', 'distraction') }] : []),
    ...(running ? [{ label: mode === 'focus' ? 'Finish session' : 'Skip break', click: () => send('tray-action', 'stop') }] : []),
    { type: 'separator' },
    { label: 'Launch at Windows startup', type: 'checkbox', checked: autostartEnabled(), click: (item) => setAutostart(item.checked) },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16, quality: 'best' }));
  tray.setToolTip('LockedIn');
  tray.on('click', showWindow);
  updateTrayMenu();
}

/* ---------- Notifications ---------- */

function showNotification({ title, body = '', data = {}, urgent = false, sound = true, actions = [] }) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title,
    body,
    icon: ICON,
    silent: !sound,
    urgency: urgent ? 'critical' : 'normal',
    timeoutType: urgent ? 'never' : 'default',
    actions: actions.map((a) => ({ type: 'button', text: a.title })),
  });
  n.on('click', () => {
    showWindow();
    send('notification-click', { action: '', data });
  });
  n.on('action', (_e, index) => {
    showWindow();
    send('notification-click', { action: actions[index]?.action ?? '', data });
  });
  n.on('close', () => liveNotifications.delete(n));
  liveNotifications.add(n);
  n.show();
  // Urgent reminders flash the taskbar icon until you come back.
  if (urgent && win && !win.isFocused()) win.flashFrame(true);
}

/* ---------- IPC ---------- */

ipcMain.on('notify', (_e, opts) => showNotification(opts));

ipcMain.on('timer-status', (_e, s) => {
  if (!win || !tray) return;
  tray.setToolTip(s.text || 'LockedIn');
  win.setProgressBar(s.running && s.progress != null ? s.progress : -1, { mode: s.paused ? 'paused' : 'normal' });
  const changed = s.running !== timerState.running || s.paused !== timerState.paused || s.mode !== timerState.mode;
  timerState = { running: s.running, paused: s.paused, mode: s.mode };
  if (changed) updateTrayMenu();
});

ipcMain.handle('get-autostart', () => autostartEnabled());
ipcMain.handle('set-autostart', (_e, enabled) => setAutostart(!!enabled));

/* ---------- Lifecycle ---------- */

app.on('second-instance', showWindow);
app.on('before-quit', () => (quitting = true));
app.on('window-all-closed', () => {}); // lives on in the tray

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(PUBLIC, decodeURIComponent(pathname)));
    if (!file.startsWith(PUBLIC)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  createTray();
});
