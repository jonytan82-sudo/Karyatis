import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { AVAILABILITY } from '../util.js';
import Avatar from './Avatar.jsx';
import BusinessCard from './BusinessCard.jsx';
import ProfileView from './ProfileView.jsx';

/** Square-crops and shrinks a photo so it fits in one Google Sheets cell. */
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 240;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const side = Math.min(img.width, img.height);
      canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      let q = 0.82, out = canvas.toDataURL('image/jpeg', q);
      while (out.length > 44000 && q > 0.35) { q -= 0.1; out = canvas.toDataURL('image/jpeg', q); }
      URL.revokeObjectURL(img.src);
      resolve(out);
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);
  });
}

const SUBTABS = [['edit', 'Edit profile'], ['preview', 'Preview and reviews'], ['card', 'Business card'], ['password', 'Password']];

export default function Profile({ user, onChanged }) {
  const [data, setData] = useState(null);
  const [f, setF] = useState(null);
  const [sub, setSub] = useState('edit');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ oldPassword: '', newPassword: '' });

  const take = (r) => {
    setData(r);
    const p = r.profile;
    setF({ ...p, certifications: p.certifications.length ? p.certifications : [], experience: p.experience });
  };

  useEffect(() => { call('getMyProfile').then(take).catch((e) => setError(e.message)); }, []);

  if (error && !f) return <div className="alert">{error}</div>;
  if (!f) return <p className="empty">Loading your profile…</p>;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setItem = (list, i, k, v) => setF({ ...f, [list]: f[list].map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  const addItem = (list, blank) => setF({ ...f, [list]: [...f[list], blank] });
  const dropItem = (list, i) => setF({ ...f, [list]: f[list].filter((_, j) => j !== i) });

  async function pickPhoto(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { setF({ ...f, photo: await resizePhoto(file) }); } catch (err) { setError(err.message); }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await call('saveProfile', { profile: {
        name: f.name, photo: f.photo, headline: f.headline, bio: f.bio, location: f.location,
        yearsExperience: f.yearsExperience, availability: f.availability, phone: f.phone,
        showContact: f.showContact, languages: f.languages,
        certifications: f.certifications, experience: f.experience,
      } });
      take(r);
      setMsg('Profile saved.');
      if (f.name !== user.name) onChanged();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function changePw(e) {
    e.preventDefault();
    setError(''); setMsg('');
    try { await call('changePassword', pw); setPw({ oldPassword: '', newPassword: '' }); setMsg('Password changed.'); }
    catch (err) { setError(err.message); }
  }

  return (
    <div className="profile">
      <nav className="subtabs">
        {SUBTABS.map(([k, label]) => (
          <button key={k} className={sub === k ? 'on' : ''} onClick={() => { setSub(k); setMsg(''); setError(''); }}>{label}</button>
        ))}
      </nav>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}

      {sub === 'edit' && (
        <form className="form" onSubmit={save}>
          <div className="photo-row">
            <Avatar name={f.name} photo={f.photo} size={96} />
            <div>
              <label className="btn file-btn">Upload photo<input type="file" accept="image/*" onChange={pickPhoto} /></label>
              {f.photo && <button type="button" className="link danger" onClick={() => setF({ ...f, photo: '' })}>Remove photo</button>}
              <p className="hint">A clear head-and-shoulders photo works best.</p>
            </div>
          </div>

          <div className="two">
            <label>Full name<input value={f.name} onChange={set('name')} required /></label>
            <label>Headline<input value={f.headline} onChange={set('headline')} placeholder="Chief Engineer, MTU and CAT, Y3" /></label>
          </div>
          <div className="two">
            <label>Based in<input value={f.location} onChange={set('location')} placeholder="Fort Lauderdale, FL" /></label>
            <label>Years at sea<input inputMode="numeric" value={f.yearsExperience} onChange={set('yearsExperience')} /></label>
          </div>
          <div className="two">
            <label>Availability
              <select value={f.availability} onChange={set('availability')}>
                <option value="">Not shown</option>
                {AVAILABILITY.map((a) => <option key={a}>{a}</option>)}
              </select>
            </label>
            <label>Languages<input value={f.languages} onChange={set('languages')} placeholder="English, Spanish" /></label>
          </div>
          <label>About you
            <textarea rows={5} value={f.bio} onChange={set('bio')} placeholder="Vessels, systems you know well, what you're looking for" />
          </label>

          <fieldset className="recur">
            <legend>Contact</legend>
            <div className="two">
              <label>Phone<input type="tel" value={f.phone} onChange={set('phone')} /></label>
              <label>Email<input value={user.email} readOnly /></label>
            </div>
            <label className="check">
              <input type="checkbox" checked={!!f.showContact} onChange={set('showContact')} />
              Show my phone and email to owners and captains searching for crew
            </label>
          </fieldset>

          <fieldset className="recur">
            <legend>Certifications</legend>
            {f.certifications.map((c, i) => (
              <div key={i} className="list-row">
                <input aria-label="Certification" value={c.name} onChange={(e) => setItem('certifications', i, 'name', e.target.value)} placeholder="STCW Basic Safety" />
                <input aria-label="Expires" type="date" value={c.expires} onChange={(e) => setItem('certifications', i, 'expires', e.target.value)} />
                <button type="button" className="close" aria-label="Remove certification" onClick={() => dropItem('certifications', i)}>×</button>
              </div>
            ))}
            <button type="button" className="link" onClick={() => addItem('certifications', { name: '', expires: '' })}>Add certification</button>
          </fieldset>

          <fieldset className="recur">
            <legend>Previous experience</legend>
            <p className="hint">Vessels you serve on through CJM Marine are added automatically. List earlier ones here.</p>
            {f.experience.map((x, i) => (
              <div key={i} className="list-row exp-row">
                <input aria-label="Vessel" value={x.vessel} onChange={(e) => setItem('experience', i, 'vessel', e.target.value)} placeholder="M/Y Sea Breeze, 52m" />
                <input aria-label="Position" value={x.position} onChange={(e) => setItem('experience', i, 'position', e.target.value)} placeholder="2nd Engineer" />
                <input aria-label="Years" value={x.years} onChange={(e) => setItem('experience', i, 'years', e.target.value)} placeholder="2018 to 2021" />
                <button type="button" className="close" aria-label="Remove experience" onClick={() => dropItem('experience', i)}>×</button>
              </div>
            ))}
            <button type="button" className="link" onClick={() => addItem('experience', { vessel: '', position: '', years: '', notes: '' })}>Add a vessel</button>
          </fieldset>

          <div className="actions left"><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div>
        </form>
      )}

      {sub === 'preview' && data && (
        <>
          <p className="hint">This is how owners and captains see your profile.</p>
          <div className="card"><ProfileView data={data} /></div>
        </>
      )}

      {sub === 'card' && data && <BusinessCard profile={data.profile} />}

      {sub === 'password' && (
        <form className="form card" onSubmit={changePw}>
          <div className="two">
            <label>Current password<input type="password" autoComplete="current-password" value={pw.oldPassword} onChange={(e) => setPw({ ...pw, oldPassword: e.target.value })} required /></label>
            <label>New password<input type="password" autoComplete="new-password" minLength={6} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required /></label>
          </div>
          <div className="actions left"><button className="btn primary">Change password</button></div>
        </form>
      )}
    </div>
  );
}
