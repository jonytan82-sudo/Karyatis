// Task → supplier search mapping. The live list is edited by CJM admin (Supplies in the admin tab); this is the starter set.
// match: phrases separated by "|". A phrase matches when the task title contains it; a phrase starting "cjm-" matches a CJM job id.
// verify: show the "confirm the manufacturer part number" reminder (oil, filters, equipment-specific and safety items).
export const DEFAULT_SUPPLY_MAPS = [
  { match: 'teak deck|deck clean|washdown', term: 'marine teak deck cleaner', category: 'deck' },
  { match: 'stainless', term: 'marine stainless steel polish', category: 'deck' },
  { match: 'bilge clean', term: 'marine bilge cleaner', category: 'mechanical' },
  { match: 'return-air filter|a/c filter|hvac filter|air conditioning filter|ac filter', term: 'marine air conditioning filter', category: 'mechanical', verify: true },
  { match: 'generator oil|generator service', term: 'generator oil filter', category: 'mechanical', verify: true },
  { match: 'main engine oil|engine oil and filter|engines oil', term: 'marine diesel engine oil filter', category: 'mechanical', verify: true },
  { match: 'fuel filter|water separator', term: 'marine diesel fuel filter water separator', category: 'mechanical', verify: true },
  { match: 'impeller', term: 'marine raw water pump impeller kit', category: 'mechanical', verify: true },
  { match: 'anode|zinc', term: 'marine zinc anode', category: 'mechanical', verify: true },
  { match: 'coolant', term: 'marine diesel engine coolant', category: 'mechanical', verify: true },
  { match: 'watermaker pre-filter|watermaker prefilter', term: 'watermaker pre filter cartridge', category: 'mechanical', verify: true },
  { match: 'battery', term: 'battery terminal cleaner and protector', category: 'electrical' },
  { match: 'varnish', term: 'marine spar varnish', category: 'deck' },
  { match: 'fender|mooring line|dock line', term: 'boat fenders and dock lines', category: 'deck', verify: true },
  { match: 'winch|windlass', term: 'marine winch grease', category: 'deck' },
  { match: 'galley hood|grease filter', term: 'kitchen hood grease filter degreaser', category: 'interior' },
  { match: 'ice maker', term: 'ice machine cleaner', category: 'interior' },
  { match: 'upholstery|carpet', term: 'marine upholstery cleaner', category: 'interior' },
  { match: 'laundry', term: 'washing machine cleaner tablets', category: 'interior' },
  { match: 'flares', term: 'marine flare kit', category: 'safety', verify: true, note: 'Flares must meet your flag and coast guard requirements.' },
  { match: 'first aid|medical kit', term: 'marine first aid kit', category: 'safety', verify: true },
  { match: 'sea strainer', term: 'sea strainer basket', category: 'mechanical', verify: true },
  { match: 'navigation lights', term: 'marine navigation light bulb', category: 'electrical', verify: true },
];

export const SUPPLY_CATEGORY_LABELS = { deck: 'Deck', interior: 'Interior', mechanical: 'Mechanical', electrical: 'Electrical', safety: 'Safety', other: 'Other' };
export const CATEGORY_SEARCH = { deck: 'marine deck supplies', interior: 'yacht interior cleaning supplies', mechanical: 'marine engine maintenance supplies',
  electrical: 'marine electrical supplies', safety: 'marine safety equipment', other: 'boat supplies' };

export const VERIFY_NOTE = 'Confirm the manufacturer part number and your vessel\'s equipment specifications before ordering.';

/** The first enabled mapping that fits this task, or null (no button). */
export function supplyFor(task, maps) {
  if (!task || !maps) return null;
  const title = String(task.title || '').toLowerCase();
  return maps.find((m) => String(m.match || '').split('|').map((p) => p.trim()).filter(Boolean)
    .some((p) => (p.startsWith('cjm-') ? task.ruleId === p : title.includes(p)))) || null;
}

export const searchLink = (supplies, term) =>
  supplies.searchUrl.replace('{term}', encodeURIComponent(term).replace(/%20/g, '+'));
