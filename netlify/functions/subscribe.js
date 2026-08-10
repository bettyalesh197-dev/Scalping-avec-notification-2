// netlify/functions/subscribe.js
// Enregistre (ou supprime) l'abonnement push de l'utilisateur dans Netlify Blobs.

import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return new Response('Method not allowed', { status: 405 });
  }

  const store = getStore('push-subscriptions');

  try {
    const body = await req.json();

    if (req.method === 'DELETE') {
      if (body.endpoint) {
        await store.delete(encodeURIComponent(body.endpoint));
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // POST : enregistrer l'abonnement (objet PushSubscription du navigateur)
    if (!body.endpoint || !body.keys) {
      return new Response(JSON.stringify({ error: 'Abonnement invalide' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await store.setJSON(encodeURIComponent(body.endpoint), body);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
