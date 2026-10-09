import { useState } from 'react';
import { call } from '../api.js';

export default function Crew({ user, crew, onChanged }) {
  const isAdmin = user.role === 'admin';
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'crew' });
  const [pw, setPw] = useState({ oldPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function run(fn, done) {
    setError(''); setMsg('');
    try { await fn(); setMsg(done); onChanged(); }
    catch (e) { setError(e.message); }
  }

  const addCrew = (e) => {
    e.preventDefault();
    run(async () => {
      await call('addCrew', { crew: form });
      setForm({ name: '', email: '', password: '', role: 'crew' });
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
                <b>{c.name}</b>{c.role === 'admin' && <span className="tag">Admin</span>}
                <small>{c.email}{!c.active && ', inactive'}</small>
              </span>
              {isAdmin && c.id !== user.id && (
                <span className="crew-actions">
                  <button className="link" onClick={() => reset(c)}>Reset password</button>
                  <button className="link" onClick={() => run(() => call('setCrewActive', { id: c.id, active: !c.active }),
                    `${c.name} ${c.active ? 'deactivated' : 'reactivated'}.`)}>
                    {c.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
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
              <label>Role
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="crew">Crew</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </div>
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
    </div>
  );
}
