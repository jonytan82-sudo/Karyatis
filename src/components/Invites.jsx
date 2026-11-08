import { useState } from 'react';
import { call } from '../api.js';

export default function Invites({ invites, teamInvites = [], onDone }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (!invites.length && !teamInvites.length) return null;

  async function respond(inv, accept) {
    setBusy(inv.membershipId); setError('');
    try { onDone(await call('respondInvite', { membershipId: inv.membershipId, accept, vesselId: '' })); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }
  async function respondTeam(inv, accept) {
    setBusy(inv.id); setError('');
    try { onDone(await call('respondTeamInvite', { id: inv.id, accept })); }
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
      {teamInvites.map((inv) => (
        <div key={inv.id} className="invite">
          <p>
            <b>{inv.invitedBy || 'A contractor'}</b> invited you to join <b>{inv.company}</b> as {inv.role}.
            You will see the work orders you are given and sign your own work. Your profile and work record stay yours.
          </p>
          <span className="invite-actions">
            <button className="btn primary" disabled={!!busy} onClick={() => respondTeam(inv, true)}>Join team</button>
            <button className="btn" disabled={!!busy} onClick={() => respondTeam(inv, false)}>Decline</button>
          </span>
        </div>
      ))}
      {error && <div className="alert">{error}</div>}
    </section>
  );
}
