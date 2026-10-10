import { useEffect, useState } from 'react';
import { call } from '../api.js';
import SetupLink from './SetupLink.jsx';
import Requests from './Requests.jsx';

const BLANK = { name: '', type: 'Motor yacht', length: '', homePort: '', managerEmail: '', managerName: '', managerPosition: 'Captain' };

export default function Admin({ user, onOpenVessel, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(BLANK);
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState('');

  const load = () => call('adminOverview').then((r) => { setData(r); setError(''); }).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    call('version').then((r) => setServer(r.version)).catch(() => setServer('out of date: deploy a new version in Apps Script'));
  }, []);

  async function run(fn, done) {
    setError(''); setMsg(''); setBusy(true);
    try { const r = await fn(); if (done) setMsg(done); await load(); onChanged(); return r; }
    catch (e) { setError(e.message); return null; }
    finally { setBusy(false); }
  }

  const create = async (e) => {
    e.preventDefault();
    const r = await run(() => call('createVessel', { vessel: form }), `${form.name} added.`);
    if (r) { setResult(r.manager); setForm(BLANK); setAdding(false); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  if (!data) return error ? <div className="alert">{error}</div> : <p className="empty">Loading…</p>;

  const activeVessels = data.vessels.filter((v) => v.active);
  const users = data.users.filter((u) => !filter || `${u.name} ${u.email} ${u.vessels.join(' ')}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="admin">
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}

      <section className="group">
        <div className="group-head">
          <h3>Vessels <span className="count">{activeVessels.length}</span></h3>
          <p className="hint head-hint">To set up a vessel for someone who asked for an account, use their email below and their request closes on its own.</p>
          <button className="btn primary" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : 'Add vessel'}</button>
        </div>
        <SetupLink result={result} onDismiss={() => setResult(null)} />
        {adding && (
          <form className="form card" onSubmit={create}>
            <div className="two">
              <label>Vessel name<input value={form.name} onChange={set('name')} required placeholder="M/Y Aurora" /></label>
              <label>Type
                <select value={form.type} onChange={set('type')}>
                  {['Motor yacht', 'Sailing yacht', 'Expedition yacht', 'Catamaran', 'Support vessel'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
            </div>
            <div className="two">
              <label>Length<input value={form.length} onChange={set('length')} placeholder="45m" /></label>
              <label>Home port<input value={form.homePort} onChange={set('homePort')} placeholder="Fort Lauderdale" /></label>
            </div>
            <fieldset className="recur">
              <legend>Who runs it</legend>
              <div className="two">
                <label>Email<input type="email" value={form.managerEmail} onChange={set('managerEmail')} /></label>
                <label>Name<input value={form.managerName} onChange={set('managerName')} /></label>
              </div>
              <label>Position
                <select value={form.managerPosition} onChange={set('managerPosition')}>
                  <option>Captain</option><option>Owner</option>
                </select>
              </label>
              <p className="hint">They can then add the rest of the crew. Leave blank to add someone later.</p>
            </fieldset>
            <div className="actions left"><button className="btn primary" disabled={busy}>Create vessel</button></div>
          </form>
        )}
        <ul className="fleet">
          {data.vessels.map((v) => (
            <li key={v.id} className={v.active ? '' : 'inactive'}>
              <div className="fleet-main">
                <b>{v.name}</b>
                <small>{[v.type, v.length, v.homePort].filter(Boolean).join(', ')}{!v.active && ', archived'}</small>
                <small>{v.managers.length ? v.managers.join(', ') : 'No Captain or Owner yet'}</small>
              </div>
              <div className="fleet-stats">
                <span><b>{v.crew}</b> crew</span>
                <span><b>{v.openTasks}</b> open</span>
                <span className={v.overdue ? 'over' : ''}><b>{v.overdue}</b> overdue</span>
              </div>
              <div className="fleet-actions">
                {v.active && <button className="btn" onClick={() => onOpenVessel(v.id)}>Open</button>}
                <button className="link" onClick={() => {
                  if (v.active && !window.confirm(`Archive ${v.name}? Its crew lose access until you restore it. Nothing is deleted.`)) return;
                  run(() => call('updateVessel', { id: v.id, vessel: { active: !v.active } }), `${v.name} ${v.active ? 'archived' : 'restored'}.`);
                }}>{v.active ? 'Archive' : 'Restore'}</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Requests vessels={activeVessels.map((v) => ({ id: v.id, name: v.name }))} canGrantOwner onChanged={() => { load(); onChanged(); }} />

      <section className="group">
        <div className="group-head">
          <h3>People <span className="count">{data.users.length}</span></h3>
          <input type="search" className="mini-search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" aria-label="Filter people" />
        </div>
        <ul className="crew-list">
          {users.map((u) => (
            <li key={u.id} className={u.active ? '' : 'inactive'}>
              <span className="crew-who">
                <span><b>{u.name}</b>{u.isAdmin && <span className="tag">CJM admin</span>}</span>
                <small>{u.email}{u.needsSetup && ', has not set a password yet'}{!u.active && ', deactivated'}</small>
                <small>{u.vessels.length ? u.vessels.join('; ') : 'No vessel'}</small>
              </span>
              {u.id !== user.id && (
                <span className="crew-actions">
                  <button className={u.active ? 'link danger' : 'link'} onClick={() => {
                    if (u.active && !window.confirm(`Deactivate ${u.name}? They can no longer log in on any vessel.`)) return;
                    run(() => call('setUserActive', { userId: u.id, active: !u.active }), `${u.name} ${u.active ? 'deactivated' : 'reactivated'}.`);
                  }}>{u.active ? 'Deactivate' : 'Reactivate'}</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <p className="hint">Google Script version: {server || 'checking…'}</p>
    </div>
  );
}
