import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { CATEGORY_SEARCH, SUPPLY_CATEGORY_LABELS, VERIFY_NOTE, searchLink, shopLink, suggestionsFor } from '../supplies.js';

/** Accurate wording: the affiliate statement appears only when the tracking tag is actually switched on. */
export function Disclosure({ supplies }) {
  return supplies.tagOn
    ? <p className="hint supply-disclosure">As an Amazon Associate, CJM Marine earns from qualifying purchases, so CJM may receive a commission. Amazon does not endorse CJM Marine. You buy directly from the seller; CJM does not process your order.</p>
    : <p className="hint supply-disclosure">Opens the seller in a new tab. You buy directly from them; CJM Marine does not process your order and does not earn from these links.</p>;
}

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** "Purchase supplies" in a task: items saved on this task, suggested searches from what it says, and a search box. Never completes the task. */
export function PurchaseSupplies({ task, supplies, saved: initialSaved, canAdd }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(initialSaved || []);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', url: '', partNumber: '', qty: '', note: '' });
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setSaved(initialSaved || []), [initialSaved]);
  if (!supplies || !supplies.searchUrl) return null;
  const sug = suggestionsFor(task, supplies.maps);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { const r = await call('addTaskSupply', { taskId: task.id, item: f }); setSaved(r.supplyItems); setAdding(false); setF({ name: '', url: '', partNumber: '', qty: '', note: '' }); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function remove(id) {
    setBusy(true); setError('');
    try { setSaved((await call('removeTaskSupply', { id })).supplyItems); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <section className="supply-box">
      {!open ? (
        <button className="btn" onClick={() => setOpen(true)}>Purchase supplies{saved.length ? ` (${saved.length} saved)` : ''}</button>
      ) : (
        <div className="supply-panel">
          {saved.length > 0 && (
            <>
              <b>Saved for this task</b>
              <ul className="supply-saved">
                {saved.map((x) => (
                  <li key={x.id}>
                    <span className="ss-main">
                      <b>{x.name}</b>
                      <small>{[x.partNumber && `Part ${x.partNumber}`, x.qty && `Qty ${x.qty}`, x.url && host(x.url), x.note].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span className="ss-actions">
                      {x.url
                        ? <a className="btn primary" href={shopLink(x.url, supplies)} target="_blank" rel="noopener noreferrer">Shop</a>
                        : <a className="btn" href={searchLink(supplies, [x.name, x.partNumber].filter(Boolean).join(' '))} target="_blank" rel="noopener noreferrer">Search</a>}
                      {x.canRemove && <button className="link danger" disabled={busy} onClick={() => remove(x.id)} aria-label={`Remove ${x.name}`}>Remove</button>}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {sug.items.length > 0 && (
            <>
              <b>{saved.length ? 'Other suggestions' : 'Suggested for this job'}{sug.equipment && <small className="muted"> for {sug.equipment}</small>}</b>
              <div className="supply-sugs">
                {sug.items.map((s) => (
                  <a key={s.term} className="supply-sug" href={searchLink(supplies, s.term)} target="_blank" rel="noopener noreferrer">{s.term}</a>
                ))}
              </div>
            </>
          )}
          {!sug.items.length && !saved.length && <b>Need something for this job?</b>}
          {sug.note && <p className="hint">{sug.note}</p>}
          {sug.verify && <p className="supply-verify">{VERIFY_NOTE}</p>}
          <form className="supply-search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) window.open(searchLink(supplies, q.trim()), '_blank', 'noopener'); }}>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Amazon for something else" aria-label="Search Amazon" />
            <button className="btn" disabled={!q.trim()}>Search</button>
          </form>
          {canAdd && !adding && <button className="link" onClick={() => setAdding(true)}>Found the right part? Save it to this task</button>}
          {adding && (
            <form className="form supply-add" onSubmit={save}>
              <p className="hint">Saved items stay on this task and show first every time it comes due.</p>
              <div className="two">
                <label>Item<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="Oil filter" /></label>
                <label><span>Part number <span className="opt">(optional)</span></span><input value={f.partNumber} onChange={(e) => setF({ ...f, partNumber: e.target.value })} placeholder="1R-0739" /></label>
              </div>
              <label><span>Product link <span className="opt">(paste from Amazon or any supplier)</span></span><input type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://www.amazon.com/dp/…" /></label>
              <div className="two">
                <label><span>Quantity <span className="opt">(optional)</span></span><input inputMode="numeric" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></label>
                <label><span>Note <span className="opt">(optional)</span></span><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="2 per engine" /></label>
              </div>
              <div className="actions left">
                <button className="btn primary" disabled={busy}>Save item</button>
                <button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            </form>
          )}
          {error && <div className="alert">{error}</div>}
          <Disclosure supplies={supplies} />
          <p className="hint">Buying supplies does not complete the task. Come back here to sign it off.</p>
        </div>
      )}
    </section>
  );
}

/** Main menu → Marine supplies: general shopping, independent of tasks. */
export function SuppliesPage({ supplies }) {
  const [q, setQ] = useState('');
  if (!supplies) return <p className="empty">Supplies are not available yet. The Google Script needs version 3.5.</p>;
  return (
    <div className="supplies-page">
      <section className="group">
        <h3>Marine supplies</h3>
        <p className="hint">Shop for boat supplies on Amazon. Your order, payment and delivery are with Amazon. Tasks that use consumables also have a Purchase supplies button.</p>
        <a className="btn primary" href={supplies.generalUrl} target="_blank" rel="noopener noreferrer">Shop marine supplies on Amazon</a>
        <form className="supply-search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) window.open(searchLink(supplies, q.trim()), '_blank', 'noopener'); }}>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Amazon, e.g. marine teak cleaner" aria-label="Search Amazon" />
          <button className="btn" disabled={!q.trim()}>Search</button>
        </form>
        <div className="supply-cats">
          {Object.entries(CATEGORY_SEARCH).map(([k, term]) => (
            <a key={k} className="supply-cat" href={searchLink(supplies, term)} target="_blank" rel="noopener noreferrer">{SUPPLY_CATEGORY_LABELS[k]}</a>
          ))}
        </div>
        <p className="supply-verify">{VERIFY_NOTE} This matters most for oil, filters, impellers and safety equipment.</p>
        <Disclosure supplies={supplies} />
      </section>
    </div>
  );
}
