import { RequestYacht } from './YachtRequests.jsx';

export default function Vessels({ options, current, busy, onOpen, canRequest, onChanged }) {
  return (
    <div className="vessels">
      <h2>Your vessels</h2>
      <p className="hint">Each vessel keeps its own maintenance program and crew.</p>
      <div className="vessel-list">
        {options.map((v) => (
          <button key={v.id} className={current && current.id === v.id ? 'vessel-card current' : 'vessel-card'}
            disabled={busy} onClick={() => onOpen(v.id)}>
            <span className="vc-name">{v.name}</span>
            <span className="vc-role">{v.position}{v.accessLabel ? `, ${v.accessLabel}` : ''}</span>
          </button>
        ))}
      </div>
      {!options.length && <p className="empty">You are not on a vessel yet.{canRequest ? ' Ask CJM Marine to add your yacht below.' : ' A captain can invite you, and you can build your profile meanwhile.'}</p>}
      {canRequest && <RequestYacht onChanged={onChanged} />}
    </div>
  );
}
