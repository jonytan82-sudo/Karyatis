// Contractor work orders and invoices: the small pieces shared by the screens.
// Totals are worked out here for the screen and again on the server, which keeps the saved total.

export const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
export const cleanNum = (v) => String(v ?? '').replace(/[^\d.]/g, '');

const SYMBOL = { USD: '$', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$', CHF: 'CHF ' };
export function money(n, cur = 'USD') {
  const v = (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (SYMBOL[cur] ?? '') + v;
}

export const ITEM_STATUS = [['open', 'Open'], ['active', 'In progress'], ['parts', 'Waiting on parts'], ['done', 'Done']];
export const PART_STATUS = [['needed', 'Needed'], ['ordered', 'Ordered'], ['received', 'Received'], ['installed', 'Installed']];
export const CHARGE_KINDS = [
  ['travel', 'Travel time', 'hours'], ['mileage', 'Mileage', 'miles'], ['vehicle', 'Vehicle, flat', 'each'],
  ['lodging', 'Lodging', 'nights'], ['perdiem', 'Per diem', 'days'], ['shipping', 'Shipping and freight', 'each'], ['other', 'Other', 'each'],
];
export const chargeLabel = (k) => (CHARGE_KINDS.find((x) => x[0] === k) || ['', 'Other'])[1];
export const chargeUnit = (k, qty) => {
  const u = (CHARGE_KINDS.find((x) => x[0] === k) || ['', '', 'each'])[2];
  return Number(qty) === 1 && u.endsWith('s') ? u.slice(0, -1) : u;
};

export const itemHours = (it) => (it.labor || []).reduce((s, l) => s + num(l.hours), 0);
export const woHours = (wo) => (wo.items || []).reduce((s, it) => s + itemHours(it), 0);
export const partsWaiting = (wo) => (wo.items || []).reduce((n, it) => n + (it.parts || []).filter((p) => p.status === 'needed' || p.status === 'ordered').length, 0);

/** Where a work order stands, for the board. */
export function woState(wo) {
  if (wo.status === 'approved') return wo.perItem ? 'closed' : 'approved';
  if (wo.status === 'review') return wo.review === 'pending' ? 'review' : 'changes';
  const items = wo.items || [];
  if (!items.length) return 'open';
  if (items.every((i) => i.sign)) return 'ready';
  if (items.some((i) => i.status === 'parts') || partsWaiting(wo) > 0) return 'parts';
  if (items.some((i) => i.status === 'active' || i.sign || (i.labor || []).length)) return 'active';
  return 'open';
}

export const STATE_LABEL = {
  open: 'Open', active: 'In progress', parts: 'Waiting on parts', ready: 'Ready to send',
  review: 'With the Captain', changes: 'Needs your attention', approved: 'Approved', closed: 'Closed',
};

export function invTotals(d) {
  const items = d.items || [];
  const labor = items.reduce((s, it) => s + num(it.hoursBilled) * num(it.rate), 0);
  const parts = items.reduce((s, it) => s + (it.parts || []).reduce((n, p) => n + num(p.qty) * num(p.price), 0), 0);
  const charges = (d.charges || []).reduce((s, c) => s + num(c.qty) * num(c.rate), 0);
  const c = d.consumables || {};
  const consumables = c.mode === 'percent' ? labor * num(c.value) / 100 : num(c.value);
  const sub = labor + parts + charges + consumables;
  const tax = sub * num(d.taxRate) / 100;
  const r = (n) => Math.round(n * 100) / 100;
  return { labor: r(labor), parts: r(parts), charges: r(charges), consumables: r(consumables), sub: r(sub), tax: r(tax), total: r(sub + tax) };
}

/** "Removed X s/n A, installed Y s/n B" for one part, as it reads on the record. */
export function partLine(p) {
  const off = p.naOff ? '' : `${p.pnOff || p.pnOn}${p.snOff ? ` s/n ${p.snOff}` : ''}`;
  const on = p.naOn ? '' : `${p.pnOn || p.pnOff}${p.snOn ? ` s/n ${p.snOn}` : ''}`;
  if (off.trim() && on.trim()) return `Removed ${off}, installed ${on}`;
  if (on.trim()) return `Installed ${on}`;
  if (off.trim()) return `Removed ${off}`;
  return '';
}

let seq = 0;
export const tmpId = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
export const newItem = () => ({ id: tmpId('I'), system: '', title: '', discrepancy: '', corrective: '', status: 'open', labor: [], parts: [], sign: null });
export const newPart = () => ({ id: tmpId('P'), desc: '', pnOff: '', snOff: '', pnOn: '', snOn: '', naOff: false, naOn: false, qty: '1', price: '', status: 'needed' });
