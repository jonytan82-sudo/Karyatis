import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { call } from '../api.js';
import { isoDate } from '../util.js';
import { CONSULTANT_NOTE, DISCLAIMER, EQUIPMENT, JOBS, REG_TAG, SIZE_BANDS, applies, everyLabel, intervalDays, jobAllowed, jobDescription, missingDetails, sizeBand, withRule } from '../jobLibrary.js';
import BasisChip from './BasisChip.jsx';
import { DetailsFields, detailsOf } from './VesselDetails.jsx';

/** Task description: approved rules carry their source; everything else says it is a CJM recommendation. */
const describe = (j) => (j.rule
  ? [j.notes, j.source && `Source: ${j.source}${j.sourceRef ? `, ${j.sourceRef}` : ''}${j.rule.edition ? ` (${j.rule.edition})` : ''}`,
    j.rule.performer && `Performed by: ${j.rule.performer}`, j.rule.proof && `Proof: ${j.rule.proof}`, 'Reviewed by the CJM Marine compliance consultant.'].filter(Boolean).join('\n\n')
  : jobDescription(j));

const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
/** One full interval from today (e.g. 12 months from now). */
const afterInterval = (j) => {
  const d = new Date();
  if (j.unit === 'days') d.setDate(d.getDate() + j.every);
  else if (j.unit === 'weeks') d.setDate(d.getDate() + 7 * j.every);
  else if (j.unit === 'months') d.setMonth(d.getMonth() + j.every);
  else d.setFullYear(d.getFullYear() + j.every);
  return isoDate(d);
};

/** Captain (or a department lead) picks a starter list of routine jobs for the boat; only ticked jobs are added. */
export default function StarterProgram({ vessel, tasks, perms, rules: reviewed, canEditBoat, onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [size, setSize] = useState(sizeBand(vessel.length) || 'M');
  const [equip, setEquip] = useState({});
  const [d, setD] = useState(() => detailsOf(vessel));
  const has = { ...equip, charter: d.usage === 'charter' || d.usage === 'passenger', classed: !!d.classSociety && d.classSociety !== 'none' && d.classSociety !== 'unknown' };
  const missing = missingDetails(d);
  const [picked, setPicked] = useState({});
  const [start, setStart] = useState('spread'); // spread | today
  const [open, setOpen] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const have = useMemo(() => new Set(tasks.filter((t) => t.state === 'Open').map((t) => t.title.trim().toLowerCase())), [tasks]);
  // labels and intervals from the consultant's review; rejected rules and rules that do not apply to this boat are left out
  const available = JOBS.filter((j) => jobAllowed(perms, j.system)).map((j) => withRule(j, reviewed)).filter(Boolean)
    .map((j) => ({ ...j, fit: applies(j.rule, d) })).filter((j) => j.fit !== 'no');
  const suggested = (j) => j.sizes.includes(size) && (!j.equipment || has[j.equipment]) && !have.has(j.title.toLowerCase());
  const shown = available.filter((j) => !j.equipment || has[j.equipment]);
  const groups = useMemo(() => {
    const g = {};
    shown.forEach((j) => (g[j.system] = g[j.system] || []).push(j));
    return Object.entries(g);
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = Object.values(picked).filter(Boolean).length;

  async function toList() {
    setError('');
    if (canEditBoat) {
      try { await call('saveVesselDetails', { details: d }); } catch (e) { setError(e.message); return; }
    }
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
        title: j.title, system: j.system, description: describe(j), intervalValue: j.every, intervalUnit: j.unit, ruleId: j.ruleId,
        dueDate: start === 'today' ? afterInterval(j) : inDays(3 + ((i * 2) % Math.max(7, Math.min(intervalDays(j), 90)))),
      }));
      const r = await call('addStarterTasks', { tasks: list, rules: canEditBoat ? undefined : { flag: d.flag, usage: d.usage, classSociety: d.classSociety } });
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
            <legend>Boat details</legend>
            <p className="hint">These decide which flag, state and class rules apply. They are saved on the boat{canEditBoat ? '' : ' (only the Captain or Owner can change most of them)'}.</p>
            <DetailsFields value={d} onChange={setD} />
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
          <p className="hint">{CONSULTANT_NOTE} Jobs already in your task list are left out.</p>
          {missing.length > 0 && (
            <div className="review-note">Review required: {missing.join(', ')} {missing.length === 1 ? 'is' : 'are'} not known, so this list cannot show which regulations apply.
              Jobs marked “confirm” need checking once the details are known.</div>
          )}
          <fieldset className="recur start-choice">
            <legend>First due dates</legend>
            <label className="check"><input type="radio" name="start" checked={start === 'spread'} onChange={() => setStart('spread')} />
              <span><b>Spread over the next few weeks</b><small>Every job comes up soon so the crew can check it, sign it off and set the real date.</small></span></label>
            <label className="check"><input type="radio" name="start" checked={start === 'today'} onChange={() => setStart('today')} />
              <span><b>Start from today</b><small>Treat everything as just done: each job is first due one full interval from now (a 12-month job in a year).</small></span></label>
          </fieldset>
          <p className="hint"><BasisChip basis="recommended" /> CJM Marine suggestion. <BasisChip basis="regulatory" authority="flag" /> confirmed by the consultant.
            <em className="reg-tag reg-flag">Check flag</em> <em className="reg-tag reg-class">Check class</em> may be set by your flag or class society and are still under review. {DISCLAIMER}</p>
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
                            <span><b>{j.title} <BasisChip basis={j.basis} authority={j.authority} pending={j.fit === 'unknown'} />{!j.rule && j.regulated && <em className={`reg-tag reg-${j.regulated}`}>{REG_TAG[j.regulated]}</em>}</b><small>{everyLabel(j)}{dup ? ', already in your list' : j.notes ? `. ${j.notes}` : ''}</small></span>
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
