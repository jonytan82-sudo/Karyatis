// CJM Marine support contact. Change it here and it updates everywhere on the site.
export const SUPPORT = {
  org: 'CJM Marine',
  name: 'CJM Marine Support',
  phone: '+18139221603',
  phoneDisplay: '+1 (813) 922-1603',
  email: 'support@cjm-aero.com',
};

// Shown on the public landing page. Confirm these before publishing.
export const COMPANY = {
  name: 'CJM Marine',
  parent: 'Carballo Jet Management LLC', // legal entity CJM Marine operates under (please confirm)
  region: 'Florida, USA',
  site: 'https://cjm-marine-1.netlify.app',
};

// Amazon Associates disclosure. Amazon requires it to be shown clearly wherever its links appear.
export const AMAZON_DISCLOSURE = 'As an Amazon Associate, CJM Marine earns from qualifying purchases.';
export const SHOW_AMAZON_DISCLOSURE = true;

const esc = (s) => String(s || '').replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');

/** vCard 3.0 for a person or for the support desk. */
export function contactVcard({ name = SUPPORT.name, title = '', org = SUPPORT.org, phone = SUPPORT.phone, email = SUPPORT.email, url = '' } = {}) {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop() : '';
  return [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:${esc(last)};${esc(parts.join(' '))};;;`,
    `FN:${esc(name)}`,
    org && `ORG:${esc(org)}`,
    title && `TITLE:${esc(title)}`,
    phone && `TEL;TYPE=WORK,VOICE:${phone}`,
    email && `EMAIL;TYPE=INTERNET,WORK:${email}`,
    url && `URL:${url}`,
    'END:VCARD',
  ].filter(Boolean).join('\r\n');
}

export function downloadVcard(text, filename) {
  const blob = new Blob([text], { type: 'text/vcard' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Link that opens the login page straight on "Request an account". */
export const signupUrl = (as) => `${window.location.origin}/?request=1${as ? `&as=${as}` : ''}`;

/** Prints just the card (front and back) on a clean page at 3.5 × 2 in. */
export function printCard(sidesEl) {
  if (!sidesEl) return;
  const w = window.open('', '_blank', 'width=720,height=640');
  if (!w) { window.print(); return; }
  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('\n');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Business card</title>${styles}
    <style>
      html, body { background: #fff !important; margin: 0; }
      body * { visibility: visible !important; }
      .print-sheet { padding: 0.5in; }
      .print-sheet .bcard-sides { position: static !important; display: flex; flex-direction: column; gap: 0.35in; }
      .print-sheet .bcard { width: 3.5in !important; max-width: none !important; height: 2in !important; aspect-ratio: auto !important;
        flex: none !important; border-radius: 0 !important; outline: 1px dashed #bbb; outline-offset: 0.06in; }
      .print-sheet .bcard-back { padding: 0.12in 0.2in 0.28in; }
      .print-sheet .bq img, .print-sheet .bq-empty { width: 1.15in; height: 1.15in; }
      .print-note { font: 12px Arial, sans-serif; color: #666; margin-top: 0.3in; }
      @media print { .print-note { display: none; } @page { margin: 0; } }
    </style></head><body><div class="print-sheet">${sidesEl.outerHTML}
    <p class="print-note">Cut along the dashed lines. Print at 100% scale.</p></div></body></html>`);
  w.document.close();
  const go = () => { w.focus(); w.print(); };
  const imgs = [...w.document.images];
  Promise.all(imgs.map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))).then(() => setTimeout(go, 300));
}
