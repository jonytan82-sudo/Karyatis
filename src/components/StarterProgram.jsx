import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { call } from '../api.js';
import { isoDate } from '../util.js';
import { CLASS_SOCIETIES, DISCLAIMER, EQUIPMENT, FLAGS, JOBS, REG_TAG, SIZE_BANDS, everyLabel, intervalDays, jobAllowed, jobDescription, sizeBand } from '../jobLibrary.js';

const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };

/** Captain (or a department lead) picks a starter list of routine jobs for the boat; only ticked jobs are added. */
export default function StarterProgram({ vessel, tasks, perms, onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [size, setSize] = useState(sizeBand(vessel.length) || 'M');
  const [equip, setEquip] = useState({});
  const [rules, setRules] = useState({ flag: vessel.flag || '', usage: vessel.usage || '', classSociety: vessel.classSociety || '' });
  const has = { ...equip, charter: rules.usage === 'charter', classed: !!rules.classSociety && rules.classSociety !== 'none' };
  const flagNote = (FLAGS.find(([f]) => f === rules.flag) || [])[1];
  const [picked, setPicked] = useState({});
  const [open, setOpen] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const have = useMemo(() => new Set(tasks.filter((t) => t.state === 'Open').map((t) => t.title.trim().toLowerCase())), [tasks]);
  const available = JOBS.filter((j) => jobAllowed(perms, j.system));
  const suggested = (j) => j.sizes.includes(size) && (!j.equipment || has[j.equipment]) && !have.has(j.title.toLowerCase());
  const shown = available.filter((j) => !j.equipment || has[j.equipment]);
  const groups = useMemo(() => {
    const g = {};
    shown.forEach((j) => (g[j.system] = g[j.system] || []).push(j));
    return Object.entries(g);
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = Object.values(picked).filter(Boolean).length;

  function toList() {
    const p = {};
    shown.forEach((j) => { if (suggested(j)) p[j.id] = true; });
    setPicked(p);
    setStep(2);
  }

  async function add() {
    setBusy(true); setError('');
    try {
      const chosen = shown.filter((j) => picked[j.id]);
      // spread the first due dates so the board does not turn red on day one
      const list = chosen.map((j, i) => ({
        title: j.title, system: j.system, description: jobDescription(j), intervalValue: j.every, intervalUnit: j.unit,
        dueDate: inDays(3 + ((i * 2) % Math.max(7, Math.min(intervalDays(j), 90)))),
      }));
      const r = await call('addStarterTasks', { tasks: list, rules: { ...rules, classSociety: rules.classSociety === 'none' ? '' : rules.classSociety } });
      onDone(r.message);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Starter maintenance program" onClose={onClose} wide>
      {step === 1 && (
        <div className="form starter">
          <p className="hint">Answer a few questions and CJM Marine suggests routine jobs for {vessel.name}. You choose which ones to add and can edit any of them afterwards.</p>
          <fieldset className="recur">
            <legend>Size</legend>
            <div className="starter-sizes">
              {SIZE_BANDS.map(([k, label]) => (
                <label key={k} className="check"><input type="radio" name="size" checked={size === k} onChange={() => setSize(k)} /> {label}</label>
              ))}
            </div>
          </fieldset>
          <fieldset className="recur">
            <legend>Registration and use</legend>
            <p className="hint">These decide which safety and survey jobs apply. They are saved on the boat.</p>
            <div className="two">
              <label>Flag (country of registration)
                <select value={rules.flag} onChange={(e) => setRules({ ...rules, flag: e.target.value })}>
                  <option value="">Choose</option>
                  {FLAGS.map(([f]) => <option key={f}>{f}</option>)}
                </select>
              </label>
              <label>Class society
                <select value={rules.classSociety} onChange={(e) => setRules({ ...rules, classSociety: e.target.value })}>
                  <option value="">Choose</option>
                  <option value="none">Not classed</option>
                  {CLASS_SOCIETIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <div className="starter-sizes">
              <label className="check"><input type="radio" name="usage" checked={rules.usage === 'private'} onChange={() => setRules({ ...rules, usage: 'private' })} /> Private use only</label>
              <label className="check"><input type="radio" name="usage" checked={rules.usage === 'charter'} onChange={() => setRules({ ...rules, usage: 'charter' })} /> Charter or commercial</label>
            </div>
            {flagNote && <p className="hint">{flagNote} This is a general guide; check with your flag administration.</p>}
          </fieldset>
          <fieldset className="recur">
            <legend>What is aboard?</legend>
            <div className="starter-equip">
              {EQUIPMENT.map(([k, label]) => (
                <label key={k} className="check"><input type="checkbox" checked={!!equip[k]} onChange={(e) => setEquip({ ...equip, [k]: e.target.checked })} /> {label}</label>
              ))}
            </div>
          </fieldset>
          <div className="actions">
            <button type="button" className="btn" onClick={onClose}>Not now</button>
            <button type="button" className="btn primary" onClick={toList}>See suggested jobs</button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="form starter">
          <p className="hint">{DISCLAIMER} First due dates are spread over the next few weeks. Jobs already in your task list are left out.</p>
          <p className="hint"><em className="reg-tag reg-flag">Flag</em> and <em className="reg-tag reg-class">Class</em> mark jobs whose interval and scope are usually set by your flag state or class society. Check those against your survey schedule first.</p>
          <div className="starter-bar">
            <button type="button" className="link" onClick={() => { const p = {}; shown.forEach((j) => { if (!have.has(j.title.toLowerCase())) p[j.id] = true; }); setPicked(p); }}>Select all</button>
            <button type="button" className="link" onClick={() => setPicked({})}>Clear</button>
          </div>
          <div className="starter-groups">
            {groups.map(([system, jobs]) => {
              const n = jobs.filter((j) => picked[j.id]).length;
              return (
                <details key={system} className="starter-group" open={!!open[system]} onToggle={(e) => setOpen({ ...open, [system]: e.target.open })}>
                  <summary><b>{system}</b> <span className="count">{n} of {jobs.length}</span></summary>
                  <ul>
                    {jobs.map((j) => {
                      const dup = have.has(j.title.toLowerCase());
                      return (
                        <li key={j.id} className={dup ? 'dup' : ''}>
                          <label className="check">
                            <input type="checkbox" disabled={dup} checked={!!picked[j.id]} onChange={(e) => setPicked({ ...picked, [j.id]: e.target.checked })} />
                            <span><b>{j.title}{j.regulated && <em className={`reg-tag reg-${j.regulated}`}>{REG_TAG[j.regulated]}</em>}</b><small>{everyLabel(j)}{dup ? ', already in your list' : j.notes ? `. ${j.notes}` : ''}</small></span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              );
            })}
          </div>
          {error && <div className="alert">{error}</div>}
          <div className="actions">
            <button type="button" className="btn" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="btn primary" disabled={busy || !count} onClick={add}>{busy ? 'Adding…' : `Add ${count} job${count === 1 ? '' : 's'}`}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
