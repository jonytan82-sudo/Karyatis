import { useEffect, useMemo, useRef, useState } from 'react';
import { call, getCompany, setCompany } from '../api.js';
import { useLiveReload } from '../live.js';
import { SYSTEMS, fmtDate, fmtStamp, todayISO } from '../util.js';
import Modal from './Modal.jsx';
import { InvoicePanel } from './Invoice.jsx';
import PartFinder from './PartFinder.jsx';
import {
  ITEM_STATUS, PART_STATUS, STATE_LABEL, cleanNum, itemHours, money, newItem, newPart, num, partLine, partsWaiting, tmpId, woHours, woState,
} from '../workorders.js';

const BLOCKS = [
  ['open', 'Open', 'green'], ['active', 'In progress', 'amber'], ['parts', 'Waiting on parts', 'parts'],
  ['ready', 'Ready to send', 'issue'], ['review', 'With the Captain', 'review'],
];

export const ROLE_HELP = {
  owner: 'Business details, rates, payment details and the team, plus everything below.',
  supervisor: 'Every work order. Assigns leads and work, makes and sends invoices.',
  lead: 'Opens and runs work orders, gives items to technicians, sends work orders to the Captain.',
  tech: 'Works the items given to them, writes up new findings and signs their own work.',
};
const ROLE_LABEL = { owner: 'Owner', supervisor: 'Supervisor', lead: 'Lead', tech: 'Technician' };

function StateChip({ state }) {
  return <span className={`wo-chip ws-${state}`}>{STATE_LABEL[state]}</span>;
}

function WoRow({ wo, onOpen, team }) {
  const s = woState(wo);
  const last = (wo.notes || []).length ? wo.notes[wo.notes.length - 1] : null;
  const hours = woHours(wo), waiting = partsWaiting(wo), n = (wo.items || []).length;
  const inv = wo.invoice;
  return (
    <button type="button" className={`wo-row ws-${s}`} onClick={() => onOpen(wo.id)}>
      <span className="wo-row-main">
        <b>{wo.title}</b>
        <small>{wo.number}, {wo.boatName}{wo.onPlatform ? '' : ' (not on CJM Marine)'}{wo.poNumber ? `, PO ${wo.poNumber}` : ''}</small>
        {team && (wo.leadName || wo.mine > 0) && (
          <small className="muted">{wo.leadName ? `Lead ${wo.leadName}` : ''}{wo.leadName && wo.mine ? '. ' : ''}{wo.mine ? `${wo.mine} item${wo.mine === 1 ? '' : 's'} given to you` : ''}</small>
        )}
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

function NewWorkOrder({ boats, leads, me, onClose, onDone }) {
  const [f, setF] = useState({ boatName: '', contactName: '', contactEmail: '', title: '', description: '', poNumber: '', leadId: me || '' });
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
        contactEmail: picked ? '' : f.contactEmail, title: f.title, description: f.description, poNumber: f.poNumber, leadId: f.leadId,
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
            {approvers && approvers.length ? `${approvers.join(', ')} see it on the boat as soon as you open it, and approve it in the app when you send it.` : 'The boat’s Captain or Owner sees it as soon as you open it, and approves it in the app when you send it.'}{' '}
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
        <div className="two">
          <label><span>PO number <span className="opt">(if the boat gave you one)</span></span><input value={f.poNumber} onChange={set('poNumber')} maxLength={40} /></label>
          {leads && leads.length > 1 && (
            <label>Lead
              <select value={f.leadId} onChange={set('leadId')}>
                <option value="">No lead yet</option>
                {leads.map((m) => <option key={m.userId} value={m.userId}>{m.name} ({m.roleLabel})</option>)}
              </select>
            </label>
          )}
        </div>
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
const BOAT_CHIP = { pending: ['Waiting for the Captain', 'wait'], approved: ['Approved for the log', 'ok'], declined: ['Not approved', 'no'] };
function BoatChip({ boat }) {
  const [label, cls] = boat.logged ? ['On the boat’s log', 'ok'] : BOAT_CHIP[boat.status] || ['', ''];
  return label ? <span className={`boat-chip ${cls}`} title={boat.note || ''}>{label}</span> : null;
}

function ItemCard({ it, idx, count, ro, credential, onChange, onMove, onRemove, onSign, onUnsign, busy, team, canRun, canSign, canUnsign, names, supplies }) {
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
          <span className="wo-item-title"><b>{it.title || 'New item'}</b>{it.boat && <BoatChip boat={it.boat} />}
            <small>{[it.system, hours ? `${Math.round(hours * 10) / 10} hr` : '', (it.parts || []).length ? `${it.parts.length} part${it.parts.length === 1 ? '' : 's'}` : '',
              team && team.length > 1 ? (it.assignedTo ? (names[it.assignedTo] || it.assignedName || 'Someone who left') : 'Not given to anyone') : ''].filter(Boolean).join(', ')}</small>
          </span>
        </button>
        {it.sign ? <span className="wo-chip ws-approved">Signed</span> : <span className={`wo-chip is-${it.status}`}>{(ITEM_STATUS.find((s) => s[0] === it.status) || [])[1]}</span>}
      </div>
      {open && (
        <div className="wo-item-body">
          {it.boat && it.boat.status === 'declined' && <p className="hint">The Captain did not approve this item{it.boat.note ? `: “${it.boat.note}”` : '.'} It will not go on the boat's record.</p>}
          {it.boat && it.boat.status === 'pending' && <p className="hint">Sent to the Captain to approve. You can keep working on it.</p>}
          {team && team.length > 1 && (canRun && !ro && !it.sign ? (
            <label className="wo-assign">Given to
              <select value={it.assignedTo || ''} onChange={(e) => set('assignedTo', e.target.value)}>
                <option value="">Not given to anyone yet</option>
                {team.filter((m) => m.status === 'active').map((m) => <option key={m.userId} value={m.userId}>{m.name} ({m.roleLabel})</option>)}
              </select>
            </label>
          ) : (
            <p className="hint wo-assign-ro">{it.assignedTo ? `Given to ${names[it.assignedTo] || it.assignedName || 'someone who left the team'}.` : 'Not given to anyone yet.'}</p>
          ))}
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
                  <li key={l.id}><span>{fmtDate(l.date)}</span><span>{num(l.hours)} hr</span><span className="muted">{[team && team.length > 1 && l.by ? names[l.by] : '', l.note].filter(Boolean).join(': ')}</span>
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
            {!locked && supplies && supplies.searchUrl && (
              <PartFinder supplies={supplies} compact task={{ title: it.title, description: [it.system, it.discrepancy].filter(Boolean).join('. ') }}
                onAdd={(x) => set('parts', [...(it.parts || []), { ...newPart(), desc: x.name, qty: x.qty || '1', pnOn: x.partNumber, url: x.url }])} />
            )}
            {(it.parts || []).map((p) => (locked ? (
              <p key={p.id} className="wo-part-ro">{p.desc}{p.desc && ' '}<span className="muted">{partLine(p)}{num(p.qty) !== 1 ? `, qty ${num(p.qty)}` : ''}</span>
                {p.url && <> <a href={p.url} target="_blank" rel="noopener noreferrer">Product page</a></>}</p>
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
                {p.url && <a className="wo-part-link" href={p.url} target="_blank" rel="noopener noreferrer">Product page</a>}
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
            {!locked && <button type="button" className="link" onClick={() => set('parts', [...(it.parts || []), newPart()])}>{supplies && supplies.searchUrl ? 'Add a part by hand' : 'Add a part'}</button>}
            {!(it.parts || []).length && locked && <p className="hint">No parts.</p>}
          </div>

          {it.sign ? (
            <div className="wo-signed">
              <span>Signed by <b>{it.sign.name}</b>{it.sign.credential ? `, ${it.sign.credential}` : ''}, {fmtStamp(it.sign.at)}</span>
              {!ro && canUnsign && <button type="button" className="link" disabled={busy} onClick={onUnsign}>Take back the signature</button>}
            </div>
          ) : !ro && canSign ? (
            <div className="wo-sign">
              <input aria-label="Your credential" value={cred} onChange={(e) => setCred(e.target.value)} placeholder="Your credential (optional), e.g. ABYC Diesel" />
              <button type="button" className="btn primary" disabled={busy || !it.title.trim() || !it.corrective.trim()} onClick={() => onSign(cred)}>Sign this item</button>
              {!it.corrective.trim() && <span className="hint">Write the work done first.</span>}
            </div>
          ) : !ro && !it.sign && (
            <p className="hint">{it.assignedTo ? `${names[it.assignedTo] || 'The person it is given to'} signs this item.` : 'The lead gives this item to someone, who then signs it.'}</p>
          )}

          {!locked && canRun && (
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
  boatName: wo.boatName || '', items: wo.items || [], poNumber: wo.poNumber || '', leadId: wo.leadId || '' });

function WorkOrderDetail({ wo, business, onBack, onData, me, team, can, role, supplies }) {
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
  const canRun = !!wo.canRun;
  const allSigned = f.items.length > 0 && f.items.every((i) => i.sign);
  const names = {};
  (team || []).forEach((m) => { names[m.userId] = m.name; });
  const isTeam = (team || []).length > 1;
  const senior = role === 'owner' || role === 'supervisor';
  const mineOpen = f.items.filter((i) => i.assignedTo === me && !i.sign).length;
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
  const payload = (items, extra) => ({ id: wo.id, workOrder: canRun
    ? { title: f.title, description: f.description, contactName: f.contactName, contactEmail: f.contactEmail, poNumber: f.poNumber,
        ...(wo.onPlatform ? {} : { boatName: f.boatName }), ...(can && can.assignLead ? { leadId: f.leadId } : {}),
        items: items || f.items, editedAt: wo.editedAt, ...extra }
    : { items: items || f.items, ...extra } });
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
          <p className="hint">{wo.boatName}{wo.onPlatform ? ', on CJM Marine' : ', not on CJM Marine'}. Opened {fmtStamp(wo.openedAt)}{wo.createdByName && isTeam ? ` by ${wo.createdByName}` : ''}.{wo.poNumber ? ` PO ${wo.poNumber}.` : ''}{isTeam ? (wo.leadName ? ` Lead ${wo.leadName}.` : ' No lead yet.') : ''}</p>
        </div>
        <StateChip state={state} />
      </div>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}

      {!canRun && wo.status === 'open' && (
        <div className="review-note wo-banner">
          <span>{mineOpen ? `${mineOpen} item${mineOpen === 1 ? ' is' : 's are'} given to you. Log your hours and parts, write the work done, then sign ${mineOpen === 1 ? 'it' : 'each one'}.` : 'Your items are signed.'} You can also add an item for anything new you find. {wo.perItem ? 'Each item goes to the Captain to approve as it is added.' : `${wo.leadName || 'The lead'} sends the work order to the Captain.`}</span>
        </div>
      )}
      {wo.match && (
        <div className="review-note wo-banner">
          <span><b>{wo.match.vesselName}</b>{wo.match.homePort ? ` (${wo.match.homePort})` : ''} is on CJM Marine. Link this work order so it goes to {wo.match.approvers.join(', ')} for approval in the app?</span>
          <button className="btn" disabled={busy} onClick={() => run('linkWorkOrder', { id: wo.id, vesselId: wo.match.vesselId })}>Link to {wo.match.vesselName}</button>
        </div>
      )}
      {wo.perItem && wo.boatStatus === 'pending' && wo.status === 'open' && (
        <div className="review-note wo-banner">
          <span>Waiting for {(wo.approvers || []).join(', ') || `the Captain of ${wo.boatName}`} to approve this work order. You can keep working on it. Each item you add also goes to them to approve before it goes on {wo.boatName}'s record.</span>
        </div>
      )}
      {wo.perItem && wo.boatStatus === 'declined' && (
        <div className="alert wo-banner">
          <span>{wo.boatBy || 'The Captain'} did not approve this work order{wo.boatNote ? `: “${wo.boatNote}”` : '.'} Nothing from it goes on {wo.boatName}'s record. You can still invoice your work.</span>
        </div>
      )}
      {wo.status === 'review' && wo.review === 'pending' && (
        <div className="review-note wo-banner">
          <span>Sent {fmtStamp(wo.signedAt)} to {wo.onPlatform ? `the Captain or Owner of ${wo.boatName} in the app` : wo.contactEmail}. Waiting for their answer.</span>
          {canRun && <button className="btn" disabled={busy} onClick={() => run('reopenWorkOrder', { id: wo.id }, 'Taken back. You can change it and send it again.')}>Take it back to edit</button>}
        </div>
      )}
      {wo.status === 'review' && wo.review !== 'pending' && (
        <div className="alert wo-banner">
          <span>
            {wo.review === 'declined' ? `${wo.reviewedBy || 'The Captain'} did not approve it${wo.decisionNote ? `: “${wo.decisionNote}”` : '.'}` : wo.review === 'expired' ? 'The review link expired before it was answered.' : 'You withdrew the review request.'}
          </span>
          {canRun && <button className="btn" disabled={busy} onClick={() => run('reopenWorkOrder', { id: wo.id }, 'Reopened. Fix it and send it again.')}>Reopen to fix and resend</button>}
        </div>
      )}
      {wo.status === 'approved' && wo.perItem && (
        <div className="ok wo-banner">
          Closed {fmtStamp(wo.signedAt)}. {f.items.filter((i) => i.boat && i.boat.status === 'approved').length} of {f.items.length} items are on {wo.boatName}'s log.
        </div>
      )}
      {wo.status === 'approved' && !wo.perItem && (
        <div className="ok wo-banner">
          Approved by {wo.reviewedBy || 'the Captain'} {fmtStamp(wo.reviewedAt)}{wo.score ? `, ${wo.score}/10` : ''}{wo.reviewText ? `: “${wo.reviewText}”` : '.'} {isTeam ? 'Scores go on the record of each person who signed items.' : 'It is part of your work record.'}
        </div>
      )}

      <section className="wo-section">
        <h3>Job</h3>
        {ro || !canRun ? (
          <>
            {wo.description && <p className="pre">{wo.description}</p>}
            <p className="hint">Captain or Owner: {[wo.contactName, canRun ? wo.contactEmail : ''].filter(Boolean).join(', ') || 'the boat’s Captain or Owner in the app'}{wo.poNumber ? `. PO ${wo.poNumber}` : ''}</p>
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
            <div className="two">
              <label><span>PO number <span className="opt">(optional)</span></span><input value={f.poNumber} maxLength={40} onChange={(e) => change({ poNumber: e.target.value })} /></label>
              {isTeam && can && can.assignLead && (
                <label>Lead
                  <select value={f.leadId} onChange={(e) => change({ leadId: e.target.value })}>
                    <option value="">No lead yet</option>
                    {team.filter((m) => m.status === 'active' && m.role !== 'tech').map((m) => <option key={m.userId} value={m.userId}>{m.name} ({m.roleLabel})</option>)}
                  </select>
                </label>
              )}
            </div>
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
            <ItemCard key={it.id} it={it} idx={i} count={f.items.length} busy={busy} credential={isTeam ? '' : business.credential}
              ro={ro || (!canRun && it.assignedTo !== me)} team={team} names={names} canRun={canRun}
              canSign={it.assignedTo ? it.assignedTo === me : canRun}
              canUnsign={!!it.sign && !(it.boat && it.boat.logged) && (it.sign.userId ? it.sign.userId === me || senior : canRun)}
              supplies={supplies} onChange={(x) => setItem(i, x)} onMove={(by) => move(i, by)} onRemove={() => setRemoving(i)}
              onSign={(c) => sign(i, c)} onUnsign={() => unsign(i)} />
          ))}
        </ol>
        {!ro && <button className="btn" onClick={() => change({ items: [...f.items, { ...newItem(), assignedTo: canRun ? '' : me }] })}>{canRun ? 'Add an item' : 'Write up a new item'}</button>}
      </section>

      <section className="wo-section">
        <h3>Notes</h3>
        {(wo.notes || []).length ? (
          <ul className="wo-notes">{wo.notes.map((n) => <li key={n.id}><p className="pre">{n.text}</p><small className="muted">{n.by && isTeam ? `${n.by}, ` : ''}{fmtStamp(n.at)}</small></li>)}</ul>
        ) : <p className="empty">No notes yet.</p>}
        {!ro && (
          <div className="wo-note-add">
            <input aria-label="New note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Part ordered Tuesday, due Friday" />
            <button className="btn" disabled={busy || !note.trim()} onClick={addNote}>Add note</button>
          </div>
        )}
      </section>

      {!ro && canRun && (
        <section className="wo-section wo-send">
          <h3>{wo.perItem ? 'Close the work order' : 'Sign off and send for review'}</h3>
          {wo.perItem ? (allSigned ? (
            <>
              <p className="hint">Every item is signed. Approved items are already signed off on {wo.boatName}'s log. Closing lets {(wo.approvers || []).join(', ') || 'the Captain'} know the job is finished.</p>
              <div className="actions left"><button className="btn primary" disabled={busy} onClick={send}>Close work order</button></div>
            </>
          ) : (
            <p className="hint">Each item goes on {wo.boatName}'s log when the Captain approves it and it is signed. Sign every item to close the work order. {f.items.filter((i) => !i.sign).length} of {f.items.length} still to sign.</p>
          )) : allSigned ? (
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

      {can && can.invoice && <InvoicePanel wo={wo} business={business} onData={onData} />}

      {dirty && !ro && (
        <div className="wo-savebar">
          <span>Unsaved changes</span>
          <button className="btn" disabled={busy} onClick={() => { setF(fromWo(wo)); setDirty(false); }}>Discard</button>
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : canRun ? 'Save work order' : 'Save my work'}</button>
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


/** The business's people. The owner adds them by email and sets their role; everyone else sees who is on the team. */
function Team({ data, onData }) {
  const isOwner = data.can && data.can.team;
  const [f, setF] = useState({ email: '', name: '', role: 'tech' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(null);
  const [leaving, setLeaving] = useState(false);
  async function run(action, args, okMsg) {
    setBusy(true); setError(''); setMsg(''); setLink('');
    try { const r = await call(action, args); onData(r); setMsg(r.message || okMsg || ''); setLink(r.setupLink || ''); return r; }
    catch (e) { setError(e.message); return null; } finally { setBusy(false); }
  }
  async function invite(e) {
    e.preventDefault();
    if (await run('inviteTeamMember', { member: f })) setF({ email: '', name: '', role: f.role });
  }
  const people = data.team || [];
  return (
    <div className="wo-team">
      <section className="group">
        <div className="group-head"><h3>{data.company.name || 'Your business'} <span className="count">{people.length}</span></h3></div>
        <ul className="team-list">
          {people.map((m) => (
            <li key={m.userId} className="team-row">
              <span className="team-main">
                <b>{m.name}</b>
                <small className="muted">{m.status === 'invited' ? 'Invited, has not accepted yet' : m.role === 'owner' ? 'Owner' : m.roleLabel}{isOwner && m.email ? `, ${m.email}` : ''}{isOwner && m.status === 'active' && m.setUp === false ? ', has not set a password yet' : ''}</small>
              </span>
              {isOwner && m.role !== 'owner' && (
                <span className="team-actions">
                  <select aria-label={`Role for ${m.name}`} value={m.role} disabled={busy} onChange={(e) => run('setTeamRole', { id: m.id, role: e.target.value }, `${m.name} is now ${ROLE_LABEL[e.target.value]}.`)}>
                    <option value="supervisor">Supervisor</option><option value="lead">Lead</option><option value="tech">Technician</option>
                  </select>
                  {m.setUp === false && <button className="link" disabled={busy} onClick={() => run('resendTeamSetup', { id: m.id })}>Send link again</button>}
                  <button className="link danger" disabled={busy} onClick={() => setRemoving(m)}>Remove</button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {msg && <div className="ok">{msg}</div>}
        {link && <p className="hint setup-link">Sign-in link: <span className="break">{link}</span></p>}
        {error && <div className="alert">{error}</div>}
      </section>

      {isOwner && (
        <form className="form card team-add" onSubmit={invite}>
          <h3>Add someone</h3>
          <p className="hint">They get an email. Someone already on CJM Marine accepts the invitation; someone new sets a password. Their profile and work record stay theirs if they leave.</p>
          <div className="two">
            <label>Email<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
            <label><span>Name <span className="opt">(for someone new)</span></span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          </div>
          <div className="role-pick" role="radiogroup" aria-label="Role">
            {['supervisor', 'lead', 'tech'].map((k) => (
              <label key={k} className={`role-opt${f.role === k ? ' on' : ''}`}>
                <input type="radio" name="team-role" checked={f.role === k} onChange={() => setF({ ...f, role: k })} />
                <span><b>{ROLE_LABEL[k]}</b><small>{ROLE_HELP[k]}</small></span>
              </label>
            ))}
          </div>
          <div className="actions left"><button className="btn primary" disabled={busy}>{busy ? 'Adding…' : 'Add to team'}</button></div>
        </form>
      )}

      <section className="group role-guide">
        <h3>Who does what</h3>
        <dl>
          {['owner', 'supervisor', 'lead', 'tech'].map((k) => <div key={k}><dt>{ROLE_LABEL[k]}</dt><dd>{ROLE_HELP[k]}</dd></div>)}
        </dl>
        <p className="hint">When the Captain scores a work order, the score goes on the record of each person who signed items on it.</p>
      </section>

      {!isOwner && (
        <div className="actions left"><button className="btn" onClick={() => setLeaving(true)}>Leave {data.company.name}</button></div>
      )}

      {removing && (
        <Modal title={`Remove ${removing.name}?`} onClose={() => setRemoving(null)}>
          <p>{removing.name} will no longer see {data.company.name}'s work orders. Items they signed keep their signature. Unsigned items given to them go back to the lead to give to someone else.</p>
          <div className="actions">
            <button className="btn" onClick={() => setRemoving(null)}>Keep them</button>
            <button className="btn primary danger-btn" disabled={busy} onClick={async () => { await run('removeTeamMember', { id: removing.id }, `${removing.name} was removed from the team.`); setRemoving(null); }}>Remove from team</button>
          </div>
        </Modal>
      )}
      {leaving && (
        <Modal title={`Leave ${data.company.name}?`} onClose={() => setLeaving(false)}>
          <p>You will no longer see its work orders. Items you signed keep your signature, and your scores stay on your record. Unsigned items given to you go back to the lead.</p>
          <div className="actions">
            <button className="btn" onClick={() => setLeaving(false)}>Stay</button>
            <button className="btn primary danger-btn" disabled={busy} onClick={async () => { const r = await run('leaveTeam', { company: data.company.id }); setLeaving(false); if (r) setCompany(''); }}>Leave team</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function WorkOrders() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [sub, setSub] = useState('orders');
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [focus, setFocus] = useState('');

  const take = (r) => { if (r && r.company && r.company.id !== getCompany()) setCompany(r.company.id); setData(r); };
  // A reload that started before a save finished must not replace the newer copy the save sent back.
  const seq = useRef(0);
  const load = () => { const n = ++seq.current; return call('workOrders').then((r) => { if (n === seq.current) take(r); }).catch((e) => setError(e.message)); };
  const fromSave = (r) => { seq.current++; take(r); };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const openRef = useRef(null);
  openRef.current = openId;
  // other people's changes: fetch again, but not while a work order is open (it may have unsaved typing)
  useLiveReload(() => { if (!openRef.current) load(); });

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
  if (!data.companies || !data.companies.length) {
    return (
      <div className="work-orders">
        <p className="empty">{(data.teamInvites || []).length ? 'Accept the invitation at the top of the page to see the team\u2019s work orders.' : 'You are not on a contractor team. Turn on contractor work in My profile to make your own work orders.'}</p>
      </div>
    );
  }

  const can = data.can || {};
  const role = (data.company && data.company.role) || 'owner';
  const team = data.team || [];
  const isTeam = team.length > 1;
  const open = openId && list.find((w) => w.id === openId);
  if (open) {
    return <WorkOrderDetail wo={open} business={data.business} supplies={data.supplies} me={data.me} team={team} can={can} role={role} onBack={() => { setOpenId(null); load(); }} onData={fromSave} />;
  }
  const switchTo = (id) => { setCompany(id); setOpenId(null); setFocus(''); setSub('orders'); setData(null); load(); };
  const live = list.filter((w) => w.status !== 'approved');
  const closed = list.filter((w) => w.status === 'approved');
  const shown = focus === 'unpaid' ? unpaid : focus ? (byState[focus] || []) : live.filter((w) => woState(w) !== 'changes');
  const attention = byState.changes || [];

  return (
    <div className="work-orders">
      {data.companies.length > 1 && (
        <label className="wo-company">Working for
          <select value={data.company.id} onChange={(e) => switchTo(e.target.value)}>
            {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}{c.role === 'owner' ? ' (my business)' : ` (${c.roleLabel})`}</option>)}
          </select>
        </label>
      )}
      <nav className="subtabs">
        <button className={sub === 'orders' ? 'on' : ''} onClick={() => setSub('orders')}>Work orders</button>
        <button className={sub === 'team' ? 'on' : ''} onClick={() => setSub('team')}>Team{isTeam ? <span className="count">{team.length}</span> : ''}</button>
        {can.business && <button className={sub === 'business' ? 'on' : ''} onClick={() => setSub('business')}>My business</button>}
      </nav>

      {sub === 'business' && can.business && <MyBusiness business={data.business} currencies={data.currencies} onData={fromSave} />}
      {sub === 'team' && <Team data={data} onData={fromSave} />}

      {sub === 'orders' && (
        <>
          {role !== 'owner' && (
            <div className="review-note wo-role">
              <span>You are <b>{data.company.roleLabel}</b> at {data.company.name}. {ROLE_HELP[role]}</span>
            </div>
          )}
          {can.business && !data.business.saved && (
            <div className="starter-card card">
              <div>
                <b>Add your business details</b>
                <p className="hint">Your business name, labor rate and how customers pay you go on every invoice.</p>
              </div>
              <button className="btn" onClick={() => setSub('business')}>My business</button>
            </div>
          )}
          <div className="group-head wo-top">
            <p className="hint">{can.create ? 'Open a work order for any boat. Sign each item as you finish it, then send it to the Captain or Owner. Approved work joins your record.'
              : 'These are the work orders with items given to you. Sign each item as you finish it.'}</p>
            {can.create && <button className="btn primary" onClick={() => setAdding(true)}>New work order</button>}
          </div>
          <div className={`gauge ${can.invoice ? 'gauge-6' : 'gauge-5'} wo-gauge`}>
            {BLOCKS.map(([k, label, cls]) => (
              <button key={k} type="button" className={`gauge-cell ${cls} ${focus === k ? 'focus' : ''}`} aria-pressed={focus === k} onClick={() => setFocus(focus === k ? '' : k)}>
                <b>{(byState[k] || []).length}</b><span>{label}</span>
              </button>
            ))}
            {can.invoice && (
              <button type="button" className={`gauge-cell money ${focus === 'unpaid' ? 'focus' : ''}`} aria-pressed={focus === 'unpaid'} onClick={() => setFocus(focus === 'unpaid' ? '' : 'unpaid')}>
                <b>{unpaid.length}</b><span>Unpaid invoices{unpaid.length ? `, ${Object.entries(unpaidByCur).map(([c, n]) => money(n, c)).join(' + ')}` : ''}</span>
              </button>
            )}
          </div>

          {attention.length > 0 && !focus && (
            <section className="group">
              <h3>Needs your attention <span className="count">{attention.length}</span></h3>
              <div className="wo-list">{attention.map((w) => <WoRow key={w.id} wo={w} onOpen={setOpenId} team={isTeam} />)}</div>
            </section>
          )}

          <section className="group">
            <div className="group-head">
              <h3>{focus === 'unpaid' ? 'Unpaid invoices' : focus ? STATE_LABEL[focus] : 'Open work orders'} <span className="count">{shown.length}</span></h3>
              {focus && <button className="link" onClick={() => setFocus('')}>Show all open</button>}
            </div>
            {shown.length ? <div className="wo-list">{shown.map((w) => <WoRow key={w.id} wo={w} onOpen={setOpenId} team={isTeam} />)}</div>
              : <p className="empty">{focus ? 'Nothing here.' : 'No open work orders. Start one with New work order.'}</p>}
          </section>

          {closed.length > 0 && !focus && (
            <section className="group">
              <h3>Approved <span className="count">{closed.length}</span></h3>
              <div className="wo-list">{closed.map((w) => <WoRow key={w.id} wo={w} onOpen={setOpenId} team={isTeam} />)}</div>
            </section>
          )}
        </>
      )}

      {adding && (
        <NewWorkOrder boats={data.boats} me={role === 'lead' ? '' : data.me} leads={can.assignLead && isTeam ? team.filter((m) => m.status === 'active' && m.role !== 'tech') : null}
          onClose={() => setAdding(false)}
          onDone={(r) => { setAdding(false); fromSave(r); setOpenId(r.workOrder.id); }} />
      )}
    </div>
  );
}
