import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { fmtStamp } from '../util.js';
import { DEFAULT_SUPPLY_MAPS, SUPPLY_CATEGORY_LABELS } from '../supplies.js';

const BLANK = { match: '', term: '', category: 'deck', note: '', verify: false, enabled: true };

function MapForm({ initial, onSave, onCancel, busy }) {
  const [m, setM] = useState(initial);
  const set = (k) => (e) => setM({ ...m, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <form className="form supply-map-form" onSubmit={(e) => { e.preventDefault(); onSave(m); }}>
      <div className="two">
        <label>Task title contains <span className="opt">(separate with |)</span><input value={m.match} onChange={set('match')} placeholder="teak deck|deck clean" required /></label>
        <label>Amazon search phrase<input value={m.term} onChange={set('term')} placeholder="marine teak deck cleaner" required /></label>
      </div>
      <div className="two">
        <label>Category
          <select value={m.category} onChange={set('category')}>{Object.entries(SUPPLY_CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label><span>Note shown to crew <span className="opt">(optional)</span></span><input value={m.note} onChange={set('note')} placeholder="Verify compatibility with your vessel." /></label>
      </div>
      <label className="check"><input type="checkbox" checked={m.verify} onChange={set('verify')} /> Remind them to confirm the manufacturer part number (oil, filters, safety items)</label>
      <label className="check"><input type="checkbox" checked={m.enabled} onChange={set('enabled')} /> Show the Purchase supplies button</label>
      <div className="actions left">
        <button className="btn primary" disabled={busy}>Save</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** CJM admin: search terms per task, and the Amazon link settings (tracking tag off until eligibility is confirmed in writing). */
export default function AdminSupplies() {
  const [d, setD] = useState(null);
  const [s, setS] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const take = (r) => { setD(r); setS({ tag: r.settings.tag, eligibility: r.settings.eligibility, generalUrl: r.settings.generalUrl, searchTemplate: r.settings.searchTemplate }); };
  useEffect(() => { call('adminSupplies').then(take).catch((e) => setError(e.message)); }, []);
  async function run(fn, done) {
    setBusy(true); setError(''); setMsg('');
    try { const r = await fn(); take(r); if (done) setMsg(typeof done === 'function' ? done(r) : done); return true; }
    catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  }
  if (!d) return <section className="group"><h3>Marine supplies</h3>{error ? <div className="alert">{error}</div> : <p className="empty">Loading…</p>}</section>;
  const st = d.settings;
  return (
    <section className="group admin-supplies">
      <h3>Marine supplies <span className="count">{d.maps.length}</span></h3>
      <p className="hint">Tasks whose title matches a line below get a <b>Purchase supplies</b> button that opens an Amazon search. Changes show the next time crew open a task; no deploy needed.</p>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}

      <div className={`supply-tag card ${d.links.tagOn ? 'on' : ''}`}>
        <b>Amazon Associates tag: {d.links.tagOn ? 'ON (links earn commission)' : 'OFF (plain links, no commission)'}</b>
        <p className="hint">Amazon's Associates policies restrict commissions on purchases for commercial use. Keep the tag off until Amazon Associates or counsel confirms in writing that your users' purchases qualify, and record that confirmation here.</p>
        <div className="two">
          <label>Tracking ID<input value={s.tag} onChange={(e) => setS({ ...s, tag: e.target.value })} placeholder="cjmmarine-20" /></label>
          <label>General shopping link<input value={s.generalUrl} onChange={(e) => setS({ ...s, generalUrl: e.target.value })} /></label>
        </div>
        <label>Task search link <span className="opt">({'{term}'} is replaced by the search phrase; {'{tag}'} optional)</span>
          <input value={s.searchTemplate} onChange={(e) => setS({ ...s, searchTemplate: e.target.value })} />
        </label>
        <label>Written eligibility confirmation <span className="opt">(who confirmed, when, reference)</span>
          <textarea rows={2} value={s.eligibility} onChange={(e) => setS({ ...s, eligibility: e.target.value })} placeholder="e.g. Email from Amazon Associates support, case 1234, 12 Nov 2026: charter yacht crew purchases qualify / do not qualify" />
        </label>
        {st.eligibilityAt && <p className="hint">Recorded by {st.eligibilityByName || 'CJM admin'}, {fmtStamp(st.eligibilityAt)}.</p>}
        <div className="actions left">
          <button className="btn" disabled={busy} onClick={() => run(() => call('saveSupplySettings', { settings: s }), 'Supply link settings saved.')}>Save settings</button>
          {!st.tagEnabled
            ? <button className="btn primary" disabled={busy || !s.tag || !s.eligibility} onClick={() => run(() => call('saveSupplySettings', { settings: { ...s, tagEnabled: true } }), 'Tag switched on.')}>Switch tag on</button>
            : <button className="btn" disabled={busy} onClick={() => run(() => call('saveSupplySettings', { settings: { tagEnabled: false } }), 'Tag switched off. Links are plain again.')}>Switch tag off</button>}
        </div>
        <p className="hint">Test links now: <a href={d.links.generalUrl} target="_blank" rel="noopener noreferrer">general</a> · <a href={d.links.searchUrl.replace('{term}', 'marine+teak+deck+cleaner')} target="_blank" rel="noopener noreferrer">deck cleaner search</a></p>
      </div>

      <div className="actions left">
        <button className="btn" onClick={() => setEditing(BLANK)}>Add a search</button>
        {d.maps.length === 0 && <button className="btn primary" disabled={busy} onClick={() => run(() => call('loadSupplyDefaults', { maps: DEFAULT_SUPPLY_MAPS }), (r) => `${r.added} searches loaded.`)}>Load the starter list ({DEFAULT_SUPPLY_MAPS.length})</button>}
      </div>
      {editing && !editing.id && <MapForm initial={editing} busy={busy} onCancel={() => setEditing(null)} onSave={(m) => run(() => call('saveSupplyMap', { map: m }), 'Search added.').then((ok) => ok && setEditing(null))} />}
      <ul className="crew-list supply-maps">
        {d.maps.map((m) => (
          <li key={m.id} className={m.enabled ? '' : 'inactive'}>
            {editing && editing.id === m.id ? (
              <MapForm initial={editing} busy={busy} onCancel={() => setEditing(null)} onSave={(x) => run(() => call('saveSupplyMap', { map: x }), 'Search saved.').then((ok) => ok && setEditing(null))} />
            ) : (
              <>
                <span className="crew-who">
                  <b>{m.term}</b>
                  <small>{SUPPLY_CATEGORY_LABELS[m.category]} · tasks with “{m.match.split('|').join('”, “')}”{m.verify ? ' · part-number reminder' : ''}{!m.enabled ? ' · off' : ''}</small>
                </span>
                <span className="crew-actions">
                  <button className="link" onClick={() => setEditing(m)}>Edit</button>
                  <button className="link" disabled={busy} onClick={() => run(() => call('saveSupplyMap', { map: { ...m, enabled: !m.enabled } }), m.enabled ? 'Button hidden for these tasks.' : 'Button shown again.')}>{m.enabled ? 'Turn off' : 'Turn on'}</button>
                  <button className="link danger" disabled={busy} onClick={() => run(() => call('deleteSupplyMap', { id: m.id }), 'Search removed.')}>Remove</button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
