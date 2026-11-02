import { useState } from 'react';
import Modal from './Modal.jsx';
import { call } from '../api.js';
import { SYSTEMS, todayISO } from '../util.js';
import { JOBS, everyLabel, jobAllowed, jobDescription, withRule } from '../jobLibrary.js';
import BasisChip from './BasisChip.jsx';

const BLANK = {
  title: '', type: 'Routine', system: '', description: '', dueDate: '', dueTime: '',
  recurring: false, intervalValue: '', intervalUnit: 'months', assignedTo: '', note: '',
};

export default function TaskForm({ initial, crew, perms, rules, onClose, onSaved }) {
  const editing = !!initial;
  const canSchedule = perms.createRoutine;
  const [f, setF] = useState(() => (initial
    ? { ...BLANK, ...initial, intervalUnit: initial.intervalUnit || 'months' }
    : { ...BLANK, type: canSchedule ? 'Routine' : 'Issue' }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const isIssue = f.type === 'Issue';
  const [jobId, setJobId] = useState('');
  const [basis, setBasis] = useState('');
  const [parts, setParts] = useState([]);
  const blankPart = () => ({ name: '', partNumber: '', qty: '', url: '', saveToTask: f.type !== 'Issue' && !!f.recurring });
  const setPart = (i, k, v) => setParts(parts.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const commonJobs = JOBS.map((j) => withRule(j, rules)).filter((j) => j && (!f.system || j.system === f.system) && jobAllowed(perms, j.system));
  const jobGroups = commonJobs.reduce((g, j) => { (g[j.system] = g[j.system] || []).push(j); return g; }, {});
  function pickJob(id) {
    setJobId(id);
    const j = commonJobs.find((x) => x.id === id);
    if (!j) { setBasis(''); setF({ ...f, title: '', description: '', recurring: false, intervalValue: '' }); return; }
    setBasis(j.basis);
    setF({ ...f, title: j.title, system: j.system, description: jobDescription(j), recurring: true,
      intervalValue: String(j.every), intervalUnit: j.unit, dueDate: f.dueDate || todayISO() });
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const task = {
        title: f.title.trim(), system: f.system, description: f.description, dueDate: f.dueDate,
        dueTime: f.dueTime,
        ...(canSchedule ? { assignedTo: f.assignedTo } : {}),
        recurring: !isIssue && f.recurring,
        intervalValue: f.intervalValue, intervalUnit: f.intervalUnit,
      };
      const r = editing
        ? await call('updateTask', { id: initial.id, task })
        : await call('createTask', { task: { ...task, type: f.type, note: f.note, ...(jobId ? { ruleId: (commonJobs.find((x) => x.id === jobId) || {}).ruleId, basis: 'recommended' } : { basis }),
            parts: parts.filter((p) => p.name.trim()) } });
      onSaved(r.task, r.parts);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={editing ? 'Edit task' : canSchedule ? 'New task' : 'Report an issue'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        {!editing && canSchedule && (
          <div className="segmented" role="radiogroup" aria-label="Task type">
            <button type="button" className={!isIssue ? 'on' : ''} onClick={() => setF({ ...f, type: 'Routine' })}>
              Routine maintenance
            </button>
            <button type="button" className={isIssue ? 'on' : ''} onClick={() => setF({ ...f, type: 'Issue', recurring: false })}>
              Report an issue
            </button>
          </div>
        )}

        {!editing && canSchedule && !isIssue && (
          <label>Common job
            <select value={jobId} onChange={(e) => pickJob(e.target.value)} className="job-pick">
              <option value="">Custom task (type your own)</option>
              {Object.entries(jobGroups).map(([sys, list]) => (
                <optgroup key={sys} label={sys}>
                  {list.map((j) => <option key={j.id} value={j.id}>{j.title} ({everyLabel(j).toLowerCase()}){j.basis === 'regulatory' ? ', regulatory' : ''}</option>)}
                </optgroup>
              ))}
            </select>
            {jobId && <small className="hint"><BasisChip basis={basis} authority={(commonJobs.find((x) => x.id === jobId) || {}).authority} /> {basis === 'regulatory' ? 'Confirmed by the CJM compliance consultant.' : 'CJM Marine suggestion, not a legal requirement. Change anything below to match your manuals.'}</small>}
          </label>
        )}

        {!editing && canSchedule && !isIssue && !jobId && (
          <label>Source of this task
            <select value={basis} onChange={(e) => setBasis(e.target.value)}>
              <option value="">Our own task</option>
              <option value="manufacturer">Manufacturer's manual</option>
              <option value="recommended">CJM recommendation</option>
            </select>
            <small className="hint">Regulatory labels come only from rules confirmed by the CJM compliance consultant.</small>
          </label>
        )}

        <label>Title
          <input value={f.title} onChange={set('title')} required
            placeholder={isIssue ? 'Port generator running hot' : 'Change main engine oil and filters'} />
        </label>

        <div className="two">
          <label>System
            <select value={f.system} onChange={set('system')}>
              <option value="">Choose a system</option>
              {SYSTEMS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          {canSchedule && (
            <label>Assigned to
              <select value={f.assignedTo} onChange={set('assignedTo')}>
                <option value="">Anyone</option>
                {crew.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.position})</option>)}
              </select>
            </label>
          )}
        </div>

        <label>Description
          <textarea rows={3} value={f.description} onChange={set('description')}
            placeholder={isIssue ? 'What is happening, when it started, what has been checked' : 'Parts, references, procedure'} />
        </label>

        <div className="two">
          <label>{isIssue ? 'Fix by (optional)' : 'Due date'}
            <input type="date" value={f.dueDate} onChange={set('dueDate')} required={!isIssue} />
          </label>
          <label>Due time (optional)
            <input type="time" value={f.dueTime} onChange={set('dueTime')} />
          </label>
        </div>

        {!isIssue && (
          <fieldset className="recur">
            <label className="check">
              <input type="checkbox" checked={f.recurring} onChange={set('recurring')} />
              Repeats on a schedule
            </label>
            {f.recurring && (
              <div className="two">
                <label>Every
                  <input type="number" min="1" value={f.intervalValue} onChange={set('intervalValue')} required />
                </label>
                <label>Unit
                  <select value={f.intervalUnit} onChange={set('intervalUnit')}>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                </label>
              </div>
            )}
          </fieldset>
        )}

        {!editing && (
          <label>First note (optional)
            <textarea rows={2} value={f.note} onChange={set('note')} />
          </label>
        )}

        {!editing && (
          <fieldset className="recur parts-needed">
            <legend>Parts needed <span className="opt">(optional)</span></legend>
            {parts.length === 0 && <p className="hint">Need parts for this {isIssue ? 'issue' : 'job'}? Add them and they go to the parts buyer or Captain to approve and order.</p>}
            {parts.map((p, i) => (
              <div key={i} className="part-row">
                <div className="two">
                  <label>Part<input value={p.name} onChange={(e) => setPart(i, 'name', e.target.value)} placeholder="Hydraulic hose 1/2 in x 2 m" /></label>
                  <div className="two">
                    <label><span>Part no. <span className="opt">(opt.)</span></span><input value={p.partNumber} onChange={(e) => setPart(i, 'partNumber', e.target.value)} /></label>
                    <label>Qty<input inputMode="numeric" value={p.qty} onChange={(e) => setPart(i, 'qty', e.target.value)} placeholder="1" /></label>
                  </div>
                </div>
                <label><span>Link <span className="opt">(optional: Amazon or any supplier)</span></span><input type="url" value={p.url} onChange={(e) => setPart(i, 'url', e.target.value)} placeholder="https://" /></label>
                <div className="part-row-foot">
                  <label className="check"><input type="checkbox" checked={p.saveToTask} onChange={(e) => setPart(i, 'saveToTask', e.target.checked)} /> Keep on this task for next time</label>
                  <button type="button" className="link danger" onClick={() => setParts(parts.filter((_, j) => j !== i))}>Remove</button>
                </div>
              </div>
            ))}
            <button type="button" className="link" onClick={() => setParts([...parts, blankPart()])}>{parts.length ? 'Add another part' : 'Add a part'}</button>
          </fieldset>
        )}

        {error && <div className="alert">{error}</div>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create task'}</button>
        </div>
      </form>
    </Modal>
  );
}
