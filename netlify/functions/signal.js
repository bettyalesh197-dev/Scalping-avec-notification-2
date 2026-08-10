// netlify/functions/signal.js
//
// Serveur intermédiaire entre le front et l'API OANDA v20.
// Garde le token OANDA côté serveur (jamais exposé au navigateur),
// calcule les indicateurs (RSI, ATR, zones S/R) et renvoie soit un
// signal d'entrée avec SL + 2 TP, soit `null` si aucune configuration
// valide n'est présente sur la dernière bougie.
//
// La logique de calcul est dans signal-logic.js, partagée avec
// scan-and-notify.js (qui envoie les notifications push).
//
// Variables d'environnement à définir sur Netlify :
//   OANDA_API_KEY   -> ton token d'accès (compte practice/démo)
//   OANDA_ENV       -> "practice" (défaut) ou "live"
//   INSTRUMENT      -> "XAU_USD" (défaut)

import { fetchCandles, buildSignal } from "./signal-logic.js";

const INSTRUMENT = process.env.INSTRUMENT || "XAU_USD";
const GRANULARITY = "M1";
const RSI_PERIOD = 14;
const ATR_PERIOD = 14;
const PIVOT_LOOKBACK = 3;

export default async function handler() {
  try {
    if (!process.env.OANDA_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OANDA_API_KEY manquant côté serveur." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    const candles = await fetchCandles(INSTRUMENT);
    if (candles.length < Math.max(RSI_PERIOD, ATR_PERIOD) + PIVOT_LOOKBACK + 1) {
      return new Response(
        JSON.stringify({ error: "Pas assez de bougies reçues d'OANDA." }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
    const result = buildSignal(candles);
    return new Response(
      JSON.stringify({
        instrument: INSTRUMENT,
        granularity: GRANULARITY,
        candles: candles.slice(-60),
        ...result
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export const config = { path: "/.netlify/functions/signal" };
