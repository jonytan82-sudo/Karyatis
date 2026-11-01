import { useState } from 'react';
import Modal from './Modal.jsx';
import { call } from '../api.js';
import { CLASS_SOCIETIES, FLAGS, missingDetails } from '../jobLibrary.js';

const USES = [['private', 'Private use only'], ['charter', 'Commercial charter'], ['passenger', 'Passenger operations'], ['other', 'Other']];

/** A text/number field with an "Unknown" tick box (stored as "unknown"). */
function Maybe({ label, hint, value, onChange, type = 'text', placeholder }) {
  const unknown = value === 'unknown';
  return (
    <div className="field">
      <span className="field-label">{label}{hint && <span className="opt"> {hint}</span>}</span>
      <span className="maybe">
        <input type={type} aria-label={label} value={unknown ? '' : value} disabled={unknown} placeholder={unknown ? 'Unknown' : placeholder} onChange={(e) => onChange(e.target.value)} />
        <label className="check mini"><input type="checkbox" checked={unknown} onChange={(e) => onChange(e.target.checked ? 'unknown' : '')} /> Unknown</label>
      </span>
    </div>
  );
}

/** Fields that decide which codes apply. Controlled: value + onChange(newValue). */
export function DetailsFields({ value: d, onChange }) {
  const set = (k) => (v) => onChange({ ...d, [k]: v && v.target ? v.target.value : v });
  const flagNote = (FLAGS.find(([f]) => f === d.flag) || [])[1];
  return (
    <div className="details-fields">
      <div className="two">
        <label>Flag (country of registration)
          <select value={d.flag} onChange={set('flag')}>
            <option value="">Choose</option>
            {FLAGS.map(([f]) => <option key={f}>{f}</option>)}
            {d.flag && !FLAGS.some(([f]) => f === d.flag) && <option>{d.flag}</option>}
          </select>
        </label>
        <label><span>Port of registry <span className="opt">(optional)</span></span><input value={d.registry} onChange={set('registry')} placeholder="e.g. George Town" /></label>
      </div>
      {flagNote && <p className="hint">{flagNote} General guide only; check with your flag administration.</p>}
      <div className="two">
        <label>Operating type
          <select value={d.usage} onChange={set('usage')}>
            <option value="">Choose</option>
            {USES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label>Class society
          <select value={d.classSociety} onChange={set('classSociety')}>
            <option value="">Choose</option>
            <option value="none">Not classed</option>
            {CLASS_SOCIETIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <div className="two">
        <label>Length overall (LOA)<input value={d.length} onChange={set('length')} placeholder="e.g. 36 m or 118 ft" /></label>
        <Maybe label="Load-line length" hint="(if known)" value={d.loadLineLength} onChange={set('loadLineLength')} placeholder="e.g. 33.5 m" />
      </div>
      <div className="two">
        <Maybe label="Gross tonnage (GT)" hint="from the registry documents" value={d.gt} onChange={set('gt')} type="number" placeholder="e.g. 180" />
        <Maybe label="Build year" value={d.buildYear} onChange={set('buildYear')} type="number" placeholder="e.g. 2015" />
      </div>
      <div className="two">
        <Maybe label="Major conversion year" hint="(if any)" value={d.conversionYear} onChange={set('conversionYear')} type="number" placeholder="" />
        <Maybe label="Maximum passengers" hint="(guests, not crew)" value={d.maxPassengers} onChange={set('maxPassengers')} type="number" placeholder="e.g. 12" />
      </div>
      <div className="two">
        <Maybe label="Maximum crew" value={d.maxCrew} onChange={set('maxCrew')} type="number" placeholder="e.g. 8" />
        <label>Operating area
          <select value={d.areaScope} onChange={set('areaScope')}>
            <option value="">Choose</option>
            <option value="domestic">Domestic only</option>
            <option value="international">International</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
      </div>
      <label><span>Cruising grounds and limits <span className="opt">(optional)</span></span>
        <input value={d.operatingArea} onChange={set('operatingArea')} placeholder="e.g. Florida, Bahamas and Caribbean" />
      </label>
      <p className="hint">Never estimate gross tonnage from length: use the figure on the registry or tonnage certificate, or tick Unknown.</p>
    </div>
  );
}

export const detailsOf = (v) => ({
  flag: v.flag || '', registry: v.registry || '', usage: v.usage || '', classSociety: v.classSociety || '', length: v.length || '',
  loadLineLength: v.loadLineLength || '', gt: v.gt || '', buildYear: v.buildYear || '', conversionYear: v.conversionYear || '',
  maxPassengers: v.maxPassengers || '', maxCrew: v.maxCrew || '', areaScope: v.areaScope || '', operatingArea: v.operatingArea || '',
});

export default function VesselDetails({ vessel, onClose, onSaved }) {
  const [d, setD] = useState(() => detailsOf(vessel));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const missing = missingDetails(d);
  async function save(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await call('saveVesselDetails', { details: d }); onSaved(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={`${vessel.name}: boat details`} onClose={onClose} wide>
      <form className="form" onSubmit={save}>
        <p className="hint">These details decide which flag, state and class rules apply. Leave a field as Unknown rather than guessing.</p>
        <DetailsFields value={d} onChange={setD} />
        {missing.length > 0 && <div className="review-note">Review required: {missing.join(', ')} {missing.length === 1 ? 'is' : 'are'} not known yet, so CJM Marine cannot show which regulations apply.</div>}
        {error && <div className="alert">{error}</div>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>
        </div>
      </form>
    </Modal>
  );
}
