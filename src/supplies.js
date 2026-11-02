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

// ── Suggested items from what the task says ──
// [pattern on title + description, items, part-specific?] — first matches win, up to 3 items.
// Part-specific items get the equipment make/model added (when the task names one) and the part-number reminder.
const SUGGEST = [
  [/generator.*oil|oil.*generator/, ['*generator oil filter', '15W-40 diesel engine oil', 'oil drain plug gasket'], true],
  [/\boil\b.*(engine|filter)|(engine|gearbox).*\boil\b/, ['*marine diesel engine oil filter', '15W-40 marine diesel engine oil', 'oil change extractor pump'], true],
  [/fuel filter|water separator|racor/, ['*fuel filter element', 'fuel water separator bowl gasket', 'fuel filter wrench'], true],
  [/impeller/, ['*raw water pump impeller kit', 'impeller puller tool', 'impeller glycerin lubricant'], true],
  [/coolant/, ['extended life diesel coolant', 'coolant test strips'], true],
  [/anode|zinc/, ['*marine zinc anode', 'anode mounting bolt kit', 'stainless wire brush'], true],
  [/\bbelt/, ['*engine drive belt', 'belt tension gauge'], true],
  [/sea strainer|strainer/, ['sea strainer basket', '*sea strainer lid gasket'], true],
  [/air filter|turbo/, ['*engine air filter'], true],
  [/gearbox|transmission/, ['marine transmission fluid'], true],
  [/shaft seal|dripless/, ['dripless shaft seal lubricant'], true],
  [/watermaker/, ['*watermaker pre filter cartridge 5 micron', 'watermaker cleaning chemical', 'watermaker pickling solution'], true],
  [/a\/c|air condition|hvac|chiller|return-air/, ['*marine air conditioning filter', 'condenser coil descaler', 'a/c sea strainer basket'], true],
  [/bilge/, ['marine bilge cleaner', 'bilge pump float switch', 'oil absorbent bilge pillows'], true],
  [/teak/, ['two part teak cleaner', 'teak brightener', 'soft deck brush']],
  [/deck|washdown|hull wash/, ['marine boat soap', 'deck brush with telescopic handle', 'microfiber chamois']],
  [/stainless/, ['marine stainless steel polish', 'microfiber polishing cloths']],
  [/varnish/, ['marine spar varnish', 'foam brushes', '320 grit sandpaper']],
  [/window|hatch|glass/, ['marine glass cleaner', 'silicone seal lubricant']],
  [/fender|mooring|dock line/, ['boat fender', 'double braid nylon dock line', 'fender cover'], true],
  [/windlass|winch|anchor chain/, ['marine winch grease', 'anchor chain markers', 'corrosion inhibitor spray']],
  [/battery|batteries/, ['battery terminal cleaner and protector', 'battery terminal brush', 'digital multimeter']],
  [/navigation light|nav light|anchor light/, ['marine navigation light bulb', 'dielectric grease'], true],
  [/extinguisher/, ['fire extinguisher inspection tags', 'fire extinguisher mounting bracket'], true],
  [/flare/, ['marine flare kit'], true],
  [/lifejacket|life jacket|pfd/, ['inflatable life jacket rearming kit', 'life jacket light'], true],
  [/aed|defibrillator/, ['AED pads', 'AED battery'], true],
  [/first aid|medical/, ['marine first aid kit', 'first aid kit refill']],
  [/galley hood|grease filter/, ['hood grease filter degreaser', 'stainless steel cleaner']],
  [/ice maker/, ['ice machine cleaner', 'ice machine sanitizer']],
  [/fridge|freezer|refrigerat/, ['fridge freezer thermometer', 'condenser coil brush']],
  [/laundry|washing machine|dryer/, ['washing machine cleaner tablets', 'dryer lint brush']],
  [/upholstery|carpet/, ['marine upholstery cleaner', 'carpet stain remover']],
  [/outboard|tender engine|jet ski/, ['outboard lower unit gear oil', '*outboard spark plugs', 'outboard flush muffs'], true],
  [/dive|scuba|compressor/, ['*dive compressor filter cartridge', 'scuba o-ring kit'], true],
  [/sewage|holding tank|toilet|\bheads?\b/, ['marine toilet treatment', 'holding tank deodorant', '*marine toilet pump rebuild kit'], true],
  [/water heater/, ['*water heater anode rod'], true],
  [/grease|lubricat/, ['marine grease', 'grease gun']],
];

// Equipment makers often named in tasks. "cat", "man" and "quick" only count with a model number (they are ordinary words).
const MAKERS = [['caterpillar'], ['cat', true], ['mtu'], ['cummins'], ['volvo penta'], ['yanmar'], ['john deere'], ['kohler'], ['northern lights'],
  ['onan'], ['man', true], ['detroit diesel'], ['perkins'], ['seakeeper'], ['naiad'], ['dometic'], ['cruisair'], ['village marine'],
  ['sea recovery'], ['spectra'], ['racor'], ['lewmar'], ['maxwell'], ['quick', true], ['westerbeke'], ['fischer panda'], ['zf'], ['twin disc']];

/** "Caterpillar C18", "MTU 16V2000", "Kohler 20EFOZ" … from the task text, or ''. */
export function equipmentIn(text) {
  const src = String(text || '');
  for (const [name, needModel] of MAKERS) {
    const re = new RegExp(`\\b(${name})\\b[\\s-]*([a-z]{0,4}-?\\d{1,5}[a-z0-9]{0,6})?`, 'i');
    const m = src.match(re);
    if (!m) continue;
    let model = m[2] || '';
    // "40 kW", "250 hours", "15 L" are ratings, not models
    if (model && /^\s*(kw|kva|hp|h|hrs?|hours|l|litres|liters|%|ft|m)\b/i.test(src.slice(m.index + m[0].length))) model = '';
    if (!model && needModel) continue;
    const maker = m[1].length <= 3 ? m[1].toUpperCase() : m[1].replace(/\b\w/g, (c) => c.toUpperCase());
    return [maker, model.toUpperCase()].filter(Boolean).join(' ');
  }
  return '';
}

const NOTHING_TO_BUY = /drill|survey|audit|record|\blog\b|review|document|certificate|inventory|rounds|radio|vhf|radar|\bais\b|\bgps\b|compass|chart|backup|network|software|test call|deviation|keys|access codes/;

/** Suggested searches for a task: admin mapping first, then items from the text, then the title itself. */
export function suggestionsFor(task, maps) {
  const text = `${task.title || ''} ${task.description || ''}`.toLowerCase();
  const equipment = equipmentIn(`${task.title || ''} ${task.description || ''}`);
  const out = [];
  let verify = false;
  const add = (term, partSpecific) => {
    const isPart = term.startsWith('*');
    const base = term.replace(/^\*/, '');
    const t = isPart && equipment ? `${equipment} ${base}` : base;
    if (out.length < 3 && !out.some((x) => x.term.toLowerCase() === t.toLowerCase())) out.push({ term: t });
    if (partSpecific) verify = true;
  };
  const mapped = supplyFor(task, maps);
  if (mapped) { add(mapped.term, mapped.verify); }
  SUGGEST.forEach(([re, items, part]) => { if (re.test(text)) items.forEach((i) => add(i, part)); });
  // nothing matched: a search from the title, except for jobs with nothing to buy (drills, surveys, checks of records or radios)
  if (!out.length && !NOTHING_TO_BUY.test(text)) {
    const words = String(task.title || '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9\s-]/gi, ' ')
      .replace(/\b(check|checks|inspect|inspection|test|service|clean|replace|change|monthly|weekly|annual|and|the|of|for|with|on|in|to|a|all|broken|function)\b/gi, ' ')
      .replace(/\s+/g, ' ').trim();
    if (words) out.push({ term: `marine ${words}`.toLowerCase(), fromTitle: true });
  }
  return { items: out, verify: verify || !!(mapped && mapped.verify), equipment, note: mapped && mapped.note };
}

/** Adds CJM's tag to Amazon links only while the tag is switched on. Other suppliers' links are left as they are. */
export function shopLink(url, supplies) {
  if (!supplies || !supplies.tagOn || !supplies.tag || !/^https:\/\/([a-z0-9-]+\.)*amazon\./i.test(url)) return url;
  const clean = url.replace(/([?&])tag=[^&]*/i, '$1').replace(/[?&]+$/, '');
  return clean + (clean.includes('?') ? '&' : '?') + 'tag=' + encodeURIComponent(supplies.tag);
}

// ── Send a list to the buyer's Amazon cart ──
// Amazon's "Add to Cart form" link: /gp/aws/cart/add.html?ASIN.1=…&Quantity.1=… (from the testing copy).
// It needs each item's Amazon product code (ASIN), taken from a saved /dp/ link. Amazon shows a confirmation page and adds the
// items to the cart of whoever is signed in. NOT verified against Amazon's current site: the format is from Amazon's older
// Product Advertising API guides. Search links cannot go into a cart.
export function asinOf(url) {
  const m = String(url || '').match(/^https:\/\/(www\.)?amazon\.[a-z.]+\/(?:[^/]+\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  return m ? m[2].toUpperCase() : '';
}

/** Cart links for lines [{ url, qty }], 20 items per link. Only items with an Amazon product link go in. */
export function cartLinks(lines, supplies) {
  const host = (() => { try { return new URL(supplies.searchUrl.replace('{term}', 'x')).host; } catch { return 'www.amazon.com'; } })();
  const ok = lines.map((l) => ({ ...l, asin: asinOf(l.url) })).filter((l) => l.asin);
  const out = [];
  for (let i = 0; i < ok.length; i += 20) {
    const part = ok.slice(i, i + 20);
    const u = new URL(`https://${host}/gp/aws/cart/add.html`);
    part.forEach((l, j) => {
      u.searchParams.set(`ASIN.${j + 1}`, l.asin);
      u.searchParams.set(`Quantity.${j + 1}`, String(Math.min(999, Math.max(1, Number(l.qty) || 1))));
    });
    if (supplies.tagOn && supplies.tag) u.searchParams.set('AssociateTag', supplies.tag);
    out.push({ url: u.toString(), items: part });
  }
  return out;
}
