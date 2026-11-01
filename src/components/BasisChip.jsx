import { AUTHORITIES, BASIS } from '../jobLibrary.js';

/** Recommended / Manufacturer / Regulatory · Flag … Nothing for tasks the crew wrote themselves. */
export default function BasisChip({ basis, authority, pending }) {
  const b = BASIS[basis];
  if (!b) return null;
  const by = basis === 'regulatory' && AUTHORITIES[authority] ? ` · ${AUTHORITIES[authority]}` : '';
  return <span className={`basis ${b.cls}`} title={pending ? 'Applicability requires confirmation' : undefined}>{b.label}{by}{pending ? ' · confirm' : ''}</span>;
}
