import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { POSITIONS, POSITION_HELP } from '../util.js';

export default function Crew({ user, crew, onChanged }) {
  const isAdmin = user.perms.manageCrew;
  const [form, setForm] = useState({ name: '', email: '', password: '', position: 'Deckhand' });
  const [pw, setPw] = useState({ oldPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [server, setServer] = useState('');
  useEffect(() => {
    call('version').then((r) => setServer(r.version))
      .catch(() => setServer('OUT OF DATE. Deploy a new version in Apps Script.'));
  }, []);

  async function run(fn, done) {
    setError(''); setMsg('');
    try { await fn(); setMsg(done); onChanged(); }
    catch (e) { setError(e.message); }
  }

  const addCrew = (e) => {
    e.preventDefault();
    run(async () => {
      await call('addCrew', { crew: form });
      setForm({ name: '', email: '', password: '', position: 'Deckhand' });
    }, `${form.name} added. Send them their email and temporary password.`);
  };

  const reset = (c) => {
    const p = window.prompt(`New temporary password for ${c.name} (6+ characters)`);
    if (p) run(() => call('resetPassword', { id: c.id, newPassword: p }), `Password reset for ${c.name}.`);
  };

  const changePw = (e) => {
    e.preventDefault();
    run(async () => { await call('changePassword', pw); setPw({ oldPassword: '', newPassword: '' }); }, 'Password changed.');
  };

  return (
    <div className="crew">
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}

      <section className="group">
        <h3>Crew <span className="count">{crew.filter((c) => c.active).length}</span></h3>
        <ul className="crew-list">
          {crew.map((c) => (
            <li key={c.id} className={c.active ? '' : 'inactive'}>
              <span>
                <b>{c.name}</b>
                <small>{c.position}, {c.email}{!c.active && ', inactive'}</small>
              </span>
              {isAdmin && c.id !== user.id && (
                <span className="crew-actions">
                  <select value={c.position} aria-label={`Position for ${c.name}`}
                    onChange={(e) => run(() => call('setPosition', { id: c.id, position: e.target.value }),
                      `${c.name} is now ${e.target.value}.`)}>
                    {POSITIONS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                  <button className="link" onClick={() => reset(c)}>Reset password</button>
                  <button className="link" onClick={() => run(() => call('setCrewActive', { id: c.id, active: !c.active }),
                    `${c.name} ${c.active ? 'deactivated' : 'reactivated'}.`)}>
                    {c.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                  <button className="link danger" onClick={() => {
                    if (window.confirm(`Remove ${c.name} from the crew? Their past notes and sign-offs stay in the log, and their open tasks become unassigned.`)) {
                      run(() => call('removeCrew', { id: c.id }), `${c.name} removed.`);
                    }
                  }}>Remove</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="group">
        <h3>What each position can do</h3>
        <dl className="positions">
          {POSITIONS.map((p) => <div key={p}><dt>{p}</dt><dd>{POSITION_HELP[p]}</dd></div>)}
        </dl>
        <p className="hint">Everyone can see all tasks, report issues, add notes, and sign off tasks assigned to them.</p>
      </section>

      {isAdmin && (
        <section className="group">
          <h3>Add crew member</h3>
          <form className="form" onSubmit={addCrew}>
            <div className="two">
              <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
              <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            </div>
            <div className="two">
              <label>Temporary password<input value={form.password} minLength={6} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
              <label>Position
                <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}>
                  {POSITIONS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
            </div>
            <p className="hint">{POSITION_HELP[form.position]}</p>
            <div className="actions left"><button className="btn primary">Add crew member</button></div>
          </form>
        </section>
      )}

      <section className="group">
        <h3>Change your password</h3>
        <form className="form" onSubmit={changePw}>
          <div className="two">
            <label>Current password<input type="password" autoComplete="current-password" value={pw.oldPassword} onChange={(e) => setPw({ ...pw, oldPassword: e.target.value })} required /></label>
            <label>New password<input type="password" autoComplete="new-password" minLength={6} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required /></label>
          </div>
          <div className="actions left"><button className="btn primary">Change password</button></div>
        </form>
      </section>
      <p className="hint">Google Script version: {server || 'checking…'}</p>
    </div>
  );
}
