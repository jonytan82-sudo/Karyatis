import { useEffect, useMemo, useState } from 'react';
import { call } from '../api.js';
import { SYSTEMS, fmtStamp } from '../util.js';
import { AUTHORITIES, BASIS, JOBS, toRule } from '../jobLibrary.js';
import BasisChip from './BasisChip.jsx';

const STATUS = { draft: ['Draft', 'st-wait'], approved: ['Approved', 'st-ok'], rejected: ['Rejected', 'st-no'] };
const USES = ['private', 'charter', 'passenger', 'other'];
const COLS = ['id', 'title', 'system', 'basis', 'authority', 'jurisdiction', 'source', 'sourceRef', 'edition', 'appliesFlags', 'appliesUsage',
  'minLength', 'maxLength', 'minGT', 'maxGT', 'minPassengers', 'maxPassengers', 'classed', 'area', 'every', 'unit', 'performer', 'proof',
  'exceptions', 'notes', 'status', 'reviewNote', 'reviewedByName', 'reviewedAt', 'version'];

function downloadCsv(rules) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = [...COLS, 'Consultant decision (approve / correct / reject)', 'Consultant comments'];
  const csv = [head.map(q).join(','), ...rules.map((r) => [...COLS.map((k) => q(r[k])), '', ''].join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = `CJM-Marine-rules-review-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function F({ label, k, f, setF, wide, ph }) {
  return <label className={wide ? 'wide' : ''}>{label}<input value={f[k] || ''} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>;
}

function RuleEditor({ rule, onSave, busy }) {
  const [f, setF] = useState(rule);
  const [note, setNote] = useState('');
  const [hist, setHist] = useState(null);
  const uses = String(f.appliesUsage || '').split(',').filter(Boolean);
  const save = (ruleAction) => onSave(rule.id, f, ruleAction, note).then((ok) => { if (ok) setNote(''); });
  return (
    <div className="rule-edit">
      <div className="rule-grid">
        <label>Basis
          <select value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })}>
            {Object.entries(BASIS).map(([k, b]) => <option key={k} value={k}>{b.label}</option>)}
          </select>
        </label>
        <label>Authority
          <select value={f.authority} onChange={(e) => setF({ ...f, authority: e.target.value })}>
            {Object.entries(AUTHORITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <F label="Jurisdiction" k="jurisdiction" f={f} setF={setF} ph="Red Ensign Group; Florida" />
        <F label="Source (code, rule or manual)" k="source" f={f} setF={setF} wide ph="REG Yacht Code Part A" />
        <F label="Section / reference" k="sourceRef" f={f} setF={setF} ph="Chapter, paragraph" />
        <F label="Edition / effective date" k="edition" f={f} setF={setF} ph="2024" />
        <label>Every<input type="number" min="1" value={f.every || ''} onChange={(e) => setF({ ...f, every: e.target.value })} /></label>
        <label>Unit
          <select value={f.unit || 'months'} onChange={(e) => setF({ ...f, unit: e.target.value })}>
            <option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option><option value="years">Years</option>
          </select>
        </label>
        <F label="Qualified performer" k="performer" f={f} setF={setF} ph="Approved service station" />
        <F label="Proof required" k="proof" f={f} setF={setF} wide ph="Service certificate kept aboard" />
      </div>
      <fieldset className="recur">
        <legend>Applies when</legend>
        <div className="rule-grid">
          <F label="Flags (comma separated, blank = all)" k="appliesFlags" f={f} setF={setF} wide ph="Red Ensign, Marshall Islands" />
          <div className="uses"><span>Operating type (none ticked = all)</span>
            {USES.map((u) => (
              <label key={u} className="check mini"><input type="checkbox" checked={uses.includes(u)}
                onChange={(e) => setF({ ...f, appliesUsage: (e.target.checked ? [...uses, u] : uses.filter((x) => x !== u)).join(',') })} /> {u}</label>
            ))}
          </div>
          <F label="Min length (m)" k="minLength" f={f} setF={setF} /><F label="Max length (m)" k="maxLength" f={f} setF={setF} />
          <F label="Min GT" k="minGT" f={f} setF={setF} /><F label="Max GT" k="maxGT" f={f} setF={setF} />
          <F label="Min passengers" k="minPassengers" f={f} setF={setF} /><F label="Max passengers" k="maxPassengers" f={f} setF={setF} />
          <label>Classed
            <select value={f.classed || ''} onChange={(e) => setF({ ...f, classed: e.target.value })}>
              <option value="">Any</option><option value="yes">Classed only</option><option value="no">Not classed only</option>
            </select>
          </label>
          <F label="Operating area" k="area" f={f} setF={setF} ph="international" />
        </div>
      </fieldset>
      <div className="rule-grid">
        <F label="Exceptions" k="exceptions" f={f} setF={setF} wide />
        <F label="Notes" k="notes" f={f} setF={setF} wide />
      </div>
      <label>Review note <span className="opt">(required to reject or to change an approved rule)</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why approved, what was corrected, or why rejected" />
      </label>
      <div className="actions left">
        <button className="btn primary" disabled={busy} onClick={() => save('approve')}>Approve</button>
        <button className="btn" disabled={busy} onClick={() => save('save')}>Save without approving</button>
        {rule.status !== 'rejected' && <button className="btn" disabled={busy} onClick={() => save('reject')}>Reject</button>}
        {rule.status !== 'draft' && <button className="link" disabled={busy} onClick={() => save('reopen')}>Back to draft</button>}
      </div>
      <div className="rule-hist">
        {!hist && <button className="link" onClick={() => call('ruleHistory', { id: rule.id }).then((r) => setHist(r.history)).catch(() => setHist([]))}>Show history ({rule.changes})</button>}
        {hist && (
          <ul>
            {hist.map((h, i) => <li key={i}><b>v{h.version} {h.action}</b> by {h.by || 'CJM'}, {fmtStamp(h.at)}{h.note && `: ${h.note}`}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Marine compliance consultant (and CJM admin) review every rule before it can label a task as required. */
export default function RulesReview({ user }) {
  const [rules, setRules] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [system, setSystem] = useState('');

  useEffect(() => { call('listRules').then((r) => setRules(r.rules)).catch((e) => setError(e.message)); }, []);
  const notLoaded = useMemo(() => (rules ? JOBS.map(toRule).filter((r) => !rules.some((x) => x.id === r.id)) : []), [rules]);
  const list = (rules || []).filter((r) => (!status || r.status === status) && (!system || r.system === system) &&
    (!q || `${r.title} ${r.source} ${r.jurisdiction}`.toLowerCase().includes(q.toLowerCase())));
  const counts = (rules || []).reduce((c, r) => ({ ...c, [r.status]: (c[r.status] || 0) + 1 }), {});

  async function run(fn, done) {
    setBusy(true); setError(''); setMsg('');
    try { const r = await fn(); setRules(r.rules); if (done) setMsg(typeof done === 'function' ? done(r) : done); return true; }
    catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  }

  if (!rules) return error ? <div className="alert">{error}</div> : <p className="empty">Loading rules…</p>;
  return (
    <div className="rules-review">
      <section className="group">
        <h3>Rules review</h3>
        <p className="hint">Every routine job CJM Marine suggests is listed here as a rule. Until it is approved, the app labels it <b>Recommended</b>.
          Approve it as it stands, correct it and approve, or reject it. Only approved rules with a source can label a task <b>Regulatory</b>.
          Every change is kept with who, when and why.</p>
        <div className="rule-counts">
          <span className="st st-wait">Draft {counts.draft || 0}</span><span className="st st-ok">Approved {counts.approved || 0}</span><span className="st st-no">Rejected {counts.rejected || 0}</span>
          <button className="btn" onClick={() => downloadCsv(rules)}>Download review sheet (CSV)</button>
          {user.isAdmin && notLoaded.length > 0 && (
            <button className="btn primary" disabled={busy} onClick={() => run(() => call('seedRules', { rules: notLoaded }), (r) => `${r.added} draft rules loaded from the CJM job list.`)}>
              Load CJM job list ({notLoaded.length} new)
            </button>
          )}
        </div>
        {msg && <div className="ok">{msg}</div>}
        {error && <div className="alert">{error}</div>}
        <div className="filters">
          <input type="search" placeholder="Search rules" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search rules" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option><option value="draft">Draft</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
          </select>
          <select value={system} onChange={(e) => setSystem(e.target.value)} aria-label="System">
            <option value="">All systems</option>{SYSTEMS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        {!rules.length && <p className="empty">No rules yet.{user.isAdmin ? ' Use "Load CJM job list" to start.' : ' CJM Marine will load them shortly.'}</p>}
        <ul className="rule-list">
          {list.map((r) => (
            <li key={r.id} className={`card rule ${open === r.id ? 'open' : ''}`}>
              <button className="rule-head" onClick={() => setOpen(open === r.id ? '' : r.id)} aria-expanded={open === r.id}>
                <span className="rule-title"><b>{r.title}</b><small>{r.system}{r.every ? `, every ${r.every} ${r.unit}` : ''}{r.source ? `, ${r.source}` : ''}</small></span>
                <span className="rule-tags">
                  {r.status === 'draft' && <span className="rule-proposed">proposed</span>}
                  <BasisChip basis={r.basis} authority={r.authority} />
                  <span className={`st ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
                  <small>v{r.version}</small>
                </span>
              </button>
              {r.reviewNote && open !== r.id && <p className="hint rule-note">“{r.reviewNote}” {r.reviewedByName && `${r.reviewedByName}, ${fmtStamp(r.reviewedAt)}`}</p>}
              {open === r.id && (
                <RuleEditor key={r.version} rule={r} busy={busy}
                  onSave={(id, rule, ruleAction, note) => run(() => call('saveRule', { id, rule, ruleAction, note }), `${rule.title}: ${ruleAction === 'save' ? 'saved' : ruleAction === 'reopen' ? 'back to draft' : ruleAction + 'd'}.`)} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
