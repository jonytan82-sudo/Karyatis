import { useEffect, useRef, useState } from 'react';
import { call } from '../api.js';
import { AVAILABILITY, POSITIONS } from '../util.js';
import Avatar from './Avatar.jsx';
import Modal from './Modal.jsx';
import ProfileView from './ProfileView.jsx';
import { Stars } from './Stars.jsx';

export default function Directory() {
  const [q, setQ] = useState('');
  const [position, setPosition] = useState('');
  const [availability, setAvailability] = useState('');
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(() => {
      setLoading(true);
      call('searchCrew', { q, position, availability })
        .then((r) => { if (n === seq.current) { setRes(r); setError(''); } })
        .catch((e) => n === seq.current && setError(e.message))
        .finally(() => n === seq.current && setLoading(false));
    }, q ? 400 : 0);
    return () => clearTimeout(t);
  }, [q, position, availability]);

  return (
    <div className="directory">
      <div className="search-bar">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search crew"
          placeholder="Search by name, skill, certificate, language or port, e.g. engineer MTU Spanish" />
      </div>
      <div className="filters">
        <select value={position} onChange={(e) => setPosition(e.target.value)} aria-label="Position">
          <option value="">Any position</option>
          {POSITIONS.filter((p) => p !== 'Owner').map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={availability} onChange={(e) => setAvailability(e.target.value)} aria-label="Availability">
          <option value="">Any availability</option>
          {AVAILABILITY.map((a) => <option key={a}>{a}</option>)}
        </select>
        <span className="hint result-count">
          {loading ? 'Searching…' : res ? `${res.total} crew member${res.total === 1 ? '' : 's'}${res.total > res.results.length ? `, showing ${res.results.length}` : ''}` : ''}
        </span>
      </div>
      {error && <div className="alert">{error}</div>}
      {res && !res.results.length && !loading && <p className="empty">No crew match that search. Try fewer words.</p>}
      <ul className="dir-list">
        {res && res.results.map((r) => (
          <li key={r.userId}>
            <button className="dir-row" onClick={() => setViewing(r.userId)}>
              <Avatar name={r.name} photo={r.photo} size={52} />
              <span className="dir-main">
                <span className="dir-name">{r.name}</span>
                <span className="dir-head">{r.headline || r.currentPosition || r.positions.join(', ')}</span>
                <span className="dir-meta">
                  {[r.location, r.yearsExperience && `${r.yearsExperience} yrs`, r.certCount ? `${r.certCount} certs` : ''].filter(Boolean).join(', ')}
                </span>
              </span>
              <span className="dir-side">
                {r.availability && <span className={`pill av-${r.availability.replace(/\s+/g, '-').toLowerCase()}`}>{r.availability}</span>}
                <Stars value={r.rating} count={r.reviewCount} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {viewing && (
        <Modal title="Crew profile" onClose={() => setViewing(null)} wide>
          <ProfileView userId={viewing} />
        </Modal>
      )}
    </div>
  );
}
