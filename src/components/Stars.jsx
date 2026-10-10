export function Stars({ value, count }) {
  const v = Math.round(Number(value) || 0);
  return (
    <span className="stars" aria-label={count ? `${value} out of 5 from ${count} review${count === 1 ? '' : 's'}` : 'No reviews yet'}>
      <span aria-hidden="true">{'★'.repeat(v)}<span className="off">{'★'.repeat(5 - v)}</span></span>
      {count !== undefined && <span className="stars-count">{count ? `${value} (${count})` : 'No reviews'}</span>}
    </span>
  );
}

export function StarInput({ value, onChange }) {
  return (
    <span className="star-input" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>★</button>
      ))}
    </span>
  );
}
