import { useState } from 'react';
import { fullLink } from '../api.js';

/** Shows the result of adding someone: invitation sent, or a setup link to pass on. */
export default function SetupLink({ result, onDismiss }) {
  const [copied, setCopied] = useState(false);
  if (!result) return null;
  const link = fullLink(result.setupLink);

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  };

  return (
    <div className="ok setup-result">
      {result.status === 'invited' ? (
        <p><b>{result.name}</b> already has an account, so they got an invitation. They join once they accept it after logging in.</p>
      ) : (
        <>
          <p>
            Account created for <b>{result.name}</b>.{' '}
            {result.emailed ? 'A setup email is on its way. You can also send them this link:' : 'Email could not be sent, so send them this link to set their password:'}
          </p>
          <div className="link-row">
            <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Setup link" />
            <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
          </div>
          <p className="hint">The link works for 7 days.</p>
        </>
      )}
      {onDismiss && <button className="link" onClick={onDismiss}>Done</button>}
    </div>
  );
}
