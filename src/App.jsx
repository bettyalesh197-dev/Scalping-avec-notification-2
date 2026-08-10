import { useEffect, useRef, useState, useCallback } from 'react';
import { usePushNotifications } from './usePushNotifications';

const POLL_INTERVAL_MS = 15000;
const PAIR_LABEL = 'XAU / USD';

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function NotifCard({ isSupported, isSubscribed, subscribe, unsubscribe }) {
  let title = 'Notifications';
  let sub = 'Reçois le signal même app fermée';
  if (!isSupported) sub = "Non supporté sur ce navigateur/appareil";
  if (isSubscribed) sub = 'Actives — tu recevras les signaux en push';

  return (
    <div className="notif-card">
      <div className="notif-text">
        <span className="notif-title">{title}</span>
        <span className="notif-sub">{sub}</span>
      </div>
      <button
        className={`notif-btn${isSubscribed ? ' active' : ''}`}
        disabled={!isSupported}
        onClick={isSubscribed ? unsubscribe : subscribe}
      >
        {isSubscribed ? 'Activées' : 'Activer'}
      </button>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const lastSignalIdRef = useRef(null);

  const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications();

  const fetchSignal = useCallback(async () => {
    try {
      const res = await fetch('/.netlify/functions/signal');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur inconnue');
      setData(json);
      setError(null);

      if (json.signal) {
        const sigKey = `${json.signal.time}-${json.signal.side}`;
        if (lastSignalIdRef.current !== sigKey) {
          lastSignalIdRef.current = sigKey;
          setHistory((h) => [{ ...json.signal, key: sigKey }, ...h].slice(0, 8));
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignal();
    const id = setInterval(fetchSignal, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchSignal]);

  const signal = data?.signal || null;
  const indicators = data?.indicators || null;
  const side = signal?.side; // 'BUY' | 'SELL' | undefined

  const cardClass = side === 'BUY' ? 'buy' : side === 'SELL' ? 'sell' : 'waiting';
  const sideLabel = side === 'BUY' ? '↑ ACHAT' : side === 'SELL' ? '↓ VENTE' : 'EN ATTENTE';

  return (
    <div className="app">
      <header className="header">
        <div className="header-pair">
          <span className="header-eyebrow">Signal scalping</span>
          <h1 className="header-title">{PAIR_LABEL}</h1>
        </div>
        <div className="status-pill">
          <span className={`status-dot${error ? ' error' : loading ? '' : ' live'}`} />
          {error ? 'Erreur' : loading ? 'Connexion…' : 'Live'}
        </div>
      </header>

      <div className="price-row">
        <span className="price-value">
          {indicators?.price ? indicators.price.toFixed(2) : '—'}
        </span>
        <div className="price-meta">
          <span>M1</span>
          <span>{formatTime(indicators?.time)}</span>
        </div>
      </div>

      <section className={`signal-card ${cardClass}`}>
        <div className="signal-header">
          <span className={`signal-side ${cardClass}`}>{sideLabel}</span>
          {signal && <span className="signal-time">{formatTime(signal.time)}</span>}
        </div>

        {signal ? (
          <>
            <p className="signal-reason">{signal.reason}</p>
            <div className="signal-grid">
              <div className="signal-cell entry">
                <div className="signal-cell-label">Entrée</div>
                <div className="signal-cell-value">{signal.entry}</div>
              </div>
              <div className="signal-cell sl">
                <div className="signal-cell-label">Stop Loss</div>
                <div className="signal-cell-value">{signal.sl}</div>
              </div>
              <div className="signal-cell tp1">
                <div className="signal-cell-label">Take Profit 1</div>
                <div className="signal-cell-value">{signal.tp1}</div>
              </div>
              <div className="signal-cell tp2">
                <div className="signal-cell-label">Take Profit 2</div>
                <div className="signal-cell-value">{signal.tp2}</div>
              </div>
            </div>
          </>
        ) : (
          <p className="signal-empty">
            {error
              ? error
              : "Aucune configuration valide sur la dernière bougie. L'app vérifie le marché en continu — active les notifications pour être alerté dès qu'un signal apparaît."}
          </p>
        )}
      </section>

      {indicators && (
        <div className="indicators">
          <div className="indicator">
            <div className="indicator-label">RSI</div>
            <div className="indicator-value">{indicators.rsi}</div>
          </div>
          <div className="indicator">
            <div className="indicator-label">ATR</div>
            <div className="indicator-value">{indicators.atr}</div>
          </div>
          <div className="indicator">
            <div className="indicator-label">Support</div>
            <div className="indicator-value">{indicators.nearestSupport ?? '—'}</div>
          </div>
          <div className="indicator">
            <div className="indicator-label">Résistance</div>
            <div className="indicator-value">{indicators.nearestResistance ?? '—'}</div>
          </div>
        </div>
      )}

      <NotifCard
        isSupported={isSupported}
        isSubscribed={isSubscribed}
        subscribe={subscribe}
        unsubscribe={unsubscribe}
      />

      {history.length > 0 && (
        <div className="log">
          <span className="log-title">Derniers signaux</span>
          {history.map((h) => (
            <div className="log-item" key={h.key}>
              <span className={`log-side ${h.side === 'BUY' ? 'buy' : 'sell'}`}>
                {h.side === 'BUY' ? 'ACHAT' : 'VENTE'}
              </span>
              <span>{h.entry}</span>
              <span>{formatTime(h.time)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="footer-note">
        Signaux uniquement — aucune exécution automatique. Compte OANDA practice.
      </p>
    </div>
  );
}
