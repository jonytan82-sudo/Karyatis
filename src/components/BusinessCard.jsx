import { useEffect, useRef, useState } from 'react';
import { printCard } from '../contact.js';
import QRCode from 'qrcode';
import Avatar from './Avatar.jsx';

const esc = (s) => String(s || '').replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');

/** vCard 3.0. forQr keeps it short so the printed code stays easy to scan. */
function vcard(p, org, withPhoto, forQr) {
  const parts = p.name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop() : '';
  return [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:${esc(last)};${esc(parts.join(' '))};;;`,
    `FN:${esc(p.name)}`,
    p.headline && `TITLE:${esc(p.headline)}`,
    org && `ORG:${esc(org)}`,
    p.phone && `TEL;TYPE=CELL:${esc(p.phone)}`,
    p.email && `EMAIL;TYPE=INTERNET:${esc(p.email)}`,
    !forQr && p.location && `ADR;TYPE=HOME:;;;${esc(p.location)};;;`,
    !forQr && p.reviewsUrl && `URL:${p.reviewsUrl}`,
    withPhoto && p.photo && `PHOTO;ENCODING=b;TYPE=JPEG:${p.photo.split(',')[1]}`,
    'END:VCARD',
  ].filter(Boolean).join('\r\n');
}

const qr = (text, level = 'M') => QRCode.toDataURL(text, { errorCorrectionLevel: level, margin: 1, width: 360, color: { dark: '#12324a', light: '#ffffff' } });

export default function BusinessCard({ profile, onEnableSharing }) {
  const current = (profile.vesselHistory || []).find((v) => v.current);
  const role = profile.headline || (current ? current.position : '');
  const org = current ? current.vesselName : '';
  const reviewsUrl = profile.shareId ? `${window.location.origin}/?r=${profile.shareId}` : '';
  const hasContact = !!(profile.phone || profile.email);
  const [codes, setCodes] = useState({ contact: '', reviews: '' });
  const sides = useRef(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      hasContact ? qr(vcard(profile, org, false, true), 'L') : Promise.resolve(''),
      reviewsUrl ? qr(reviewsUrl) : Promise.resolve(''),
    ]).then(([contact, reviews]) => live && setCodes({ contact, reviews })).catch(() => {});
    return () => { live = false; };
  }, [profile, org, reviewsUrl, hasContact]);

  const download = () => {
    const blob = new Blob([vcard({ ...profile, reviewsUrl }, org, true)], { type: 'text/vcard' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = profile.name.replace(/[^\w]+/g, '-') + '.vcf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="bcard-wrap">
      <div className="bcard-sides" ref={sides}>
        <div className="bcard">
          <div className="bcard-top">
            <Avatar name={profile.name} photo={profile.photo} size={64} />
            <div>
              <div className="bcard-name">{profile.name}</div>
              {role && <div className="bcard-role">{role}</div>}
              {org && <div className="bcard-org">{org}</div>}
            </div>
          </div>
          <div className="bcard-contact">
            {profile.phone && <span>{profile.phone}</span>}
            {profile.email && <span>{profile.email}</span>}
            {profile.location && <span>{profile.location}</span>}
          </div>
          <div className="bcard-mark">CJM Marine</div>
        </div>

        <div className="bcard bcard-back">
          <div className="bq">
            {codes.contact ? <img src={codes.contact} alt="QR code: save contact" /> : <span className="bq-empty">Add a phone or email</span>}
            <span>Save contact</span>
          </div>
          <div className="bq">
            {codes.reviews ? <img src={codes.reviews} alt="QR code: reviews" /> : <span className="bq-empty">Reviews not shared</span>}
            <span>Read my reviews</span>
          </div>
          <div className="bcard-mark">CJM Marine</div>
        </div>
      </div>

      <div className="actions left">
        <button className="btn primary" onClick={download}>Save contact (.vcf)</button>
        <button className="btn" onClick={() => printCard(sides.current)}>Print card</button>
        {reviewsUrl && <a className="btn" href={reviewsUrl} target="_blank" rel="noreferrer">Open reviews page</a>}
      </div>

      {!hasContact && (
        <p className="hint">The contact code needs a phone or email. Add a phone and turn on "Show my phone and email" in Edit profile.</p>
      )}
      {!reviewsUrl && onEnableSharing && (
        <p className="hint">
          The reviews code opens a page anyone can view without logging in. It shows your reviews but not who wrote them.{' '}
          <button className="link" onClick={onEnableSharing}>Turn on review sharing</button>
        </p>
      )}
      {!reviewsUrl && !onEnableSharing && <p className="hint">This crew member has not shared their reviews publicly.</p>}
      <p className="hint">Prints at standard card size (3.5 × 2 in), front and back.</p>
    </div>
  );
}
