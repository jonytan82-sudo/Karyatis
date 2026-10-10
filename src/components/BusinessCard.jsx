import Avatar from './Avatar.jsx';

function vcard(p, org) {
  const esc = (s) => String(s || '').replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const parts = p.name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop() : '';
  const lines = [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:${esc(last)};${esc(parts.join(' '))};;;`,
    `FN:${esc(p.name)}`,
    p.headline && `TITLE:${esc(p.headline)}`,
    org && `ORG:${esc(org)}`,
    p.phone && `TEL;TYPE=CELL:${esc(p.phone)}`,
    p.email && `EMAIL;TYPE=INTERNET:${esc(p.email)}`,
    p.location && `ADR;TYPE=HOME:;;;${esc(p.location)};;;`,
    p.photo && `PHOTO;ENCODING=b;TYPE=JPEG:${p.photo.split(',')[1]}`,
    'NOTE:Crew profile on CJM Marine',
    'END:VCARD',
  ].filter(Boolean);
  return lines.join('\r\n');
}

export default function BusinessCard({ profile }) {
  const current = (profile.vesselHistory || []).find((v) => v.current);
  const role = profile.headline || (current ? current.position : '');
  const org = current ? current.vesselName : '';

  const download = () => {
    const blob = new Blob([vcard(profile, org)], { type: 'text/vcard' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = profile.name.replace(/[^\w]+/g, '-') + '.vcf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="bcard-wrap">
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
      <div className="actions left">
        <button className="btn primary" onClick={download}>Save contact (.vcf)</button>
        <button className="btn" onClick={() => window.print()}>Print card</button>
      </div>
      {!profile.phone && !profile.email && (
        <p className="hint">Add a phone number and turn on "Show my contact details" so the card carries your contact details.</p>
      )}
    </div>
  );
}
