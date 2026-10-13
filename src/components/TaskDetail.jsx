import { Fragment, useCallback, useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { call } from '../api.js';
import { STATUS, dueText, everyText, fmtDate, fmtStamp, todayISO } from '../util.js';

export default function TaskDetail({ id, onClose, onChanged, onEdit }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [signing, setSigning] = useState(false);
  const [sign, setSign] = useState({ performedDate: todayISO(), notes: '', resolution: '', requestReview: false, reviewMessage: '' });
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => call('getTask', { id }).then((r) => { setData(r); setError(''); })
    .catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try { await fn(); await load(); onChanged(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const signOff = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await call('completeTask', { id, ...sign });
      setSigning(false);
      setSign({ performedDate: todayISO(), notes: '', resolution: '', requestReview: false, reviewMessage: '' });
      setInfo(r.reviewRequested ? 'Signed off. The Captain has been asked to review your work.' : '');
    });
  };

  const askReview = (completionId) => run(async () => {
    await call('requestTaskReview', { completionId });
    setInfo('Review requested. The Captain gets an email; reviews are optional.');
  });

  const addNote = (e) => {
    e.preventDefault();
    run(async () => { await call('addNote', { taskId: id, text: note }); setNote(''); });
  };

  if (!data) {
    return <Modal title="Task" onClose={onClose}>{error ? <div className="alert">{error}</div> : <p className="empty">Loading…</p>}</Modal>;
  }

  const t = data.task;
  const isIssue = t.type === 'Issue';
  const open = t.state === 'Open';

  return (
    <Modal title={t.title} onClose={onClose} wide>
      <div className={`status-band band-${t.color}`}>
        <b>{dueText(t)}</b>
        <span>{STATUS[t.color]}</span>
      </div>

      <dl className="facts">
        <div><dt>Type</dt><dd>{isIssue ? 'Issue' : 'Routine maintenance'}</dd></div>
        {t.system && <div><dt>System</dt><dd>{t.system}</dd></div>}
        {t.dueDate && <div><dt>Due</dt><dd>{fmtDate(t.dueDate)}{t.dueTime && `, ${t.dueTime}`}</dd></div>}
        {!isIssue && <div><dt>Schedule</dt><dd>{everyText(t)}</dd></div>}
        <div><dt>Assigned to</dt><dd>{t.assignedToName || 'Anyone'}</dd></div>
        <div><dt>Created</dt><dd>{t.createdByName}, {fmtStamp(t.createdAt)}</dd></div>
        {t.lastPerformed && <div><dt>Last done</dt><dd>{fmtDate(t.lastPerformed)} by {t.lastPerformedByName}</dd></div>}
      </dl>

      {t.description && <p className="desc">{t.description}</p>}
      {t.resolution && <div className="resolution"><b>Resolution</b><p>{t.resolution}</p></div>}

      {error && <div className="alert">{error}</div>}
      {info && <div className="ok">{info}</div>}

      {open && !signing && (t.canSignOff || t.canEdit) && (
        <div className="actions left">
          {t.canSignOff && <button className="btn primary" onClick={() => setSigning(true)}>{isIssue ? 'Close issue' : 'Sign off'}</button>}
          {t.canEdit && <button className="btn" onClick={() => onEdit(t)}>Edit</button>}
        </div>
      )}
      {open && !t.canSignOff && (
        <p className="hint perm">
          {t.departmentLabel ? `Signed off by ${t.departmentLabel.toLowerCase()} crew with sign-off rights` : 'Signed off by an officer'} or the assigned person. You can still add notes.
        </p>
      )}

      {open && signing && (
        <form className="form signoff" onSubmit={signOff}>
          <h3>{isIssue ? 'Close issue' : 'Sign off task'}</h3>
          <label>Date performed
            <input type="date" max={todayISO()} value={sign.performedDate}
              onChange={(e) => setSign({ ...sign, performedDate: e.target.value })} required />
          </label>
          {isIssue && (
            <label>Resolution
              <textarea rows={3} required value={sign.resolution}
                onChange={(e) => setSign({ ...sign, resolution: e.target.value })}
                placeholder="What fixed it, parts replaced" />
            </label>
          )}
          <label>Work notes (optional)
            <textarea rows={2} value={sign.notes} onChange={(e) => setSign({ ...sign, notes: e.target.value })}
              placeholder="Hours, readings, parts used" />
          </label>
          {t.recurring && <p className="hint">The next due date will be set from the date performed.</p>}
          {data.canRequestReview && (
            <div className="review-ask">
              <label className="check">
                <input type="checkbox" checked={sign.requestReview} onChange={(e) => setSign({ ...sign, requestReview: e.target.checked })} />
                Ask the Captain to review my work (1 to 10)
              </label>
              {sign.requestReview && (
                <textarea rows={2} value={sign.reviewMessage} onChange={(e) => setSign({ ...sign, reviewMessage: e.target.value })}
                  placeholder="Anything the Captain should know (optional)" aria-label="Message to the Captain" />
              )}
              <p className="hint">Reviews go on your personal record and stay with you when you change boats.</p>
            </div>
          )}
          <div className="actions left">
            <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : isIssue ? 'Close issue' : 'Sign off'}</button>
            <button type="button" className="btn" onClick={() => setSigning(false)}>Cancel</button>
          </div>
        </form>
      )}

      <section className="block">
        <h3>Notes</h3>
        <form className="note-form" onSubmit={addNote}>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the crew" aria-label="New note" />
          <button className="btn" disabled={busy || !note.trim()}>Add note</button>
        </form>
        {data.notes.length === 0 && <p className="empty">No notes yet.</p>}
        <ul className="notes">
          {[...data.notes].reverse().map((n) => (
            <li key={n.id}><p>{n.text}</p><small>{n.by}, {fmtStamp(n.createdAt)}</small></li>
          ))}
        </ul>
      </section>

      {data.completions.length > 0 && (
        <section className="block">
          <h3>Sign-off history</h3>
          <table className="history">
            <thead><tr><th>Performed</th><th>Was due</th><th>By</th><th>Timing</th><th>Review</th></tr></thead>
            <tbody>
              {[...data.completions].reverse().map((c, i) => (
                <Fragment key={i}>
                <tr>
                  <td>{fmtDate(c.performedDate)}</td>
                  <td>{fmtDate(c.dueDate) || 'None'}</td>
                  <td>{c.by}</td>
                  <td className={c.timing.startsWith('Late') ? 'late' : ''}>{c.timing}</td>
                  <td>
                    {c.review && c.review.status === 'reviewed' && (
                      <span className="score" title={c.review.text || ''}>{c.review.score}/10</span>
                    )}
                    {c.review && c.review.status === 'requested' && <span className="muted">Requested</span>}
                    {c.review && c.review.status === 'skipped' && <span className="muted">Not reviewed</span>}
                    {!c.review && c.canRequestReview && (
                      <button className="link" disabled={busy} onClick={() => askReview(c.id)}>Ask for review</button>
                    )}
                  </td>
                </tr>
                {c.review && c.review.status === 'reviewed' && c.review.text && (
                  <tr className="review-row"><td colSpan={5}>“{c.review.text}”</td></tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <details className="block log">
        <summary>Activity log ({data.history.length})</summary>
        <ul>
          {[...data.history].reverse().map((h, i) => (
            <li key={i}><small>{fmtStamp(h.timestamp)}, {h.by}</small> {h.action}{h.details && `: ${h.details}`}</li>
          ))}
        </ul>
      </details>
    </Modal>
  );
}
