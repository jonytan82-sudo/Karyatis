import { useCallback, useEffect, useState } from 'react';
import { call } from '../api.js';
import { fmtDate, fmtStamp, todayISO } from '../util.js';
import Modal from './Modal.jsx';
import { AttachmentList } from './Attachments.jsx';
import { ACCEPT, MAX_FILES, prepareFile } from '../files.js';

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const daysUntil = (iso) => Math.round((new Date(iso + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 86400000);
const CELL = { a: 'Aboard', o: 'Off', l: 'Leave', x: 'Extra days', n: 'Not yet joined' };
const patternText = (r) => (r ? `${r.onDays} days on / ${r.offDays} off` : 'Permanent (no rotation)');
const isPhone = () => window.matchMedia('(max-width: 700px)').matches;

/* ───────── My schedule ───────── */
function MySchedule({ me, due, onStart }) {
  if (!me) return null;
  const n = me.next;
  return (
    <section className={`rot-me ${me.aboardToday ? 'aboard' : 'off'}`}>
      <div className="rot-me-main">
        <span className="rot-me-label">Today</span>
        <b>{me.aboardToday ? 'Aboard' : 'Off rotation'}</b>
        {n && <span>{n.aboard ? 'Back aboard' : 'Off from'} <b>{fmtDate(n.date)}</b> ({daysUntil(n.date) === 0 ? 'today' : `in ${daysUntil(n.date)} day${daysUntil(n.date) === 1 ? '' : 's'}`})</span>}
        <small>{patternText(me.rotation)}{me.rotation && me.rotation.reliefName ? `, back-to-back with ${me.rotation.reliefName}` : ''}</small>
      </div>
      {due && (
        <div className="rot-due">
          <p><b>Time to hand over.</b> You go off on {fmtDate(due.offFrom)}. Your handover is already drafted from the log; add a line and send it{due.reliefName ? ` to ${due.reliefName}` : ''}.</p>
          <button className="btn primary" onClick={onStart}>Start handover</button>
        </div>
      )}
    </section>
  );
}

/* ───────── Handover ───────── */
function Summary({ auto, onOpenTask }) {
  const T = ({ t, extra }) => (
    <li><span className={`dot dot-${t.color || 'none'}`} /><button className="link plain" onClick={() => onOpenTask(t.id || t.taskId)}>{t.title}</button>{extra && <small> {extra}</small>}</li>
  );
  const block = (title, items, render, empty) => (
    <div className="ho-block">
      <h4>{title} <span className="count">{items.length}</span></h4>
      {items.length ? <ul>{items.map(render)}</ul> : <p className="empty">{empty}</p>}
    </div>
  );
  return (
    <div className="ho-summary">
      {block('Overdue', auto.overdue || [], (t) => <T key={t.id} t={t} extra={`due ${fmtDate(t.dueDate)}`} />, 'Nothing overdue.')}
      {block('Open issues', auto.issues || [], (t) => <T key={t.id} t={t} />, 'No open issues.')}
      {block('Due in the next 3 weeks', auto.dueSoon || [], (t) => <T key={t.id} t={t} extra={fmtDate(t.dueDate)} />, 'Nothing due soon.')}
      {block('Signed off this rotation', auto.done || [], (d, i) => <T key={i} t={{ ...d, color: 'done' }} extra={`${fmtDate(d.date)}${d.notes ? ` · ${d.notes}` : ''}`} />, 'No sign-offs logged.')}
      {(auto.notes || []).length > 0 && block('Your notes', auto.notes, (n, i) => <li key={i}><small>{fmtDate(n.date)}, {n.title}:</small> {n.text}</li>, '')}
    </div>
  );
}

function HandoverEditor({ handover, crew, onClose, onSent, onOpenTask }) {
  const [note, setNote] = useState('');
  const [to, setTo] = useState(handover.toUserId || '');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = async (e) => {
    const list = [...e.target.files]; e.target.value = '';
    if (files.length + list.length > MAX_FILES) { setError(`Up to ${MAX_FILES} photos or files.`); return; }
    setBusy(true); setError('');
    try { const ready = []; for (const f of list) ready.push(await prepareFile(f)); setFiles((c) => [...c, ...ready]); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const send = async () => {
    setBusy(true); setError('');
    try {
      await call('sendHandover', { id: handover.id, toUserId: to, note, files: files.map(({ name, mimeType, data, thumb }) => ({ name, mimeType, data, thumb })) });
      onSent();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Your handover" onClose={onClose} wide>
      <p className="hint">Drafted from the log since {fmtDate(handover.auto.since)}. Check it, add anything the log cannot know, and send.</p>
      <Summary auto={handover.auto} onOpenTask={(id) => { onClose(); onOpenTask(id); }} />
      <div className="form ho-form">
        <label>Handing over to
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose…</option>
            {crew.filter((p) => p.userId !== handover.fromUserId).map((p) => <option key={p.userId} value={p.userId}>{p.name} ({p.title})</option>)}
          </select>
        </label>
        <label>Anything the log can't tell them?
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={3000}
            placeholder="e.g. Port genset making a noise at 1500 rpm. Tap the microphone on your keyboard to dictate." />
        </label>
        <div className="note-tools">
          <label className={`btn attach-btn ${busy || files.length >= MAX_FILES ? 'disabled' : ''}`}>
            <input type="file" multiple accept={ACCEPT} onChange={pick} disabled={busy || files.length >= MAX_FILES} />
            Add photo
          </label>
        </div>
        {files.length > 0 && (
          <ul className="att-pending">{files.map((f, i) => (
            <li key={i}>{f.thumb ? <img src={f.thumb} alt="" /> : <span className="att-ext">{(f.name.split('.').pop() || '').toUpperCase()}</span>}
              <span className="att-pname">{f.name}</span>
              <button type="button" className="link danger" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button></li>
          ))}</ul>
        )}
        {error && <div className="alert">{error}</div>}
        <div className="actions left">
          <button className="btn primary" disabled={busy || !to} onClick={send}>{busy ? 'Sending…' : 'Send handover'}</button>
          <button className="btn" onClick={onClose}>Later</button>
        </div>
      </div>
    </Modal>
  );
}

function HandoverRead({ handover, me, canManage, onClose, onDone, onOpenTask }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const accept = async () => {
    setBusy(true); setError('');
    try { await call('acceptHandover', { id: handover.id }); onDone(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const mine = handover.toUserId === me;
  return (
    <Modal title={`Handover from ${handover.fromName}`} onClose={onClose} wide>
      <p className="hint">To {handover.toName}, sent {fmtStamp(handover.sentAt)}{handover.status === 'accepted' ? ` · accepted by ${handover.acceptedBy} ${fmtStamp(handover.acceptedAt)}` : ''}</p>
      {(handover.note || handover.files.length > 0) && (
        <div className="ho-note">
          {handover.note && <p>“{handover.note}”</p>}
          <AttachmentList items={handover.files} />
        </div>
      )}
      <Summary auto={handover.auto} onOpenTask={(id) => { onClose(); onOpenTask(id); }} />
      {error && <div className="alert">{error}</div>}
      {handover.status === 'sent' && (mine || canManage) && (
        <div className="actions left">
          <button className="btn primary big-ok" disabled={busy} onClick={accept}>{busy ? 'Saving…' : mine ? 'Got it' : 'Mark as received'}</button>
        </div>
      )}
    </Modal>
  );
}

function HandoverList({ items, me, onOpen }) {
  if (!items.length) return null;
  const waiting = items.filter((h) => h.status === 'sent' && h.toUserId === me);
  return (
    <section className="group">
      <h3>Handovers</h3>
      {waiting.map((h) => (
        <button key={h.id} className="ho-waiting" onClick={() => onOpen(h)}>
          <b>Handover from {h.fromName} is waiting for you</b><span>Read it and tap “Got it”</span>
        </button>
      ))}
      <ul className="ho-list">
        {items.filter((h) => !waiting.includes(h)).map((h) => (
          <li key={h.id}>
            <button className="link plain" onClick={() => onOpen(h)}><b>{h.fromName}</b> → {h.toName || 'not chosen'}</button>
            <span className={`tag ho-${h.status}`}>{h.status === 'draft' ? 'Draft' : h.status === 'sent' ? 'Waiting for “Got it”' : 'Accepted'}</span>
            <small>{fmtStamp(h.sentAt || h.createdAt)}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────── Calendar ───────── */
function CrewCalendar({ view, onSet }) {
  const groups = view.groups;
  const today = todayISO();
  return (
    <div className="rot-cal-wrap" role="region" aria-label="Crew rotation calendar" tabIndex={0}>
      <table className="rot-cal">
        <thead>
          <tr>
            <th className="rc-name">Crew</th>
            {view.dates.map((d) => {
              const dt = new Date(d + 'T12:00:00');
              return (
                <th key={d} className={`${d === today ? 'today' : ''} ${dt.getDate() === 1 ? 'month' : ''}`} title={fmtDate(d)}>
                  <span>{dt.getDate() === 1 || d === view.dates[0] ? dt.toLocaleString(undefined, { month: 'short' }) : ''}</span>
                  {dt.getDate()}
                </th>
              );
            })}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g}>
            <tr className="rc-group"><th colSpan={view.dates.length + 1}>{g}{view.rules[g] ? ` · minimum ${view.rules[g]} aboard` : ''}</th></tr>
            {view.rows.filter((r) => r.group === g).map((r) => (
              <tr key={r.userId}>
                <th className="rc-name">
                  {view.canManage ? <button className="link plain" onClick={() => onSet(r)} title="Set rotation">{r.name}</button> : r.name}
                  <small>{r.title}{r.rotation ? ` · ${r.rotation.onDays}/${r.rotation.offDays}` : ''}</small>
                </th>
                {r.cells.split('').map((s, i) => <td key={i} className={`c-${s} ${view.dates[i] === today ? 'today' : ''}`} title={`${r.name}, ${fmtDate(view.dates[i])}: ${CELL[s]}`} />)}
              </tr>
            ))}
          </tbody>
        ))}
        <tfoot>
          <tr>
            <th className="rc-name">Aboard</th>
            {view.totals.map((t) => <td key={t.date} className={t.short.length ? 'short' : ''} title={t.short.length ? `Below minimum: ${t.short.join(', ')}` : `${t.total} aboard`}>{t.total}</td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SetRotation({ row, view, onClose, onSaved }) {
  const presetIdx = row.rotation ? view.presets.findIndex(([, on, off]) => on === row.rotation.onDays && off === row.rotation.offDays) : 0;
  const [p, setP] = useState(presetIdx === -1 ? 'custom' : String(presetIdx));
  const [on, setOn] = useState(row.rotation ? row.rotation.onDays : 70);
  const [off, setOff] = useState(row.rotation ? row.rotation.offDays : 70);
  const [start, setStart] = useState(row.rotation ? row.rotation.startDate : todayISO());
  const [relief, setRelief] = useState(row.rotation ? row.rotation.reliefId : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const permanent = p === '0';
  const choose = (v) => { setP(v); if (v !== 'custom') { const [, a, b] = view.presets[Number(v)]; if (a) { setOn(a); setOff(b); } } };
  const save = async () => {
    setBusy(true); setError('');
    try { await call('saveRotation', { rotation: { userId: row.userId, onDays: permanent ? 0 : on, offDays: off, startDate: start, reliefId: permanent ? '' : relief } }); onSaved(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Rotation: ${row.name}`} onClose={onClose}>
      <div className="form">
        <label>Pattern
          <select value={p} onChange={(e) => choose(e.target.value)}>
            {view.presets.map(([label], i) => <option key={i} value={i}>{label}</option>)}
            <option value="custom">Custom…</option>
          </select>
        </label>
        {!permanent && (
          <>
            {p === 'custom' && (
              <div className="two">
                <label>Days on<input type="number" min="1" max="365" value={on} onChange={(e) => setOn(e.target.value)} /></label>
                <label>Days off<input type="number" min="1" max="365" value={off} onChange={(e) => setOff(e.target.value)} /></label>
              </div>
            )}
            <label>First day aboard<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label><span>Back-to-back relief <span className="opt">(optional)</span></span>
              <select value={relief} onChange={(e) => setRelief(e.target.value)}>
                <option value="">None</option>
                {view.rows.filter((r) => r.userId !== row.userId).map((r) => <option key={r.userId} value={r.userId}>{r.name} ({r.title})</option>)}
              </select>
            </label>
            {relief && <p className="hint">The relief gets the opposite half: aboard while {row.name.split(' ')[0]} is off.</p>}
          </>
        )}
        {error && <div className="alert">{error}</div>}
        <div className="actions left">
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save rotation'}</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function Manning({ view, onSaved }) {
  const [rules, setRules] = useState(() => ({ ...view.rules }));
  const [msg, setMsg] = useState('');
  const save = async () => { await call('setManning', { rules }); setMsg('Saved.'); onSaved(); };
  return (
    <details className="group">
      <summary><h3>Minimum crew aboard</h3></summary>
      <p className="hint">Days below these numbers turn red in the calendar.</p>
      <div className="manning">
        {view.groups.map((g) => (
          <label key={g}>{g}<input type="number" min="0" max="100" value={rules[g] || ''} onChange={(e) => setRules({ ...rules, [g]: e.target.value })} /></label>
        ))}
        <label>Total<input type="number" min="0" max="100" value={rules._total || ''} onChange={(e) => setRules({ ...rules, _total: e.target.value })} /></label>
      </div>
      <div className="actions left"><button className="btn" onClick={save}>Save minimums</button>{msg && <span className="hint">{msg}</span>}</div>
    </details>
  );
}

function Requests({ view, onChanged }) {
  const [f, setF] = useState({ type: 'leave', fromDate: addDays(todayISO(), 7), toDate: addDays(todayISO(), 10), note: '' });
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const send = async (e) => {
    e.preventDefault(); setError('');
    try { const r = await call('requestRotationChange', { change: f }); setMsg(r.status === 'approved' ? 'Added to the calendar.' : 'Request sent to the Captain.'); setOpen(false); onChanged(); }
    catch (err) { setError(err.message); }
  };
  const decide = async (id, approve) => { setError(''); try { await call('decideRotationChange', { id, approve }); onChanged(); } catch (e) { setError(e.message); } };
  const pending = view.requests.filter((r) => r.status === 'pending');
  const past = view.requests.filter((r) => r.status !== 'pending').slice(0, 6);
  return (
    <section className="group">
      <h3>Leave and extra days {pending.length > 0 && <span className="badge">{pending.length}</span>}</h3>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}
      {!open && <button className="btn" onClick={() => { setOpen(true); setMsg(''); }}>{view.canManage ? 'Add leave or extra days' : 'Request leave or extra days'}</button>}
      {open && (
        <form className="form card" onSubmit={send}>
          <div className="three">
            <label>Type<select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="leave">Leave (off)</option><option value="extra">Extra days aboard</option></select></label>
            <label>From<input type="date" value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value })} required /></label>
            <label>To<input type="date" value={f.toDate} onChange={(e) => setF({ ...f, toDate: e.target.value })} required /></label>
          </div>
          {view.canManage && (
            <label>For<select value={f.userId || ''} onChange={(e) => setF({ ...f, userId: e.target.value })}>
              <option value="">Me</option>{view.rows.map((r) => <option key={r.userId} value={r.userId}>{r.name}</option>)}
            </select></label>
          )}
          <label><span>Note <span className="opt">(optional)</span></span><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} /></label>
          <div className="actions left"><button className="btn primary">{view.canManage ? 'Add' : 'Send request'}</button><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
      {(pending.length > 0 || past.length > 0) && (
        <ul className="rot-req">
          {pending.concat(past).map((r) => (
            <li key={r.id}>
              <span><b>{r.name}</b> {r.type === 'leave' ? 'leave' : 'extra days'} {fmtDate(r.fromDate)} – {fmtDate(r.toDate)}{r.note ? ` · ${r.note}` : ''}</span>
              {r.status === 'pending' && view.canManage ? (
                <span className="actions left"><button className="btn primary" onClick={() => decide(r.id, true)}>Approve</button><button className="btn" onClick={() => decide(r.id, false)}>Decline</button></span>
              ) : <span className={`tag rq-${r.status}`}>{r.status === 'pending' ? 'Waiting' : r.status === 'approved' ? 'Approved' : 'Declined'}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ───────── Tab ───────── */
export default function Rotation({ user, onOpenTask }) {
  const [from, setFrom] = useState(() => addDays(todayISO(), -3));
  const days = isPhone() ? 28 : 56;
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [reading, setReading] = useState(null);
  const [setting, setSetting] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => call('rotationView', { from, days }).then((r) => { setView(r); setError(''); }).catch((e) => setError(e.message)), [from, days]);
  useEffect(() => { load(); }, [load]);

  const start = async () => { try { const r = await call('startHandover', {}); setEditing(r.handover); } catch (e) { setError(e.message); } };
  if (!view) return error ? <div className="alert">{error}</div> : <p className="empty">Loading…</p>;

  return (
    <div className="rotation">
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}
      <MySchedule me={view.me} due={view.handoverDue} onStart={start} />
      <HandoverList items={view.handovers} me={user.id} onOpen={(h) => (h.status === 'draft' && h.fromUserId === user.id ? start() : setReading(h))} />
      {view.me && !view.handoverDue && <button className="link ho-any" onClick={start}>Write a handover now</button>}

      <section className="group">
        <div className="rot-head">
          <h3>Who is aboard</h3>
          <div className="rot-nav">
            <button className="btn" onClick={() => setFrom(addDays(from, -days / 2))} aria-label="Earlier">‹</button>
            <button className="btn" onClick={() => setFrom(addDays(todayISO(), -3))}>Today</button>
            <button className="btn" onClick={() => setFrom(addDays(from, days / 2))} aria-label="Later">›</button>
          </div>
        </div>
        <CrewCalendar view={view} onSet={setSetting} />
        <div className="rot-legend">
          <span><i className="c-a" /> Aboard</span><span><i className="c-o" /> Off</span><span><i className="c-l" /> Leave</span>
          <span><i className="c-x" /> Extra days</span><span><i className="short-key" /> Below minimum crew</span>
        </div>
        {view.canManage && <p className="hint">Tap a name to set their rotation pattern and back-to-back relief.</p>}
      </section>

      <Requests view={view} onChanged={load} />
      {view.canManage && <Manning view={view} onSaved={load} />}

      {editing && <HandoverEditor handover={editing} crew={view.rows} onClose={() => setEditing(null)}
        onSent={() => { setEditing(null); setMsg('Handover sent.'); load(); }} onOpenTask={onOpenTask} />}
      {reading && <HandoverRead handover={reading} me={user.id} canManage={view.canManage} onClose={() => setReading(null)}
        onDone={() => { setReading(null); setMsg('Handover accepted.'); load(); }} onOpenTask={onOpenTask} />}
      {setting && <SetRotation row={setting} view={view} onClose={() => setSetting(null)} onSaved={() => { setSetting(null); setMsg('Rotation saved.'); load(); }} />}
    </div>
  );
}
