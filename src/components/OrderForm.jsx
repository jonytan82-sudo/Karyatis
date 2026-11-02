import { useState } from 'react';
import { fmtDate } from '../util.js';

export const CARRIERS = ['', 'UPS', 'FedEx', 'USPS', 'DHL', 'Amazon', 'Courier / other'];
const LABEL = { requested: 'Requested', approved: 'Approved, to order', ordered: 'Ordered', received: 'Received', declined: 'Declined', cancelled: 'Cancelled' };

/** Track-and-trace page for common carriers (same rules as the Google Script). */
export function trackUrl(carrier, number) {
  const n = encodeURIComponent(String(number || '').trim());
  const k = String(carrier || '').toLowerCase();
  if (!n) return '';
  if (/ups/.test(k)) return `https://www.ups.com/track?tracknum=${n}`;
  if (/fedex/.test(k)) return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
  if (/usps|postal/.test(k)) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
  if (/dhl/.test(k)) return `https://www.dhl.com/us-en/home/tracking/tracking-express.html?tracking-id=${n}`;
  if (/amazon/.test(k)) return `https://www.amazon.com/progress-tracker/package?trackingId=${n}`;
  return '';
}

/** "Requested 2 Nov", "Ordered 2 Nov · UPS 1Z… · due 5 Nov". */
export function OrderState({ o }) {
  const t = trackUrl(o.carrier, o.tracking);
  return (
    <small className={`order-state os-${o.status}`}>
      {LABEL[o.status] || o.status} {o.at ? fmtDate(String(o.at).slice(0, 10)) : ''}{o.qty ? `, qty ${o.qty}` : ''}
      {o.tracking && <> · {t ? <a href={t} target="_blank" rel="noopener noreferrer">{o.carrier} {o.tracking}</a> : `${o.carrier || ''} ${o.tracking}`}</>}
      {o.eta && o.status === 'ordered' && ` · due ${fmtDate(o.eta)}`}
      {o.location && o.status === 'received' && ` · left at ${o.location}`}
      {o.core && <> · <b>core due back{o.core !== 'open' ? ` ${fmtDate(o.core)}` : ''}</b></>}
    </small>
  );
}

/** Buyer records an order: quantity, supplier, order number, carrier, tracking, expected date. All optional except it being ordered. */
export function OrderForm({ qty = '', url = '', initial, busy, onSubmit, onCancel, submitLabel = 'Record order', showCore = true }) {
  const [o, setO] = useState(() => ({ qty, supplier: /amazon\./i.test(url) ? 'Amazon' : '', orderRef: '', carrier: '', tracking: '', eta: '', core: false, coreCharge: '', coreDue: '', ...(initial || {}) }));
  const set = (k) => (e) => setO({ ...o, [k]: e.target.value });
  return (
    <form className="order-form" onSubmit={(e) => { e.preventDefault(); onSubmit(o); }}>
      <div className="of-grid">
        <label>Qty<input inputMode="numeric" value={o.qty} onChange={set('qty')} /></label>
        <label>Supplier<input value={o.supplier} onChange={set('supplier')} placeholder="Amazon, West Marine…" /></label>
        <label>Order no.<input value={o.orderRef} onChange={set('orderRef')} /></label>
        <label>Carrier<select value={o.carrier} onChange={set('carrier')}>{CARRIERS.map((c) => <option key={c} value={c}>{c || 'Not yet'}</option>)}</select></label>
        <label>Tracking no.<input value={o.tracking} onChange={set('tracking')} /></label>
        <label>Expected<input type="date" value={o.eta} onChange={set('eta')} /></label>
      </div>
      {showCore && (
        <div className="core-box">
          <label className="check"><input type="checkbox" checked={o.core} onChange={(e) => setO({ ...o, core: e.target.checked })} /> <b>Core return</b> (the old part must go back for credit)</label>
          {o.core && (
            <div className="of-grid">
              <label>Core charge<input value={o.coreCharge} onChange={set('coreCharge')} placeholder="$850" /></label>
              <label>Return by<input type="date" value={o.coreDue} onChange={set('coreDue')} /></label>
            </div>
          )}
          {o.core && <p className="hint">Reminders go to the buyers and the person who asked 7 and 2 days before, then while overdue.</p>}
        </div>
      )}
      <p className="hint">Tracking can be added later from Marine supplies → Ordered. The person who asked is emailed.</p>
      <div className="actions left">
        <button className="btn primary" disabled={busy}>{submitLabel}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}


/** Mark parts received, with where they were left aboard (optional). */
export function ReceiveForm({ spots = [], busy, onSubmit, onCancel }) {
  const [loc, setLoc] = useState('');
  const id = `spots-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <form className="ss-confirm receive-form" onSubmit={(e) => { e.preventDefault(); onSubmit(loc.trim()); }}>
      <label className="inline">Left at <input list={id} value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Engine room shelf 3 (optional)" /></label>
      <datalist id={id}>{spots.map((s) => <option key={s} value={s} />)}</datalist>
      <button className="btn primary" disabled={busy}>Mark received</button>
      {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
    </form>
  );
}

export const RETURN_KINDS = { core: 'Core return', wrong: 'Wrong part', damaged: 'Damaged or faulty', other: 'Other return' };

/** A field that can be marked N/A (stored as the text "N/A"). */
function NA({ label, value, onChange, placeholder }) {
  const na = value === 'N/A';
  return (
    <label className="na-field">{label}
      <span className="maybe">
        <input value={na ? '' : value || ''} disabled={na} placeholder={na ? 'N/A' : placeholder} onChange={(e) => onChange(e.target.value)} />
        <span className="check mini"><input type="checkbox" checked={na} onChange={(e) => onChange(e.target.checked ? 'N/A' : '')} aria-label={`${label} not applicable`} /> N/A</span>
      </span>
    </label>
  );
}

/** Open (mode "open") or update a return / core. Nothing is required. */
export function ReturnForm({ mode = 'open', initial = {}, partNumber = '', isBuyer, busy, onSubmit, onCancel }) {
  const [r, setR] = useState(() => ({ kind: initial.kind || 'wrong', rma: initial.rma || '', pnOff: initial.pnOff || '', snOff: initial.snOff || '',
    pnOn: initial.pnOn || partNumber || '', snOn: initial.snOn || '', carrier: initial.carrier || '', tracking: initial.tracking || '', credit: initial.credit || '',
    due: initial.due || '', charge: initial.charge || '', note: initial.note || '', reorder: true, correctPartNumber: '' }));
  const set = (k) => (v) => setR({ ...r, [k]: v && v.target ? v.target.value : v });
  return (
    <form className="order-form return-form" onSubmit={(e) => { e.preventDefault(); onSubmit(r, false); }}>
      {mode === 'open' && (
        <label className="inline">Reason
          <select value={r.kind} onChange={set('kind')}>{Object.entries(RETURN_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
      )}
      <div className="of-grid">
        <NA label="RMA no." value={r.rma} onChange={set('rma')} />
        <NA label="Part no. coming off" value={r.pnOff} onChange={set('pnOff')} />
        <NA label="Serial no. coming off" value={r.snOff} onChange={set('snOff')} />
        <NA label="Part no. going on" value={r.pnOn} onChange={set('pnOn')} />
        <NA label="Serial no. going on" value={r.snOn} onChange={set('snOn')} />
        {(r.kind === 'core' || mode !== 'open') && <label>Return by<input type="date" value={r.due} onChange={set('due')} /></label>}
        {(r.kind === 'core' || mode !== 'open') && <label>Core charge<input value={r.charge} onChange={set('charge')} /></label>}
        <label>Return carrier<select value={r.carrier} onChange={set('carrier')}>{CARRIERS.map((c) => <option key={c} value={c}>{c || 'Not yet'}</option>)}</select></label>
        <label>Return tracking<input value={r.tracking} onChange={set('tracking')} /></label>
        <NA label="Refund / credit" value={r.credit} onChange={set('credit')} placeholder="$850 credited" />
      </div>
      <label>Note<input value={r.note} onChange={set('note')} placeholder="What was wrong, who to ship to" /></label>
      {mode === 'open' && r.kind === 'wrong' && (
        <div className="core-box">
          <label className="check"><input type="checkbox" checked={r.reorder} onChange={(e) => setR({ ...r, reorder: e.target.checked })} /> Request the right part</label>
          {r.reorder && <label>Correct part no. <span className="opt">(if different)</span><input value={r.correctPartNumber} onChange={set('correctPartNumber')} /></label>}
        </div>
      )}
      <p className="hint">Nothing here is required. Tick N/A where a number does not apply.</p>
      <div className="actions left">
        <button className="btn primary" disabled={busy}>{mode === 'open' ? 'Open return' : 'Save'}</button>
        {mode !== 'open' && isBuyer && <button type="button" className="btn" disabled={busy} onClick={() => onSubmit(r, true)}>Save and close</button>}
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
