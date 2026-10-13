import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { POSITIONS, fmtStamp } from '../util.js';
import SetupLink from './SetupLink.jsx';

/**
 * Pending account requests.
 * vesselId set  → requests that name this vessel, approved onto it.
 * vessels list → (CJM admin) choose any vessel or a profile-only account.
 */
export default function Requests({ vesselId, vessels, canGrantOwner, onChanged }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [choice, setChoice] = useState({});

  const load = () => call('listRequests', { vesselId: vesselId || '' })
    .then((r) => { setList(r.requests); setError(''); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [vesselId]); // eslint-disable-line react-hooks/exhaustive-deps

  const norm = (s) => String(s || '').toLowerCase().replace(/\b(m\/?y|s\/?y|mv|sy|my)\b/g, '').replace(/[^a-z0-9]/g, '');
  const matchVessel = (r) => {
    const v = (vessels || []).find((x) => r.vesselName && norm(x.name) === norm(r.vesselName));
    return v ? v.id : '';
  };
  const pick = (id, k, v) => setChoice((c) => ({ ...c, [id]: { ...c[id], [k]: v } }));
  const defaultPos = (r) => r.position || (r.kind === 'Owner' ? 'Owner' : r.kind === 'Captain' ? 'Captain' : 'Deckhand');

  async function approve(r) {
    const c = choice[r.id] || {};
    const target = vesselId || (c.vesselId ?? matchVessel(r));
    setError('');
    try {
      const res = await call('approveRequest', { id: r.id, vesselId: target, position: c.position || defaultPos(r) });
      setResult(res); load(); onChanged && onChanged();
    } catch (e) { setError(e.message); }
  }

  async function decline(r) {
    if (!window.confirm(`Decline the request from ${r.name}?`)) return;
    try { await call('declineRequest', { id: r.id }); load(); onChanged && onChanged(); }
    catch (e) { setError(e.message); }
  }

  if (list === null) return error ? <div className="alert">{error}</div> : null;

  return (
    <section className="group">
      <h3>Account requests <span className="count">{list.length}</span></h3>
      <SetupLink result={result} onDismiss={() => setResult(null)} />
      {error && <div className="alert">{error}</div>}
      {!list.length && <p className="empty">No pending requests.</p>}
      <ul className="requests">
        {list.map((r) => {
          const c = choice[r.id] || {};
          const positions = POSITIONS.filter((p) => p !== 'Owner' || canGrantOwner);
          return (
            <li key={r.id}>
              <div className="req-who">
                <b>{r.name}</b> <small>{r.email}</small>
                <small>
                  Wants a {r.kind.toLowerCase()} account{r.position ? ` as ${r.position}` : ''}
                  {r.vesselName ? ` on ${r.vesselName}` : ''}, {fmtStamp(r.createdAt)}
                </small>
                {r.message && <p className="req-msg">{r.message}</p>}
              </div>
              <div className="req-actions">
                {!vesselId && vessels && (
                  <select aria-label="Vessel" value={c.vesselId ?? matchVessel(r)}
                    onChange={(e) => pick(r.id, 'vesselId', e.target.value)}>
                    {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    <option value="">Profile only, no vessel</option>
                  </select>
                )}
                {(vesselId || (c.vesselId ?? matchVessel(r))) && (
                  <select aria-label="Position" value={c.position || defaultPos(r)} onChange={(e) => pick(r.id, 'position', e.target.value)}>
                    {positions.map((p) => <option key={p}>{p}</option>)}
                  </select>
                )}
                <button className="btn primary" onClick={() => approve(r)}>Approve</button>
                <button className="btn" onClick={() => decline(r)}>Decline</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
