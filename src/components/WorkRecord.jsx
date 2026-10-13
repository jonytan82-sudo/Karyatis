import { fmtDate } from '../util.js';

/** Task reviews (1–10) a crew member asked for and received. */
export default function WorkRecord({ performance, limit }) {
  if (!performance || !performance.count) return <p className="empty">No work reviews yet.</p>;
  const items = limit ? performance.items.slice(0, limit) : performance.items;
  return (
    <>
      <div className="work-summary">
        <span className="work-avg">{performance.average.toFixed(1)}<small>/10</small></span>
        <span>average from {performance.count} reviewed task{performance.count === 1 ? '' : 's'}</span>
      </div>
      <ul className="reviews work-items">
        {items.map((x, i) => (
          <li key={i}>
            <div className="wi-top">
              <span className="score">{x.score}/10</span>
              <b>{x.task}</b>
            </div>
            {x.text && <p>{x.text}</p>}
            <small>{[x.system, x.by, x.vesselName, fmtDate(x.date)].filter(Boolean).join(', ')}</small>
          </li>
        ))}
      </ul>
      {limit && performance.items.length > limit && <p className="hint">Showing the latest {limit} of {performance.count}.</p>}
    </>
  );
}
