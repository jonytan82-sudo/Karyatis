import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { fmtDate, fmtStamp } from '../util.js';
import { AttachmentList } from './Attachments.jsx';
import SubmitWork from './SubmitWork.jsx';

const STATUS = { pending: ['Waiting', 'st-wait'], approved: ['Approved', 'st-ok'], declined: ['Not approved', 'st-no'], expired: ['Link expired', 'st-no'] };

/** Everything a person sent for approval: suggestions, unlisted work and jobs on other boats. */
export default function MyJobs() {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => call('myWork').then((r) => setList(r.submissions)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function cancel(id) {
    setError('');
    try { setList((await call('cancelWork', { id })).submissions); } catch (e) { setError(e.message); }
  }

  return (
    <div className="my-jobs">
      <div className="record-box card">
        <div>
          <b>Log a job on another boat</b>
          <p className="hint">Did work on a boat you are not crew on? Log it and name its Captain or Owner. If the boat is on CJM Marine it goes into its maintenance log once they approve. If not, they confirm it from an email, no account needed, and can score it for your record.</p>
        </div>
        <button className="btn primary" onClick={() => { setOpen(true); setMsg(''); }}>Log a job</button>
      </div>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}
      <section className="group">
        <h3>Sent for approval</h3>
        {!list && <p className="empty">Loading…</p>}
        {list && !list.length && <p className="empty">Nothing sent yet. Crew can also suggest tasks or log unlisted work from their vessel.</p>}
        <ul className="wr-list">
          {(list || []).map((x) => (
            <li key={x.id} className="wr card">
              <div className="wr-head">
                <div>
                  <b>{x.title}</b>
                  <span className="wr-task">{x.kindLabel}, {x.boatName}{x.system && <small>, {x.system}</small>}</span>
                </div>
                <span className={`st ${(STATUS[x.status] || [])[1] || ''}`}>{(STATUS[x.status] || [x.status])[0]}</span>
              </div>
              <small className="muted">
                {x.performedDate ? `Done ${fmtDate(x.performedDate)}. ` : ''}Sent {fmtStamp(x.createdAt)}{x.contactEmail ? ` to ${x.contactEmail}` : ''}
                {x.decidedBy ? `. ${x.status === 'approved' ? 'Approved' : 'Answered'} by ${x.decidedBy}` : ''}
              </small>
              {x.score && <p><span className="score">{x.score}/10</span> {x.reviewText && `“${x.reviewText}”`}</p>}
              {x.decisionNote && <p className="wr-msg">“{x.decisionNote}”</p>}
              <AttachmentList items={x.attachments} action="getWorkFile" />
              {x.status === 'pending' && <div className="actions left"><button className="link danger" onClick={() => cancel(x.id)}>Withdraw</button></div>}
            </li>
          ))}
        </ul>
      </section>
      {open && <SubmitWork kinds={['external']} onClose={() => setOpen(false)} onSent={(m) => { setOpen(false); setMsg(m); load(); }} />}
    </div>
  );
}
