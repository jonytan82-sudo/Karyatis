import { useEffect, useState } from 'react';
import { call, setToken } from '../api.js';
import { POSITIONS } from '../util.js';

const setupToken = () => new URLSearchParams(window.location.search).get('setup') || '';
const clearSetupParam = () => window.history.replaceState(null, '', window.location.pathname);

export default function Login({ onLogin }) {
  const [mode, setMode] = useState(setupToken() ? 'setup' : 'login'); // login | forgot | code | request | setup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [req, setReq] = useState({ name: '', kind: 'Crew', position: '', vesselName: '', message: '' });
  const [setupName, setSetupName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!busy) { setSlow(false); return undefined; }
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, [busy]);

  useEffect(() => {
    if (mode !== 'setup') return;
    setBusy(true);
    call('getSetup', { setupToken: setupToken() })
      .then((r) => { setSetupName(r.name); setEmail(r.email); })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [mode]);

  async function run(fn) {
    setBusy(true); setError('');
    try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const go = (m) => {
    if (m !== 'setup' && setupToken()) clearSetupParam();
    setMode(m); setError(''); setInfo(''); setPassword(''); setCode(''); setDone(false);
  };
  const finish = (r) => { setToken(r.token); clearSetupParam(); onLogin(r); };

  const submit = (e) => {
    e.preventDefault();
    if (mode === 'login') run(async () => finish(await call('login', { email, password, vesselId: '' })));
    else if (mode === 'forgot') run(async () => { const r = await call('requestReset', { email }); setInfo(r.message); setMode('code'); });
    else if (mode === 'code') run(async () => finish(await call('confirmReset', { email, code, newPassword: password })));
    else if (mode === 'setup') run(async () => finish(await call('completeSetup', { setupToken: setupToken(), newPassword: password })));
    else if (mode === 'request') run(async () => { const r = await call('requestAccount', { request: { ...req, email } }); setInfo(r.message); setDone(true); });
  };

  const titles = {
    login: 'Vessel maintenance and crew',
    forgot: 'Reset your password',
    code: 'Enter your reset code',
    request: 'Request an account',
    setup: setupName ? `Welcome, ${setupName.split(' ')[0]}. Set your password to finish.` : 'Set up your account',
  };
  const buttons = {
    login: ['Log in', 'Logging in…'], forgot: ['Email me a reset code', 'Sending…'], code: ['Set new password', 'Saving…'],
    request: ['Send request', 'Sending…'], setup: ['Set password and log in', 'Saving…'],
  };
  const setReqF = (k) => (e) => setReq({ ...req, [k]: e.target.value });

  return (
    <div className="login">
      <div className="login-panel">
        <div className="login-name">CJM Marine</div>
        <p className="login-sub">{titles[mode]}</p>
        {done ? (
          <div className="ok">{info}</div>
        ) : (
          <form onSubmit={submit}>
            {mode === 'request' && (
              <label>Full name<input value={req.name} onChange={setReqF('name')} required autoComplete="name" /></label>
            )}
            <label>Email
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required
                readOnly={mode === 'code' || mode === 'setup'} />
            </label>
            {mode === 'request' && (
              <>
                <label>I am
                  <select value={req.kind} onChange={setReqF('kind')}>
                    <option value="Crew">Crew</option><option value="Captain">Captain</option><option value="Owner">Owner or manager</option>
                  </select>
                </label>
                {req.kind === 'Crew' && (
                  <label>Position
                    <select value={req.position} onChange={setReqF('position')}>
                      <option value="">Choose</option>
                      {POSITIONS.filter((p) => p !== 'Owner' && p !== 'Captain').map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </label>
                )}
                <label><span>Vessel <span className="opt">(if you have one)</span></span><input value={req.vesselName} onChange={setReqF('vesselName')} placeholder="M/Y Karyatis" /></label>
                <label><span>Message <span className="opt">(optional)</span></span><textarea rows={2} value={req.message} onChange={setReqF('message')} /></label>
              </>
            )}
            {mode === 'code' && (
              <label>Reset code
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
              </label>
            )}
            {(mode === 'login' || mode === 'code' || mode === 'setup') && (
              <label>{mode === 'login' ? 'Password' : 'New password'}
                <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? undefined : 6}
                  value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
            )}
            {info && <div className="ok">{info} Check your inbox and spam folder.</div>}
            {error && <div className="alert">{error}</div>}
            <button className="btn primary full" disabled={busy || (mode === 'setup' && !setupName)}>{busy ? buttons[mode][1] : buttons[mode][0]}</button>
            {slow && <p className="hint">Still connecting. The first request after a quiet spell can take up to 15 seconds.</p>}
          </form>
        )}
        <div className="login-links">
          {mode === 'login' ? (
            <>
              <button className="link" onClick={() => go('forgot')}>Forgot password?</button>
              <button className="link" onClick={() => go('request')}>Request an account</button>
            </>
          ) : (
            <button className="link" onClick={() => go('login')}>Back to log in</button>
          )}
          {mode === 'code' && <button className="link" onClick={() => go('forgot')}>Send a new code</button>}
        </div>
        {mode === 'request' && !done && (
          <p className="hint">Your captain or CJM reviews requests. If you already have an account from another vessel, log in instead and ask the captain to invite you.</p>
        )}
      </div>
    </div>
  );
}
