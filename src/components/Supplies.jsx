import { useState } from 'react';
import { CATEGORY_SEARCH, SUPPLY_CATEGORY_LABELS, VERIFY_NOTE, searchLink, supplyFor } from '../supplies.js';

/** Accurate wording: the affiliate statement appears only when the tracking tag is actually switched on. */
export function Disclosure({ supplies }) {
  return supplies.tagOn
    ? <p className="hint supply-disclosure">As an Amazon Associate, CJM Marine earns from qualifying purchases, so CJM may receive a commission. Amazon does not endorse CJM Marine. You buy directly from Amazon; CJM does not process your order.</p>
    : <p className="hint supply-disclosure">Opens Amazon in a new tab. You buy directly from Amazon; CJM Marine does not process your order and does not earn from this link.</p>;
}

/** "Purchase Supplies" in a task. Shown only when the task matches an enabled supply search. Never completes the task. */
export function PurchaseSupplies({ task, supplies }) {
  const [open, setOpen] = useState(false);
  const m = supplies && supplyFor(task, supplies.maps);
  if (!m) return null;
  return (
    <section className="supply-box">
      {!open ? (
        <button className="btn" onClick={() => setOpen(true)}>Purchase supplies</button>
      ) : (
        <div className="supply-panel">
          <b>Supplies for this job</b>
          <p>Search: <i>{m.term}</i></p>
          {m.note && <p className="hint">{m.note}</p>}
          {m.verify && <p className="supply-verify">{VERIFY_NOTE}</p>}
          <a className="btn primary" href={searchLink(supplies, m.term)} target="_blank" rel="noopener noreferrer">Shop on Amazon</a>
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
