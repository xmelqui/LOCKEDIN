// Service worker: enables notifications with action buttons and makes the app installable.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const msg = { type: 'notification-click', action: event.action, data: event.notification.data || {} };
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    let client = all[0];
    if (client) {
      await client.focus();
      client.postMessage(msg);
    } else {
      client = await self.clients.openWindow('./#today');
    }
  })());
});
