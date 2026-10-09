import { useState } from 'react';
import Modal from './Modal.jsx';
import { call } from '../api.js';
import { SYSTEMS } from '../util.js';

const BLANK = {
  title: '', type: 'Routine', system: '', description: '', dueDate: '', dueTime: '',
  recurring: false, intervalValue: '', intervalUnit: 'months', assignedTo: '', note: '',
};

export default function TaskForm({ initial, crew, onClose, onSaved }) {
  const editing = !!initial;
  const [f, setF] = useState(() => (initial ? { ...BLANK, ...initial, intervalUnit: initial.intervalUnit || 'months' } : BLANK));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const isIssue = f.type === 'Issue';

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const task = {
        title: f.title.trim(), system: f.system, description: f.description, dueDate: f.dueDate,
        dueTime: f.dueTime, assignedTo: f.assignedTo,
        recurring: !isIssue && f.recurring,
        intervalValue: f.intervalValue, intervalUnit: f.intervalUnit,
      };
      const r = editing
        ? await call('updateTask', { id: initial.id, task })
        : await call('createTask', { task: { ...task, type: f.type, note: f.note } });
      onSaved(r.task);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={editing ? 'Edit task' : 'New task'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        {!editing && (
          <div className="segmented" role="radiogroup" aria-label="Task type">
            <button type="button" className={!isIssue ? 'on' : ''} onClick={() => setF({ ...f, type: 'Routine' })}>
              Routine maintenance
            </button>
            <button type="button" className={isIssue ? 'on' : ''} onClick={() => setF({ ...f, type: 'Issue', recurring: false })}>
              Report an issue
            </button>
          </div>
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
          <label>Assigned to
            <select value={f.assignedTo} onChange={set('assignedTo')}>
              <option value="">Anyone</option>
              {crew.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
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

        {error && <div className="alert">{error}</div>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create task'}</button>
        </div>
      </form>
    </Modal>
  );
}
