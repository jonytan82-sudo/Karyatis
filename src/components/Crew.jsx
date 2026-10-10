import { useState } from 'react';
import { call } from '../api.js';
import { POSITIONS, POSITION_HELP } from '../util.js';
import SetupLink from './SetupLink.jsx';
import Requests from './Requests.jsx';
import Modal from './Modal.jsx';
import ProfileView from './ProfileView.jsx';

const BLANK = { email: '', name: '', position: 'Deckhand' };

export default function Crew({ user, vessel, position, perms, crew, onChanged }) {
  const manager = perms.manageCrew;
  const ownerRights = position === 'Owner' || user.isAdmin;
  const [form, setForm] = useState(BLANK);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);

  async function run(fn, done) {
    setError(''); setMsg(''); setBusy(true);
    try { const r = await fn(); if (done) setMsg(done); onChanged(); return r; }
    catch (e) { setError(e.message); return null; }
    finally { setBusy(false); }
  }

  const invite = async (e) => {
    e.preventDefault();
    setResult(null);
    const r = await run(() => call('inviteMember', { member: form }));
    if (r) { setResult(r); setForm(BLANK); }
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

  const active = crew.filter((c) => c.status === 'active');
  const invited = crew.filter((c) => c.status === 'invited');
  const positions = POSITIONS.filter((p) => p !== 'Owner' || ownerRights);

  const row = (c) => (
    <li key={c.id} className={c.status === 'invited' ? 'inactive' : ''}>
      <span className="crew-who">
        <button className="link plain" onClick={() => setViewing(c.id)}><b>{c.name}</b></button>
        <small>
          {c.position}, {c.email}
          {c.status === 'invited' && ', invitation pending'}
          {c.needsSetup && c.status === 'active' && ', has not set a password yet'}
        </small>
      </span>
      {manager && c.id !== user.id && (
        <span className="crew-actions">
          {c.status === 'active' && (c.position !== 'Owner' || ownerRights) && (
            <select value={c.position} aria-label={`Position for ${c.name}`} disabled={busy}
              onChange={(e) => run(() => call('setPosition', { userId: c.id, position: e.target.value }), `${c.name} is now ${e.target.value}.`)}>
              {positions.map((p) => <option key={p}>{p}</option>)}
            </select>
          )}
          {c.needsSetup && c.status === 'active' && <button className="link" onClick={() => resend(c)}>New setup link</button>}
          {(c.position !== 'Owner' || ownerRights) && (
            <button className="link danger" onClick={() => remove(c)}>{c.status === 'invited' ? 'Cancel invite' : 'Remove'}</button>
          )}
        </span>
      )}
    </li>
  );

  return (
    <div className="crew">
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}

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
              Enter their email. Crew who already have a CJM Marine account from another vessel get an invitation and keep their profile.
              New crew get a link to set their password.
            </p>
            <div className="two">
              <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
              <label><span>Name <span className="opt">(needed for new accounts)</span></span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
            </div>
            <label>Position
              <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}>
                {positions.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <p className="hint">{POSITION_HELP[form.position]}</p>
            <div className="actions left"><button className="btn primary" disabled={busy}>Add to {vessel.name}</button></div>
          </form>
        </section>
      )}

      {manager && <Requests vesselId={vessel.id} canGrantOwner={ownerRights} onChanged={onChanged} />}

      <section className="group">
        <h3>What each position can do</h3>
        <dl className="positions">
          {POSITIONS.map((p) => <div key={p}><dt>{p}</dt><dd>{POSITION_HELP[p]}</dd></div>)}
        </dl>
        <p className="hint">Everyone on the vessel can see all its tasks, report issues, add notes, and sign off tasks assigned to them.</p>
      </section>

      {viewing && (
        <Modal title="Crew profile" onClose={() => setViewing(null)} wide>
          <ProfileView userId={viewing} />
        </Modal>
      )}
    </div>
  );
}
