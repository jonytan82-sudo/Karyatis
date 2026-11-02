import { useState } from 'react';
import { call } from '../api.js';
import { cartLinks } from '../supplies.js';

/**
 * "Add to Amazon cart" for a list of items [{ itemId, name, url, qty }]. Opens Amazon (one link per 20 items), then asks whether
 * the order was placed; "Yes" records them as ordered. Items without an Amazon product link are listed so crew use Shop instead.
 */
export default function CartButton({ items, supplies, label = 'Add to Amazon cart', onRecorded }) {
  const [sent, setSent] = useState(null); // items opened in Amazon
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  if (!supplies || !items.length) return null;
  const links = cartLinks(items, supplies);
  const key = (x) => x.id || x.itemId;
  const without = items.filter((x) => !links.some((l) => l.items.some((i) => key(i) === key(x))));

  async function record() {
    setBusy(true); setError('');
    try {
      const r = await call('markOrderedMany', { orders: sent.map((x) => (x.id ? { id: x.id, qty: x.qty } : { itemId: x.itemId, qty: x.qty })) });
      setMsg(`${r.count} item${r.count === 1 ? '' : 's'} recorded as ordered.`); setSent(null); if (onRecorded) onRecorded();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="cart-send">
      {links.length > 0 && !sent && (
        <div className="cart-links">
          {links.map((l, i) => (
            <a key={l.url} className="btn primary" href={l.url} target="_blank" rel="noopener noreferrer"
              onClick={() => setTimeout(() => setSent(links.flatMap((x) => x.items)), 300)}>
              {label}{links.length > 1 ? ` (part ${i + 1} of ${links.length})` : ''} · {l.items.length} item{l.items.length === 1 ? '' : 's'}
            </a>
          ))}
        </div>
      )}
      {links.length === 0 && <p className="hint">To send items to the Amazon cart in one go, save them with their Amazon product link (the address with /dp/).</p>}
      {links.length > 0 && without.length > 0 && !sent && (
        <p className="hint">{without.length} item{without.length === 1 ? ' has' : 's have'} no Amazon product link ({without.map((x) => x.name).join(', ')}), so {without.length === 1 ? 'it is' : 'they are'} not in the cart link. Use Shop for {without.length === 1 ? 'it' : 'them'}.</p>
      )}
      {sent && (
        <div className="cart-confirm" role="status">
          <span><b>Did you place the order on Amazon?</b> Adding to the cart is not ordering. Check that Amazon added all {sent.length} item{sent.length === 1 ? '' : 's'}.</span>
          <span className="actions left">
            <button className="btn primary" disabled={busy} onClick={record}>Yes, mark {sent.length} ordered</button>
            <button className="btn" onClick={() => setSent(null)}>Not yet</button>
          </span>
        </div>
      )}
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}
    </div>
  );
}
