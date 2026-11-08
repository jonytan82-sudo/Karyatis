import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { CATEGORY_SEARCH, SUPPLY_CATEGORY_LABELS, VERIFY_NOTE, readProductLink, searchLink, shopLink } from '../supplies.js';
import PartFinder from './PartFinder.jsx';
import { fmtDate } from '../util.js';
import { SupplyOrders } from './SupplyOrders.jsx';
import CartButton from './CartButton.jsx';
import { OrderForm, OrderState } from './OrderForm.jsx';

/** Accurate wording: the affiliate statement appears only when the tracking tag is actually switched on. */
export function Disclosure({ supplies }) {
  return supplies.tagOn
    ? <p className="hint supply-disclosure">As an Amazon Associate, CJM Marine earns from qualifying purchases, so CJM may receive a commission. Amazon does not endorse CJM Marine. You buy directly from the seller; CJM does not process your order.</p>
    : <p className="hint supply-disclosure">Opens the seller in a new tab. You buy directly from them; CJM Marine does not process your order and does not earn from these links.</p>;
}

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** "Purchase supplies" in a task: items saved on this task, suggested searches from what it says, and a search box. Never completes the task. */
export function PurchaseSupplies({ task, supplies, saved: initialSaved, canAdd, isBuyer }) {
  const [confirmDel, setConfirmDel] = useState('');
  const [ordering, setOrdering] = useState(null); // { id, qty } — buyer records an order / crew request
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(initialSaved || []);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', url: '', partNumber: '', qty: '', note: '', need: 'every' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setSaved(initialSaved || []), [initialSaved]);
  if (!supplies || !supplies.searchUrl) return null;
  const blank = { name: '', url: '', partNumber: '', qty: '', note: '', need: 'every' };

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { const r = await call('addTaskSupply', { taskId: task.id, item: f }); setSaved(r.supplyItems); setAdding(false); setF(blank); setMsg('Saved to this task. Nothing was sent for approval.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function act(action, data) {
    setBusy(true); setError('');
    try { const r = await call(action, data); if (r.supplyItems) setSaved(r.supplyItems); return true; }
    catch (err) { setError(err.message); return false; } finally { setBusy(false); }
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
                  <li key={x.id} className="ss-item">
                    <span className="ss-main">
                      <b>{x.name}
                        <button type="button" className={`need-tag need-${x.need}`} disabled={busy || !x.canRemove}
                          title="Tap to switch between needed every time and as needed"
                          onClick={() => act('setSupplyNeed', { id: x.id, need: x.need === 'every' ? 'asNeeded' : 'every' })}>
                          {x.need === 'every' ? 'Every time' : 'As needed'}
                        </button>
                      </b>
                      <small>{[x.partNumber && `Part ${x.partNumber}`, x.qty && `Qty ${x.qty}`, x.url && host(x.url), x.note].filter(Boolean).join(' · ')}</small>
                      {x.lastOrder && <OrderState o={x.lastOrder} />}
                    </span>
                    <span className="ss-actions">
                      {x.url
                        ? <a className="btn primary" href={shopLink(x.url, supplies)} target="_blank" rel="noopener noreferrer">Shop</a>
                        : <a className="btn" href={searchLink(supplies, [x.name, x.partNumber].filter(Boolean).join(' '))} target="_blank" rel="noopener noreferrer">Search</a>}
                      {(!x.lastOrder || ['received'].includes(x.lastOrder.status) || (isBuyer && ['requested', 'approved'].includes(x.lastOrder.status))) && (
                        <button className="btn" disabled={busy} onClick={() => setOrdering({ id: x.id, qty: x.qty || '' })}>{isBuyer ? 'Mark ordered' : 'Request'}</button>
                      )}
                      {x.canRemove && <button className="link danger" disabled={busy} onClick={() => setConfirmDel(x.id)} aria-label={`Remove ${x.name}`}>Remove</button>}
                    </span>
                    {ordering && ordering.id === x.id && (isBuyer ? (
                      <OrderForm qty={ordering.qty} url={x.url} busy={busy} onCancel={() => setOrdering(null)}
                        onSubmit={async (o) => { if (await act('markOrdered', { order: { ...o, itemId: x.id } })) setOrdering(null); }} />
                    ) : (
                      <div className="ss-confirm">
                        <label className="inline">Quantity <input inputMode="numeric" value={ordering.qty} onChange={(e) => setOrdering({ ...ordering, qty: e.target.value })} /></label>
                        <input value={ordering.note || ''} onChange={(e) => setOrdering({ ...ordering, note: e.target.value })} placeholder="Note for the buyer (optional)" aria-label="Note" />
                        <button className="btn primary" disabled={busy} onClick={async () => {
                          if (await act('requestParts', { taskId: task.id, items: [{ itemId: x.id, qty: ordering.qty, note: ordering.note }] })) {
                            setOrdering(null); setMsg('Requested. The parts buyer or Captain will approve and order it.');
                            const r = await call('getTask', { id: task.id }); setSaved(r.supplyItems);
                          }
                        }}>Send request</button>
                        <button className="btn" onClick={() => setOrdering(null)}>Cancel</button>
                      </div>
                    ))}
                    {confirmDel === x.id && (
                      <div className="ss-confirm warn" role="alert">
                        <span>Remove <b>{x.name}</b> from this task? It will no longer show when the task comes due{x.need === 'every' ? ' or on the Needed soon list' : ''}. Past orders are kept.</span>
                        <button className="btn danger-btn" disabled={busy} onClick={async () => { if (await act('removeTaskSupply', { id: x.id })) setConfirmDel(''); }}>Remove item</button>
                        <button className="btn" onClick={() => setConfirmDel('')}>Keep it</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {isBuyer && saved.length > 1 && (
                <CartButton supplies={supplies} items={saved.map((x) => ({ itemId: x.id, name: x.name, url: x.url, qty: x.qty }))} label="Add all to Amazon cart"
                  onRecorded={async () => { try { const r = await call('getTask', { id: task.id }); setSaved(r.supplyItems); } catch { /* keep list */ } }} />
              )}
              {!isBuyer && saved.filter((x) => !x.lastOrder || x.lastOrder.status === 'received').length > 1 && (
                <button className="btn primary" disabled={busy} onClick={async () => {
                  const items = saved.filter((x) => !x.lastOrder || x.lastOrder.status === 'received').map((x) => ({ itemId: x.id, qty: x.qty }));
                  if (await act('requestParts', { taskId: task.id, items })) { setMsg(`${items.length} parts requested. The parts buyer or Captain will approve and order them.`); const r = await call('getTask', { id: task.id }); setSaved(r.supplyItems); }
                }}>Request all for this job</button>
              )}
              {msg && <div className="ok">{msg}</div>}
            </>
          )}
          {!adding && (
            <>
              {saved.length > 0 && <b>Need something else?</b>}
              <PartFinder supplies={supplies} task={task} canSave={canAdd} compact addLabel="Next"
                onAdd={(p) => { setF({ ...blank, ...p }); setAdding(true); setMsg(''); }} />
            </>
          )}
          {adding && (
            <form className="form supply-add" onSubmit={save}>
              <p className="hint">{isBuyer ? 'Saved parts stay on this task and show first every time it comes due.' : 'The part goes to the parts buyer or Captain to approve and order. It also stays on this task for next time.'}</p>
              <label><span>Product link <span className="opt">(Amazon or any supplier)</span></span>
                <input type="url" value={f.url} placeholder="https://www.amazon.com/dp/…" onChange={(e) => {
                  const v = e.target.value; const info = readProductLink(v);
                  setF({ ...f, url: v, name: f.name || (info && info.name) || '' });
                }} /></label>
              <div className="two">
                <label>Item<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="Oil filter" /></label>
                <label><span>Part number <span className="opt">(optional)</span></span><input value={f.partNumber} onChange={(e) => setF({ ...f, partNumber: e.target.value })} placeholder="1R-0739" /></label>
              </div>
              <div className="need-choice">
                <label className="check"><input type="radio" name="need" checked={f.need === 'every'} onChange={() => setF({ ...f, need: 'every' })} /> <span><b>Needed every time</b> this task is done (goes on the Needed soon list)</span></label>
                <label className="check"><input type="radio" name="need" checked={f.need === 'asNeeded'} onChange={() => setF({ ...f, need: 'asNeeded' })} /> <span><b>Only as needed</b></span></label>
              </div>
              <div className="two">
                <label><span>Quantity <span className="opt">(optional)</span></span><input inputMode="numeric" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></label>
                <label><span>Note <span className="opt">(optional)</span></span><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="2 per engine" /></label>
              </div>
              <div className="actions left">
                <button type="button" className="btn primary" disabled={busy || !f.name.trim()} onClick={async () => {
                  if (await act('requestParts', { taskId: task.id, items: [{ ...f, saveToTask: true }] })) {
                    setAdding(false); setF(blank);
                    setMsg(isBuyer ? 'Saved and added to the order list.' : 'Saved and sent for approval. The parts buyer or Captain will approve and order it.');
                    const r = await call('getTask', { id: task.id }); setSaved(r.supplyItems);
                  }
                }}>{isBuyer ? 'Save and add to order list' : 'Save and send for approval'}</button>
                <button className="btn" disabled={busy}>Save to task only</button>
                <button type="button" className="btn" onClick={() => { setAdding(false); setF(blank); }}>Cancel</button>
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
export function SuppliesPage({ supplies, vessel, onOpenTask, isBuyer, pending = 0, onChanged }) {
  const [view, setView] = useState(vessel ? 'needed' : 'shop');
  const [q, setQ] = useState('');
  if (!supplies) return <p className="empty">Supplies are not available yet. The Google Script needs version 3.5.</p>;
  const tabs = vessel ? [['needed', 'Needed soon'], ['requests', isBuyer ? 'Requests' : 'My requests'], ['orders', 'Ordered'], ['returns', 'Returns & cores'], ['parts', 'Parts list'], ['shop', 'Shop']] : [];
  return (
    <div className="supplies-page">
      {tabs.length > 0 && (
        <nav className="subtabs">{tabs.map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}{k === 'requests' && isBuyer && pending > 0 && <span className="badge">{pending}</span>}</button>)}</nav>
      )}
      {vessel && view !== 'shop' && <SupplyOrders view={view} vessel={vessel} supplies={supplies} onOpenTask={onOpenTask} isBuyer={isBuyer} onChanged={onChanged} />}
      {view === 'shop' && <section className="group shop-group">
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
      </section>}
    </div>
  );
}
