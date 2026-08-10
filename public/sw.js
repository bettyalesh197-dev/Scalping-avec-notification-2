// public/sw.js
// Service Worker : reçoit les notifications push et les affiche,
// même si l'app n'est pas ouverte.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Nouveau signal', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || `Signal ${data.pair || ''}`;

  const lines = [];
  if (data.direction) lines.push(data.direction === 'buy' ? '📈 ACHAT' : '📉 VENTE');
  if (data.entry) lines.push(`Entrée: ${data.entry}`);
  if (data.sl) lines.push(`SL: ${data.sl}`);
  if (data.tp1) lines.push(`TP1: ${data.tp1}`);
  if (data.tp2) lines.push(`TP2: ${data.tp2}`);
  if (data.tp3) lines.push(`TP3: ${data.tp3}`);

  const body = lines.length ? lines.join(' | ') : (data.body || 'Nouveau signal disponible');

  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: data.id || 'signal-' + Date.now(),
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      signalId: data.id
    },
    requireInteraction: true // reste affichée jusqu'à interaction (utile pour un signal de trading)
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Au clic sur la notification, ouvre ou remet au premier plan l'app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
