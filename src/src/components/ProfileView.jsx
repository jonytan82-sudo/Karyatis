import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { certStatus, fmtDate, fmtStamp } from '../util.js';
import Avatar from './Avatar.jsx';
import BusinessCard from './BusinessCard.jsx';
import { StarInput, Stars } from './Stars.jsx';

const monthYear = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '');

export default function ProfileView({ userId, data: initial }) {
  const [data, setData] = useState(initial || null);
  const [error, setError] = useState('');
  const [card, setCard] = useState(false);
  const [rev, setRev] = useState({ rating: 0, text: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial) { setData(initial); return; }
    call('getProfile', { userId }).then(setData).catch((e) => setError(e.message));
  }, [userId, initial]);

  useEffect(() => {
    const mine = data && data.reviews.find((r) => r.mine);
    setRev(mine ? { rating: mine.rating, text: mine.text } : { rating: 0, text: '' });
  }, [data]);

  if (error) return <div className="alert">{error}</div>;
  if (!data) return <p className="empty">Loading profile…</p>;
  const p = data.profile;

  async function save(e) {
    e.preventDefault();
    if (!rev.rating) { setError('Choose 1 to 5 stars'); return; }
    setBusy(true); setError('');
    try { setData(await call('saveReview', { userId: p.userId, rating: rev.rating, text: rev.text })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function remove(id) {
    if (!window.confirm('Delete this review?')) return;
    try { setData(await call('deleteReview', { id })); } catch (err) { setError(err.message); }
  }

  const mine = data.reviews.find((r) => r.mine);

  return (
    <div className="profile-view">
      <header className="pv-head">
        <Avatar name={p.name} photo={p.photo} size={88} />
        <div className="pv-id">
          <h2>{p.name}</h2>
          {p.headline && <p className="pv-headline">{p.headline}</p>}
          <p className="pv-meta">
            {[p.location, p.yearsExperience && `${p.yearsExperience} years at sea`, p.languages].filter(Boolean).join(', ')}
          </p>
          <div className="pv-tags">
            {p.availability && <span className={`pill av-${p.availability.replace(/\s+/g, '-').toLowerCase()}`}>{p.availability}</span>}
            <Stars value={data.summary.rating} count={data.summary.reviewCount} />
          </div>
        </div>
      </header>

      {(p.phone || p.email) && (
        <p className="pv-contact">
          {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a>}
          {p.email && <a href={`mailto:${p.email}`}>{p.email}</a>}
        </p>
      )}
      <div className="actions left"><button className="btn" onClick={() => setCard(!card)}>{card ? 'Hide business card' : 'Business card'}</button></div>
      {card && <BusinessCard profile={p} />}

      {p.bio && <section className="block"><h3>About</h3><p className="desc">{p.bio}</p></section>}

      {p.certifications.length > 0 && (
        <section className="block">
          <h3>Certifications</h3>
          <ul className="certs">
            {p.certifications.map((c, i) => {
              const st = certStatus(c.expires);
              return (
                <li key={i}>
                  <span>{c.name}</span>
                  {c.expires && <small className={`cert-${st}`}>{st === 'expired' ? 'Expired' : 'Expires'} {fmtDate(c.expires)}</small>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(p.vesselHistory.length > 0 || p.experience.length > 0) && (
        <section className="block">
          <h3>Experience</h3>
          <ul className="exp">
            {p.vesselHistory.map((v, i) => (
              <li key={'v' + i}>
                <span><b>{v.position}</b>, {v.vesselName}{v.length ? ` (${v.length})` : ''}</span>
                <small>{monthYear(v.from)} to {v.current ? 'present' : monthYear(v.to)}, verified on CJM Marine</small>
              </li>
            ))}
            {p.experience.map((x, i) => (
              <li key={'x' + i}>
                <span><b>{x.position}</b>{x.vessel && `, ${x.vessel}`}</span>
                <small>{[x.years, x.notes].filter(Boolean).join('. ')}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="block">
        <h3>Reviews</h3>
        {data.reviews.length === 0 && <p className="empty">No reviews yet.</p>}
        <ul className="reviews">
          {data.reviews.map((r) => (
            <li key={r.id}>
              <Stars value={r.rating} />
              {r.text && <p>{r.text}</p>}
              <small>
                {r.reviewer}{r.vesselName && `, ${r.vesselName}`}, {fmtStamp(r.createdAt)}
                {(r.mine || data.canModerate) && <> <button className="link danger" onClick={() => remove(r.id)}>Delete</button></>}
              </small>
            </li>
          ))}
        </ul>
        {data.canReview && (
          <form className="form review-form" onSubmit={save}>
            <h4>{mine ? 'Update your review' : `Review ${p.name.split(' ')[0]}`}</h4>
            <StarInput value={rev.rating} onChange={(n) => setRev({ ...rev, rating: n })} />
            <textarea rows={3} value={rev.text} onChange={(e) => setRev({ ...rev, text: e.target.value })}
              placeholder="What was it like working with them?" aria-label="Review" />
            <div className="actions left"><button className="btn primary" disabled={busy}>{mine ? 'Update review' : 'Post review'}</button></div>
          </form>
        )}
      </section>
    </div>
  );
}
