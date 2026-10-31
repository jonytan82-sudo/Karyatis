import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { fmtDate, fmtStamp, isoDate } from '../util.js';
import { AttachmentList } from './Attachments.jsx';

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

const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };

function Every({ f, setF }) {
  return (
    <div className="two">
      <label>Every<input type="number" min="1" value={f.intervalValue} onChange={(e) => setF({ ...f, intervalValue: e.target.value })} /></label>
      <label>Unit
        <select value={f.intervalUnit} onChange={(e) => setF({ ...f, intervalUnit: e.target.value })}>
          <option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option><option value="years">Years</option>
        </select>
      </label>
    </div>
  );
}

/** A suggestion, unlisted work or a job by someone not on the crew, waiting for the Captain or Owner. */
function Approval({ a, onDecide, busy }) {
  const suggest = a.kind === 'suggest';
  const [f, setF] = useState({ dueDate: a.dueDate || inDays(7), recurring: suggest && a.recurring, intervalValue: a.intervalValue || '',
    intervalUnit: a.intervalUnit || 'months', assignToThem: a.onCrew, score: 0, text: '', note: '' });
  const decide = (approve) => onDecide(a.id, approve ? {
    approve: true, note: f.note,
    ...(suggest ? { dueDate: f.dueDate, assignToThem: f.assignToThem } : { score: f.score || undefined, text: f.text }),
    recurring: f.recurring, intervalValue: f.intervalValue, intervalUnit: f.intervalUnit,
  } : { approve: false, note: f.note });
  return (
    <li className="wr card approval">
      <div className="wr-head">
        <div>
          <b>{a.crewName}</b> <small className="muted">{a.crewTitle}</small>
          <span className="wr-task">{a.title}{a.system && <small>, {a.system}</small>}</span>
        </div>
        <span className={`kind kind-${a.kind}`}>{a.kindLabel}</span>
      </div>
      <small className="muted">{a.performedDate ? `Done ${fmtDate(a.performedDate)}` : a.dueDate ? `Suggested by ${fmtDate(a.dueDate)}` : 'Suggested'}, sent {fmtStamp(a.createdAt)}</small>
      {!a.onCrew && <p className="hint">Not on your crew. Approving adds this job to your maintenance log.</p>}
      {a.description && <p className="wr-notes">{a.description}</p>}
      <AttachmentList items={a.attachments} action="getWorkFile" />
      {suggest ? (
        <div className="two">
          <label>Due date<input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
          {a.onCrew && <label className="check"><input type="checkbox" checked={f.assignToThem} onChange={(e) => setF({ ...f, assignToThem: e.target.checked })} /> Assign to {a.crewName.split(' ')[0]}</label>}
        </div>
      ) : a.wantScore && (
        <>
          <p className="hint">They asked for a score for their record (optional).</p>
          <ScorePicker value={f.score} onChange={(n) => setF({ ...f, score: f.score === n ? 0 : n })} />
          {f.score > 0 && <textarea rows={2} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="What went well, what to improve (optional)" aria-label="Review" />}
        </>
      )}
      <label className="check"><input type="checkbox" checked={f.recurring} onChange={(e) => setF({ ...f, recurring: e.target.checked })} /> {suggest ? 'Repeats on a schedule' : 'Make it a recurring task from this date'}</label>
      {f.recurring && <Every f={f} setF={setF} />}
      <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note to them (optional)" aria-label="Note" />
      <div className="actions left">
        <button className="btn primary" disabled={busy || (f.recurring && !f.intervalValue)} onClick={() => decide(true)}>
          {suggest ? 'Approve, add to tasks' : f.score ? `Approve with ${f.score}/10` : 'Approve into the log'}
        </button>
        <button className="btn" disabled={busy} onClick={() => decide(false)}>Decline</button>
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

  const ap = data.approvals || { pending: [], done: [] };
  return (
    <div className="work-reviews">
      {error && <div className="alert">{error}</div>}
      <section className="group">
        <h3>Waiting for your approval <span className="count">{ap.pending.length}</span></h3>
        <p className="hint">Tasks crew suggest, work they did that was not in the list, and jobs by contractors. Nothing is added to the vessel's log until you approve it.</p>
        {!ap.pending.length && <p className="empty">Nothing waiting.</p>}
        <ul className="wr-list">
          {ap.pending.map((a) => (
            <Approval key={a.id} a={a} busy={busy} onDecide={(id, decision) => run(() => call('decideWork', { id, decision }))} />
          ))}
        </ul>
      </section>
      <section className="group">
        <h3>Work reviews requested <span className="count">{data.pending.length}</span></h3>
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
      {ap.done.length > 0 && (
        <section className="group">
          <h3>Recently approved or declined</h3>
          <ul className="crew-list">
            {ap.done.map((a) => (
              <li key={a.id}>
                <span className="crew-who">
                  <b>{a.crewName}</b>
                  <small>{a.kindLabel}: {a.title}{a.decisionNote && ` (“${a.decisionNote}”)`}</small>
                  <small>{a.decidedBy}, {fmtStamp(a.decidedAt)}</small>
                </span>
                {a.status === 'approved' ? <span className="score big">{a.score ? `${a.score}/10` : 'Approved'}</span> : <span className="muted">Declined</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
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
