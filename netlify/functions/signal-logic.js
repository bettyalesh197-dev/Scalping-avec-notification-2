// netlify/functions/signal-logic.js
//
// Logique de détection de signal, extraite de signal.js pour être
// réutilisable à la fois par l'endpoint on-demand (signal.js) et par
// la fonction planifiée qui envoie les notifications (scan-and-notify.js).
//
// Variables d'environnement utilisées :
//   OANDA_API_KEY   -> ton token d'accès (compte practice/démo)
//   OANDA_ENV       -> "practice" (défaut) ou "live"
//   INSTRUMENT      -> "XAU_USD" (défaut)

const GRANULARITY = "M1";
const CANDLE_COUNT = 150;
const RSI_PERIOD = 14;
const ATR_PERIOD = 14;
const PIVOT_LOOKBACK = 3;
const SR_TOLERANCE_ATR = 0.25;
const RSI_OVERSOLD = 35;
const RSI_OVERBOUGHT = 65;

function oandaBaseUrl() {
  return process.env.OANDA_ENV === "live"
    ? "https://api-fxtrade.oanda.com"
    : "https://api-fxpractice.oanda.com";
}

export async function fetchCandles(instrument) {
  const url = `${oandaBaseUrl()}/v3/instruments/${instrument}/candles?granularity=${GRANULARITY}&count=${CANDLE_COUNT}&price=M`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.OANDA_API_KEY}` }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OANDA ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.candles
    .filter((c) => c.complete)
    .map((c) => ({
      time: c.time,
      open: parseFloat(c.mid.o),
      high: parseFloat(c.mid.h),
      low: parseFloat(c.mid.l),
      close: parseFloat(c.mid.c)
    }));
}

export function computeRSI(candles, period) {
  const closes = candles.map((c) => c.close);
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function computeATR(candles, period) {
  const trueRanges = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trueRanges.push(tr);
  }
  return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
}

export function findSRLevels(candles) {
  const highs = [];
  const lows = [];
  for (let i = PIVOT_LOOKBACK; i < candles.length - PIVOT_LOOKBACK; i++) {
    const window = candles.slice(i - PIVOT_LOOKBACK, i + PIVOT_LOOKBACK + 1);
    const cur = candles[i];
    if (cur.high === Math.max(...window.map((c) => c.high))) highs.push(cur.high);
    if (cur.low === Math.min(...window.map((c) => c.low))) lows.push(cur.low);
  }
  return { resistances: highs, supports: lows };
}

export function nearestLevel(levels, price) {
  if (!levels.length) return null;
  return levels.reduce((best, lvl) =>
    Math.abs(lvl - price) < Math.abs(best - price) ? lvl : best
  );
}

export function buildSignal(candles) {
  const last = candles[candles.length - 1];
  const price = last.close;
  const rsi = computeRSI(candles, RSI_PERIOD);
  const atr = computeATR(candles, ATR_PERIOD);
  const { resistances, supports } = findSRLevels(candles.slice(0, -1));

  const support = nearestLevel(supports, price);
  const resistance = nearestLevel(resistances, price);

  let side = null;

  if (
    support !== null &&
    Math.abs(price - support) <= atr * SR_TOLERANCE_ATR &&
    rsi <= RSI_OVERSOLD
  ) {
    side = "BUY";
  }

  if (
    resistance !== null &&
    Math.abs(price - resistance) <= atr * SR_TOLERANCE_ATR &&
    rsi >= RSI_OVERBOUGHT
  ) {
    side = "SELL";
  }

  const indicators = {
    price,
    rsi: Number(rsi.toFixed(2)),
    atr: Number(atr.toFixed(3)),
    nearestSupport: support,
    nearestResistance: resistance,
    time: last.time
  };

  if (!side) return { signal: null, indicators };

  const direction = side === "BUY" ? 1 : -1;
  const entry = price;
  const sl = entry - direction * atr;
  const tp1 = entry + direction * atr;
  const tp2 = entry + direction * atr * 2;

  return {
    signal: {
      side,
      entry: Number(entry.toFixed(2)),
      sl: Number(sl.toFixed(2)),
      tp1: Number(tp1.toFixed(2)),
      tp2: Number(tp2.toFixed(2)),
      reason:
        side === "BUY"
          ? "Rebond sur support + RSI survendu"
          : "Rejet sur résistance + RSI suracheté",
      time: last.time
    },
    indicators
  };
}

// Utilisée par scan-and-notify.js : retourne un signal au format prêt
// pour la notification push, ou `null` si aucune configuration valide.
export async function detectSignal(instrument) {
  const candles = await fetchCandles(instrument);
  if (candles.length < Math.max(RSI_PERIOD, ATR_PERIOD) + PIVOT_LOOKBACK + 1) {
    return null;
  }

  const { signal } = buildSignal(candles);
  if (!signal) return null;

  return {
    id: `${instrument}-${signal.time}-${signal.side}`,
    pair: instrument.replace("_", "/"),
    direction: signal.side === "BUY" ? "buy" : "sell",
    entry: signal.entry,
    sl: signal.sl,
    tp1: signal.tp1,
    tp2: signal.tp2
  };
}
