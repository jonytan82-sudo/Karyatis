import { useEffect, useState } from 'react';
import { call, setToken } from '../api.js';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login'); // login | forgot | code
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!busy) { setSlow(false); return undefined; }
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, [busy]);

  async function run(fn) {
    setBusy(true); setError('');
    try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const go = (m) => { setMode(m); setError(''); setInfo(''); setPassword(''); setCode(''); };

  const submit = (e) => {
    e.preventDefault();
    if (mode === 'login') {
      run(async () => { const r = await call('login', { email, password }); setToken(r.token); onLogin(r); });
    } else if (mode === 'forgot') {
      run(async () => { const r = await call('requestReset', { email }); setInfo(r.message); setMode('code'); });
    } else {
      run(async () => {
        const r = await call('confirmReset', { email, code, newPassword: password });
        setToken(r.token); onLogin(r);
      });
    }
  };

  const titles = { login: 'Crew maintenance log', forgot: 'Reset your password', code: 'Enter your reset code' };
  const buttons = { login: ['Log in', 'Logging in…'], forgot: ['Email me a reset code', 'Sending…'], code: ['Set new password', 'Saving…'] };

  return (
    <div className="login">
      <div className="login-panel">
        <div className="login-name">Karyatis</div>
        <p className="login-sub">{titles[mode]}</p>
        <form onSubmit={submit}>
          <label>Email
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required readOnly={mode === 'code'} />
          </label>
          {mode === 'code' && (
            <label>Reset code
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
            </label>
          )}
          {mode !== 'forgot' && (
            <label>{mode === 'code' ? 'New password' : 'Password'}
              <input type="password" autoComplete={mode === 'code' ? 'new-password' : 'current-password'} minLength={mode === 'code' ? 6 : undefined}
                value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          )}
          {info && <div className="ok">{info} Check your inbox and spam folder.</div>}
          {error && <div className="alert">{error}</div>}
          <button className="btn primary full" disabled={busy}>{busy ? buttons[mode][1] : buttons[mode][0]}</button>
          {slow && <p className="hint">Still connecting. The first request after a quiet spell can take up to 15 seconds.</p>}
        </form>
        <p className="hint">
          {mode === 'login'
            ? <button className="link" onClick={() => go('forgot')}>Forgot password?</button>
            : <button className="link" onClick={() => go('login')}>Back to log in</button>}
        </p>
        {mode === 'code' && <p className="hint"><button className="link" onClick={() => go('forgot')}>Send a new code</button></p>}
        {mode === 'login' && <p className="hint">Need an account? Ask the captain to add you.</p>}
      </div>
    </div>
  );
}
