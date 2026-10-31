import { useState } from 'react';
import { ACCEPT, MAX_FILES, prepareFile } from '../files.js';

/** Photos and files chosen for upload, shrunk first. `files` are prepared objects. */
export default function FilePicker({ files, onChange, onError, label = 'Add photos or files' }) {
  const [preparing, setPreparing] = useState(false);
  async function pick(e) {
    const list = [...e.target.files];
    e.target.value = '';
    if (!list.length) return;
    if (files.length + list.length > MAX_FILES) { onError(`Attach up to ${MAX_FILES} files.`); return; }
    setPreparing(true);
    try {
      const ready = [];
      for (const f of list) ready.push(await prepareFile(f));
      onChange([...files, ...ready]);
    } catch (err) { onError(err.message); } finally { setPreparing(false); }
  }
  return (
    <div className="file-picker">
      <label className={`btn attach-btn ${preparing || files.length >= MAX_FILES ? 'disabled' : ''}`}>
        <input type="file" multiple accept={ACCEPT} onChange={pick} disabled={preparing || files.length >= MAX_FILES} />
        {preparing ? 'Preparing…' : label}
      </label>
      {files.length > 0 && (
        <ul className="att-pending">
          {files.map((f, i) => (
            <li key={i}>
              {f.thumb ? <img src={f.thumb} alt="" /> : <span className="att-ext">{(f.name.split('.').pop() || '').toUpperCase()}</span>}
              <span className="att-pname">{f.name}</span>
              <button type="button" className="link danger" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const forUpload = (files) => files.map(({ name, mimeType, data, thumb }) => ({ name, mimeType, data, thumb }));
