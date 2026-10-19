// Secure bridge between the (web) UI and the Electron main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lockedinDesktop', {
  notify: (opts) => ipcRenderer.send('notify', opts),
  onNotificationClick: (cb) => ipcRenderer.on('notification-click', (_e, msg) => cb(msg)),
  onTrayAction: (cb) => ipcRenderer.on('tray-action', (_e, action) => cb(action)),
  timerStatus: (status) => ipcRenderer.send('timer-status', status),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),
});
