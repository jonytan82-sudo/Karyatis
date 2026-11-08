import { useCallback, useEffect, useMemo, useState } from 'react';
import { call } from '../api.js';
import { useLiveReload } from '../live.js';
import { SYSTEMS, fmtDate, fmtStamp } from '../util.js';
import { searchLink, shopLink } from '../supplies.js';
import CartButton from './CartButton.jsx';
import { OrderForm, ReceiveForm, ReturnForm, RETURN_KINDS } from './OrderForm.jsx';

const DEPTS = ['Deck', 'Engineering', 'Interior', 'Galley', 'Medical', 'Security', 'General'];
const STATUS = { requested: 'Requested', approved: 'Approved', ordered: 'Ordered', received: 'Received', declined: 'Declined', cancelled: 'Cancelled' };
const ST_CLASS = { requested: 'st-wait', approved: 'st-wait', ordered: 'st-wait', received: 'st-ok', declined: 'st-no', cancelled: 'st-no' };

function csv(rows) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cols = [['orderedAt', 'Ordered'], ['department', 'Department'], ['name', 'Item'], ['partNumber', 'Part number'], ['qty', 'Qty'], ['task', 'Task'],
    ['system', 'System'], ['status', 'Status'], ['orderedBy', 'Ordered by'], ['receivedAt', 'Received'], ['receivedBy', 'Received by'], ['note', 'Note'], ['url', 'Link']];
  const text = [cols.map(([, l]) => q(l)).join(','), ...rows.map((r) => cols.map(([k]) => q(k === 'orderedAt' || k === 'receivedAt' ? String(r[k] || '').slice(0, 10) : r[k])).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
  a.download = `supply-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** The vessel's master supply list: needed soon (from recurring tasks), order history, and the parts list. */
export function SupplyOrders({ view, vessel, supplies, onOpenTask, isBuyer, onChanged }) {
  const [ordering, setOrdering] = useState(''); // order id being recorded
  const [tracking, setTracking] = useState(''); // order id whose tracking is being edited
  const [declining, setDeclining] = useState(null); // { ids, note }
  const [picked, setPicked] = useState({});
  const [msg, setMsg] = useState('');
  const [receiving, setReceiving] = useState('');
  const [returning, setReturning] = useState(''); // order id: open return
  const [retEdit, setRetEdit] = useState(''); // order id: update return
  const spots = vessel.partSpots || [];
  const [d, setD] = useState(null);
  const [days, setDays] = useState(45);
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState(null);

  const load = useCallback(() => call('supplyOverview', { days, from, to }).then(setD).catch((e) => setError(e.message)), [days, from, to]);
  useEffect(() => { load(); }, [load, vessel.id]);
  useLiveReload(load);

  async function act(action, data) {
    setBusy(true); setError('');
    try { await call(action, data); await load(); if (onChanged) onChanged(); return true; } catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  }

  const byDept = (r) => !dept || r.department === dept;
  const needed = useMemo(() => (d ? d.needed.filter(byDept) : []), [d, dept]); // eslint-disable-line react-hooks/exhaustive-deps
  const orders = useMemo(() => (d ? d.orders.filter((o) => byDept(o) && (!status || o.status === status)) : []), [d, dept, status]); // eslint-disable-line react-hooks/exhaustive-deps
  const parts = useMemo(() => {
    const g = {};
    (d ? d.items.filter(byDept) : []).forEach((x) => (g[x.department] = g[x.department] || []).push(x));
    return Object.entries(g);
  }, [d, dept]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) return error ? <div className="alert">{error}</div> : <p className="empty">Loading…</p>;
  const shop = (x) => (x.url ? shopLink(x.url, supplies) : searchLink(supplies, [x.name, x.partNumber].filter(Boolean).join(' ')));
  const deptFilter = (
    <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
      <option value="">All departments</option>{DEPTS.map((x) => <option key={x}>{x}</option>)}
    </select>
  );

  return (
    <div className="supply-orders">
      {error && <div className="alert">{error}</div>}

      {view === 'needed' && (
        <section className="group">
          <h3>Needed soon <span className="count">{needed.filter((x) => !x.order).length} to order</span></h3>
          <p className="hint">Filled in automatically from items marked <b>Every time</b> on tasks coming due. Tick an item once it is ordered; it stays ticked until the task is signed off and comes round again.</p>
          <div className="filters">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time ahead">
              <option value={14}>Next 2 weeks</option><option value={30}>Next 30 days</option><option value={45}>Next 45 days</option><option value={90}>Next 90 days</option>
            </select>
            {deptFilter}
          </div>
          {isBuyer ? (
            <CartButton supplies={supplies} items={needed.filter((x) => !x.order).map((x) => ({ itemId: x.itemId, name: x.name, url: x.url, qty: x.qty }))}
              label="Add everything to Amazon cart" onRecorded={load} />
          ) : needed.some((x) => !x.order) && (
            <button className="btn primary" disabled={busy} onClick={async () => {
              const items = needed.filter((x) => !x.order).map((x) => ({ itemId: x.itemId, qty: x.qty }));
              if (await act('requestParts', { items })) setMsg(`${items.length} part${items.length === 1 ? '' : 's'} requested from the parts buyer.`);
            }}>Request everything not yet asked for</button>
          )}
          {msg && <div className="ok">{msg}</div>}
          {!needed.length && <p className="empty">Nothing needed in this period. Save items on a task and mark them “Every time” to see them here.</p>}
          <ul className="need-list">
            {needed.map((x) => (
              <li key={x.itemId + x.dueDate} className={x.order ? 'done' : ''}>
                <label className="check need-tick">
                  <input type="checkbox" checked={!!x.order} disabled={busy || !isBuyer || (x.order && x.order.status === 'received')}
                    title={isBuyer ? 'Ticked = ordered' : 'The parts buyer ticks it when ordered'}
                    onChange={(e) => (e.target.checked ? act('markOrdered', { order: { itemId: x.itemId, qty: x.qty } }) : act('setOrderStatus', { id: x.order.id, status: 'cancelled' }))} />
                  <span className="need-main">
                    <b>{x.name}{x.qty && <small> × {x.qty}</small>}</b>
                    <small>{[x.partNumber && `Part ${x.partNumber}`, x.department].filter(Boolean).join(' · ')}</small>
                    <button type="button" className="link need-task" onClick={() => onOpenTask && onOpenTask(x.taskId)}>{x.task}</button>
                    {x.order && <small className={`order-state os-${x.order.status}`}>{STATUS[x.order.status]} {fmtDate(String(x.order.at).slice(0, 10))}{x.order.by && ` by ${x.order.by}`}</small>}
                  </span>
                </label>
                <span className="need-side">
                  <span className={`need-due ${x.daysUntilDue < 0 ? 'late' : x.daysUntilDue <= 10 ? 'soon' : ''}`}>{x.daysUntilDue < 0 ? `${-x.daysUntilDue}d overdue` : `Due ${fmtDate(x.dueDate)}`}</span>
                  {!x.order && isBuyer && <a className="btn" href={shop(x)} target="_blank" rel="noopener noreferrer">Shop</a>}
                  {!x.order && !isBuyer && <button className="btn" disabled={busy} onClick={() => act('requestParts', { items: [{ itemId: x.itemId, qty: x.qty }] })}>Request</button>}
                  {x.order && x.order.status === 'ordered' && <button className="btn" disabled={busy} onClick={() => setReceiving(x.order.id)}>Received</button>}
                </span>
                {x.order && receiving === x.order.id && <ReceiveForm spots={spots} busy={busy} onCancel={() => setReceiving('')}
                  onSubmit={async (loc) => { if (await act('setOrderStatus', { id: x.order.id, status: 'received', location: loc })) setReceiving(''); }} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === 'returns' && (() => {
        const rets = d.orders.filter((o) => o.ret && byDept(o));
        const open = rets.filter((o) => o.ret.status === 'pending').sort((a, b) => (a.ret.due || '9999') < (b.ret.due || '9999') ? -1 : 1);
        const closed = rets.filter((o) => o.ret.status === 'closed');
        const card = (o) => {
          const r = o.ret;
          const late = r.daysLeft !== null && r.daysLeft < 0, soon = r.daysLeft !== null && r.daysLeft <= 7;
          return (
            <li key={o.id} className={`ret-row ${late ? 'ret-late' : ''}`}>
              <span className="order-main">
                <b>{o.name}{o.qty && <small> × {o.qty}</small>} <span className={`ret-kind rk-${r.kind}`}>{RETURN_KINDS[r.kind]}</span></b>
                <small>{[o.department, o.supplier, o.task].filter(Boolean).join(' · ')}</small>
                {r.due && r.status === 'pending' && <small className={late ? 'ret-due late' : soon ? 'ret-due soon' : 'ret-due'}>{late ? `${-r.daysLeft} days overdue` : r.daysLeft === 0 ? 'Due back today' : `Due back ${fmtDate(r.due)} (${r.daysLeft} days)`}{r.charge && ` · charge ${r.charge}`}</small>}
                <small>{[r.rma && `RMA ${r.rma}`, (r.pnOff || r.snOff) && `Off: ${r.pnOff || '—'} / SN ${r.snOff || '—'}`, (r.pnOn || r.snOn) && `On: ${r.pnOn || '—'} / SN ${r.snOn || '—'}`].filter(Boolean).join(' · ')}</small>
                {(r.tracking || r.credit) && <small>{r.tracking && <>Return: {r.trackingUrl ? <a href={r.trackingUrl} target="_blank" rel="noopener noreferrer">{r.carrier} {r.tracking}</a> : `${r.carrier} ${r.tracking}`}</>}{r.credit && ` · Credit: ${r.credit}`}</small>}
                {r.note && <small>“{r.note}”</small>}
                <small>Opened by {r.openedBy || 'buyer'} {fmtDate(String(r.openedAt).slice(0, 10))}{r.status === 'closed' && ` · closed by ${r.closedBy} ${fmtDate(String(r.closedAt).slice(0, 10))}`}</small>
              </span>
              <span className="order-side">
                <span className={`st ${r.status === 'closed' ? 'st-ok' : late ? 'st-no' : 'st-wait'}`}>{r.status === 'closed' ? 'Closed' : 'Return pending'}</span>
                {r.status === 'pending' && <button className="link" onClick={() => setRetEdit(retEdit === o.id ? '' : o.id)}>Update</button>}
                {r.status === 'closed' && isBuyer && <button className="link" disabled={busy} onClick={() => act('updateReturn', { id: o.id, ret: { reopen: true } })}>Reopen</button>}
              </span>
              {retEdit === o.id && <ReturnForm mode="update" initial={r} isBuyer={isBuyer} busy={busy} onCancel={() => setRetEdit('')}
                onSubmit={async (x, close) => { if (await act('updateReturn', { id: o.id, ret: x, close })) setRetEdit(''); }} />}
            </li>
          );
        };
        return (
          <section className="group">
            <h3>Returns and cores <span className="count">{open.length} open</span></h3>
            <p className="hint">Cores are flagged when a part is ordered; wrong or damaged parts are returned from the Ordered list. Record RMA, part and serial numbers off and on, return tracking and the credit. A buyer closes it.</p>
            <div className="filters">{deptFilter}</div>
            {!open.length && <p className="empty">No open returns or cores.</p>}
            <ul className="order-list">{open.map(card)}</ul>
            {closed.length > 0 && <><h4>Closed <span className="count">{closed.length}</span></h4><ul className="order-list">{closed.slice(0, 50).map(card)}</ul></>}
          </section>
        );
      })()}

      {view === 'requests' && (() => {
        const reqs = d.orders.filter((o) => (o.status === 'requested' || o.status === 'approved') && byDept(o) && (isBuyer || o.mine));
        const waiting = reqs.filter((o) => o.status === 'requested'), approved = reqs.filter((o) => o.status === 'approved');
        const ids = waiting.filter((o) => picked[o.id]).map((o) => o.id);
        const row = (o) => (
          <li key={o.id} className="req-row">
            <span className="order-main">
              {isBuyer && o.status === 'requested' && <label className="check mini"><input type="checkbox" checked={!!picked[o.id]} onChange={(e) => setPicked({ ...picked, [o.id]: e.target.checked })} /> select</label>}
              <b>{o.name}{o.qty && <small> × {o.qty}</small>}</b>
              <small>{[o.department, o.partNumber && `Part ${o.partNumber}`, `asked by ${o.requestedBy || 'crew'} ${fmtDate(String(o.requestedAt).slice(0, 10))}`, o.note].filter(Boolean).join(' · ')}</small>
              {o.taskId && <button type="button" className="link need-task" onClick={() => onOpenTask && onOpenTask(o.taskId)}>{o.task}</button>}
              {o.status === 'approved' && <small className="order-state os-approved">Approved by {o.approvedBy}{o.approvedAt && `, ${fmtDate(o.approvedAt.slice(0, 10))}`}</small>}
            </span>
            <span className="order-side">
              {o.url && <a className="link" href={shopLink(o.url, supplies)} target="_blank" rel="noopener noreferrer">Link</a>}
              {isBuyer && o.status === 'requested' && <button className="btn primary" disabled={busy} onClick={() => act('decideParts', { ids: [o.id], approve: true })}>Approve</button>}
              {isBuyer && o.status === 'requested' && <button className="link danger" disabled={busy} onClick={() => setDeclining({ ids: [o.id], note: '' })}>Decline</button>}
              {isBuyer && o.status === 'approved' && <button className="btn primary" disabled={busy} onClick={() => setOrdering(o.id)}>Mark ordered</button>}
              {!isBuyer && <span className={`st ${ST_CLASS[o.status]}`}>{STATUS[o.status]}</span>}
              {o.canCancel && !(isBuyer && o.status === 'requested') && <button className="link danger" disabled={busy} onClick={() => act('setOrderStatus', { id: o.id, status: 'cancelled' })}>{o.mine && o.status === 'requested' ? 'Withdraw' : 'Cancel'}</button>}
            </span>
            {ordering === o.id && <OrderForm qty={o.qty} url={o.url} busy={busy} onCancel={() => setOrdering('')}
              onSubmit={async (x) => { if (await act('markOrdered', { order: { ...x, id: o.id } })) { setOrdering(''); setMsg(`${o.name} recorded as ordered.`); } }} />}
            {declining && declining.ids.length === 1 && declining.ids[0] === o.id && (
              <div className="ss-confirm warn">
                <input value={declining.note} onChange={(e) => setDeclining({ ...declining, note: e.target.value })} placeholder="Why (the crew member is emailed)" aria-label="Reason" />
                <button className="btn danger-btn" disabled={busy || !declining.note.trim()} onClick={async () => { if (await act('decideParts', { ids: declining.ids, approve: false, note: declining.note })) setDeclining(null); }}>Decline</button>
                <button className="btn" onClick={() => setDeclining(null)}>Back</button>
              </div>
            )}
          </li>
        );
        return (
          <section className="group">
            <h3>{isBuyer ? 'Parts requests' : 'My parts requests'} <span className="count">{reqs.length}</span></h3>
            <p className="hint">{isBuyer
              ? 'Crew requests wait here. Approve or decline (the crew member is emailed), then place the order and record supplier, order number and tracking.'
              : 'Parts you asked for. The parts buyer or Captain approves and orders them; you are emailed with tracking.'}</p>
            <div className="filters">{deptFilter}</div>
            {msg && <div className="ok">{msg}</div>}
            {!reqs.length && <p className="empty">{isBuyer ? 'No requests waiting.' : 'No open requests.'}</p>}
            {waiting.length > 0 && <h4>Waiting for approval <span className="count">{waiting.length}</span></h4>}
            {isBuyer && ids.length > 1 && (
              <div className="actions left">
                <button className="btn primary" disabled={busy} onClick={async () => { if (await act('decideParts', { ids, approve: true })) setPicked({}); }}>Approve {ids.length} selected</button>
              </div>
            )}
            <ul className="order-list">{waiting.map(row)}</ul>
            {approved.length > 0 && <h4>Approved, to order <span className="count">{approved.length}</span></h4>}
            {isBuyer && approved.length > 0 && (
              <CartButton supplies={supplies} items={approved.map((o) => ({ itemId: o.itemId, id: o.id, name: o.name, url: o.url, qty: o.qty }))} label="Add approved to Amazon cart" onRecorded={load} />
            )}
            <ul className="order-list">{approved.map(row)}</ul>
          </section>
        );
      })()}

      {view === 'orders' && (
        <section className="group">
          <h3>Ordered <span className="count">{orders.length}</span></h3>
          <div className="filters">
            <label className="inline">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="inline">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            {deptFilter}
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">Any status</option><option value="ordered">Ordered (not received)</option><option value="received">Received</option><option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="actions left">
            <button className="btn" onClick={() => csv(orders)} disabled={!orders.length}>Download (CSV)</button>
            <button className="btn" onClick={() => setLog(log ? null : { name: '', partNumber: '', qty: '', url: '', system: '', note: '' })}>{log ? 'Close' : isBuyer ? 'Log an order' : 'Request a part'}</button>
          </div>
          {msg && <div className="ok">{msg}</div>}
          {log && (
            <form className="form supply-add" onSubmit={async (e) => { e.preventDefault(); if (await act(isBuyer ? 'markOrdered' : 'requestParts', isBuyer ? { order: log } : { items: [log] })) setLog(null); }}>
              <p className="hint">For anything not saved on a task: stores, fuel additives, cleaning products.</p>
              <div className="two">
                <label>Item<input value={log.name} onChange={(e) => setLog({ ...log, name: e.target.value })} required /></label>
                <label>System (sets the department)
                  <select value={log.system} onChange={(e) => setLog({ ...log, system: e.target.value })}><option value="">General</option>{SYSTEMS.map((x) => <option key={x}>{x}</option>)}</select>
                </label>
              </div>
              <div className="two">
                <label><span>Part number <span className="opt">(optional)</span></span><input value={log.partNumber} onChange={(e) => setLog({ ...log, partNumber: e.target.value })} /></label>
                <label><span>Quantity <span className="opt">(optional)</span></span><input inputMode="numeric" value={log.qty} onChange={(e) => setLog({ ...log, qty: e.target.value })} /></label>
              </div>
              <label><span>Link <span className="opt">(optional)</span></span><input type="url" value={log.url} onChange={(e) => setLog({ ...log, url: e.target.value })} /></label>
              <label><span>Note <span className="opt">(optional)</span></span><input value={log.note} onChange={(e) => setLog({ ...log, note: e.target.value })} placeholder="Order number, supplier, delivery port" /></label>
              <div className="actions left"><button className="btn primary" disabled={busy}>{isBuyer ? 'Record order' : 'Send request'}</button></div>
            </form>
          )}
          {!orders.length && <p className="empty">No orders in this view yet.</p>}
          <ul className="order-list">
            {orders.map((o) => (
              <li key={o.id} className={`os-row orow-${o.status}`}>
                <span className="order-date">{fmtDate(o.orderedAt.slice(0, 10))}</span>
                <span className="order-main">
                  <b>{o.name}{o.qty && <small> × {o.qty}</small>}</b>
                  <small>{[o.department, o.partNumber && `Part ${o.partNumber}`, o.task, o.orderedBy && `by ${o.orderedBy}`, o.note].filter(Boolean).join(' · ')}</small>
                  {(o.supplier || o.orderRef || o.tracking || o.eta) && (
                    <small>{[o.supplier, o.orderRef && `order ${o.orderRef}`].filter(Boolean).join(' · ')}
                      {o.tracking && <> · {o.trackingUrl ? <a href={o.trackingUrl} target="_blank" rel="noopener noreferrer">{o.carrier} {o.tracking}</a> : `${o.carrier} ${o.tracking}`}</>}
                      {o.eta && o.status === 'ordered' && ` · expected ${fmtDate(o.eta)}`}</small>
                  )}
                  {o.status === 'declined' && o.decisionNote && <small>Declined: {o.decisionNote}</small>}
                  {o.status === 'received' && <small>Received {fmtStamp(o.receivedAt)}{o.receivedBy && ` by ${o.receivedBy}`}{o.receivedLocation && <>, left at <b>{o.receivedLocation}</b></>}</small>}
                  {o.replacementOf && <small>Replacement for a wrong part</small>}
                </span>
                <span className="order-side">
                  <span className={`st ${ST_CLASS[o.status]}`}>{STATUS[o.status]}</span>
                  {isBuyer && o.status === 'ordered' && <button className="link" disabled={busy} onClick={() => setTracking(tracking === o.id ? '' : o.id)}>{o.tracking ? 'Edit tracking' : 'Add tracking'}</button>}
                  {o.status === 'ordered' && <button className="link" disabled={busy} onClick={() => setReceiving(receiving === o.id ? '' : o.id)}>Received</button>}
                  {['ordered', 'received'].includes(o.status) && !(o.ret && o.ret.status === 'pending') && <button className="link" onClick={() => setReturning(returning === o.id ? '' : o.id)}>Return</button>}
                  {o.ret && <span className={`ret-kind rk-${o.ret.kind}`}>{o.ret.status === 'pending' ? `${RETURN_KINDS[o.ret.kind]} pending` : `${RETURN_KINDS[o.ret.kind]} closed`}</span>}
                  {o.status === 'ordered' && o.canCancel && <button className="link danger" disabled={busy} onClick={() => act('setOrderStatus', { id: o.id, status: 'cancelled' })}>Cancel</button>}
                  {o.url && <a className="link" href={shopLink(o.url, supplies)} target="_blank" rel="noopener noreferrer">Reorder</a>}
                </span>
                {receiving === o.id && <ReceiveForm spots={spots} busy={busy} onCancel={() => setReceiving('')}
                  onSubmit={async (loc) => { if (await act('setOrderStatus', { id: o.id, status: 'received', location: loc })) setReceiving(''); }} />}
                {returning === o.id && <ReturnForm mode="open" partNumber={o.partNumber} isBuyer={isBuyer} busy={busy} onCancel={() => setReturning('')}
                  onSubmit={async (x) => { if (await act('openReturn', { id: o.id, ret: x })) { setReturning(''); setMsg(x.kind === 'wrong' && x.reorder ? 'Return opened and the right part requested.' : 'Return opened.'); } }} />}
                {tracking === o.id && <OrderForm showCore={false} initial={{ qty: o.qty, supplier: o.supplier, orderRef: o.orderRef, carrier: o.carrier, tracking: o.tracking, eta: o.eta }}
                  busy={busy} submitLabel="Save tracking" onCancel={() => setTracking('')}
                  onSubmit={async (x) => { if (await act('updateTracking', { id: o.id, tracking: x })) setTracking(''); }} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === 'parts' && (
        <section className="group">
          <h3>Parts list <span className="count">{d.items.length}</span></h3>
          <p className="hint">Every item saved on this vessel's tasks, by department.</p>
          <div className="filters">{deptFilter}</div>
          {!parts.length && <p className="empty">No items saved yet. Open a task → Purchase supplies → Save it to this task.</p>}
          {parts.map(([dp, list]) => (
            <div key={dp} className="parts-group">
              <h4>{dp} <span className="count">{list.length}</span></h4>
              <ul className="order-list">
                {list.map((x) => (
                  <li key={x.id}>
                    <span className="order-main">
                      <b>{x.name}{x.qty && <small> × {x.qty}</small>} <span className={`need-tag need-${x.need}`}>{x.need === 'every' ? 'Every time' : 'As needed'}</span></b>
                      <small>{[x.partNumber && `Part ${x.partNumber}`, x.system].filter(Boolean).join(' · ')}</small>
                      <button type="button" className="link need-task" onClick={() => onOpenTask && onOpenTask(x.taskId)}>{x.task}</button>
                    </span>
                    <span className="order-side"><a className="btn" href={shop(x)} target="_blank" rel="noopener noreferrer">Shop</a></span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
