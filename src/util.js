export const SYSTEMS = [
  'Main engines', 'Generators', 'Electrical', 'Fuel', 'Plumbing & water', 'HVAC',
  'Hull & deck', 'Steering & stabilizers', 'Navigation & electronics', 'Safety equipment',
  'Tender & toys', 'Galley', 'Interior', 'Other',
];

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
