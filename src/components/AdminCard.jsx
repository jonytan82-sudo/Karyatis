import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { SUPPORT, contactVcard, downloadVcard, printCard, signupUrl } from '../contact.js';

const qr = (text, level = 'M') => QRCode.toDataURL(text, { errorCorrectionLevel: level, margin: 1, width: 480, color: { dark: '#12324a', light: '#ffffff' } });

const STORE = 'cjm_admin_card';
const load = (user) => {
  try { const v = JSON.parse(localStorage.getItem(STORE) || 'null'); if (v) return v; } catch { /* ignore */ }
  return { name: user.name, title: 'CJM Marine Division' };
};

/** Business card for the CJM admin: support contact on the front, sign-up and contact QR codes on the back. */
export default function AdminCard({ user }) {
  const [card, setCard] = useState(() => load(user));
  const [codes, setCodes] = useState({ signup: '', contact: '' });
  const [copied, setCopied] = useState(false);
  const sides = useRef(null);
  const link = signupUrl();
  const vcard = contactVcard({ name: card.name || SUPPORT.name, title: card.title, url: window.location.origin });

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(card)); } catch { /* private mode */ }
    let live = true;
    Promise.all([qr(link), qr(contactVcard({ name: card.name || SUPPORT.name, title: card.title }), 'L')])
      .then(([signup, contact]) => live && setCodes({ signup, contact })).catch(() => {});
    return () => { live = false; };
  }, [card, link]);

  const savePng = (data, name) => {
    const a = document.createElement('a');
    a.href = data; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } };

  return (
    <section className="group">
      <h3>Your business card</h3>
      <p className="hint">Hand this to new owners, captains and crew. The left code opens the account request form; the right code saves your contact.</p>
      <div className="form card admin-card-form">
        <div className="two">
          <label>Name on card<input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></label>
          <label>Title<input value={card.title} onChange={(e) => setCard({ ...card, title: e.target.value })} /></label>
        </div>
      </div>

      <div className="bcard-wrap">
        <div className="bcard-sides" ref={sides}>
          <div className="bcard admin-front">
            <div className="ac-brand">CJM Marine</div>
            <div>
              <div className="bcard-name">{card.name || SUPPORT.name}</div>
              {card.title && <div className="bcard-role">{card.title}</div>}
            </div>
            <div className="bcard-contact">
              <span>{SUPPORT.phoneDisplay}</span>
              <span>{SUPPORT.email}</span>
              <span>{window.location.host}</span>
            </div>
          </div>
          <div className="bcard bcard-back">
            <div className="bq">
              {codes.signup ? <img src={codes.signup} alt="QR code: request an account" /> : <span className="bq-empty" />}
              <span>Request an account</span>
            </div>
            <div className="bq">
              {codes.contact ? <img src={codes.contact} alt="QR code: save contact" /> : <span className="bq-empty" />}
              <span>Save contact</span>
            </div>
            <div className="bcard-mark">CJM Marine</div>
          </div>
        </div>

        <div className="actions left">
          <button className="btn primary" onClick={() => printCard(sides.current)}>Print card</button>
          <button className="btn" onClick={() => downloadVcard(vcard, (card.name || 'CJM-Marine').replace(/[^\w]+/g, '-') + '.vcf')}>Save contact (.vcf)</button>
          <button className="btn" disabled={!codes.signup} onClick={() => savePng(codes.signup, 'CJM-Marine-request-account-QR.png')}>Download sign-up QR</button>
          <button className="btn" disabled={!codes.contact} onClick={() => savePng(codes.contact, 'CJM-Marine-contact-QR.png')}>Download contact QR</button>
        </div>
        <div className="link-row">
          <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Sign-up link" />
          <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy sign-up link'}</button>
        </div>
        <p className="hint">Prints at standard card size (3.5 × 2 in), front and back. The sign-up link also works in a text or email.</p>
      </div>
    </section>
  );
}
