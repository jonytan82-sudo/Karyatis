export const SYSTEMS = [
  'Main engines', 'Generators', 'Electrical', 'Fuel', 'Plumbing & water', 'HVAC',
  'Steering & stabilizers', 'Navigation & electronics', 'AV/IT & communications',
  'Hull & deck', 'Safety equipment', 'Tender & toys', 'Dive & watersports',
  'Interior', 'Galley', 'Medical', 'Security', 'Other',
];

export const AVAILABILITY = ['Available', 'Open to offers', 'Employed'];

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export function certStatus(expires) {
  if (!expires) return '';
  const days = Math.round((new Date(expires + 'T12:00:00') - new Date()) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 90) return 'soon';
  return 'valid';
}

export const STATUS = {
  red: 'Overdue',
  amber: 'Due soon',
  green: 'On schedule',
  none: 'Open issue',
  done: 'Closed',
  projected: 'Projected',
};

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => isoDate(new Date());

export function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtStamp(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function dueText(t) {
  if (t.state === 'Completed') return 'Completed';
  if (t.state === 'Resolved') return 'Resolved';
  const d = t.daysUntilDue;
  if (d === null || d === undefined) return 'No due date';
  if (d < -1) return `${-d} days overdue`;
  if (d === -1) return '1 day overdue';
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  return `Due in ${d} days`;
}

export function everyText(t) {
  if (!t.recurring) return 'One-time';
  const n = Number(t.intervalValue);
  const unit = n === 1 ? t.intervalUnit.replace(/s$/, '') : t.intervalUnit;
  return `Every ${n} ${unit}`;
}

export function fmtDays(d) {
  d = Number(d) || 0;
  if (d < 31) return `${d} day${d === 1 ? '' : 's'}`;
  const months = Math.round(d / 30.44);
  if (months < 12) return `${months} months`;
  const y = Math.floor(months / 12), m = months % 12;
  return `${y} yr${m ? ` ${m} mo` : ''}`;
}
