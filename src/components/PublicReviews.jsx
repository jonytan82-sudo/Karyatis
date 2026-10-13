import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { fmtDate } from '../util.js';
import Avatar from './Avatar.jsx';
import { Stars } from './Stars.jsx';
import WorkRecord from './WorkRecord.jsx';

/** Opened from the QR code on a business card. No login. */
export default function PublicReviews({ shareId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    call('publicReviews', { shareId, token: '' }).then(setData).catch((e) => setError(e.message));
  }, [shareId]);

  return (
    <div className="pub">
      <header className="pub-head"><span className="brand">CJM Marine</span><span className="pub-tag">Crew reviews</span></header>
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
              <div className="pub-score">
                <span className="pub-num">{data.summary.reviewCount ? data.summary.rating.toFixed(1) : '–'}</span>
                <Stars value={data.summary.rating} count={data.summary.reviewCount} />
              </div>
            </section>
            {data.performance && data.performance.count > 0 && (
              <>
                <h2 className="pub-h">Work reviews</h2>
                <div className="pub-reviews pub-block"><WorkRecord performance={data.performance} limit={10} /></div>
              </>
            )}
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
            <p className="hint pub-note">
              Reviews on CJM Marine come only from owners and captains of vessels this crew member served on. Work reviews are scored 1 to 10 for specific tasks.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
