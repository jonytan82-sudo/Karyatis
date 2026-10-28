import { useState } from 'react';
import { call } from '../api.js';

function saveJson(obj, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const fileName = (name) => `${name.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')}-CJM-Marine-${new Date().toISOString().slice(0, 10)}.json`;

/** Downloads one vessel's full data file. Returns a short status message. */
export async function downloadVessel(v) {
  const r = await call('exportVessel', { id: v.id, withFiles: true });
  saveJson(r.package, fileName(v.name));
  const p = r.package;
  return `Downloaded ${v.name}: ${p.tasks.length} tasks, ${p.completions.length} sign-offs, ${p.notes.length} notes, ${p.attachments.length} files` +
    (r.filesSkipped ? ` (${r.filesSkipped} large file(s) left out; they stay in Google Drive)` : '') + '.';
}

/** Delete box shown under a vessel in CJM admin. */
export function DeleteVessel({ vessel, onDone, onCancel }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const go = async (fn) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return (
    <div className="delete-box">
      <p><b>Delete {vessel.name} permanently?</b> This removes its tasks, sign-offs, notes, attached files and activity log, and takes everyone off it.
        Crew keep their time aboard and their reviews. This cannot be undone, unless you upload a downloaded data file later.</p>
      <div className="actions left">
        <button className="btn" disabled={busy} onClick={() => go(async () => setNote(await downloadVessel(vessel)))}>1. Download its data first</button>
      </div>
      {note && <div className="ok">{note}</div>}
      <label>2. Type the vessel name to confirm
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={vessel.name} autoComplete="off" />
      </label>
      {error && <div className="alert">{error}</div>}
      <div className="actions left">
        <button className="btn danger-btn" disabled={busy || norm(typed) !== norm(vessel.name)}
          onClick={() => go(async () => { const r = await call('deleteVessel', { id: vessel.id, confirmName: typed }); onDone(r.message); })}>
          Delete vessel permanently
        </button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** Upload a vessel data file: restores a deleted vessel, or adds a copy. */
export function UploadVessel({ onDone }) {
  const [pkg, setPkg] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    setError(''); setPkg(null);
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 45 * 1024 * 1024) { setError('That file is larger than 45 MB.'); return; }
    try {
      const p = JSON.parse(await f.text());
      if (p.format !== 'cjm-marine-vessel' || !p.vessel) throw new Error();
      setPkg(p);
    } catch { setError('That is not a CJM Marine vessel file. Use a file made with Download data.'); }
  };
  const upload = async () => {
    setBusy(true); setError('');
    try { const r = await call('importVessel', { package: pkg }); setPkg(null); onDone(r.message); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="upload-vessel card">
      <b>Upload vessel data</b>
      <p className="hint">Use a file made with <b>Download data</b>. A deleted vessel comes back with its records and crew. If the vessel still exists, a separate copy is added.</p>
      <label className="btn attach-btn">
        <input type="file" accept=".json,application/json" onChange={pick} />
        Choose file
      </label>
      {error && <div className="alert">{error}</div>}
      {pkg && (
        <div className="upload-preview">
          <p><b>{pkg.vessel.name}</b> <small>saved {String(pkg.exportedAt || '').slice(0, 10)}</small></p>
          <p className="hint">{pkg.tasks.length} tasks, {pkg.completions.length} sign-offs, {pkg.notes.length} notes, {pkg.attachments.length} files,{' '}
            {pkg.memberships.filter((m) => m.status === 'active').length} crew aboard, {pkg.people.length} people.</p>
          <div className="actions left">
            <button className="btn primary" disabled={busy} onClick={upload}>{busy ? 'Uploading…' : 'Upload and restore'}</button>
            <button className="btn" onClick={() => setPkg(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
