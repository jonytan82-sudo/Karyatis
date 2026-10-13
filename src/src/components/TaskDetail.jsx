import { useCallback, useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { call } from '../api.js';
import { STATUS, dueText, everyText, fmtDate, fmtStamp, todayISO } from '../util.js';

export default function TaskDetail({ id, onClose, onChanged, onEdit }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [signing, setSigning] = useState(false);
  const [sign, setSign] = useState({ performedDate: todayISO(), notes: '', resolution: '' });
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
      await call('completeTask', { id, ...sign });
      setSigning(false);
      setSign({ performedDate: todayISO(), notes: '', resolution: '' });
    });
  };

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

      {open && !signing && (t.canSignOff || t.canEdit) && (
        <div className="actions left">
          {t.canSignOff && <button className="btn primary" onClick={() => setSigning(true)}>{isIssue ? 'Close issue' : 'Sign off'}</button>}
          {t.canEdit && <button className="btn" onClick={() => onEdit(t)}>Edit</button>}
        </div>
      )}
      {open && !t.canSignOff && (
        <p className="hint perm">
          {t.department === 'engine' ? 'Signed off by the engineering department'
            : t.department === 'deck' ? 'Signed off by the deck department'
            : t.department === 'interior' ? 'Signed off by the interior department'
            : 'Signed off by an officer'} or the assigned crew member. You can still add notes.
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
            <thead><tr><th>Performed</th><th>Was due</th><th>By</th><th>Timing</th></tr></thead>
            <tbody>
              {[...data.completions].reverse().map((c, i) => (
                <tr key={i}>
                  <td>{fmtDate(c.performedDate)}</td>
                  <td>{fmtDate(c.dueDate) || 'None'}</td>
                  <td>{c.by}</td>
                  <td className={c.timing.startsWith('Late') ? 'late' : ''}>{c.timing}</td>
                </tr>
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
