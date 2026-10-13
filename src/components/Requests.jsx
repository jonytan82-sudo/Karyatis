import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { fmtStamp } from '../util.js';
import SetupLink from './SetupLink.jsx';
import { RoleFields, titleInfo } from './Roles.jsx';

const KIND_TITLE = { Owner: 'Yacht Owner', Captain: 'Captain / Master', Contractor: 'Independent Contractor / External Technician', Crew: 'Deckhand' };

/**
 * Pending account requests.
 * vesselId set  → requests that name this vessel, approved onto it.
 * vessels list → (CJM admin) choose any vessel or a profile-only account.
 */
export default function Requests({ vesselId, vessels, catalog, allowOversight, allowCommand, onChanged }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [open, setOpen] = useState(null); // { id, vesselId, role }

  const load = () => call('listRequests', { vesselId: vesselId || '' })
    .then((r) => { setList(r.requests); setError(''); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [vesselId]); // eslint-disable-line react-hooks/exhaustive-deps

  const norm = (s) => String(s || '').toLowerCase().replace(/\b(m\/?y|s\/?y|mv|sy|my)\b/g, '').replace(/[^a-z0-9]/g, '');
  const matchVessel = (r) => {
    const v = (vessels || []).find((x) => r.vesselName && norm(x.name) === norm(r.vesselName));
    return v ? v.id : '';
  };

  const start = (r) => {
    const title = r.position || KIND_TITLE[r.kind] || 'Deckhand';
    const t = titleInfo(catalog, title);
    setOpen({ id: r.id, vesselId: vesselId || matchVessel(r), role: { title, access: t ? t.access : 'supervised', departments: t ? t.depts : [] } });
  };

  async function approve() {
    setError('');
    try {
      const res = await call('approveRequest', { id: open.id, vesselId: open.vesselId, role: open.vesselId ? open.role : undefined });
      setResult(res); setOpen(null); load(); onChanged && onChanged();
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
        {list.map((r) => (
          <li key={r.id}>
            <div className="req-who">
              <b>{r.name}</b> <small>{r.email}</small>
              <small>
                Wants a {r.kind.toLowerCase()} account{r.position ? ` as ${r.position}` : ''}
                {r.vesselName ? ` on ${r.vesselName}` : ''}, {fmtStamp(r.createdAt)}
              </small>
              {r.message && <p className="req-msg">{r.message}</p>}
            </div>
            {open?.id !== r.id && (
              <div className="req-actions">
                <button className="btn primary" onClick={() => start(r)}>Approve…</button>
                <button className="btn" onClick={() => decline(r)}>Decline</button>
              </div>
            )}
            {open?.id === r.id && (
              <div className="req-approve form">
                {!vesselId && vessels && (
                  <label>Vessel
                    <select value={open.vesselId} onChange={(e) => setOpen({ ...open, vesselId: e.target.value })}>
                      {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      <option value="">Profile only, no vessel</option>
                    </select>
                  </label>
                )}
                {open.vesselId && (
                  <RoleFields catalog={catalog} value={open.role} isNew allowOversight={allowOversight} allowCommand={allowCommand}
                    onChange={(role) => setOpen({ ...open, role })} />
                )}
                <div className="actions left">
                  <button className="btn primary" onClick={approve}>Approve {r.name.split(' ')[0]}</button>
                  <button className="btn" onClick={() => setOpen(null)}>Cancel</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
