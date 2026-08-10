// src/usePushNotifications.js
// Hook React : enregistre le service worker et abonne l'utilisateur aux notifications push.

import { useState, useEffect, useCallback } from 'react';

// Clé VAPID_PUBLIC_KEY (déjà configurée côté serveur dans Netlify)
const VAPID_PUBLIC_KEY = 'BOmHG8UHBM-yDZwJ0ChVvKLylAmxnip_T5aVENm1PIpkOUUGnJ59V9bD_5UbRcuyfkmlC8tWIeD_nEBQYfh-4V0';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function usePushNotifications() {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    setIsSupported('serviceWorker' in navigator && 'PushManager' in window);
  }, []);

  useEffect(() => {
    if (!isSupported) return;
    navigator.serviceWorker.register('/sw.js').then(async (registration) => {
      const existingSub = await registration.pushManager.getSubscription();
      setIsSubscribed(!!existingSub);
    });
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) {
      alert("Les notifications push ne sont pas supportées sur cet appareil/navigateur.");
      return;
    }

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== 'granted') return;

    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    await fetch('/.netlify/functions/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });

    setIsSubscribed(true);
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await fetch('/.netlify/functions/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });
      await subscription.unsubscribe();
    }
    setIsSubscribed(false);
  }, []);

  return { permission, isSupported, isSubscribed, subscribe, unsubscribe };
}
