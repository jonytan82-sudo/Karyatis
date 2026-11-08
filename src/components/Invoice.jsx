import { Fragment, useEffect, useState } from 'react';
import { call } from '../api.js';
import { fmtStamp } from '../util.js';
import Modal from './Modal.jsx';
import Logo from './Logo.jsx';
import { CHARGE_KINDS, chargeLabel, chargeUnit, cleanNum, invTotals, money, num } from '../workorders.js';

const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

/** Prints only the invoice: everything else on the page is hidden while the print dialog is open. */
export function printInvoice() {
  document.body.classList.add('printing-invoice');
  const done = () => { document.body.classList.remove('printing-invoice'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}

/** The invoice as it reads on screen and on paper. Shared by the contractor's preview and the customer's emailed link. */
export function InvoiceDoc({ inv, business, contractorName, wo }) {
  const d = inv.data || {};
  const cur = inv.currency || d.currency || 'USD';
  const t = invTotals(d);
  const pay = d.pay || {};
  const paid = inv.status === 'paid';
  const c = d.consumables || {};
  return (
    <article className="invoice-doc">
      <header className="inv-head">
        <div>
          <p className="inv-co">{business.name || contractorName}</p>
          {business.credential && <p className="inv-small">{business.credential}</p>}
          {business.address && <p className="inv-small pre">{business.address}</p>}
          <p className="inv-small">{[business.phone, business.email].filter(Boolean).join('  ·  ')}</p>
        </div>
        <div className="inv-right">
          <p className="inv-title">Invoice</p>
          <p className="inv-no">{inv.number}</p>
          <p className="inv-small">{day(inv.sentAt || inv.createdAt)}</p>
          {paid && <p className="inv-paid">Paid {day(inv.paidAt)}</p>}
        </div>
      </header>
      <div className="inv-meta">
        <div><span>Bill to</span><b>{d.billToName || d.billToEmail || 'Not set'}</b>{d.billToName && d.billToEmail && <small>{d.billToEmail}</small>}</div>
        <div><span>Boat</span><b>{wo.boatName}</b></div>
        <div><span>Work order</span><b>{wo.number}</b><small>{wo.title}</small></div>
        {d.poNumber && <div><span>PO number</span><b>{d.poNumber}</b></div>}
      </div>
      <table className="inv-table">
        <thead><tr><th>Item</th><th className="r">Qty or hours</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead>
        <tbody>
          {(d.items || []).map((it) => (
            <Fragment key={it.id}>
              <tr className="inv-item">
                <td><b>{it.no}. {it.label}</b>{it.corrective && <small>{it.corrective}</small>}{num(it.hoursBilled) > 0 && <small className="inv-mq">{num(it.hoursBilled)} hr at {money(it.rate, cur)}</small>}</td>
                <td className="r">{num(it.hoursBilled) ? `${num(it.hoursBilled)} hr` : ''}</td>
                <td className="r">{num(it.rate) ? money(it.rate, cur) : ''}</td>
                <td className="r">{num(it.hoursBilled) && num(it.rate) ? money(num(it.hoursBilled) * num(it.rate), cur) : ''}</td>
              </tr>
              {(it.parts || []).map((p) => (
                <tr className="inv-part" key={p.id}>
                  <td>Part: {[p.desc, p.pn].filter(Boolean).join(', ')}<small className="inv-mq">{num(p.qty)} at {money(p.price, cur)}</small></td>
                  <td className="r">{num(p.qty)}</td>
                  <td className="r">{money(p.price, cur)}</td>
                  <td className="r">{money(num(p.qty) * num(p.price), cur)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
          {(d.charges || []).map((ch) => (
            <tr className="inv-item" key={ch.id}>
              <td>{chargeLabel(ch.kind)}{ch.desc ? `: ${ch.desc}` : ''}<small className="inv-mq">{num(ch.qty)} {chargeUnit(ch.kind, ch.qty)} at {money(ch.rate, cur)}</small></td>
              <td className="r">{num(ch.qty)} {chargeUnit(ch.kind, ch.qty)}</td>
              <td className="r">{money(ch.rate, cur)}</td>
              <td className="r">{money(num(ch.qty) * num(ch.rate), cur)}</td>
            </tr>
          ))}
          {t.consumables > 0 && (
            <tr className="inv-item">
              <td>Shop consumables{c.mode === 'percent' ? ` (${num(c.value)}% of labor)` : ''}</td><td /><td /><td className="r">{money(t.consumables, cur)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr><td colSpan={3} className="r">Labor</td><td className="r">{money(t.labor, cur)}</td></tr>
          <tr><td colSpan={3} className="r">Parts</td><td className="r">{money(t.parts, cur)}</td></tr>
          {t.charges > 0 && <tr><td colSpan={3} className="r">Travel and other charges</td><td className="r">{money(t.charges, cur)}</td></tr>}
          {t.consumables > 0 && <tr><td colSpan={3} className="r">Consumables</td><td className="r">{money(t.consumables, cur)}</td></tr>}
          {t.tax > 0 && <tr><td colSpan={3} className="r">Tax at {num(d.taxRate)}%</td><td className="r">{money(t.tax, cur)}</td></tr>}
          <tr className="inv-total"><td colSpan={3} className="r">Total due</td><td className="r">{money(t.total, cur)}</td></tr>
        </tfoot>
      </table>
      {d.notes && <p className="inv-notes pre">{d.notes}</p>}
      {(pay.to || pay.how || pay.address || pay.terms) && (
        <section className="inv-pay">
          <p className="inv-label">How to pay</p>
          {pay.to && <p><b>Make payment out to {pay.to}</b></p>}
          {pay.terms && <p>Terms: {pay.terms}</p>}
          {pay.address && <p className="pre">{pay.address}</p>}
          {pay.how && <p className="pre">{pay.how}</p>}
        </section>
      )}
      <p className="inv-foot">Pay {business.name || contractorName} directly. CJM Marine keeps the work record and does not take or hold payments.</p>
    </article>
  );
}

/** The contractor's invoice for one work order: create it, adjust it, preview and print, email it, mark it paid. */
export function InvoicePanel({ wo, business, onData }) {
  const inv = wo.invoice;
  const [d, setD] = useState(inv ? inv.data : null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState(false);
  const [charge, setCharge] = useState({ kind: 'mileage', desc: '', qty: '', rate: business.mileRate || '' });
  const [paidNote, setPaidNote] = useState('');

  useEffect(() => { setD(inv ? inv.data : null); setDirty(false); }, [inv && inv.id, inv && inv.editedAt, inv && inv.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(action, args, after) {
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await call(action, args);
      onData(r);
      if (r.message) setMsg(r.message);
      if (after) after(r);
      return r;
    } catch (e) { setError(e.message); return null; } finally { setBusy(false); }
  }

  if (!inv) {
    return (
      <section className="wo-section">
        <h3>Invoice</h3>
        <p className="hint">Builds an invoice from this work order: a line for each item with its hours and parts, at your rate. You can change any amount before you send it. The work order itself does not change.</p>
        {!num(business.rate) && <p className="hint">No labor rate set yet, so lines start at zero. Set one under My business.</p>}
        {error && <div className="alert">{error}</div>}
        <div className="actions left">
          <button className="btn primary" disabled={busy || !(wo.items || []).length} onClick={() => run('createInvoice', { woId: wo.id })}>
            {busy ? 'Building…' : 'Create the invoice'}
          </button>
          {!(wo.items || []).length && <span className="hint">Add the work items first.</span>}
        </div>
      </section>
    );
  }

  if (!d) return null;
  const cur = d.currency || inv.currency || 'USD';
  const paid = inv.status === 'paid';
  const t = invTotals(d);
  const ro = paid;
  const change = (fn) => { setD(fn(d)); setDirty(true); };
  const setItem = (id, k, v) => change((x) => ({ ...x, items: x.items.map((it) => (it.id === id ? { ...it, [k]: v } : it)) }));
  const setPart = (iid, pid, k, v) => change((x) => ({ ...x, items: x.items.map((it) => (it.id !== iid ? it : { ...it, parts: it.parts.map((p) => (p.id === pid ? { ...p, [k]: v } : p)) })) }));
  const dropPart = (iid, pid) => change((x) => ({ ...x, items: x.items.map((it) => (it.id !== iid ? it : { ...it, parts: it.parts.filter((p) => p.id !== pid) })) }));
  const setPay = (k, v) => change((x) => ({ ...x, pay: { ...(x.pay || {}), [k]: v } }));
  const seedRate = (kind) => ({ mileage: business.mileRate, travel: business.travelRate || business.rate }[kind] || '');
  const addCharge = () => {
    if (!num(charge.rate)) return;
    change((x) => ({ ...x, charges: [...(x.charges || []), { id: `C${Date.now().toString(36)}`, kind: charge.kind, desc: charge.desc.trim(), qty: charge.qty || '1', rate: charge.rate }] }));
    setCharge({ ...charge, desc: '', qty: '' });
  };
  const save = () => run('saveInvoice', { id: inv.id, invoice: d }, () => setMsg('Invoice saved.'));
  const send = async () => {
    if (dirty && !(await run('saveInvoice', { id: inv.id, invoice: d }))) return;
    run('sendInvoice', { id: inv.id });
  };

  return (
    <section className="wo-section invoice-panel">
      <div className="group-head">
        <h3>Invoice {inv.number} <span className={`inv-state is-${inv.status}`}>{paid ? `Paid ${fmtStamp(inv.paidAt)}` : inv.status === 'sent' ? `Sent ${fmtStamp(inv.sentAt)}` : 'Draft'}</span></h3>
        <b className="inv-sum">{money(t.total, cur)}</b>
      </div>
      {inv.sentTo && <p className="hint">Emailed to {inv.sentTo}. {inv.link && <a href={inv.link} target="_blank" rel="noreferrer">Open the customer's copy</a>}</p>}
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}

      <div className="two">
        <label>Bill to<input value={d.billToName || ''} disabled={ro} onChange={(e) => change((x) => ({ ...x, billToName: e.target.value }))} placeholder="Captain or Owner" /></label>
        <label>Send to email<input type="email" value={d.billToEmail || ''} disabled={ro} onChange={(e) => change((x) => ({ ...x, billToEmail: e.target.value }))} placeholder="captain@example.com" /></label>
      </div>
      <label className="inv-po"><span>PO number <span className="opt">(the boat's purchase order, if they gave one)</span></span>
        <input value={d.poNumber || ''} disabled={ro} maxLength={40} onChange={(e) => change((x) => ({ ...x, poNumber: e.target.value }))} />
      </label>

      <div className="inv-lines">
        <div className="inv-line inv-line-head"><span>Item</span><span>Hours billed</span><span>Rate</span><span className="r">Amount</span></div>
        {(d.items || []).map((it) => (
          <div key={it.id} className="inv-block">
            <div className="inv-line">
              <span><b>{it.no}. {it.label}</b>{num(it.hoursBilled) !== num(it.hoursLogged) && <small className="muted">Logged {num(it.hoursLogged)} hr on the work order</small>}</span>
              <input aria-label={`Hours billed, item ${it.no}`} inputMode="decimal" value={it.hoursBilled} disabled={ro} onChange={(e) => setItem(it.id, 'hoursBilled', cleanNum(e.target.value))} />
              <input aria-label={`Rate, item ${it.no}`} inputMode="decimal" value={it.rate} disabled={ro} onChange={(e) => setItem(it.id, 'rate', cleanNum(e.target.value))} />
              <span className="r">{money(num(it.hoursBilled) * num(it.rate), cur)}</span>
            </div>
            {(it.parts || []).map((p) => (
              <div key={p.id} className="inv-line inv-part-line">
                <span>Part: {[p.desc, p.pn].filter(Boolean).join(', ')} {!ro && <button type="button" className="link" onClick={() => dropPart(it.id, p.id)}>remove</button>}</span>
                <input aria-label="Quantity" inputMode="decimal" value={p.qty} disabled={ro} onChange={(e) => setPart(it.id, p.id, 'qty', cleanNum(e.target.value))} />
                <input aria-label="Price each" inputMode="decimal" value={p.price} disabled={ro} onChange={(e) => setPart(it.id, p.id, 'price', cleanNum(e.target.value))} placeholder="Price" />
                <span className="r">{money(num(p.qty) * num(p.price), cur)}</span>
              </div>
            ))}
          </div>
        ))}
        {(d.charges || []).map((c) => (
          <div key={c.id} className="inv-line">
            <span>{chargeLabel(c.kind)}{c.desc ? `: ${c.desc}` : ''} {!ro && <button type="button" className="link" onClick={() => change((x) => ({ ...x, charges: x.charges.filter((y) => y.id !== c.id) }))}>remove</button>}</span>
            <span>{num(c.qty)} {chargeUnit(c.kind, c.qty)}</span>
            <span>{money(c.rate, cur)}</span>
            <span className="r">{money(num(c.qty) * num(c.rate), cur)}</span>
          </div>
        ))}
      </div>

      {!ro && (
        <fieldset className="recur">
          <legend>Add a charge</legend>
          <p className="hint">Travel, mileage, lodging, shipping: anything that is not labor or a part.</p>
          <div className="inv-add">
            <select aria-label="Charge type" value={charge.kind} onChange={(e) => setCharge({ ...charge, kind: e.target.value, rate: seedRate(e.target.value) || charge.rate })}>
              {CHARGE_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <input aria-label="Description" value={charge.desc} onChange={(e) => setCharge({ ...charge, desc: e.target.value })} placeholder="Description (optional)" />
            <input aria-label="Quantity" inputMode="decimal" value={charge.qty} onChange={(e) => setCharge({ ...charge, qty: cleanNum(e.target.value) })} placeholder={chargeUnit(charge.kind)} />
            <input aria-label="Rate" inputMode="decimal" value={charge.rate} onChange={(e) => setCharge({ ...charge, rate: cleanNum(e.target.value) })} placeholder="Rate" />
            <button type="button" className="btn" disabled={!num(charge.rate)} onClick={addCharge}>Add</button>
          </div>
        </fieldset>
      )}

      <div className="inv-adjust">
        <label>Consumables
          <select value={(d.consumables || {}).mode || 'flat'} disabled={ro} onChange={(e) => change((x) => ({ ...x, consumables: { ...(x.consumables || {}), mode: e.target.value } }))}>
            <option value="flat">Flat amount</option><option value="percent">Percent of labor</option>
          </select>
        </label>
        <label>{(d.consumables || {}).mode === 'percent' ? 'Percent' : 'Amount'}
          <input inputMode="decimal" value={(d.consumables || {}).value || ''} disabled={ro} onChange={(e) => change((x) => ({ ...x, consumables: { ...(x.consumables || {}), value: cleanNum(e.target.value) } }))} />
        </label>
        <label>Tax %<input inputMode="decimal" value={d.taxRate || ''} disabled={ro} onChange={(e) => change((x) => ({ ...x, taxRate: cleanNum(e.target.value) }))} /></label>
      </div>

      <div className="inv-totals">
        <span>Labor {money(t.labor, cur)}</span><span>Parts {money(t.parts, cur)}</span>
        {t.charges > 0 && <span>Charges {money(t.charges, cur)}</span>}
        {t.consumables > 0 && <span>Consumables {money(t.consumables, cur)}</span>}
        {t.tax > 0 && <span>Tax {money(t.tax, cur)}</span>}
        <b>Total {money(t.total, cur)}</b>
      </div>

      <label>Notes on the invoice<textarea rows={2} value={d.notes || ''} disabled={ro} onChange={(e) => change((x) => ({ ...x, notes: e.target.value }))} placeholder="PO number, anything the Captain or Owner should see" /></label>

      <details className="inv-paydetails">
        <summary>How to pay you <span className="muted">{(d.pay || {}).to ? `(${d.pay.to})` : '(not set)'}</span></summary>
        <p className="hint">Copied from My business when the invoice was made. Changes here are for this invoice only.</p>
        <div className="two">
          <label>Make payment out to<input value={(d.pay || {}).to || ''} disabled={ro} onChange={(e) => setPay('to', e.target.value)} /></label>
          <label>Terms<input value={(d.pay || {}).terms || ''} disabled={ro} onChange={(e) => setPay('terms', e.target.value)} placeholder="Net 15" /></label>
        </div>
        <label>Remit to address<textarea rows={2} value={(d.pay || {}).address || ''} disabled={ro} onChange={(e) => setPay('address', e.target.value)} /></label>
        <label>How to pay<textarea rows={2} value={(d.pay || {}).how || ''} disabled={ro} onChange={(e) => setPay('how', e.target.value)} placeholder={'Zelle: (555) 010-0000\nACH or wire details on request'} /></label>
      </details>

      <div className="actions left wo-actions">
        {!ro && <button className="btn" disabled={busy || !dirty} onClick={save}>{dirty ? 'Save invoice' : 'Saved'}</button>}
        <button className="btn" onClick={() => setPreview(true)}>Preview and print</button>
        {!paid && <button className="btn primary" disabled={busy || !d.billToEmail || !(t.total > 0)} onClick={send}>{inv.status === 'sent' ? 'Email it again' : 'Email the invoice'}</button>}
      </div>
      <div className="inv-paid-row">
        {paid ? (
          <>
            <span>Marked paid {fmtStamp(inv.paidAt)}{inv.paidNote ? `: ${inv.paidNote}` : ''}.</span>
            <button className="link" disabled={busy} onClick={() => run('setInvoicePaid', { id: inv.id, paid: false })}>Mark unpaid</button>
          </>
        ) : (
          <>
            <input aria-label="Payment note" value={paidNote} onChange={(e) => setPaidNote(e.target.value)} placeholder="Payment note, e.g. Zelle received" />
            <button className="btn" disabled={busy || dirty} onClick={() => run('setInvoicePaid', { id: inv.id, paid: true, note: paidNote })}>Mark paid</button>
          </>
        )}
      </div>
      <p className="hint">CJM Marine does not take payments. The customer pays you directly, and you mark the invoice paid.</p>

      {preview && (
        <Modal title={`Invoice ${inv.number}`} wide onClose={() => setPreview(false)}>
          <InvoiceDoc inv={{ ...inv, data: d }} business={business} wo={wo} />
          <div className="actions noprint">
            {dirty && <span className="hint">Unsaved changes are shown here. Save before you email it.</span>}
            <button className="btn primary" onClick={printInvoice}>Print or save as PDF</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** What the Captain or Owner opens from the emailed invoice link. No account needed. */
export function InvoicePage({ token }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { call('getInvoice', { invoiceToken: token }).then(setR).catch((e) => setError(e.message)); }, [token]);
  return (
    <div className="ext-review invoice-page">
      <header className="ext-top noprint">
        <a href="/" aria-label="CJM Marine home"><Logo size="sm" /></a>
        <a className="top-join" href="/login?request=1&as=captain">Open a free account</a>
      </header>
      <main className="ext-main card">
        {!r && !error && <p className="empty">Loading…</p>}
        {error && <div className="alert">{error}</div>}
        {r && (
          <>
            <div className="actions noprint"><button className="btn primary" onClick={() => window.print()}>Print or save as PDF</button></div>
            <InvoiceDoc inv={r.invoice} business={r.business} contractorName={r.contractorName} wo={r.workOrder} />
          </>
        )}
      </main>
    </div>
  );
}
