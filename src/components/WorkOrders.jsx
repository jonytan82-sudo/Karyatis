import { useEffect, useMemo, useState } from 'react';
import { call } from '../api.js';
import { SYSTEMS, fmtDate, fmtStamp, todayISO } from '../util.js';
import Modal from './Modal.jsx';
import { InvoicePanel } from './Invoice.jsx';
import {
  ITEM_STATUS, PART_STATUS, STATE_LABEL, cleanNum, itemHours, money, newItem, newPart, num, partLine, partsWaiting, tmpId, woHours, woState,
} from '../workorders.js';

const BLOCKS = [
  ['open', 'Open', 'green'], ['active', 'In progress', 'amber'], ['parts', 'Waiting on parts', 'parts'],
  ['ready', 'Ready to send', 'issue'], ['review', 'With the Captain', 'review'],
];

function StateChip({ state }) {
  return <span className={`wo-chip ws-${state}`}>{STATE_LABEL[state]}</span>;
}

function WoRow({ wo, onOpen }) {
  const s = woState(wo);
  const last = (wo.notes || []).length ? wo.notes[wo.notes.length - 1] : null;
  const hours = woHours(wo), waiting = partsWaiting(wo), n = (wo.items || []).length;
  const inv = wo.invoice;
  return (
    <button type="button" className={`wo-row ws-${s}`} onClick={() => onOpen(wo.id)}>
      <span className="wo-row-main">
        <b>{wo.title}</b>
        <small>{wo.number}, {wo.boatName}{wo.onPlatform ? '' : ' (not on CJM Marine)'}</small>
        <small className="muted">
          {n} item{n === 1 ? '' : 's'}{hours ? `, ${Math.round(hours * 10) / 10} hr` : ''}{waiting ? `, ${waiting} part${waiting === 1 ? '' : 's'} on order` : ''}
          {inv ? `. ${inv.number} ${money(inv.total, inv.currency)} ${inv.status === 'paid' ? 'paid' : inv.status === 'sent' ? 'sent' : 'draft'}` : ''}
        </small>
        {last && <span className="wo-row-note">“{last.text}” <small className="muted">{fmtStamp(last.at)}</small></span>}
      </span>
      <StateChip state={s} />
    </button>
  );
}

function NewWorkOrder({ boats, onClose, onDone }) {
  const [f, setF] = useState({ boatName: '', contactName: '', contactEmail: '', title: '', description: '' });
  const [picked, setPicked] = useState(null); // a boat on CJM Marine
  const [found, setFound] = useState([]);
  const [listOpen, setListOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // search CJM Marine boats as the name is typed; my own boats show first
  useEffect(() => {
    const q = f.boatName.trim();
    if (picked || q.length < 2) { setFound([]); return undefined; }
    let live = true;
    const t = setTimeout(() => { call('findBoats', { q }).then((r) => live && setFound(r.boats || [])).catch(() => {}); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [f.boatName, picked]);
  const q = f.boatName.trim().toLowerCase();
  const mineShown = boats.filter((b) => !q || b.vesselName.toLowerCase().includes(q)).map((b) => ({ ...b, mine: true }));
  const options = [...mineShown, ...found.filter((b) => !mineShown.some((m) => m.vesselId === b.vesselId))].slice(0, 8);

  const pick = (b) => { setPicked(b); setF({ ...f, boatName: b.vesselName }); setListOpen(false); };
  async function create(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await call('createWorkOrder', { workOrder: {
        vesselId: picked ? picked.vesselId : '', boatName: f.boatName, contactName: picked ? '' : f.contactName,
        contactEmail: picked ? '' : f.contactEmail, title: f.title, description: f.description,
      } });
      onDone(r);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const approvers = picked && (picked.approvers || []);
  return (
    <Modal title="New work order" onClose={onClose}>
      <form className="form" onSubmit={create}>
        <div className="boat-pick">
          <label>Boat
            <input value={f.boatName} required autoComplete="off" placeholder="Start typing the boat name" role="combobox"
              aria-expanded={listOpen && options.length > 0} aria-controls="boat-options"
              onFocus={() => setListOpen(true)} onBlur={() => setTimeout(() => setListOpen(false), 150)}
              onChange={(e) => { setPicked(null); setListOpen(true); setF({ ...f, boatName: e.target.value }); }} />
          </label>
          {listOpen && !picked && options.length > 0 && (
            <ul className="boat-options" id="boat-options" role="listbox">
              {options.map((b) => (
                <li key={b.vesselId} role="option" aria-selected="false">
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(b)}>
                    <b>{b.vesselName}</b>
                    <small>{b.mine ? 'Your boat' : 'On CJM Marine'}{b.homePort ? `, ${b.homePort}` : ''}{b.approvers && b.approvers.length ? `. Approved by ${b.approvers.join(', ')}` : ''}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {picked ? (
          <div className="ok boat-picked">
            <b>{picked.vesselName} is on CJM Marine.</b>{' '}
            {approvers && approvers.length ? `When you send it, the work order goes to ${approvers.join(', ')} for approval in the app.` : 'When you send it, it goes to the boat’s Captain or Owner in the app.'}{' '}
            <button type="button" className="link" onClick={() => { setPicked(null); setF({ ...f, boatName: '' }); }}>Change boat</button>
          </div>
        ) : (
          <>
            <div className="two">
              <label>Captain or Owner<input value={f.contactName} onChange={set('contactName')} placeholder="Name" /></label>
              <label>Their email<input type="email" value={f.contactEmail} onChange={set('contactEmail')} required placeholder="captain@example.com" /></label>
            </div>
            <p className="hint">Not in the list? The boat is not on CJM Marine yet. Its Captain or Owner reviews the work from an email, no account needed, and the invoice goes to this email.</p>
          </>
        )}
        <label>What's the job?<input value={f.title} onChange={set('title')} placeholder="Annual stabilizer service" required /></label>
        <label><span>Notes before you start <span className="opt">(optional)</span></span>
          <textarea rows={2} value={f.description} onChange={set('description')} placeholder="Squawk list from the Chief Engineer, access, dock and slip" />
        </label>
        {error && <div className="alert">{error}</div>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Opening…' : 'Open work order'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** One item on the work order: what was found, what was done, labor, parts, and the signature. */
function ItemCard({ it, idx, count, ro, credential, onChange, onMove, onRemove, onSign, onUnsign, busy }) {
  const [labor, setLabor] = useState({ date: todayISO(), hours: '', note: '' });
  const [cred, setCred] = useState(credential || '');
  const [open, setOpen] = useState(!it.title || !it.sign);
  const set = (k, v) => onChange({ ...it, [k]: v });
  const setPart = (id, k, v) => set('parts', it.parts.map((p) => (p.id === id ? { ...p, [k]: v } : p)));
  const hours = itemHours(it);
  const locked = ro || !!it.sign;

  const addLabor = () => {
    if (!num(labor.hours)) return;
    set('labor', [...(it.labor || []), { id: tmpId('L'), date: labor.date || todayISO(), hours: labor.hours, note: labor.note.trim() }]);
    setLabor({ ...labor, hours: '', note: '' });
  };

  return (
    <li className={`wo-item ${it.sign ? 'signed' : ''}`}>
      <div className="wo-item-head">
        <button type="button" className="wo-item-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="wo-no">{idx + 1}</span>
          <span className="wo-item-title"><b>{it.title || 'New item'}</b>
            <small>{[it.system, hours ? `${Math.round(hours * 10) / 10} hr` : '', (it.parts || []).length ? `${it.parts.length} part${it.parts.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ')}</small>
          </span>
        </button>
        {it.sign ? <span className="wo-chip ws-approved">Signed</span> : <span className={`wo-chip is-${it.status}`}>{(ITEM_STATUS.find((s) => s[0] === it.status) || [])[1]}</span>}
      </div>
      {open && (
        <div className="wo-item-body">
          {locked ? (
            <>
              {it.discrepancy && <p className="pre"><span className="muted">Found: </span>{it.discrepancy}</p>}
              {it.corrective && <p className="pre"><span className="muted">Done: </span>{it.corrective}</p>}
            </>
          ) : (
            <>
              <div className="wo-item-fields">
                <label>Item<input value={it.title} onChange={(e) => set('title', e.target.value)} placeholder="Short title, e.g. Port generator impeller" /></label>
                <label>System
                  <select value={it.system} onChange={(e) => set('system', e.target.value)}>
                    <option value="">Choose</option>
                    {SYSTEMS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label>Status
                  <select value={it.status} onChange={(e) => set('status', e.target.value)}>
                    {ITEM_STATUS.filter((s) => s[0] !== 'done').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </label>
              </div>
              <label>What was found<textarea rows={2} value={it.discrepancy} onChange={(e) => set('discrepancy', e.target.value)} placeholder="What you found, with readings if you took any" /></label>
              <label>Work done<textarea rows={2} value={it.corrective} onChange={(e) => set('corrective', e.target.value)} placeholder="What you did, and how you tested it" /></label>
            </>
          )}

          <div className="wo-sub">
            <b>Labor</b>
            {(it.labor || []).length > 0 && (
              <ul className="wo-labor">
                {it.labor.map((l) => (
                  <li key={l.id}><span>{fmtDate(l.date)}</span><span>{num(l.hours)} hr</span><span className="muted">{l.note}</span>
                    {!locked && <button type="button" className="close" aria-label="Remove labor line" onClick={() => set('labor', it.labor.filter((x) => x.id !== l.id))}>×</button>}
                  </li>
                ))}
              </ul>
            )}
            {!locked && (
              <div className="wo-labor-add">
                <input type="date" aria-label="Date" value={labor.date} max={todayISO()} onChange={(e) => setLabor({ ...labor, date: e.target.value })} />
                <input aria-label="Hours" inputMode="decimal" placeholder="Hours" value={labor.hours} onChange={(e) => setLabor({ ...labor, hours: cleanNum(e.target.value) })} />
                <input aria-label="Labor note" placeholder="Note (optional)" value={labor.note} onChange={(e) => setLabor({ ...labor, note: e.target.value })} />
                <button type="button" className="btn" disabled={!num(labor.hours)} onClick={addLabor}>Add hours</button>
              </div>
            )}
            {!(it.labor || []).length && locked && <p className="hint">No hours logged.</p>}
          </div>

          <div className="wo-sub">
            <b>Parts</b>
            {(it.parts || []).map((p) => (locked ? (
              <p key={p.id} className="wo-part-ro">{p.desc}{p.desc && ' '}<span className="muted">{partLine(p)}{num(p.qty) !== 1 ? `, qty ${num(p.qty)}` : ''}</span></p>
            ) : (
              <div key={p.id} className="wo-part">
                <div className="wo-part-top">
                  <input aria-label="Part" value={p.desc} onChange={(e) => setPart(p.id, 'desc', e.target.value)} placeholder="Part" />
                  <input aria-label="Quantity" inputMode="decimal" value={p.qty} onChange={(e) => setPart(p.id, 'qty', cleanNum(e.target.value))} placeholder="Qty" />
                  <input aria-label="Price each" inputMode="decimal" value={p.price} onChange={(e) => setPart(p.id, 'price', cleanNum(e.target.value))} placeholder="Price each" />
                  <select aria-label="Part status" value={p.status} onChange={(e) => setPart(p.id, 'status', e.target.value)}>
                    {PART_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <button type="button" className="close" aria-label="Remove part" onClick={() => set('parts', it.parts.filter((x) => x.id !== p.id))}>×</button>
                </div>
                <div className="wo-part-sn">
                  <span className="muted">Off</span>
                  <input aria-label="Part number off" value={p.pnOff} disabled={p.naOff} onChange={(e) => setPart(p.id, 'pnOff', e.target.value)} placeholder="Part no. off" />
                  <input aria-label="Serial off" value={p.snOff} disabled={p.naOff} onChange={(e) => setPart(p.id, 'snOff', e.target.value)} placeholder="Serial off" />
                  <label className="check mini"><input type="checkbox" checked={!!p.naOff} onChange={(e) => setPart(p.id, 'naOff', e.target.checked)} /> N/A</label>
                  <span className="muted">On</span>
                  <input aria-label="Part number on" value={p.pnOn} disabled={p.naOn} onChange={(e) => setPart(p.id, 'pnOn', e.target.value)} placeholder="Part no. on" />
                  <input aria-label="Serial on" value={p.snOn} disabled={p.naOn} onChange={(e) => setPart(p.id, 'snOn', e.target.value)} placeholder="Serial on" />
                  <label className="check mini"><input type="checkbox" checked={!!p.naOn} onChange={(e) => setPart(p.id, 'naOn', e.target.checked)} /> N/A</label>
                </div>
              </div>
            )))}
            {!locked && <button type="button" className="link" onClick={() => set('parts', [...(it.parts || []), newPart()])}>Add a part</button>}
            {!(it.parts || []).length && locked && <p className="hint">No parts.</p>}
          </div>

          {it.sign ? (
            <div className="wo-signed">
              <span>Signed by <b>{it.sign.name}</b>{it.sign.credential ? `, ${it.sign.credential}` : ''}, {fmtStamp(it.sign.at)}</span>
              {!ro && <button type="button" className="link" disabled={busy} onClick={onUnsign}>Take back the signature</button>}
            </div>
          ) : !ro && (
            <div className="wo-sign">
              <input aria-label="Your credential" value={cred} onChange={(e) => setCred(e.target.value)} placeholder="Your credential (optional), e.g. ABYC Diesel" />
              <button type="button" className="btn primary" disabled={busy || !it.title.trim() || !it.corrective.trim()} onClick={() => onSign(cred)}>Sign this item</button>
              {!it.corrective.trim() && <span className="hint">Write the work done first.</span>}
            </div>
          )}

          {!locked && (
            <div className="wo-item-tools">
              <button type="button" className="link" disabled={idx === 0} onClick={() => onMove(-1)}>Move up</button>
              <button type="button" className="link" disabled={idx === count - 1} onClick={() => onMove(1)}>Move down</button>
              <button type="button" className="link danger" onClick={onRemove}>Remove item</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

const fromWo = (wo) => ({ title: wo.title, description: wo.description || '', contactName: wo.contactName || '', contactEmail: wo.contactEmail || '',
  boatName: wo.boatName || '', items: wo.items || [] });

function WorkOrderDetail({ wo, business, onBack, onData }) {
  const [f, setF] = useState(() => fromWo(wo));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');
  const [wantScore, setWantScore] = useState(true);
  const [removing, setRemoving] = useState(null);

  useEffect(() => { setF(fromWo(wo)); setDirty(false); }, [wo.id, wo.editedAt, wo.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const state = woState({ ...wo, items: f.items });
  const ro = wo.status !== 'open';
  const allSigned = f.items.length > 0 && f.items.every((i) => i.sign);
  const change = (patch) => { setF({ ...f, ...patch }); setDirty(true); setMsg(''); };
  const setItem = (i, it) => change({ items: f.items.map((x, j) => (j === i ? it : x)) });

  async function run(action, args, okMsg) {
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await call(action, args);
      onData(r);
      setMsg(r.message || okMsg || '');
      return r;
    } catch (e) { setError(e.message); return null; } finally { setBusy(false); }
  }
  const payload = (items, extra) => ({ id: wo.id, workOrder: { title: f.title, description: f.description, contactName: f.contactName, contactEmail: f.contactEmail,
    ...(wo.onPlatform ? {} : { boatName: f.boatName }), items: items || f.items, editedAt: wo.editedAt, ...extra } });
  const save = () => run('saveWorkOrder', payload(), 'Saved.');
  const sign = (i, credential) => run('saveWorkOrder', payload(f.items.map((x, j) => (j === i ? { ...x, sign: { credential } } : x))), `Item ${i + 1} signed.`);
  const unsign = (i) => run('saveWorkOrder', payload(f.items.map((x, j) => (j === i ? { ...x, sign: null } : x))), `Signature taken back on item ${i + 1}.`);
  const addNote = async () => { if (await run('saveWorkOrder', payload(null, { addNote: note }), 'Note added.')) setNote(''); };
  const move = (i, by) => { const items = [...f.items]; const [x] = items.splice(i, 1); items.splice(i + by, 0, x); change({ items }); };
  const send = async () => {
    if (dirty && !(await run('saveWorkOrder', payload()))) return;
    run('submitWorkOrder', { id: wo.id, options: { wantScore } });
  };

  return (
    <div className="wo-detail">
      <button className="link" onClick={onBack}>All work orders</button>
      <div className="wo-detail-head">
        <div>
          <h2>{wo.number}: {wo.title}</h2>
          <p className="hint">{wo.boatName}{wo.onPlatform ? ', on CJM Marine' : ', not on CJM Marine'}. Opened {fmtStamp(wo.openedAt)}.</p>
        </div>
        <StateChip state={state} />
      </div>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}

      {wo.match && (
        <div className="review-note wo-banner">
          <span><b>{wo.match.vesselName}</b>{wo.match.homePort ? ` (${wo.match.homePort})` : ''} is on CJM Marine. Link this work order so it goes to {wo.match.approvers.join(', ')} for approval in the app?</span>
          <button className="btn" disabled={busy} onClick={() => run('linkWorkOrder', { id: wo.id, vesselId: wo.match.vesselId })}>Link to {wo.match.vesselName}</button>
        </div>
      )}
      {wo.status === 'review' && wo.review === 'pending' && (
        <div className="review-note wo-banner">
          <span>Sent {fmtStamp(wo.signedAt)} to {wo.onPlatform ? `the Captain or Owner of ${wo.boatName} in the app` : wo.contactEmail}. Waiting for their answer.</span>
          <button className="btn" disabled={busy} onClick={() => run('reopenWorkOrder', { id: wo.id }, 'Taken back. You can change it and send it again.')}>Take it back to edit</button>
        </div>
      )}
      {wo.status === 'review' && wo.review !== 'pending' && (
        <div className="alert wo-banner">
          <span>
            {wo.review === 'declined' ? `${wo.reviewedBy || 'The Captain'} did not approve it${wo.decisionNote ? `: “${wo.decisionNote}”` : '.'}` : wo.review === 'expired' ? 'The review link expired before it was answered.' : 'You withdrew the review request.'}
          </span>
          <button className="btn" disabled={busy} onClick={() => run('reopenWorkOrder', { id: wo.id }, 'Reopened. Fix it and send it again.')}>Reopen to fix and resend</button>
        </div>
      )}
      {wo.status === 'approved' && (
        <div className="ok wo-banner">
          Approved by {wo.reviewedBy || 'the Captain'} {fmtStamp(wo.reviewedAt)}{wo.score ? `, ${wo.score}/10` : ''}{wo.reviewText ? `: “${wo.reviewText}”` : '.'} It is part of your work record.
        </div>
      )}

      <section className="wo-section">
        <h3>Job</h3>
        {ro ? (
          <>
            {wo.description && <p className="pre">{wo.description}</p>}
            <p className="hint">Captain or Owner: {[wo.contactName, wo.contactEmail].filter(Boolean).join(', ') || 'the boat’s Captain or Owner in the app'}</p>
          </>
        ) : (
          <div className="form">
            <div className="two">
              <label>What's the job?<input value={f.title} onChange={(e) => change({ title: e.target.value })} /></label>
              {!wo.onPlatform && <label>Boat<input value={f.boatName} onChange={(e) => change({ boatName: e.target.value })} /></label>}
            </div>
            {wo.onPlatform ? (
              <p className="hint">Approved in the app by {(wo.approvers || []).join(', ') || 'the boat\u2019s Captain or Owner'}.</p>
            ) : (
              <div className="two">
                <label>Captain or Owner<input value={f.contactName} onChange={(e) => change({ contactName: e.target.value })} /></label>
                <label>Their email<input type="email" value={f.contactEmail} onChange={(e) => change({ contactEmail: e.target.value })} /></label>
              </div>
            )}
            <label>Notes<textarea rows={2} value={f.description} onChange={(e) => change({ description: e.target.value })} /></label>
          </div>
        )}
      </section>

      <section className="wo-section">
        <div className="group-head">
          <h3>Items <span className="count">{f.items.length}</span></h3>
          <span className="hint">{Math.round(woHours({ items: f.items }) * 10) / 10} hr logged</span>
        </div>
        {!f.items.length && <p className="empty">No items yet. Add one for each thing you find or fix.</p>}
        <ol className="wo-items">
          {f.items.map((it, i) => (
            <ItemCard key={it.id} it={it} idx={i} count={f.items.length} ro={ro} busy={busy} credential={business.credential}
              onChange={(x) => setItem(i, x)} onMove={(by) => move(i, by)} onRemove={() => setRemoving(i)}
              onSign={(c) => sign(i, c)} onUnsign={() => unsign(i)} />
          ))}
        </ol>
        {!ro && <button className="btn" onClick={() => change({ items: [...f.items, newItem()] })}>Add an item</button>}
      </section>

      <section className="wo-section">
        <h3>Notes</h3>
        {(wo.notes || []).length ? (
          <ul className="wo-notes">{wo.notes.map((n) => <li key={n.id}><p className="pre">{n.text}</p><small className="muted">{fmtStamp(n.at)}</small></li>)}</ul>
        ) : <p className="empty">No notes yet.</p>}
        {!ro && (
          <div className="wo-note-add">
            <input aria-label="New note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Part ordered Tuesday, due Friday" />
            <button className="btn" disabled={busy || !note.trim()} onClick={addNote}>Add note</button>
          </div>
        )}
      </section>

      {!ro && (
        <section className="wo-section wo-send">
          <h3>Sign off and send for review</h3>
          {allSigned ? (
            <>
              <p className="hint">
                {wo.onPlatform || !f.contactEmail
                  ? `Goes to the Captain or Owner of ${wo.boatName} in the Reviews tab. They can add it to the log or sign off one of their open tasks with it.`
                  : `Goes to ${f.contactEmail}. If ${f.boatName} is on CJM Marine it waits in their Reviews tab; if not, they confirm it from the email.`}
              </p>
              <label className="check"><input type="checkbox" checked={wantScore} onChange={(e) => setWantScore(e.target.checked)} /> Ask for a score from 1 to 10 for my work record</label>
              <div className="actions left"><button className="btn primary" disabled={busy} onClick={send}>Send for review</button></div>
            </>
          ) : (
            <p className="hint">Sign every item to send it. {f.items.filter((i) => !i.sign).length} of {f.items.length} still to sign.</p>
          )}
        </section>
      )}

      <InvoicePanel wo={wo} business={business} onData={onData} />

      {dirty && !ro && (
        <div className="wo-savebar">
          <span>Unsaved changes</span>
          <button className="btn" disabled={busy} onClick={() => { setF(fromWo(wo)); setDirty(false); }}>Discard</button>
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save work order'}</button>
        </div>
      )}

      {removing !== null && (
        <Modal title="Remove this item?" onClose={() => setRemoving(null)}>
          <p>Item {removing + 1}, <b>{f.items[removing].title || 'New item'}</b>, and its hours and parts will be removed from the work order when you save.</p>
          <div className="actions">
            <button className="btn" onClick={() => setRemoving(null)}>Keep it</button>
            <button className="btn primary danger-btn" onClick={() => { change({ items: f.items.filter((_, j) => j !== removing) }); setRemoving(null); }}>Remove item</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const CURRENCY_NAMES = { USD: 'US dollar', EUR: 'Euro', GBP: 'Pound sterling', AUD: 'Australian dollar', CAD: 'Canadian dollar', CHF: 'Swiss franc' };

function MyBusiness({ business, currencies, onData }) {
  const [f, setF] = useState(business);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setN = (k) => (e) => setF({ ...f, [k]: cleanNum(e.target.value) });
  async function save(e) {
    e.preventDefault();
    setBusy(true); setError(''); setMsg('');
    try { const r = await call('saveBusiness', { business: f }); onData(r); setF(r.business); setMsg('Business details saved. New invoices use them.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <form className="form card wo-business" onSubmit={save}>
      <p className="hint">These go on every new invoice. Each invoice keeps its own copy, so changing them here does not change invoices already made.</p>
      <div className="two">
        <label>Business name<input value={f.name} onChange={set('name')} placeholder="Your name or company" /></label>
        <label>Credential<input value={f.credential} onChange={set('credential')} placeholder="ABYC Certified Technician, Y4 Engineer" /></label>
      </div>
      <div className="two">
        <label>Phone<input type="tel" value={f.phone} onChange={set('phone')} /></label>
        <label>Email on invoices<input type="email" value={f.email} onChange={set('email')} /></label>
      </div>
      <label>Address<textarea rows={2} value={f.address} onChange={set('address')} /></label>
      <fieldset className="recur">
        <legend>Rates</legend>
        <div className="wo-rates">
          <label>Currency
            <select value={f.currency} onChange={set('currency')}>{currencies.map((c) => <option key={c} value={c}>{c}, {CURRENCY_NAMES[c]}</option>)}</select>
          </label>
          <label>Labor rate per hour<input inputMode="decimal" value={f.rate} onChange={setN('rate')} /></label>
          <label>Travel time per hour<input inputMode="decimal" value={f.travelRate} onChange={setN('travelRate')} /></label>
          <label>Mileage rate<input inputMode="decimal" value={f.mileRate} onChange={setN('mileRate')} /></label>
          <label>Consumables % of labor<input inputMode="decimal" value={f.consumablesPct} onChange={setN('consumablesPct')} /></label>
          <label>Tax %<input inputMode="decimal" value={f.taxRate} onChange={setN('taxRate')} /></label>
        </div>
      </fieldset>
      <fieldset className="recur">
        <legend>How customers pay you</legend>
        <p className="hint">Shown on the invoice. CJM Marine does not take payments; the Captain or Owner pays you directly.</p>
        <div className="two">
          <label>Make payment out to<input value={f.payTo} onChange={set('payTo')} /></label>
          <label>Terms<input value={f.payTerms} onChange={set('payTerms')} placeholder="Net 15" /></label>
        </div>
        <label>Remit to address<textarea rows={2} value={f.payAddress} onChange={set('payAddress')} /></label>
        <label>How to pay<textarea rows={2} value={f.payHow} onChange={set('payHow')} placeholder={'Zelle: (555) 010-0000\nACH or wire details on request'} /></label>
      </fieldset>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}
      <div className="actions left"><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save business details'}</button></div>
    </form>
  );
}

export default function WorkOrders() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [sub, setSub] = useState('orders');
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [focus, setFocus] = useState('');

  useEffect(() => { call('workOrders').then(setData).catch((e) => setError(e.message)); }, []);

  const list = data ? data.workOrders : [];
  const byState = useMemo(() => {
    const g = {};
    list.forEach((w) => { const s = woState(w); (g[s] = g[s] || []).push(w); });
    return g;
  }, [list]);
  const unpaid = list.filter((w) => w.invoice && w.invoice.status === 'sent');
  const unpaidByCur = {};
  unpaid.forEach((w) => { unpaidByCur[w.invoice.currency] = (unpaidByCur[w.invoice.currency] || 0) + w.invoice.total; });

  if (!data) return error ? <div className="alert">{error}</div> : <p className="empty">Loading work orders…</p>;

  const take = (r) => setData(r);
  const open = openId && list.find((w) => w.id === openId);
  if (open) {
    return <WorkOrderDetail wo={open} business={data.business} onBack={() => setOpenId(null)} onData={take} />;
  }
  const live = list.filter((w) => w.status !== 'approved');
  const closed = list.filter((w) => w.status === 'approved');
  const shown = focus === 'unpaid' ? unpaid : focus ? (byState[focus] || []) : live.filter((w) => woState(w) !== 'changes');
  const attention = byState.changes || [];

  return (
    <div className="work-orders">
      <nav className="subtabs">
        <button className={sub === 'orders' ? 'on' : ''} onClick={() => setSub('orders')}>Work orders</button>
        <button className={sub === 'business' ? 'on' : ''} onClick={() => setSub('business')}>My business</button>
      </nav>

      {sub === 'business' && <MyBusiness business={data.business} currencies={data.currencies} onData={take} />}

      {sub === 'orders' && (
        <>
          {!data.business.saved && (
            <div className="starter-card card">
              <div>
                <b>Add your business details</b>
                <p className="hint">Your business name, labor rate and how customers pay you go on every invoice.</p>
              </div>
              <button className="btn" onClick={() => setSub('business')}>My business</button>
            </div>
          )}
          <div className="group-head wo-top">
            <p className="hint">Open a work order for any boat. Sign each item as you finish it, then send it to the Captain or Owner. Approved work joins your record.</p>
            <button className="btn primary" onClick={() => setAdding(true)}>New work order</button>
          </div>
          <div className="gauge gauge-6 wo-gauge">
            {BLOCKS.map(([k, label, cls]) => (
              <button key={k} type="button" className={`gauge-cell ${cls} ${focus === k ? 'focus' : ''}`} aria-pressed={focus === k} onClick={() => setFocus(focus === k ? '' : k)}>
                <b>{(byState[k] || []).length}</b><span>{label}</span>
              </button>
            ))}
            <button type="button" className={`gauge-cell money ${focus === 'unpaid' ? 'focus' : ''}`} aria-pressed={focus === 'unpaid'} onClick={() => setFocus(focus === 'unpaid' ? '' : 'unpaid')}>
              <b>{unpaid.length}</b><span>Unpaid invoices{unpaid.length ? `, ${Object.entries(unpaidByCur).map(([c, n]) => money(n, c)).join(' + ')}` : ''}</span>
            </button>
          </div>

          {attention.length > 0 && !focus && (
            <section className="group">
              <h3>Needs your attention <span className="count">{attention.length}</span></h3>
              <div className="wo-list">{attention.map((w) => <WoRow key={w.id} wo={w} onOpen={setOpenId} />)}</div>
            </section>
          )}

          <section className="group">
            <div className="group-head">
              <h3>{focus === 'unpaid' ? 'Unpaid invoices' : focus ? STATE_LABEL[focus] : 'Open work orders'} <span className="count">{shown.length}</span></h3>
              {focus && <button className="link" onClick={() => setFocus('')}>Show all open</button>}
            </div>
            {shown.length ? <div className="wo-list">{shown.map((w) => <WoRow key={w.id} wo={w} onOpen={setOpenId} />)}</div>
              : <p className="empty">{focus ? 'Nothing here.' : 'No open work orders. Start one with New work order.'}</p>}
          </section>

          {closed.length > 0 && !focus && (
            <section className="group">
              <h3>Approved <span className="count">{closed.length}</span></h3>
              <div className="wo-list">{closed.map((w) => <WoRow key={w.id} wo={w} onOpen={setOpenId} />)}</div>
            </section>
          )}
        </>
      )}

      {adding && (
        <NewWorkOrder boats={data.boats} onClose={() => setAdding(false)}
          onDone={(r) => { setAdding(false); setData(r); setOpenId(r.workOrder.id); }} />
      )}
    </div>
  );
}
