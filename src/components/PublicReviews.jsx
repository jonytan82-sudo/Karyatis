import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { fmtDate } from '../util.js';
import Avatar from './Avatar.jsx';
import { Stars } from './Stars.jsx';
import WorkRecord from './WorkRecord.jsx';
import Logo from './Logo.jsx';

const SIGNUP = '/login?request=1';

function JoinFree({ name }) {
  return (
    <section className="pub-join">
      <h2>Build a record like {name.split(' ')[0]}'s</h2>
      <p>A free CJM Marine account gives crew and contractors a work record that stays with them from boat to boat: sea time, certifications and jobs scored by the captains and owners they worked for. Share it with one QR code.</p>
      <div className="pub-join-btns">
        <a className="btn primary" href={`${SIGNUP}&as=crew`}>Create a free account</a>
        <a className="btn" href={`${SIGNUP}&as=contractor`}>I'm a contractor</a>
      </div>
      <p className="pub-join-owner">Captain or owner? <a href={`${SIGNUP}&as=captain`}>Put your boat on CJM Marine</a> to keep maintenance, crew and rotations in one place.</p>
    </section>
  );
}

/** Opened from the QR code on a business card. No login. */
export default function PublicReviews({ shareId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    call('publicReviews', { shareId, token: '' }).then(setData).catch((e) => setError(e.message));
  }, [shareId]);

  return (
    <div className="pub">
      <header className="pub-head"><a className="brand" href="/" aria-label="CJM Marine"><Logo size="sm" /></a><a className="top-join" href={`${SIGNUP}&as=crew`}>Open a free account</a></header>
      <main className="pub-main">
        {error && <div className="alert">{error}</div>}
        {!data && !error && <p className="empty">Loading reviews…</p>}
        {data && (
          <>
            <section className="pub-id">
              <Avatar name={data.name} photo={data.photo} size={96} />
              <h1>{data.name}</h1>
              {data.headline && <p className="pv-headline">{data.headline}</p>}
              <p className="pv-meta">{[data.location, data.yearsExperience && `${data.yearsExperience} years at sea`].filter(Boolean).join(', ')}</p>
              {data.operatingArea && <p className="pv-meta">Operates in {data.operatingArea}</p>}
              {data.summary.reviewCount > 0 && (
                <div className="pub-score">
                  <span className="pub-num">{data.summary.rating.toFixed(1)}</span>
                  <Stars value={data.summary.rating} count={data.summary.reviewCount} />
                </div>
              )}
            </section>
            {data.performance && data.performance.count > 0 && (
              <>
                <h2 className="pub-h">Work reviews</h2>
                <div className="pub-reviews pub-block"><WorkRecord performance={data.performance} limit={10} /></div>
              </>
            )}
            {(data.reviews.length > 0 || !(data.performance && data.performance.count)) && <>
            <h2 className="pub-h">Recommendations</h2>
            <ul className="reviews pub-reviews">
              {data.reviews.length === 0 && <li><p className="empty">No recommendations yet.</p></li>}
              {data.reviews.map((r, i) => (
                <li key={i}>
                  <Stars value={r.rating} />
                  {r.text && <p>{r.text}</p>}
                  <small>{r.by}{r.vesselName && `, ${r.vesselName}`}, {fmtDate(r.date)}</small>
                </li>
              ))}
            </ul>
            </>}
            <p className="hint pub-note">
              Reviews on CJM Marine come only from owners and captains this person worked for: on vessels they served on, or confirmed by the captain by email. Work reviews are scored 1 to 10 for specific jobs.
            </p>
            <JoinFree name={data.name} />
          </>
        )}
      </main>
    </div>
  );
}
