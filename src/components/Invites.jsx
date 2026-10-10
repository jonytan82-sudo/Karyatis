import { useState } from 'react';
import { call } from '../api.js';

export default function Invites({ invites, onDone }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (!invites.length) return null;

  async function respond(inv, accept) {
    setBusy(inv.membershipId); setError('');
    try { onDone(await call('respondInvite', { membershipId: inv.membershipId, accept, vesselId: '' })); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }

  return (
    <section className="invites">
      {invites.map((inv) => (
        <div key={inv.membershipId} className="invite">
          <p>
            <b>{inv.invitedBy || 'A captain'}</b> invited you to join <b>{inv.vesselName}</b> as {inv.position}.
            Your profile and reviews come with you.
          </p>
          <span className="invite-actions">
            <button className="btn primary" disabled={!!busy} onClick={() => respond(inv, true)}>Join {inv.vesselName}</button>
            <button className="btn" disabled={!!busy} onClick={() => respond(inv, false)}>Decline</button>
          </span>
        </div>
      ))}
      {error && <div className="alert">{error}</div>}
    </section>
  );
}
