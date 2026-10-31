import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { fmtDate } from '../util.js';
import Logo from './Logo.jsx';
import { AttachmentList } from './Attachments.jsx';

/** Opened from the email a Captain or Owner gets when crew log a job on a boat that is not on CJM Marine. No account needed. */
export default function ExternalReview({ token }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ name: '', role: 'Captain', score: 0, text: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call('getWorkReview', { reviewToken: token }).then((x) => { setR(x); setF((v) => ({ ...v, name: x.job.contactName || '' })); }).catch((e) => setError(e.message));
  }, [token]);

  async function answer(approve) {
    setBusy(true); setError('');
    try { setR(await call('answerWorkReview', { reviewToken: token, answer: { ...f, approve, score: approve ? f.score : 0 } })); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const j = r && r.job;
  return (
    <div className="ext-review">
      <header className="ext-top"><Logo size="md" /></header>
      <main className="ext-main card">
        {!r && !error && <p className="empty">Loading…</p>}
        {error && <div className="alert">{error}</div>}
        {j && (
          <>
            <h1>Confirm a job on {j.boatName}</h1>
            <p><b>{j.crewName}</b>{j.crewHeadline && <span className="muted">, {j.crewHeadline}</span>} says they did this work on your boat:</p>
            <div className="ext-job">
              <b>{j.title}</b>
              <small>{[j.system, j.performedDate && `done ${fmtDate(j.performedDate)}`].filter(Boolean).join(', ')}</small>
              {j.description && <p>{j.description}</p>}
              <AttachmentList items={j.attachments} action="workReviewFile" extra={{ reviewToken: token }} />
            </div>

            {j.status === 'pending' && (
              <div className="form">
                <div className="two">
                  <label>Your name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoComplete="name" /></label>
                  <label>You are the
                    <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{r.roles.map((x) => <option key={x}>{x}</option>)}</select>
                  </label>
                </div>
                <p className="hint">{j.wantScore ? 'They asked for a score from 1 to 10 for their work record (optional).' : 'You can add a score from 1 to 10 for their work record (optional).'}</p>
                <div className="score-pick" role="radiogroup" aria-label="Score from 1 to 10">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={f.score === n}
                      className={f.score === n ? 'on' : n <= 4 ? 'low' : n <= 7 ? 'mid' : 'high'} onClick={() => setF({ ...f, score: f.score === n ? 0 : n })}>{n}</button>
                  ))}
                </div>
                <textarea rows={2} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Comment (optional)" aria-label="Comment" />
                <div className="actions left">
                  <button className="btn primary" disabled={busy || !f.name.trim()} onClick={() => answer(true)}>{f.score ? `Confirm with ${f.score}/10` : 'Confirm the job'}</button>
                  <button className="btn" disabled={busy || !f.name.trim()} onClick={() => answer(false)}>This is not right</button>
                </div>
                <p className="hint">Your answer goes on {j.crewName.split(' ')[0]}'s work record with your role and name. Nothing else is shared.</p>
              </div>
            )}
            {j.status === 'approved' && <div className="ok">Confirmed{j.score ? ` with ${j.score}/10` : ''} by {j.decidedLabel}. Thank you.</div>}
            {j.status === 'declined' && <div className="ok">Answered by {j.decidedLabel}. The job was not confirmed.</div>}
            {j.status === 'expired' && <div className="alert">This link has expired. Ask {j.crewName} to send the job again.</div>}
            {j.status === 'cancelled' && <div className="alert">{j.crewName} withdrew this job.</div>}

            <div className="ext-invite">
              <b>Keep {j.boatName}'s maintenance on CJM Marine?</b>
              <p>CJM Marine keeps maintenance logs, crew, rotations and handovers in one place, and jobs like this one land straight in your log once you approve them. It is optional.</p>
              <a className="btn" href={r.joinUrl}>Request {j.boatName} on CJM Marine</a>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
