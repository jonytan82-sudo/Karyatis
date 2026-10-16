// Turns web addresses in plain text into links that open in a new tab. Only http(s) addresses become links.
const URL_RE = /(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])/gi;

export default function Linkify({ text }) {
  const s = String(text || '');
  const parts = s.split(URL_RE);
  return parts.map((part, i) => (i % 2 === 1
    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="auto-link">{shorten(part)}</a>
    : part));
}

function shorten(u) {
  try {
    const x = new URL(u);
    const rest = (x.pathname + x.search).replace(/\/$/, '');
    return x.hostname.replace(/^www\./, '') + (rest.length > 28 ? rest.slice(0, 26) + '…' : rest);
  } catch { return u; }
}
