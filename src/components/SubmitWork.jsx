import { useState } from 'react';
import Modal from './Modal.jsx';
import FilePicker, { forUpload } from './FilePicker.jsx';
import { call } from '../api.js';
import { SYSTEMS, todayISO } from '../util.js';

const KINDS = {
  done: ['I did a job', 'Work you finished that is not in the task list. The Captain approves it into the log.'],
  suggest: ['Suggest a task', 'A job that should be done or added to the schedule. The Captain approves it into the task list.'],
  external: ['Job on another boat', 'Work on any boat, even one not on CJM Marine. Its Captain or Owner confirms it and can score it for your record.'],
};

/** Crew and contractors send work to a Captain or Owner. Nothing is added until they approve it. */
export default function SubmitWork({ vessel, kinds = ['done', 'suggest', 'external'], start, onClose, onSent }) {
  const [kind, setKind] = useState(start || kinds[0]);
  const [f, setF] = useState({ title: '', system: '', description: '', performedDate: todayISO(), dueDate: '', recurring: false,
    intervalValue: '', intervalUnit: 'months', wantScore: true, boatName: '', contactEmail: '', contactName: '' });
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function send(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await call('submitWork', { work: { ...f, kind, vesselId: kind === 'external' ? '' : vessel && vessel.id, files: forUpload(files) } });
      onSent(r.message);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Send work for approval" onClose={onClose}>
      <form className="form submit-work" onSubmit={send}>
        {kinds.length > 1 && (
          <div className="segmented" role="radiogroup" aria-label="What are you sending">
            {kinds.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{KINDS[k][0]}</button>
            ))}
          </div>
        )}
        <p className="hint">{KINDS[kind][1]}</p>

        {kind === 'external' && (
          <>
            <label>Boat<input value={f.boatName} onChange={set('boatName')} required placeholder="M/Y Blue Horizon" /></label>
            <div className="two">
              <label>Captain or Owner's email<input type="email" value={f.contactEmail} onChange={set('contactEmail')} required autoComplete="off" /></label>
              <label><span>Their name <span className="opt">(optional)</span></span><input value={f.contactName} onChange={set('contactName')} /></label>
            </div>
          </>
        )}

        <label>{kind === 'suggest' ? 'Task' : 'What you did'}
          <input value={f.title} onChange={set('title')} required
            placeholder={kind === 'suggest' ? 'Check tender davit wire for broken strands' : 'Replaced raw water pump impeller'} />
        </label>
        <div className="two">
          <label>System
            <select value={f.system} onChange={set('system')}>
              <option value="">Choose a system</option>
              {SYSTEMS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          {kind === 'suggest'
            ? <label><span>Do it by <span className="opt">(optional)</span></span><input type="date" value={f.dueDate} min={todayISO()} onChange={set('dueDate')} /></label>
            : <label>Date done<input type="date" value={f.performedDate} max={todayISO()} onChange={set('performedDate')} required /></label>}
        </div>
        <label><span>Details <span className="opt">(optional)</span></span>
          <textarea rows={3} value={f.description} onChange={set('description')}
            placeholder={kind === 'suggest' ? 'Why it is needed, what you noticed' : 'What you found, parts used, hours'} />
        </label>

        {kind === 'suggest' && (
          <fieldset className="recur">
            <label className="check"><input type="checkbox" checked={f.recurring} onChange={set('recurring')} /> Should repeat on a schedule</label>
            {f.recurring && (
              <div className="two">
                <label>Every<input type="number" min="1" value={f.intervalValue} onChange={set('intervalValue')} required /></label>
                <label>Unit
                  <select value={f.intervalUnit} onChange={set('intervalUnit')}>
                    <option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option><option value="years">Years</option>
                  </select>
                </label>
              </div>
            )}
          </fieldset>
        )}
        {kind !== 'suggest' && (
          <label className="check"><input type="checkbox" checked={f.wantScore} onChange={set('wantScore')} /> Ask for a score from 1 to 10 for my record</label>
        )}

        <FilePicker files={files} onChange={setFiles} onError={setError} />
        {error && <div className="alert">{error}</div>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : kind === 'external' ? 'Send for review' : 'Send to the Captain'}</button>
        </div>
      </form>
    </Modal>
  );
}
