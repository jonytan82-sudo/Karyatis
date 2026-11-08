import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { useLiveReload } from '../live.js';
import SetupLink from './SetupLink.jsx';
import AdminSupplies from './AdminSupplies.jsx';
import Requests from './Requests.jsx';
import AdminCard from './AdminCard.jsx';
import { YachtRequestsAdmin } from './YachtRequests.jsx';
import { DeleteVessel, UploadVessel, downloadVessel } from './VesselData.jsx';

const BLANK = { name: '', type: 'Motor yacht', length: '', homePort: '', managerEmail: '', managerName: '', managerPosition: 'Captain / Master' };

function Consultants({ users, busy, run }) {
  const [f, setF] = useState({ email: '', name: '' });
  const [made, setMade] = useState(null);
  const list = users.filter((u) => u.consultant);
  return (
    <section className="group">
      <h3>Rules consultants <span className="count">{list.length}</span></h3>
      <p className="hint">A marine compliance consultant gets a login that shows only the Rules review screen: no boats, crew or tasks. They log in with an emailed code.</p>
      {list.length > 0 && (
        <ul className="crew-list">
          {list.map((u) => (
            <li key={u.id}><span className="crew-who"><b>{u.name}</b><small>{u.email}</small></span>
              <button className="link danger" disabled={busy} onClick={() => run(() => call('setConsultant', { email: u.email, on: false }), `${u.name} no longer reviews rules.`)}>Remove access</button></li>
          ))}
        </ul>
      )}
      <form className="form three consultant-form" onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(() => call('setConsultant', { email: f.email, name: f.name }));
        if (r) { setMade(r.status === 'created' ? r : null); setF({ email: '', name: '' }); }
      }}>
        <label>Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></label>
        <label><span>Name <span className="opt">(new accounts)</span></span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <button className="btn primary" disabled={busy}>Give rules access</button>
      </form>
      {made && <SetupLink result={made} onDismiss={() => setMade(null)} />}
    </section>
  );
}

const ADMIN_TABS = [['vessels', 'Vessels'], ['requests', 'Requests'], ['people', 'People'], ['supplies', 'Marine supplies'], ['system', 'Backup and system'], ['card', 'Business card']];
const TAB_KEY = 'cjm_admin_tab';
const savedTab = () => { try { const t = sessionStorage.getItem(TAB_KEY); return ADMIN_TABS.some(([k]) => k === t) ? t : 'vessels'; } catch { return 'vessels'; } };

export default function Admin({ user, catalog, onOpenVessel, onChanged, pending = 0 }) {
  const [data, setData] = useState(null);
  const [tab, setTabState] = useState(savedTab);
  const setTab = (t) => { setTabState(t); try { sessionStorage.setItem(TAB_KEY, t); } catch { /* private mode */ } };
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(BLANK);
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState('');
  const [deleting, setDeleting] = useState(null); // { id, name, email, typed }
  const [deletingVessel, setDeletingVessel] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = () => call('adminOverview').then((r) => { setData(r); setError(''); }).catch((e) => setError(e.message));
  useLiveReload(load);
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

  const [backup, setBackup] = useState(null);
  const sendBackup = async (vesselId) => {
    setBackup(null);
    const r = await run(() => call('sendBackupNow', { backupVesselId: vesselId || '' }));
    if (r) setBackup(r);
  };

  const create = async (e) => {
    e.preventDefault();
    const r = await run(() => call('createVessel', { vessel: form }), `${form.name} added.`);
    if (r) { setResult(r.manager); setForm(BLANK); setAdding(false); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  if (!data) return error ? <div className="alert">{error}</div> : <p className="empty">Loading…</p>;

  const activeVessels = data.vessels.filter((v) => v.active);
  const users = data.users.filter((u) => !filter || `${u.name} ${u.email} ${u.vessels.join(' ')}`.toLowerCase().includes(filter.toLowerCase()));

  const cw = data.contractorWork || {};
  const contractors = data.users.filter((u) => u.contractor && u.active).length;
  const counts = { vessels: activeVessels.length, people: data.users.filter((u) => u.active).length, requests: pending };

  return (
    <div className="admin">
      <nav className="subtabs admin-tabs" aria-label="CJM admin sections">
        {ADMIN_TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => { setTab(k); setMsg(''); setError(''); }}>
            {label}
            {k === 'requests' && pending > 0 ? <span className="badge">{pending}</span> : counts[k] != null && k !== 'requests' ? <span className="tab-count">{counts[k]}</span> : null}
          </button>
        ))}
      </nav>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}

      {tab === 'vessels' && (
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
              <label>Job title
                <select value={form.managerPosition} onChange={set('managerPosition')}>
                  <option>Captain / Master</option><option>Staff Captain</option>
                  <option>Yacht Owner</option><option>Yacht Manager (shore-based)</option>
                </select>
              </label>
              <p className="hint">Captains and Staff Captains get Command access; Owners and Managers get Owner oversight. They can then add the rest of the crew. Leave blank to add someone later.</p>
            </fieldset>
            <div className="actions left"><button className="btn primary" disabled={busy}>Create vessel</button></div>
          </form>
        )}
        <div className="actions left">
          <button className="btn" onClick={() => setUploading(!uploading)}>{uploading ? 'Close upload' : 'Upload vessel data'}</button>
        </div>
        {uploading && <UploadVessel onDone={(m) => { setUploading(false); setMsg(m); load(); onChanged(); }} />}
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
                {v.active && <button className="link" disabled={busy} onClick={() => sendBackup(v.id)}>Email backup</button>}
                <button className="link" onClick={() => {
                  if (v.active && !window.confirm(`Archive ${v.name}? Its crew lose access until you restore it. Nothing is deleted.`)) return;
                  run(() => call('updateVessel', { id: v.id, vessel: { active: !v.active } }), `${v.name} ${v.active ? 'archived' : 'restored'}.`);
                }}>{v.active ? 'Archive' : 'Restore'}</button>
                <button className="link" disabled={busy} onClick={() => run(() => downloadVessel(v)).then((m) => m && setMsg(m))}>Download data</button>
                <button className="link danger" onClick={() => setDeletingVessel(v.id)}>Delete</button>
              </div>
              {deletingVessel === v.id && (
                <DeleteVessel vessel={v} onCancel={() => setDeletingVessel(null)}
                  onDone={(m) => { setDeletingVessel(null); setMsg(m); load(); onChanged(); }} />
              )}
            </li>
          ))}
        </ul>
      </section>
      )}

      {tab === 'system' && (
      <>
      <section className="group">
        <div className="group-head">
          <h3>Daily backup</h3>
          <button className="btn" disabled={busy} onClick={() => sendBackup('')}>{busy ? 'Working…' : 'Email all backups now'}</button>
        </div>
        <p className="hint">
          Every morning each vessel's open tasks, open issues and last 30 days of sign-offs are saved as a Google Sheet in your Drive
          folder "CJM Marine backups". The vessel's Captain gets their vessel's sheet by email with an Excel copy attached, and you
          get one email covering every vessel.
        </p>
        {backup && (
          <div className="ok">
            Backup sent for {backup.vessels} vessel{backup.vessels === 1 ? '' : 's'}.
            <ul className="backup-links">
              {backup.files.map((f) => (
                <li key={f.url}><a href={f.url} target="_blank" rel="noreferrer">{f.vessel}</a>: {f.counts.tasks} tasks, {f.counts.issues} issues, {f.counts.overdue} overdue</li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <section className="group">
        <h3>Contractor work orders</h3>
        <p className="hint">Across all contractors. CJM Marine only keeps the records; it does not handle any money.</p>
        <div className="fleet-stats admin-stats">
          <span><b>{contractors}</b> contractors</span>
          <span><b>{cw.open || 0}</b> open</span>
          <span><b>{cw.review || 0}</b> with a Captain</span>
          <span><b>{cw.approved || 0}</b> approved</span>
          <span><b>{cw.invoicesSent || 0}</b> invoices unpaid</span>
          <span><b>{cw.invoicesPaid || 0}</b> paid</span>
        </div>
      </section>
      <section className="group">
        <h3>System</h3>
        <p className="hint">Google Script version: {server || 'checking…'}</p>
        {data.emailQuota != null && <p className="hint">Emails left today: <b className={data.emailQuota < 10 ? 'warn-text' : ''}>{data.emailQuota}</b>{data.emailQuota < 10 && ' (Google’s daily limit; it resets every 24 hours)'}</p>}
      </section>
      </>
      )}

      {tab === 'requests' && (
      <>
      <YachtRequestsAdmin onChanged={() => { load(); onChanged(); }} />
      <Requests vessels={activeVessels.map((v) => ({ id: v.id, name: v.name }))} catalog={catalog} allowOversight allowCommand onChanged={() => { load(); onChanged(); }} />
      </>
      )}

      {tab === 'supplies' && <AdminSupplies />}

      {tab === 'people' && (
      <>
      <section className="group">
        <div className="group-head">
          <h3>People <span className="count">{data.users.length}</span></h3>
          <input type="search" className="mini-search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" aria-label="Filter people" />
        </div>
        <ul className="crew-list">
          {users.map((u) => (
            <li key={u.id} className={u.active ? '' : 'inactive'}>
              <span className="crew-who">
                <span><b>{u.name}</b>{u.isAdmin && <span className="tag">CJM admin</span>}{u.consultant && <span className="tag">Rules consultant</span>}{u.contractor && <span className="tag">Contractor</span>}</span>
                <small>{u.email}{u.needsSetup && ', has not set a password yet'}{!u.active && ', deactivated'}</small>
                <small>{u.vessels.length ? u.vessels.join('; ') : 'No vessel'}</small>
              </span>
              {u.id !== user.id && (
                <span className="crew-actions">
                  <button className={u.active ? 'link danger' : 'link'} onClick={() => {
                    if (u.active && !window.confirm(`Deactivate ${u.name}? They can no longer log in on any vessel.`)) return;
                    run(() => call('setUserActive', { userId: u.id, active: !u.active }), `${u.name} ${u.active ? 'deactivated' : 'reactivated'}.`);
                  }}>{u.active ? 'Deactivate' : 'Reactivate'}</button>
                  <button className="link danger" onClick={() => setDeleting({ id: u.id, name: u.name, email: u.email, typed: '' })}>Delete account</button>
                </span>
              )}
              {deleting && deleting.id === u.id && (
                <div className="delete-box">
                  <p><b>Delete {u.name}'s account permanently?</b> This erases their name, email, password, profile, photo, certificates and reviews,
                    and removes them from every vessel. Maintenance history they signed stays on the yacht as "Deleted user". This cannot be undone.</p>
                  <label>Type their email to confirm
                    <input value={deleting.typed} onChange={(e) => setDeleting({ ...deleting, typed: e.target.value })} placeholder={u.email} autoComplete="off" />
                  </label>
                  <div className="actions left">
                    <button className="btn danger-btn" disabled={busy || deleting.typed.trim().toLowerCase() !== u.email.toLowerCase()}
                      onClick={async () => { const r = await run(() => call('deleteUser', { userId: u.id, confirmEmail: deleting.typed })); if (r) { setDeleting(null); setMsg(r.message); } }}>
                      Delete account permanently
                    </button>
                    <button className="btn" onClick={() => setDeleting(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <Consultants users={data.users} busy={busy} run={run} />
      </>
      )}

      {tab === 'card' && <AdminCard user={user} />}
    </div>
  );
}
