import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { fmtDate, fmtStamp } from '../util.js';

function ScorePicker({ value, onChange }) {
  return (
    <div className="score-pick" role="radiogroup" aria-label="Score from 1 to 10">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n}
          className={value === n ? 'on' : n <= 4 ? 'low' : n <= 7 ? 'mid' : 'high'} onClick={() => onChange(n)}>{n}</button>
      ))}
    </div>
  );
}

function Pending({ r, onSubmit, onSkip, busy }) {
  const [score, setScore] = useState(0);
  const [text, setText] = useState('');
  return (
    <li className="wr card">
      <div className="wr-head">
        <div>
          <b>{r.crewName}</b>
          <span className="wr-task">{r.task}{r.system && <small>, {r.system}</small>}</span>
        </div>
        <small>Done {fmtDate(r.performedDate)}, {r.timing}</small>
      </div>
      {r.workNotes && <p className="wr-notes"><b>Work notes:</b> {r.workNotes}</p>}
      {r.message && <p className="wr-msg">“{r.message}”</p>}
      <ScorePicker value={score} onChange={setScore} />
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What went well, what to improve (optional)" aria-label="Review" />
      <div className="actions left">
        <button className="btn primary" disabled={busy || !score} onClick={() => onSubmit(r.id, score, text)}>
          {score ? `Submit ${score}/10` : 'Choose a score'}
        </button>
        <button className="btn" disabled={busy} onClick={() => onSkip(r.id)}>Skip</button>
      </div>
    </li>
  );
}

export default function WorkReviews({ vessel, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { call('listTaskReviews').then(setData).catch((e) => setError(e.message)); }, [vessel.id]);

  async function run(fn) {
    setBusy(true); setError('');
    try { setData(await fn()); onChanged(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (!data) return error ? <div className="alert">{error}</div> : <p className="empty">Loading…</p>;

  return (
    <div className="work-reviews">
      {error && <div className="alert">{error}</div>}
      <section className="group">
        <h3>Waiting for your review <span className="count">{data.pending.length}</span></h3>
        <p className="hint">Crew ask for these after finishing a task. Reviews are optional and become part of their personal record, which stays with them when they change boats.</p>
        {!data.pending.length && <p className="empty">No requests right now.</p>}
        <ul className="wr-list">
          {data.pending.map((r) => (
            <Pending key={r.id} r={r} busy={busy}
              onSubmit={(id, score, text) => run(() => call('submitTaskReview', { reviewId: id, score, text }))}
              onSkip={(id) => run(() => call('skipTaskReview', { reviewId: id }))} />
          ))}
        </ul>
      </section>
      {data.done.length > 0 && (
        <section className="group">
          <h3>Recently handled</h3>
          <ul className="crew-list">
            {data.done.map((r) => (
              <li key={r.id}>
                <span className="crew-who">
                  <b>{r.crewName}</b>
                  <small>{r.task}, done {fmtDate(r.performedDate)}{r.text && `: “${r.text}”`}</small>
                  <small>{r.reviewer}, {fmtStamp(r.reviewedAt)}</small>
                </span>
                {r.status === 'reviewed' ? <span className="score big">{r.score}/10</span> : <span className="muted">Skipped</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
