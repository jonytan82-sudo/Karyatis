export default function Vessels({ options, current, busy, onOpen }) {
  return (
    <div className="vessels">
      <h2>Your vessels</h2>
      <p className="hint">Each vessel keeps its own maintenance program and crew.</p>
      <div className="vessel-list">
        {options.map((v) => (
          <button key={v.id} className={current && current.id === v.id ? 'vessel-card current' : 'vessel-card'}
            disabled={busy} onClick={() => onOpen(v.id)}>
            <span className="vc-name">{v.name}</span>
            <span className="vc-role">{v.position}</span>
          </button>
        ))}
      </div>
      {!options.length && <p className="empty">You are not on a vessel yet. A captain can invite you, and you can build your profile meanwhile.</p>}
    </div>
  );
}
