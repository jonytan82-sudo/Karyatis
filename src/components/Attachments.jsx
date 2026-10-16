import { useEffect, useState } from 'react';
import { call } from '../api.js';
import { fileKind, fileSize, isImage } from '../files.js';

/** Thumbnails and file chips under a note. Opening one fetches it (only the vessel's crew can). */
export function AttachmentList({ items }) {
  const [open, setOpen] = useState(null);
  if (!items || !items.length) return null;
  return (
    <>
      <ul className="att-list">
        {items.map((a) => (
          <li key={a.id}>
            <button type="button" className={a.thumb ? 'att-thumb' : 'att-chip'} onClick={() => setOpen(a)} title={`Open ${a.name}`}>
              {a.thumb ? <img src={a.thumb} alt={a.name} /> : <><b>{fileKind(a.mimeType, a.name)}</b><span>{a.name}</span></>}
            </button>
          </li>
        ))}
      </ul>
      {open && <Viewer item={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Viewer({ item, onClose }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let url = '';
    call('getAttachment', { id: item.id }).then((r) => {
      const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
      url = URL.createObjectURL(new Blob([bytes], { type: r.mimeType }));
      setFile({ url, name: r.name, mimeType: r.mimeType });
    }).catch((e) => setError(e.message));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [item.id]);

  useEffect(() => {
    // Escape closes only this viewer, not the task window underneath.
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={item.name} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="viewer-bar">
        <span className="viewer-name">{item.name} <small>{fileSize(item.size)}</small></span>
        {file && <a className="btn" href={file.url} target="_blank" rel="noopener noreferrer">Open</a>}
        {file && <a className="btn" href={file.url} download={file.name}>Download</a>}
        <button className="btn" onClick={onClose}>Close</button>
      </div>
      <div className="viewer-body" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {error && <div className="alert">{error}</div>}
        {!file && !error && <p className="viewer-wait">Loading…</p>}
        {file && isImage(file.mimeType) && <img src={file.url} alt={item.name} />}
        {file && /pdf/.test(file.mimeType) && <iframe src={file.url} title={item.name} />}
        {file && /^video/.test(file.mimeType) && <video src={file.url} controls playsInline />}
        {file && !isImage(file.mimeType) && !/pdf|^video/.test(file.mimeType) && (
          <p className="viewer-wait">This file opens in its own app. Use <b>Open</b> or <b>Download</b>.</p>
        )}
      </div>
    </div>
  );
}
