import { useCallback, useEffect, useState } from 'react';
import { call } from '../api.js';
import { fmtStamp } from '../util.js';

export const VESSEL_TYPES = ['Motor yacht', 'Sailing yacht', 'Catamaran', 'Expedition yacht', 'Sport fisher', 'Other'];
const ROLES = [['captain', 'Captain'], ['owner', 'Owner'], ['manager', 'Yacht manager (shore-based)']];
const BLANK = { name: '', type: 'Motor yacht', length: '', homePort: '', role: 'captain', message: '' };
const STATUS = { pending: 'Waiting for CJM Marine', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled' };

/** For owners and captains: ask CJM Marine to add a yacht, and see what happened to earlier requests. */
export function RequestYacht({ onChanged }) {
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call('listVesselRequests').then((r) => setList(r.requests)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const send = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setMsg('');
    try { const r = await call('requestVessel', { vessel: form }); setMsg(r.message); setForm(null); await load(); onChanged?.(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const cancel = async (id) => {
    setError('');
    try { await call('cancelVesselRequest', { id }); await load(); onChanged?.(); } catch (err) { setError(err.message); }
  };

  return (
    <section className="group yacht-req">
      <h3>Add a new yacht</h3>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}
      {!form && (
        <div className="card note-card">
          <p>Taking on another yacht? Send CJM Marine the details. Once approved, the yacht appears in your vessels with you aboard, ready for its maintenance program and crew.</p>
          <div className="actions left"><button className="btn primary" onClick={() => { setForm({ ...BLANK }); setMsg(''); }}>Request a new yacht</button></div>
        </div>
      )}
      {form && (
        <form className="form card" onSubmit={send}>
          <div className="two">
            <label>Yacht name<input value={form.name} onChange={set('name')} required maxLength={100} placeholder="M/Y Aurora" /></label>
            <label>My role on board
              <select value={form.role} onChange={set('role')}>{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
          </div>
          <div className="three">
            <label>Type<select value={form.type} onChange={set('type')}>{VESSEL_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label><span>Length <span className="opt">(optional)</span></span><input value={form.length} onChange={set('length')} maxLength={20} placeholder="42 m or 138 ft" /></label>
            <label><span>Home port <span className="opt">(optional)</span></span><input value={form.homePort} onChange={set('homePort')} maxLength={80} placeholder="Fort Lauderdale, FL" /></label>
          </div>
          <label><span>Message to CJM Marine <span className="opt">(optional)</span></span>
            <textarea rows={2} value={form.message} onChange={set('message')} maxLength={1000} placeholder="Start date, crew size, anything we should know" />
          </label>
          <div className="actions left">
            <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
            <button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}
      {list && list.length > 0 && (
        <ul className="yr-list">
          {list.map((r) => (
            <li key={r.id}>
              <div><b>{r.name}</b> <small>{[r.type, r.length, r.homePort].filter(Boolean).join(', ')} · as {r.role}</small></div>
              <div className="yr-meta">
                <span className={`tag yr-${r.status}`}>{STATUS[r.status] || r.status}</span>
                <small>Sent {fmtStamp(r.createdAt)}</small>
                {r.status === 'pending' && <button className="link danger" onClick={() => cancel(r.id)}>Cancel request</button>}
              </div>
              {r.note && <small className="yr-note">CJM Marine: {r.note}</small>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** For CJM admins: approve (optionally correcting details) or decline yacht requests. */
export function YachtRequestsAdmin({ onChanged }) {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState({});
  const [declining, setDeclining] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call('listVesselRequests').then((r) => setList(r.requests)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, done) => {
    setBusy(true); setError(''); setMsg('');
    try { await fn(); setMsg(done); await load(); onChanged?.(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  if (!list) return null;
  const pending = list.filter((r) => r.status === 'pending');
  const done = list.filter((r) => r.status !== 'pending').slice(0, 8);
  const field = (r, k) => (edit[r.id] && edit[r.id][k] !== undefined ? edit[r.id][k] : r[k]);
  const setField = (r, k) => (e) => setEdit({ ...edit, [r.id]: { ...(edit[r.id] || {}), [k]: e.target.value } });

  return (
    <section className="group">
      <h3>Yacht requests <span className="count">{pending.length}</span></h3>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}
      {!pending.length && <p className="empty">No yachts waiting for approval.</p>}
      <ul className="yr-list">
        {pending.map((r) => (
          <li key={r.id} className="yr-admin">
            <div><b>{r.by}</b> <small>{r.email} · wants to be {r.role} · {fmtStamp(r.createdAt)}</small></div>
            {r.message && <p className="yr-msg">“{r.message}”</p>}
            <div className="form three">
              <label>Yacht name<input value={field(r, 'name')} onChange={setField(r, 'name')} /></label>
              <label>Length<input value={field(r, 'length')} onChange={setField(r, 'length')} /></label>
              <label>Home port<input value={field(r, 'homePort')} onChange={setField(r, 'homePort')} /></label>
            </div>
            {declining === r.id ? (
              <div className="form">
                <label><span>Reason sent to {r.by} <span className="opt">(optional)</span></span>
                  <input value={field(r, 'note') || ''} onChange={setField(r, 'note')} maxLength={500} />
                </label>
                <div className="actions left">
                  <button className="btn" disabled={busy} onClick={() => run(() => call('declineVesselRequest', { id: r.id, note: field(r, 'note') }), `${r.name} declined. ${r.by} was emailed.`)}>Decline and email</button>
                  <button className="link" onClick={() => setDeclining(null)}>Back</button>
                </div>
              </div>
            ) : (
              <div className="actions left">
                <button className="btn primary" disabled={busy} onClick={() => run(() => call('approveVesselRequest', {
                  id: r.id, vessel: { name: field(r, 'name'), length: field(r, 'length'), homePort: field(r, 'homePort'), type: r.type } }),
                  `${field(r, 'name')} created with ${r.by} aboard as ${r.role}. They were emailed.`)}>Approve and create yacht</button>
                <button className="btn" onClick={() => setDeclining(r.id)}>Decline</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <details className="yr-done">
          <summary>Recent decisions ({done.length})</summary>
          <ul>{done.map((r) => <li key={r.id}><b>{r.name}</b> <small>{r.by}, {STATUS[r.status] || r.status}{r.handledAt ? ` ${fmtStamp(r.handledAt)}` : ''}</small></li>)}</ul>
        </details>
      )}
    </section>
  );
}
