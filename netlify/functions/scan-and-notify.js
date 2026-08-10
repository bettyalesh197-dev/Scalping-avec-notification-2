// netlify/functions/scan-and-notify.js
// Fonction planifiée (scheduled function) : tourne toutes les 5 minutes,
// détecte les signaux via la logique existante (signal-logic.js), et
// envoie une notification push si un NOUVEAU signal apparaît.

import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { detectSignal } from './signal-logic.js';

const INSTRUMENT = process.env.INSTRUMENT || 'XAU_USD';

export const config = {
  schedule: '*/5 * * * *' // toutes les 5 minutes — ajuste selon ton besoin et ton plan Netlify
};

export default async (req) => {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  // 1. Détecter un signal avec la vraie logique (S/R + RSI + ATR sur OANDA)
  let signal;
  try {
    signal = await detectSignal(INSTRUMENT);
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500 });
  }

  if (!signal) {
    return new Response(JSON.stringify({ ok: true, message: 'Aucun signal' }));
  }

  // 2. Anti-doublon : ne pas renvoyer le même signal deux fois
  const lastSignalStore = getStore('last-signal');
  const lastSignal = await lastSignalStore.get(INSTRUMENT, { type: 'json' });

  if (lastSignal && lastSignal.id === signal.id) {
    return new Response(JSON.stringify({ ok: true, message: 'Signal déjà notifié' }));
  }

  await lastSignalStore.setJSON(INSTRUMENT, signal);

  // 3. Récupérer tous les abonnements push enregistrés et notifier
  const subsStore = getStore('push-subscriptions');
  const { blobs } = await subsStore.list();

  const payload = JSON.stringify({
    id: signal.id,
    title: `Signal ${signal.pair}`,
    pair: signal.pair,
    direction: signal.direction,
    entry: signal.entry,
    sl: signal.sl,
    tp1: signal.tp1,
    tp2: signal.tp2,
    url: '/'
  });

  const results = await Promise.allSettled(
    blobs.map(async (blob) => {
      const subscription = await subsStore.get(blob.key, { type: 'json' });
      if (!subscription) return;
      try {
        await webpush.sendNotification(subscription, payload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await subsStore.delete(blob.key);
        }
        throw err;
      }
    })
  );

  return new Response(
    JSON.stringify({ ok: true, sent: results.filter(r => r.status === 'fulfilled').length })
  );
};
