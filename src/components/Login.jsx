import { useState } from 'react';
import { call, setToken } from '../api.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await call('login', { email, password });
      setToken(r.token);
      onLogin(r.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-panel">
        <div className="login-name">Karyatis</div>
        <p className="login-sub">Crew maintenance log</p>
        <form onSubmit={submit}>
          <label>Email
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>Password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="alert">{error}</div>}
          <button className="btn primary full" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        </form>
        <p className="hint">Need an account? Ask the captain or an admin to add you.</p>
      </div>
    </div>
  );
}
