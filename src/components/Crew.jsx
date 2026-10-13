import { useState } from 'react';
import { call } from '../api.js';
import SetupLink from './SetupLink.jsx';
import Requests from './Requests.jsx';
import Modal from './Modal.jsx';
import ProfileView from './ProfileView.jsx';
import { RoleFields, RoleReference, deptNames } from './Roles.jsx';

const blankRole = (catalog) => {
  const t = catalog?.titles.find((x) => x.title === 'Deckhand');
  return { title: 'Deckhand', access: t ? t.access : 'supervised', departments: t ? t.depts : [] };
};

export default function Crew({ user, vessel, perms, crew, catalog, onChanged }) {
  const manager = perms.manageCrew;
  const allowOversight = perms.access === 'oversight' || user.isAdmin;
  const allowCommand = allowOversight || perms.access === 'command';
  const [form, setForm] = useState({ email: '', name: '', role: blankRole(catalog) });
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null); // { member, role }

  async function run(fn, done) {
    setError(''); setMsg(''); setBusy(true);
    try { const r = await fn(); if (done) setMsg(done); onChanged(); return r; }
    catch (e) { setError(e.message); return null; }
    finally { setBusy(false); }
  }

  const invite = async (e) => {
    e.preventDefault();
    setResult(null);
    const r = await run(() => call('inviteMember', { member: { email: form.email, name: form.name, role: form.role } }));
    if (r) { setResult(r); setForm({ email: '', name: '', role: blankRole(catalog) }); }
  };

  const remove = (c) => {
    const what = c.status === 'invited' ? `Cancel ${c.name}'s invitation?` :
      `Remove ${c.name} from ${vessel.name}? Their notes and sign-offs stay in the log, their open tasks become unassigned, and they keep their profile and reviews.`;
    if (window.confirm(what)) run(() => call('removeMember', { userId: c.id }), `${c.name} ${c.status === 'invited' ? 'invitation cancelled' : 'removed'}.`);
  };

  const resend = async (c) => {
    setResult(null);
    const r = await run(() => call('resendSetup', { userId: c.id }));
    if (r) setResult({ ...r, status: 'created', name: c.name });
  };

  const saveRole = async () => {
    const r = await run(() => call('setRole', { userId: editing.member.id, role: editing.role }), `${editing.member.name} updated.`);
    if (r) setEditing(null);
  };

  const active = crew.filter((c) => c.status === 'active');
  const invited = crew.filter((c) => c.status === 'invited');
  const canTouch = (c) => c.access !== 'oversight' || allowOversight;

  const row = (c) => (
    <li key={c.id} className={c.status === 'invited' ? 'inactive' : ''}>
      <span className="crew-who">
        <button className="link plain" onClick={() => setViewing(c.id)}><b>{c.name}</b></button>
        <small>{c.title}{c.email && `, ${c.email}`}</small>
        <span className="access-line">
          <span className={`access-tag acc-${c.access}`}>{c.accessLabel}</span>
          {c.departments?.length > 0 && <small>{deptNames(catalog, c.departments)}</small>}
          {c.status === 'invited' && <small>Invitation pending</small>}
          {c.needsSetup && c.status === 'active' && <small>Has not set a password yet</small>}
        </span>
      </span>
      {manager && c.id !== user.id && canTouch(c) && (
        <span className="crew-actions">
          {c.status === 'active' && (
            <button className="btn" disabled={!catalog} title={catalog ? '' : 'Update the Google Script to 2.3 first'}
              onClick={() => setEditing({ member: c, role: { title: c.title, access: c.access, departments: c.departments || [] } })}>Edit role</button>
          )}
          {c.needsSetup && c.status === 'active' && <button className="link" onClick={() => resend(c)}>New setup link</button>}
          <button className="link danger" onClick={() => remove(c)}>{c.status === 'invited' ? 'Cancel invite' : 'Remove'}</button>
        </span>
      )}
    </li>
  );

  return (
    <div className="crew">
      {msg && <div className="ok">{msg}</div>}
      {error && !editing && <div className="alert">{error}</div>}

      <section className="group">
        <h3>{vessel.name} crew <span className="count">{active.length}</span></h3>
        <ul className="crew-list">{active.map(row)}</ul>
        {invited.length > 0 && (
          <>
            <h4 className="sub">Waiting to accept</h4>
            <ul className="crew-list">{invited.map(row)}</ul>
          </>
        )}
      </section>

      {manager && (
        <section className="group">
          <h3>Add crew</h3>
          <SetupLink result={result} onDismiss={() => setResult(null)} />
          <form className="form card" onSubmit={invite}>
            <p className="hint">
              Crew who already have a CJM Marine account from another vessel get an invitation and keep their profile.
              New crew get a link to set their password.
            </p>
            <div className="two">
              <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
              <label><span>Name <span className="opt">(needed for new accounts)</span></span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
            </div>
            <RoleFields catalog={catalog} value={form.role} isNew allowOversight={allowOversight} allowCommand={allowCommand}
              onChange={(role) => setForm({ ...form, role })} />
            <div className="actions left"><button className="btn primary" disabled={busy}>Add to {vessel.name}</button></div>
          </form>
        </section>
      )}

      {manager && <Requests vesselId={vessel.id} catalog={catalog} allowOversight={allowOversight} allowCommand={allowCommand} onChanged={onChanged} />}

      <RoleReference catalog={catalog} />

      {viewing && (
        <Modal title="Crew profile" onClose={() => setViewing(null)} wide>
          <ProfileView userId={viewing} />
        </Modal>
      )}
      {editing && (
        <Modal title={`${editing.member.name}: role and access`} onClose={() => { setEditing(null); setError(''); }}>
          <div className="form">
            <RoleFields catalog={catalog} value={editing.role} allowOversight={allowOversight} allowCommand={allowCommand}
              onChange={(role) => setEditing({ ...editing, role })} />
            {error && <div className="alert">{error}</div>}
            <div className="actions">
              <button className="btn" onClick={() => { setEditing(null); setError(''); }}>Cancel</button>
              <button className="btn primary" disabled={busy} onClick={saveRole}>{busy ? 'Saving…' : 'Save role'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
