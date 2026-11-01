// Common routine maintenance jobs, by system, for the "Common jobs" list and the starter program.
// Intervals are general industry practice for private yachts, NOT manufacturer, flag or class requirements.
// Every task created from here says so; the Captain/Chief Engineer adjusts them to the boat's manuals.
//
// [system, title, every, unit, notes, sizes, equipment, regulated]
//   sizes: which size bands get it by default in the starter program (S under 24 m, M 24–40 m, L over 40 m)
//   equipment: only suggested when the boat has it ('' = every boat). 'charter' = commercial/charter yachts, 'classed' = classed yachts.
//   regulated: 'flag' or 'class' when the flag state or class society usually sets the interval and scope (shown as a tag).

export const SIZE_BANDS = [
  ['S', 'Under 24 m (80 ft)'],
  ['M', '24 to 40 m (80 to 130 ft)'],
  ['L', 'Over 40 m (130 ft)'],
];

export const EQUIPMENT = [
  ['stabilizers', 'Fin stabilizers'],
  ['gyro', 'Gyro stabilizer'],
  ['thrusters', 'Bow or stern thrusters'],
  ['watermaker', 'Watermaker'],
  ['sewage', 'Sewage treatment plant'],
  ['chiller', 'Chilled-water air conditioning'],
  ['tender', 'Tender'],
  ['davit', 'Davit or crane'],
  ['toys', 'Jet skis and water toys'],
  ['dive', 'Dive compressor and scuba gear'],
  ['hydraulics', 'Hydraulic passerelle or swim platform'],
  ['fireSystem', 'Fixed fire suppression in the engine room'],
  ['satcom', 'VSAT or Starlink'],
  ['gas', 'LPG or gas galley'],
  ['rig', 'Sailing rig'],
];

// Flag states commonly used by yachts. The note is a general guide only, not legal advice; check with the flag administration.
export const FLAGS = [
  ['United States', 'Private yachts follow US Coast Guard recreational rules. Carrying more than 6 paying passengers needs a USCG-inspected vessel.'],
  ['Red Ensign Group (UK, Cayman, BVI, Bermuda, Isle of Man, Gibraltar…)', 'Commercial yachts generally follow the REG Yacht Code.'],
  ['Marshall Islands', 'Commercial yachts generally follow the Marshall Islands Yacht Code.'],
  ['Malta', 'Commercial yachts generally follow the Malta Commercial Yacht Code.'],
  ['Bahamas', ''],
  ['Panama', ''],
  ['Netherlands', ''],
  ['Other', ''],
];
export const CLASS_SOCIETIES = ["Lloyd's Register", 'ABS', 'DNV', 'Bureau Veritas', 'RINA', 'Other'];

const J = [
  // Main engines
  ['Main engines', 'Main engine oil and filter change', 12, 'months', 'Or at the hours in the engine manual, whichever comes first. Take an oil sample for analysis.', 'SML', ''],
  ['Main engines', 'Main engine fuel filters and water separators', 12, 'months', 'Replace primary and secondary filters; drain separator bowls weekly between changes.', 'SML', ''],
  ['Main engines', 'Main engine raw water pump impeller', 12, 'months', 'Replace impeller and gasket; inspect cam and wear plate. Carry a spare.', 'SML', ''],
  ['Main engines', 'Main engine sea strainers check and clean', 1, 'weeks', 'Close the seacock first. Clean basket, check lid seal.', 'SML', ''],
  ['Main engines', 'Main engine coolant level and condition', 1, 'months', 'Check level, test freeze point and additive with test strips.', 'SML', ''],
  ['Main engines', 'Main engine coolant replacement', 3, 'years', 'Or per the coolant manufacturer. Flush and refill.', 'SML', ''],
  ['Main engines', 'Main engine belts and hoses inspection', 1, 'months', 'Tension, cracks, glazing; hose clamps and chafe.', 'SML', ''],
  ['Main engines', 'Main engine heat exchanger anodes', 6, 'months', 'Inspect and replace when half wasted.', 'SML', ''],
  ['Main engines', 'Main engine heat exchanger and aftercooler cleaning', 2, 'years', 'Remove end caps, rod tubes, pressure test if possible.', 'SML', ''],
  ['Main engines', 'Main engine valve clearance adjustment', 2, 'years', 'At the hours given in the engine manual.', 'ML', ''],
  ['Main engines', 'Main engine air filters and turbo inlet check', 6, 'months', 'Clean or replace filters; check turbo for oil and play.', 'SML', ''],
  ['Main engines', 'Exhaust elbows, risers and hoses inspection', 12, 'months', 'Look for corrosion, scale and leaks.', 'SML', ''],
  ['Main engines', 'Engine mounts and shaft alignment check', 12, 'months', 'Check mounts for cracks and settling; check coupling alignment.', 'SML', ''],
  ['Main engines', 'Gearbox oil and filter change', 12, 'months', 'Or at the hours in the gearbox manual.', 'SML', ''],
  ['Main engines', 'Shaft seals inspection', 1, 'months', 'Drip rate or dripless seal condition; burp after haul-out.', 'SML', ''],
  ['Main engines', 'Engine room rounds and log', 1, 'days', 'Levels, leaks, temperatures, bilges, unusual noise.', 'ML', ''],

  // Generators
  ['Generators', 'Generator oil and filter change', 6, 'months', 'Or at the hours in the generator manual.', 'SML', ''],
  ['Generators', 'Generator raw water impeller', 12, 'months', 'Replace impeller; carry a spare.', 'SML', ''],
  ['Generators', 'Generator fuel filters', 12, 'months', 'Primary and secondary.', 'SML', ''],
  ['Generators', 'Generator belts, hoses and anodes', 3, 'months', 'Tension, cracks, anode wear.', 'SML', ''],
  ['Generators', 'Generator load run when idle', 1, 'months', 'Run under load for 30+ minutes if it has not run.', 'SML', ''],
  ['Generators', 'Generator heat exchanger cleaning', 2, 'years', '', 'SML', ''],

  // Electrical
  ['Electrical', 'Batteries: terminals, voltage and condition', 1, 'months', 'Clean terminals, check voltage/specific gravity, secure mounts.', 'SML', ''],
  ['Electrical', 'Battery chargers and inverters check', 3, 'months', 'Settings, fans, error logs.', 'SML', ''],
  ['Electrical', 'Shore power cords and inlets inspection', 3, 'months', 'Heat marks, corrosion, strain reliefs.', 'SML', ''],
  ['Electrical', 'Switchboard thermal imaging', 12, 'months', 'Under load; tighten hot connections.', 'ML', ''],
  ['Electrical', 'Insulation and ground fault test', 12, 'months', '', 'ML', ''],
  ['Electrical', 'Emergency lighting test', 1, 'months', '', 'ML', ''],

  // Fuel
  ['Fuel', 'Fuel tanks: drain water and sample', 1, 'months', 'From tank sumps or drains; check for diesel bug.', 'SML', ''],
  ['Fuel', 'Fuel polishing and transfer system check', 3, 'months', 'Filters, pumps, valves.', 'ML', ''],
  ['Fuel', 'Fuel tank inspection and cleaning', 5, 'years', 'Or when samples show contamination.', 'ML', ''],
  ['Fuel', 'Fuel hoses, valves and shut-offs check', 12, 'months', 'Including remote emergency shut-offs.', 'SML', ''],

  // Plumbing & water
  ['Plumbing & water', 'Bilge pumps and float switches test', 1, 'months', 'Manual and automatic; high-water alarms.', 'SML', ''],
  ['Plumbing & water', 'Seacocks exercise and inspection', 3, 'months', 'Open and close each; check hose clamps.', 'SML', ''],
  ['Plumbing & water', 'Freshwater pumps and accumulators check', 3, 'months', '', 'SML', ''],
  ['Plumbing & water', 'Water heater service and anode', 12, 'months', '', 'SML', ''],
  ['Plumbing & water', 'Potable water tanks disinfection', 6, 'months', 'And test the water.', 'ML', ''],
  ['Plumbing & water', 'Black and grey water tanks and pumps check', 3, 'months', 'Level sensors, vents, macerators.', 'SML', ''],
  ['Plumbing & water', 'Sewage treatment plant service', 3, 'months', 'Per the plant manual.', 'SML', 'sewage'],
  ['Plumbing & water', 'Watermaker pre-filters change', 1, 'months', 'Or when pressure drop says so.', 'SML', 'watermaker'],
  ['Plumbing & water', 'Watermaker fresh flush or pickle', 1, 'weeks', 'Flush if idle a week; pickle for longer lay-ups.', 'SML', 'watermaker'],
  ['Plumbing & water', 'Watermaker high-pressure pump oil change', 12, 'months', '', 'SML', 'watermaker'],

  // HVAC
  ['HVAC', 'A/C raw water strainers clean', 2, 'weeks', '', 'SML', ''],
  ['HVAC', 'A/C return-air filters clean', 1, 'months', '', 'SML', ''],
  ['HVAC', 'A/C condenser coils descale', 12, 'months', 'Acid flush of seawater coils.', 'SML', ''],
  ['HVAC', 'Chiller service', 6, 'months', 'Pressures, pumps, controls; check refrigerant with a licensed tech.', 'ML', 'chiller'],
  ['HVAC', 'Engine room ventilation fans and dampers', 6, 'months', 'Including fire dampers.', 'ML', ''],

  // Steering & stabilizers
  ['Steering & stabilizers', 'Steering hydraulic fluid and leaks check', 1, 'months', '', 'SML', ''],
  ['Steering & stabilizers', 'Steering system inspection', 12, 'months', 'Rams, linkages, rudder stock and bearings.', 'SML', ''],
  ['Steering & stabilizers', 'Emergency steering test', 3, 'months', '', 'ML', '', 'flag'],
  ['Steering & stabilizers', 'Stabilizer fins, seals and actuators inspection', 6, 'months', '', 'ML', 'stabilizers'],
  ['Steering & stabilizers', 'Stabilizer hydraulic oil and filters', 12, 'months', 'Or per the stabilizer manual.', 'ML', 'stabilizers'],
  ['Steering & stabilizers', 'Gyro stabilizer service', 12, 'months', 'Per the maker: bearings, coolant, vacuum.', 'SML', 'gyro'],
  ['Steering & stabilizers', 'Thrusters: motor, anode and props', 12, 'months', 'Brushes, oil, anode, prop and shear pin.', 'SML', 'thrusters'],

  // Navigation & electronics
  ['Navigation & electronics', 'Navigation lights test', 1, 'weeks', 'Including anchor light; carry spare bulbs.', 'SML', ''],
  ['Navigation & electronics', 'Radar, GPS and AIS check', 1, 'months', 'Positions agree, alarms work.', 'SML', ''],
  ['Navigation & electronics', 'VHF and DSC radio test', 1, 'months', 'Test call; check DSC position input.', 'SML', ''],
  ['Navigation & electronics', 'Horn and whistle test', 1, 'months', '', 'SML', ''],
  ['Navigation & electronics', 'Chart and publication updates', 1, 'weeks', 'Electronic chart updates and notices to mariners.', 'ML', ''],
  ['Navigation & electronics', 'Compass deviation check', 12, 'months', '', 'SML', '', 'flag'],

  // AV/IT
  ['AV/IT & communications', 'Network, Wi-Fi and software updates', 1, 'months', '', 'ML', ''],
  ['AV/IT & communications', 'Backups of navigation and onboard systems', 1, 'months', '', 'ML', ''],
  ['AV/IT & communications', 'VSAT or Starlink dish inspection', 6, 'months', 'Radome, cabling, firmware.', 'SML', 'satcom'],

  // Hull & deck
  ['Hull & deck', 'Underwater hull inspection', 3, 'months', 'Growth, anodes, running gear; by diver if afloat.', 'SML', ''],
  ['Hull & deck', 'Hull anodes replacement', 12, 'months', 'Or when half wasted.', 'SML', ''],
  ['Hull & deck', 'Haul-out: antifouling, running gear and seacocks', 2, 'years', 'Per your yard plan.', 'SML', '', 'class'],
  ['Hull & deck', 'Anchor windlass service', 6, 'months', 'Gearbox oil, brake, gypsy, controls.', 'SML', ''],
  ['Hull & deck', 'Anchor chain inspection and marking', 12, 'months', 'Wear, swivel, bitter end.', 'SML', ''],
  ['Hull & deck', 'Mooring lines and fenders inspection', 1, 'months', 'Chafe, UV damage.', 'SML', ''],
  ['Hull & deck', 'Deck hardware, rails and stanchions check', 3, 'months', 'Loose fittings, sealant, corrosion.', 'SML', ''],
  ['Hull & deck', 'Teak deck clean and inspection', 1, 'months', 'Seams and plugs.', 'SML', ''],
  ['Hull & deck', 'Exterior stainless polish and corrosion check', 1, 'months', '', 'SML', ''],
  ['Hull & deck', 'Windows, hatches and wiper seals check', 6, 'months', 'Leak test.', 'SML', ''],
  ['Hull & deck', 'Exterior varnish touch-up', 6, 'months', '', 'ML', ''],
  ['Hull & deck', 'Passerelle and swim platform hydraulics service', 12, 'months', 'Oil, hoses, rams, limit switches.', 'SML', 'hydraulics'],
  ['Hull & deck', 'Davit or crane inspection and load test', 12, 'months', 'Wire, hook, brakes; load test per the maker or class.', 'SML', 'davit', 'class'],
  ['Hull & deck', 'Rig inspection', 12, 'months', 'Standing rigging, terminals, chainplates.', 'SML', 'rig'],
  ['Hull & deck', 'Winches service', 12, 'months', 'Strip, clean and grease.', 'SML', 'rig'],

  // Tender & toys
  ['Tender & toys', 'Tender engine service', 12, 'months', 'Or at the hours in the engine manual.', 'SML', 'tender'],
  ['Tender & toys', 'Tender hull, tubes and bilge check', 1, 'months', '', 'SML', 'tender'],
  ['Tender & toys', 'Tender safety kit check', 3, 'months', 'Lifejackets, kill cord, flares, VHF, anchor.', 'SML', 'tender'],
  ['Tender & toys', 'Jet ski service', 12, 'months', 'Or at the hours in the manual; flush after every use.', 'SML', 'toys'],
  ['Tender & toys', 'Water toys inspection', 1, 'months', 'Inflatables, towables, tow ropes.', 'SML', 'toys'],

  // Safety equipment
  ['Safety equipment', 'Liferaft service', 12, 'months', 'At an approved station; interval per the raft maker and flag.', 'SML', '', 'flag'],
  ['Safety equipment', 'EPIRB self-test and expiry dates', 1, 'months', 'Battery and hydrostatic release dates; registration current.', 'SML', '', 'flag'],
  ['Safety equipment', 'PLBs and SART test', 1, 'months', '', 'ML', '', 'flag'],
  ['Safety equipment', 'Fire extinguishers visual check', 1, 'months', 'Pressure gauge, pin, access.', 'SML', ''],
  ['Safety equipment', 'Fire extinguishers annual service', 12, 'months', 'By an approved service company.', 'SML', '', 'flag'],
  ['Safety equipment', 'Fixed fire suppression service', 12, 'months', 'By an approved service company.', 'SML', 'fireSystem', 'flag'],
  ['Safety equipment', 'Smoke, heat and gas detectors test', 1, 'months', 'Including CO detectors.', 'SML', ''],
  ['Safety equipment', 'Lifejackets inspection', 6, 'months', 'Lights, whistles, inflation cylinders.', 'SML', ''],
  ['Safety equipment', 'Inflatable lifejackets service', 12, 'months', '', 'SML', '', 'flag'],
  ['Safety equipment', 'Flares and pyrotechnics expiry check', 6, 'months', '', 'SML', '', 'flag'],
  ['Safety equipment', 'Fire pumps and hoses test', 3, 'months', '', 'ML', '', 'flag'],
  ['Safety equipment', 'Fire and abandon-ship drill', 1, 'months', 'Log who attended.', 'ML', '', 'flag'],
  ['Safety equipment', 'Man-overboard drill', 1, 'months', '', 'ML', '', 'flag'],

  // Dive & watersports
  ['Dive & watersports', 'Dive compressor service and air test', 6, 'months', 'Filters per hours; air quality test.', 'SML', 'dive'],
  ['Dive & watersports', 'Scuba tanks visual inspection', 12, 'months', 'Hydrostatic test as required by your area.', 'SML', 'dive'],
  ['Dive & watersports', 'Regulators and BCDs service', 12, 'months', '', 'SML', 'dive'],

  // Interior
  ['Interior', 'Guest cabins deep clean', 1, 'months', '', 'ML', ''],
  ['Interior', 'Interior inventory: linen and amenities', 3, 'months', '', 'ML', ''],
  ['Interior', 'Upholstery and carpets clean', 6, 'months', '', 'SML', ''],
  ['Interior', 'Laundry machines filters and service', 1, 'months', 'Lint filters, drain filters, door seals.', 'ML', ''],
  ['Interior', 'Doors, latches and interior hardware check', 6, 'months', '', 'SML', ''],

  // Galley
  ['Galley', 'Fridge and freezer temperatures check', 1, 'weeks', '', 'SML', ''],
  ['Galley', 'Galley hood and grease filters clean', 1, 'months', '', 'SML', ''],
  ['Galley', 'Fridge and freezer condenser coils clean', 3, 'months', '', 'SML', ''],
  ['Galley', 'Ice maker clean and sanitize', 3, 'months', '', 'SML', ''],
  ['Galley', 'Stores rotation and expiry check', 1, 'months', '', 'SML', ''],
  ['Galley', 'Gas system, hoses and solenoid check', 12, 'months', 'And leak test.', 'SML', 'gas'],

  // Medical
  ['Medical', 'Medical kit inventory and expiry dates', 3, 'months', '', 'SML', ''],
  ['Medical', 'Defibrillator (AED) check', 1, 'months', 'Status light, pads and battery dates.', 'ML', ''],
  ['Medical', 'Oxygen cylinders check', 3, 'months', '', 'ML', ''],

  // Security
  ['Security', 'CCTV and alarm system test', 3, 'months', '', 'ML', ''],
  ['Security', 'Keys and access codes audit', 6, 'months', '', 'L', ''],

  // Other
  ['Other', "Ship's documents and certificates expiry check", 3, 'months', 'Registration, insurance, radio licence, crew certificates.', 'SML', ''],
  ['Other', 'Pre-season or pre-charter check', 12, 'months', '', 'ML', ''],

  // Commercial / charter yachts (scope and dates come from the flag state and the yacht code the boat operates under)
  ['Other', 'Annual flag state survey preparation', 12, 'months', 'Survey date and scope come from your flag administration and the yacht code you operate under.', 'SML', 'charter', 'flag'],
  ['Safety equipment', 'Weekly lifesaving appliance inspection', 1, 'weeks', 'Liferafts, lifejackets, lifebuoys, muster list; record it as your flag requires.', 'SML', 'charter', 'flag'],
  ['Safety equipment', 'Monthly lifesaving and firefighting inspection', 1, 'months', 'Record in the official log as your flag requires.', 'SML', 'charter', 'flag'],
  ['Navigation & electronics', 'Radio survey (GMDSS)', 12, 'months', 'By a flag-approved radio surveyor.', 'SML', 'charter', 'flag'],
  ['Electrical', 'Emergency generator and emergency power test', 1, 'weeks', 'Start and run on load; log it.', 'ML', 'charter', 'flag'],
  ['Medical', 'Medical stores check against the flag requirements', 12, 'months', 'The required medical chest depends on flag and cruising area.', 'SML', 'charter', 'flag'],
  ['Other', 'Safety management system internal audit', 12, 'months', 'For yachts that need an ISM safety management system (generally commercial yachts of 500 GT and over).', 'L', 'charter', 'flag'],
  ['Other', 'Crew certificates and training records review', 3, 'months', 'STCW, medicals and flag endorsements.', 'SML', 'charter', 'flag'],
  ['Other', 'Garbage and oil record books check', 1, 'months', 'MARPOL record keeping; what is required depends on size.', 'ML', 'charter', 'flag'],

  // Classed yachts (windows and scope set by the class society)
  ['Other', 'Class annual survey', 12, 'months', 'Window and scope set by your class society.', 'SML', 'classed', 'class'],
  ['Other', 'Class renewal survey preparation', 5, 'years', 'Set by your class society.', 'SML', 'classed', 'class'],
  ['Main engines', 'Tailshaft survey', 5, 'years', 'Interval depends on shaft and seal type; set by your class society.', 'SML', 'classed', 'class'],
  ['Hull & deck', 'Bottom survey (dry-dock or in-water)', 30, 'months', 'Commonly twice in five years; set by your class society.', 'SML', 'classed', 'class'],
];

export const JOBS = J.map(([system, title, every, unit, notes, sizes, equipment, regulated = ''], i) => ({
  id: `j${i}`, system, title, every, unit, notes, sizes, equipment, regulated,
}));

export const DISCLAIMER = 'Recommended by CJM Marine (general practice, not a legal requirement). Follow the manufacturer\'s manual and your flag, state or class rules where they differ.';
export const CONSULTANT_NOTE = 'Everything is labelled Recommended until a marine compliance consultant confirms it. CJM Marine is working with a consultant to confirm flag, state and class requirements.';

export const REG_NOTE = {
  flag: 'This may be set by your flag state (and the yacht code for charter yachts). Under consultant review; check your flag requirements.',
  class: 'This may be set by your class society. Under consultant review; check your class survey schedule.',
};
export const REG_TAG = { flag: 'Check flag', class: 'Check class' };

export const jobDescription = (j) => [j.notes, REG_NOTE[j.regulated], DISCLAIMER].filter(Boolean).join('\n\n');

export const everyLabel = (j) => `Every ${j.every === 1 ? '' : `${j.every} `}${j.every === 1 ? j.unit.replace(/s$/, '') : j.unit}`;

/** Size band from the vessel's length field ("45m", "120 ft", "36", ...). Numbers over 60 without a unit are read as feet. */
export function sizeBand(length) {
  const m = String(length || '').toLowerCase().match(/([\d.]+)\s*(m|meter|metre|ft|feet|')?/);
  if (!m) return '';
  let metres = Number(m[1]);
  if (m[2] === 'ft' || m[2] === 'feet' || m[2] === "'" || (!m[2] && metres > 60)) metres *= 0.3048;
  return metres < 24 ? 'S' : metres <= 40 ? 'M' : 'L';
}

/** Days in an interval, roughly (for spreading first due dates). */
export const intervalDays = (j) => j.every * ({ days: 1, weeks: 7, months: 30, years: 365 }[j.unit] || 30);

/** Department of each system (same as the Google Script), so department leads see only their jobs. */
export const SYSTEM_DEPT = {
  'Main engines': 'engine', Generators: 'engine', Electrical: 'engine', Fuel: 'engine', 'Plumbing & water': 'engine', HVAC: 'engine',
  'Steering & stabilizers': 'engine', 'Navigation & electronics': 'engine', 'AV/IT & communications': 'engine',
  'Hull & deck': 'deck', 'Tender & toys': 'deck', 'Safety equipment': 'deck', 'Dive & watersports': 'deck',
  Interior: 'interior', Galley: 'galley', Medical: 'medical', Security: 'security', Other: 'any',
};

export function jobAllowed(perms, system) {
  if (!perms || perms.depts === 'all') return true;
  const d = SYSTEM_DEPT[system] || 'any';
  return d === 'any' ? perms.depts.length > 0 : perms.depts.includes(d);
}


// ── Rules: labels, consultant review and applicability ──
export const slug = (t) => String(t).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
export const ruleIdOf = (j) => `cjm-${slug(j.title)}`;

export const BASIS = {
  recommended: { label: 'Recommended', cls: 'b-rec' },
  manufacturer: { label: 'Manufacturer', cls: 'b-oem' },
  regulatory: { label: 'Regulatory', cls: 'b-reg' },
};
export const AUTHORITIES = { cjm: 'CJM Marine', oem: 'Manufacturer', flag: 'Flag', class: 'Class', state: 'State', uscg: 'USCG', other: 'Other' };

/** Draft rule record for the consultant, from a library job. Proposed values only; nothing is approved here. */
export const toRule = (j) => ({
  id: ruleIdOf(j), title: j.title, system: j.system,
  basis: j.regulated ? 'regulatory' : 'recommended', authority: j.regulated || 'cjm',
  jurisdiction: j.regulated ? 'To be confirmed by the consultant' : '',
  source: '', sourceRef: '', edition: '',
  appliesFlags: '', appliesUsage: j.equipment === 'charter' ? 'charter,passenger' : '', classed: j.equipment === 'classed' ? 'yes' : '',
  minLength: '', maxLength: '', minGT: '', maxGT: '', minPassengers: '', maxPassengers: '', area: '',
  every: j.every, unit: j.unit, performer: '', proof: '', exceptions: '',
  notes: [j.notes, j.equipment && !['charter', 'classed'].includes(j.equipment) ? `Only when aboard: ${j.equipment}` : ''].filter(Boolean).join(' '),
});

/** Effective view of a job given the reviewed rules from the server. */
export function withRule(j, rules) {
  const r = (rules || []).find((x) => x.id === ruleIdOf(j));
  if (r && r.status === 'rejected') return null;
  if (r && r.status === 'approved') {
    return { ...j, ruleId: r.id, basis: r.basis || 'recommended', authority: r.authority || '', every: Number(r.every) || j.every, unit: r.unit || j.unit,
      title: r.title || j.title, source: r.source, sourceRef: r.sourceRef, rule: r };
  }
  return { ...j, ruleId: ruleIdOf(j), basis: 'recommended', authority: 'cjm' };
}

const metres = (len) => {
  const m = String(len || '').toLowerCase().match(/([\d.]+)\s*(m|meter|metre|ft|feet|')?/);
  if (!m) return null;
  let v = Number(m[1]);
  if (m[2] === 'ft' || m[2] === 'feet' || m[2] === "'" || (!m[2] && v > 60)) v *= 0.3048;
  return v;
};
const known = (v) => v !== '' && v !== undefined && v !== null && String(v).toLowerCase() !== 'unknown';

/** Does an approved rule apply to this boat? 'yes' | 'no' | 'unknown' (a needed detail is missing). */
export function applies(rule, v) {
  if (!rule) return 'yes';
  let unknown = false;
  const need = (val, test) => { if (!known(val)) { unknown = true; return true; } return test(val); };
  const list = (s) => String(s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (list(rule.appliesFlags).length && !need(v.flag, (f) => list(rule.appliesFlags).some((x) => f.toLowerCase().includes(x)))) return 'no';
  if (list(rule.appliesUsage).length && !need(v.usage, (u) => list(rule.appliesUsage).includes(u))) return 'no';
  const len = metres(v.loadLineLength) ?? metres(v.length);
  if (known(rule.minLength) && !need(len, (x) => x >= Number(rule.minLength))) return 'no';
  if (known(rule.maxLength) && !need(len, (x) => x <= Number(rule.maxLength))) return 'no';
  if (known(rule.minGT) && !need(v.gt, (x) => Number(x) >= Number(rule.minGT))) return 'no';
  if (known(rule.maxGT) && !need(v.gt, (x) => Number(x) <= Number(rule.maxGT))) return 'no';
  if (known(rule.minPassengers) && !need(v.maxPassengers, (x) => Number(x) >= Number(rule.minPassengers))) return 'no';
  if (known(rule.maxPassengers) && !need(v.maxPassengers, (x) => Number(x) <= Number(rule.maxPassengers))) return 'no';
  if (rule.classed === 'yes' && !need(v.classSociety, (c) => c && c !== 'none')) return 'no';
  if (rule.classed === 'no' && known(v.classSociety) && v.classSociety !== 'none') return 'no';
  return unknown ? 'unknown' : 'yes';
}

/** Boat details that decide which codes apply; the ones still missing or unknown. */
export const KEY_DETAILS = [
  ['flag', 'flag'], ['usage', 'use (private or charter)'], ['gt', 'gross tonnage'], ['buildYear', 'build year'],
  ['maxPassengers', 'passengers'], ['areaScope', 'operating area'], ['classSociety', 'class status'],
];
export const missingDetails = (v) => KEY_DETAILS.filter(([k]) => !v || !known(v[k])).map(([, label]) => label);
