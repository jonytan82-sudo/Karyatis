import { useState } from 'react';
import { readProductLink, searchLink, suggestionsFor, VERIFY_NOTE } from '../supplies.js';

/**
 * "Find the part": search the supplier (through CJM's link when the tag is on), then paste the product link back.
 * The item name is read from the link and can be corrected; part number and quantity are typed (they are never in a link).
 * onAdd({ name, partNumber, qty, url }) is called when the part is added.
 */
export default function PartFinder({ supplies, task, onAdd, addLabel = 'Add to parts', compact, canSave = true }) {
  const sug = supplies && supplies.searchUrl ? suggestionsFor(task || {}, supplies.maps) : { items: [] };
  const [q, setQ] = useState('');
  const [link, setLink] = useState('');
  const [found, setFound] = useState(null); // { name, partNumber, qty, url, info }
  if (!supplies || !supplies.searchUrl) return null;
  const term = q.trim() || (sug.items[0] && sug.items[0].term) || String((task && task.title) || '').trim();

  function read(v) {
    setLink(v);
    const info = readProductLink(v);
    if (!info) { setFound(null); return; }
    setFound((f) => ({ name: (f && f.name) || info.name, partNumber: (f && f.partNumber) || '', qty: (f && f.qty) || '1', url: v.trim(), info }));
  }
  function add() {
    if (!found || !found.name.trim()) return;
    onAdd({ name: found.name.trim(), partNumber: found.partNumber.trim(), qty: found.qty.trim() || '1', url: found.url });
    setFound(null); setLink('');
  }

  return (
    <div className={`part-finder${compact ? ' compact' : ''}`}>
      <div className="pf-step">
        <span className="pf-label">Find the part</span>
        <div className="pf-search">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="What part do you need?"
            placeholder={term || 'What do you need? e.g. Racor R12T fuel filter'}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (term) window.open(searchLink(supplies, term), '_blank', 'noopener'); } }} />
          <a className={`btn primary${term ? '' : ' disabled'}`} aria-disabled={!term} href={term ? searchLink(supplies, term) : undefined}
            target="_blank" rel="noopener noreferrer">Search Amazon</a>
        </div>
        {sug.items.length > 0 && !q && (
          <div className="supply-sugs pf-sugs">
            {sug.items.map((s) => <button type="button" key={s.term} className="supply-sug" onClick={() => setQ(s.term)}>{s.term}</button>)}
          </div>
        )}
        {sug.equipment && <small className="hint">Searches include {sug.equipment}, from what the task says.</small>}
      </div>
      {canSave && <div className="pf-step">
        <span className="pf-label">Found it? Paste the link</span>
        <input type="url" inputMode="url" value={link} onChange={(e) => read(e.target.value)} aria-label="Product link"
          placeholder="https://www.amazon.com/… or any supplier" />
        {link && !found && <small className="hint">Paste the full https:// address of the product page.</small>}
      </div>}
      {found && (
        <div className="pf-found">
          <label>Item
            <input value={found.name} onChange={(e) => setFound({ ...found, name: e.target.value })} placeholder="Type the item name" autoFocus={!found.name} />
          </label>
          <div className="pf-row">
            <label><span>Part no. <span className="opt">(if known)</span></span>
              <input value={found.partNumber} onChange={(e) => setFound({ ...found, partNumber: e.target.value })} />
            </label>
            <label>Qty
              <input inputMode="numeric" value={found.qty} onChange={(e) => setFound({ ...found, qty: e.target.value.replace(/[^\d]/g, '').slice(0, 4) })} />
            </label>
          </div>
          <small className="hint">
            {found.info.short ? 'Short links do not include the item name. Type it in. For the Amazon cart button, copy the full link from the product page.'
              : found.info.name ? 'Name taken from the link. Check it before adding.' : 'This link does not include the item name. Type it in.'}
            {found.info.amazon && found.info.asin ? ` Amazon item ${found.info.asin}.` : ''}
          </small>
          <div className="actions left">
            <button type="button" className="btn primary" disabled={!found.name.trim()} onClick={add}>{addLabel}</button>
            <button type="button" className="btn" onClick={() => { setFound(null); setLink(''); }}>Clear</button>
          </div>
        </div>
      )}
      {sug.note && <p className="hint">{sug.note}</p>}
      {sug.verify && <p className="supply-verify">{VERIFY_NOTE}</p>}
    </div>
  );
}
