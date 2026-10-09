import { useEffect, useMemo, useState } from 'react';
import { call } from '../api.js';
import { isoDate, todayISO, STATUS } from '../util.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthDays(year, month) {
  const first = new Date(year, month, 1, 12);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function Calendar({ version, onOpen }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(todayISO());

  const days = useMemo(() => monthDays(ym.y, ym.m), [ym]);
  const from = isoDate(days[0]);
  const to = isoDate(days[41]);

  useEffect(() => {
    let live = true;
    call('calendar', { from, to })
      .then((r) => live && (setEvents(r.events), setError('')))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [from, to, version]);

  const byDate = useMemo(() => {
    const m = {};
    events.forEach((e) => (m[e.date] = m[e.date] || []).push(e));
    return m;
  }, [events]);

  const shift = (n) => setYm(({ y, m }) => {
    const d = new Date(y, m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const title = new Date(ym.y, ym.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const today = todayISO();
  const dayEvents = byDate[selected] || [];

  return (
    <div className="calendar">
      <div className="cal-head">
        <button className="btn" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <h2>{title}</h2>
        <button className="btn" onClick={() => shift(1)} aria-label="Next month">›</button>
        <button className="btn" onClick={() => { setYm({ y: now.getFullYear(), m: now.getMonth() }); setSelected(today); }}>Today</button>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="legend">
        {['green', 'amber', 'red', 'done', 'projected'].map((c) => (
          <span key={c}><i className={`dot ${c}`} />{c === 'done' ? 'Signed off' : STATUS[c]}</span>
        ))}
      </div>

      <div className="grid">
        {WEEKDAYS.map((w) => <div key={w} className="wd">{w}</div>)}
        {days.map((d) => {
          const iso = isoDate(d);
          const list = byDate[iso] || [];
          const cls = ['day'];
          if (d.getMonth() !== ym.m) cls.push('other');
          if (iso === today) cls.push('today');
          if (iso === selected) cls.push('selected');
          return (
            <button key={iso} className={cls.join(' ')} onClick={() => setSelected(iso)}>
              <span className="day-num">{d.getDate()}</span>
              <span className="chips">
                {list.slice(0, 3).map((e, i) => (
                  <span key={i} className={`chip ${e.color}`}>{e.title}</span>
                ))}
                {list.length > 3 && <span className="more">+{list.length - 3}</span>}
              </span>
              <span className="dots">
                {list.slice(0, 5).map((e, i) => <i key={i} className={`dot ${e.color}`} />)}
              </span>
            </button>
          );
        })}
      </div>

      <section className="day-list">
        <h3>{new Date(selected + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
        {dayEvents.length === 0 && <p className="empty">Nothing scheduled.</p>}
        {dayEvents.map((e, i) => (
          <button key={i} className={`row stripe-${e.color}`} onClick={() => onOpen(e.taskId)}>
            <span className="row-main">
              <span className="row-title">{e.title}{e.type === 'Issue' && <span className="tag">Issue</span>}</span>
              <span className="row-meta">
                {e.completed ? `Signed off by ${e.by} (${e.timing})` : e.projected ? 'Projected from the recurring schedule' : [e.system, e.time].filter(Boolean).join(', ')}
              </span>
            </span>
            <span className="row-due"><span className={`due-${e.color}`}>{e.completed ? 'Signed off' : STATUS[e.color]}</span></span>
          </button>
        ))}
      </section>
    </div>
  );
}
