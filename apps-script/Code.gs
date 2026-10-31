/**  
 * CJM MARINE — Multi-vessel maintenance platform and crew directory
 * Google Apps Script backend, bound to one Google Sheet.
 *
 * FIRST-TIME SETUP (or upgrading from the single-vessel Karyatis version):
 *   1. Paste this file into Extensions → Apps Script of your Google Sheet and save.
 *   2. Edit the four values at the top of setupPlatform() and run it once.
 *   3. Run setupBackups() once (daily Google Sheets backup, needs Drive permission).
 *   4. Deploy → Manage deployments → edit → New version (or New deployment → Web app,
 *      Execute as: Me, Who has access: Anyone). Put the /exec URL in Netlify as VITE_API_URL.
 *
 * The frontend talks to this with POST requests:
 *   fetch(URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
 *                body: JSON.stringify({ action, token, vesselId, ... }) })
 */

const SCRIPT_VERSION = '3.1 (crew suggestions and job approvals)';

// ───────────────────────── CONFIG ─────────────────────────
const CONFIG = {
  APP_NAME: 'CJM Marine',
  APP_URL: 'https://cjm-marine-1.netlify.app', // your live site address, used for links in emails
  AMBER_DAYS: 10,              // 0–10 days to due = amber, >10 = green, past due = red
  REMINDER_DAYS: [30, 10, 0],  // email milestones before the due date
  OVERDUE_REMIND_EVERY: 3,     // days between repeat emails for overdue items
  RECUR_FROM: 'performed',     // 'performed' = next due counts from date done; 'due' = from old due date
  SESSION_DAYS: 30,
  REQUEST_NOTIFY: ['support@cjm-aero.com'], // also emailed for every new account and yacht request (CJM admins always are)
  PASSWORD_MIN: 15,            // new passwords: at least this long, with letters and numbers
  LOGIN_CODE_MINUTES: 10,      // admins, captains and owners get an emailed code at every login; it works this long            // people stay logged in this long
  SETUP_LINK_DAYS: 7,          // how long an account setup link works
  DIGEST_HOUR: 7,              // hour (script time zone) the daily reminder runs
  BACKUP_HOUR: 5,              // hour the daily Google Sheets backup is emailed
  BACKUP_TO: ['command'],      // access levels that get their vessel's daily backup (CJM admins always get all)
  BACKUP_KEEP_DAYS: 30,        // older backup files are moved to the Drive trash
  BACKUP_FOLDER: 'CJM Marine backups',
  ATTACH_FOLDER: 'CJM Marine attachments', // photos and files added to notes (private to the script owner's Drive)
  REVIEW_REQUEST_DAYS: 60,     // crew can ask for a review of work done in the last N days
  REVIEW_EMAILS: true,         // email the Captain when crew ask for a review, and crew when it is answered
  CREW_RECORD_EVERY_DAYS: 7,   // each crew member gets their personal record by email this often
  CREW_RECORD_PER_RUN: 25      // max crew records sent per daily run (spreads the email load)
};

const SHEETS = {
  Users:       ['id', 'name', 'email', 'passwordHash', 'salt', 'active', 'isAdmin', 'createdAt'],
  Profiles:    ['userId', 'photo', 'headline', 'bio', 'location', 'yearsExperience', 'availability',
                'phone', 'showContact', 'languages', 'certifications', 'experience', 'updatedAt',
                'shareReviews', 'shareId', 'operatingArea'],
  Vessels:     ['id', 'name', 'type', 'length', 'homePort', 'active', 'createdAt', 'createdBy', 'deletedAt'],
  VesselRequests: ['id', 'userId', 'name', 'type', 'length', 'homePort', 'role', 'message', 'status',
                   'createdAt', 'handledBy', 'handledAt', 'vesselId', 'note'],
  // Rotation & handover
  Rotations:       ['id', 'vesselId', 'userId', 'onDays', 'offDays', 'startDate', 'reliefId', 'active', 'createdBy', 'createdAt', 'updatedAt'],
  RotationChanges: ['id', 'vesselId', 'userId', 'type', 'fromDate', 'toDate', 'note', 'status', 'requestedAt', 'handledBy', 'handledAt'],
  RotationRules:   ['vesselId', 'group', 'min'],
  Handovers:       ['id', 'vesselId', 'fromUserId', 'toUserId', 'changeDate', 'autoSummary', 'note', 'status', 'createdAt', 'sentAt', 'acceptedAt', 'acceptedBy'],
  Memberships: ['id', 'vesselId', 'userId', 'position', 'status', 'joinedAt', 'leftAt', 'invitedBy', 'access', 'departments'],
  Sessions:    ['token', 'userId', 'expiresAt'],
  Tokens:      ['token', 'userId', 'purpose', 'expiresAt', 'used'],
  Requests:    ['id', 'name', 'email', 'kind', 'position', 'vesselName', 'message', 'status',
                'createdAt', 'handledBy', 'handledAt'],
  Reviews:     ['id', 'userId', 'reviewerId', 'vesselId', 'rating', 'text', 'createdAt', 'updatedAt'],
  Tasks:       ['id', 'title', 'description', 'system', 'type', 'dueDate', 'dueTime',
                'recurring', 'intervalValue', 'intervalUnit', 'assignedTo', 'state',
                'createdBy', 'createdAt', 'lastPerformed', 'lastPerformedBy',
                'resolution', 'reminderLog', 'vesselId'],
  Completions: ['id', 'taskId', 'dueDate', 'performedDate', 'performedBy', 'timing', 'notes', 'loggedAt'],
  Notes:       ['id', 'taskId', 'userId', 'text', 'createdAt'],
  Attachments: ['id', 'vesselId', 'taskId', 'noteId', 'fileId', 'name', 'mimeType', 'size', 'thumb', 'userId', 'createdAt'],
  StoredFiles: ['id', 'data'], // staging only: file contents kept in the sheet instead of Google Drive
  TaskReviews: ['id', 'vesselId', 'taskId', 'completionId', 'userId', 'requestedAt', 'message',
                'status', 'reviewerId', 'score', 'text', 'reviewedAt', 'taskTitle', 'vesselName', 'reviewerLabel', 'reviewerName', 'workDate'],
  // Crew suggestions, unlisted work and jobs on other boats, waiting for a Captain or Owner
  WorkSubmissions: ['id', 'kind', 'vesselId', 'boatName', 'userId', 'title', 'system', 'description', 'performedDate',
                    'dueDate', 'recurring', 'intervalValue', 'intervalUnit', 'wantScore', 'contactEmail', 'contactName',
                    'token', 'tokenExpires', 'status', 'decidedBy', 'decidedLabel', 'decidedAt', 'decisionNote',
                    'score', 'reviewText', 'taskId', 'completionId', 'createdAt'],
  Audit:       ['timestamp', 'userId', 'action', 'taskId', 'details', 'vesselId']
};

// Membership.status: 'active' | 'invited' | 'left' | 'declined'
// Task.type: 'Routine' | 'Issue'.  Task.state: 'Open' | 'Completed' | 'Resolved'

// ───────────────────────── ROLES: TITLE ≠ ACCESS ─────────────────────────
// Per the CJM Marine Crew Role Reference: a job title is descriptive only. What someone can do in the
// app comes from their ACCESS LEVEL and DEPARTMENTS, which the Captain sets separately.

// Which department a maintenance system belongs to (for sign-off rights).
const DEPARTMENTS = {
  'Main engines': 'engine', 'Generators': 'engine', 'Electrical': 'engine', 'Fuel': 'engine',
  'Plumbing & water': 'engine', 'HVAC': 'engine', 'Steering & stabilizers': 'engine',
  'Navigation & electronics': 'engine', 'AV/IT & communications': 'engine',
  'Hull & deck': 'deck', 'Tender & toys': 'deck', 'Safety equipment': 'deck', 'Dive & watersports': 'deck',
  'Interior': 'interior', 'Galley': 'galley', 'Medical': 'medical', 'Security': 'security',
  'Other': 'any', '': 'any'
};
const DEPT_KEYS = ['deck', 'engine', 'interior', 'galley', 'medical', 'security'];
const DEPT_LABELS = { deck: 'Deck', engine: 'Engineering', interior: 'Interior', galley: 'Galley', medical: 'Medical', security: 'Security' };

// What each access level allows. 'member' depts = the departments set on that person's membership.
const ACCESS = {
  command:    { label: 'Command',             rank: 1, manageCrew: true,  createRoutine: true,  editAll: true,  hires: true,  depts: 'all',
                help: 'Full control of the vessel: crew and access, scheduling, editing and signing off any task, work reviews and hiring.' },
  oversight:  { label: 'Owner oversight',     rank: 2, manageCrew: true,  createRoutine: false, editAll: false, hires: true,  depts: 'none',
                help: 'Sees everything, manages crew and access, reports issues, reviews and hires crew. Does not schedule or sign off maintenance.' },
  lead:       { label: 'Department lead',     rank: 3, manageCrew: false, createRoutine: true,  editAll: false, hires: false, depts: 'member',
                help: 'Schedules, assigns, edits and signs off tasks in their departments.' },
  qualified:  { label: 'Qualified crew',      rank: 4, manageCrew: false, createRoutine: false, editAll: false, hires: false, depts: 'member',
                help: 'Signs off tasks in their departments and tasks assigned to them. Reports issues.' },
  supervised: { label: 'Supervised crew',     rank: 5, manageCrew: false, createRoutine: false, editAll: false, hires: false, depts: 'none',
                help: 'Signs off only tasks assigned to them. Reports issues.' },
  contractor: { label: 'External contractor', rank: 6, manageCrew: false, createRoutine: false, editAll: false, hires: false, depts: 'none', contractor: true,
                help: 'Sees and signs off only jobs assigned to them and records findings. Not vessel crew; no sea time.' },
  viewonly:   { label: 'View only',           rank: 7, manageCrew: false, createRoutine: false, editAll: false, hires: false, depts: 'none', viewOnly: true,
                help: 'Sees the maintenance program and adds notes. Cannot sign off or report issues.' }
};

// The 39 job titles from the Crew Role Reference, with the access a new member starts with.
// [group, title, default access, default departments, description]
const TITLE_LIST = [
  ['Ownership & Command', 'Yacht Owner', 'oversight', [], 'Owns the vessel and sets operating priorities and budgets; appoints a captain or manager; approves major expenditures. Not ordinarily operating crew.'],
  ['Ownership & Command', 'Yacht Manager (shore-based)', 'oversight', [], 'Represents the owner in administrative oversight; budgets, insurance, vendors, staffing, compliance support and refit planning with the captain.'],
  ['Ownership & Command', 'Captain / Master', 'command', [], 'Overall responsibility for safe vessel operation: crew, navigation, emergency readiness, maintenance oversight, guest operations and documentation.'],
  ['Ownership & Command', 'Staff Captain', 'command', [], 'On larger yachts, supports the master with daily operations, safety management, training and supervision of officers; may act as deputy.'],
  ['Ownership & Command', 'Chief Officer / First Officer', 'lead', ['deck'], 'Leads deck operations and watches; deck maintenance, safety equipment, drills, passage preparations and deck crew assignments.'],
  ['Ownership & Command', 'Second Officer', 'qualified', ['deck'], 'Navigation publications, charts, passage planning support, bridge watches, and assigned safety equipment and records.'],
  ['Ownership & Command', 'Third Officer', 'qualified', ['deck'], 'Supports navigational watches, safety checks, drills, deck operations and assigned documentation under senior officers.'],
  ['Deck', 'Bosun (Deck Supervisor)', 'lead', ['deck'], 'Supervises day-to-day deck work; exterior surfaces, tenders, mooring equipment, deck gear and work plans; trains deckhands.'],
  ['Deck', 'Lead Deckhand', 'qualified', ['deck'], 'Coordinates hands-on deck tasks and supports the bosun; cleaning, line handling, tender preparation and junior crew.'],
  ['Deck', 'Deckhand', 'supervised', [], 'Washdowns, polishing, line handling, lookout, tender support, equipment checks and guest water-activity setup within qualifications.'],
  ['Deck', 'Junior Deckhand', 'supervised', [], 'Routine cleaning, maintenance, stores, mooring preparations and safe deck practices under supervision.'],
  ['Deck', 'Deck Cadet / Trainee', 'supervised', [], 'Learns seamanship and vessel procedures; assists with watches and deck tasks as permitted and supervised; logs training.'],
  ['Engineering', 'Chief Engineer', 'lead', ['engine'], 'Leads technical operations; machinery and engineering safety; preventive maintenance, technical records, spares, defects and the engineering team.'],
  ['Engineering', 'Second Engineer', 'lead', ['engine'], 'Supports the chief engineer; performs and supervises machinery maintenance, troubleshooting, watchkeeping, spares and documentation.'],
  ['Engineering', 'Third Engineer', 'qualified', ['engine'], 'Assigned maintenance and engine-room rounds; monitors machinery, records readings and reports defects to senior engineers.'],
  ['Engineering', 'Electrical Technical Officer (ETO)', 'qualified', ['engine'], 'Electrical distribution, controls, alarms, automation, electronics and related technical systems within authorization.'],
  ['Engineering', 'AV/IT Officer', 'qualified', ['engine'], 'Onboard networks, communications, entertainment, AV and IT systems; user access, backups and technical support.'],
  ['Engineering', 'Engineer / Mechanic', 'qualified', ['engine'], 'Inspects, services, repairs and documents propulsion, generators, pumps, HVAC, plumbing and mechanical equipment as qualified.'],
  ['Engineering', 'Junior Engineer', 'supervised', [], 'Rounds, routine servicing, cleaning, readings, spares and work documentation under senior engineering supervision.'],
  ['Engineering', 'Engineering Cadet', 'supervised', [], 'Learns engineering procedures, safety, machinery systems, watchkeeping and supervised maintenance; keeps training records.'],
  ['Interior', 'Purser', 'qualified', ['interior'], 'Crew and guest administration, accounts, purchasing, travel logistics, inventories and records, especially on larger yachts.'],
  ['Interior', 'Chief Steward / Stewardess', 'lead', ['interior'], 'Leads interior service and housekeeping; guest service, standards, interior inventories, schedules and training.'],
  ['Interior', 'Second Steward / Stewardess', 'qualified', ['interior'], 'Assists the chief steward; supervises sections of service, housekeeping, laundry, inventories and junior staff.'],
  ['Interior', 'Third Steward / Stewardess', 'qualified', ['interior'], 'Guest service, cabin care, table service, laundry, cleaning and supply checks under interior supervision.'],
  ['Interior', 'Steward / Stewardess', 'qualified', ['interior'], 'Housekeeping, guest hospitality, meal and beverage service, laundry, provisioning support and interior maintenance.'],
  ['Interior', 'Junior Steward / Stewardess', 'supervised', [], 'Routine guest-area cleaning, laundry, setup, restocking and service duties while learning interior standards.'],
  ['Interior', 'Laundry Steward / Housekeeper', 'qualified', ['interior'], 'Linen and garment care, washing, pressing, inventories, and cabin or interior cleanliness as assigned.'],
  ['Galley', 'Executive Chef / Head Chef', 'lead', ['galley'], 'Menus, provisioning, dietary requirements, food safety, galley costs, kitchen operations and galley staff.'],
  ['Galley', 'Sous Chef', 'qualified', ['galley'], 'Assists the head chef with preparation, supervision, food safety, stock rotation and service; may lead the galley when delegated.'],
  ['Galley', 'Crew Chef', 'qualified', ['galley'], 'Plans and prepares daily crew meals; associated provisioning, dietary needs, sanitation and stock.'],
  ['Galley', 'Galley Assistant', 'supervised', [], 'Food preparation, cleaning, dishwashing, stores, hygiene and basic kitchen tasks under supervision.'],
  ['Combined & Specialist', 'Deck/Engineer', 'qualified', ['deck', 'engine'], 'Deck operations plus authorized mechanical and technical maintenance, depending on qualifications and staffing.'],
  ['Combined & Specialist', 'Deck/Steward', 'qualified', ['deck', 'interior'], 'Deck and interior duties: cleaning, hospitality, line handling and guest preparation as assigned.'],
  ['Combined & Specialist', 'Sole Engineer', 'lead', ['engine'], 'Principal onboard engineer on smaller yachts; machinery operation, maintenance planning, repairs and technical logs.'],
  ['Combined & Specialist', 'Dive Instructor / Dive Master', 'qualified', ['deck'], 'Plans and supervises diving within qualifications; inspects dive equipment, assesses conditions, supports emergency preparedness.'],
  ['Combined & Specialist', 'Watersports Instructor', 'qualified', ['deck'], 'Prepares and supervises approved water activities; checks equipment and guest readiness; follows vessel safety procedures.'],
  ['Combined & Specialist', 'Medic / Nurse', 'qualified', ['medical'], 'Clinical support within professional scope; medical supplies and records; emergency response and crew wellness.'],
  ['Combined & Specialist', 'Security Officer', 'qualified', ['security'], 'Vessel and guest security, access control, risk assessments, security drills and incident reporting under vessel policy.'],
  ['External', 'Independent Contractor / External Technician', 'contractor', [], 'Works for their own company; performs separately authorized jobs, records findings and work, and signs their own task entries. Not crew.']
];
const TITLES = {};
TITLE_LIST.forEach(t => TITLES[t[1]] = { group: t[0], access: t[2], depts: t[3], help: t[4] });

// Positions used before the Crew Role Reference: title + the exact rights they had, so nobody loses access.
const LEGACY = {
  'Owner':          { title: 'Yacht Owner', access: 'oversight', depts: [] },
  'admin':          { title: 'Captain / Master', access: 'command', depts: [] },
  'Captain':        { title: 'Captain / Master', access: 'command', depts: [] },
  'Chief Engineer': { title: 'Chief Engineer', access: 'lead', depts: ['all'] },
  'Engineer':       { title: 'Engineer / Mechanic', access: 'lead', depts: ['engine'] },
  'Bosun':          { title: 'Bosun (Deck Supervisor)', access: 'lead', depts: ['deck'] },
  'Interior':       { title: 'Steward / Stewardess', access: 'qualified', depts: ['interior', 'galley'] },
  'Deckhand':       { title: 'Deckhand', access: 'supervised', depts: [] },
  'crew':           { title: 'Deckhand', access: 'supervised', depts: [] }
};

/** Canonical job title for anything stored or sent. */
function titleOf(p) {
  p = String(p || '').trim();
  if (TITLES[p]) return p;
  if (LEGACY[p]) return LEGACY[p].title;
  const lower = p.toLowerCase();
  const hit = Object.keys(TITLES).find(t => t.toLowerCase() === lower);
  return hit || 'Deckhand';
}
const positionOf = titleOf; // older name used throughout

function cleanDepts(list) {
  const arr = Array.isArray(list) ? list : String(list || '').split(',');
  const out = arr.map(d => String(d).trim()).filter(d => d === 'all' || DEPT_KEYS.indexOf(d) !== -1);
  return out.indexOf('all') !== -1 ? ['all'] : out.filter((d, i) => out.indexOf(d) === i);
}

/** Defaults for a title (what a new member starts with). */
function defaultRole(title) {
  const t = titleOf(title);
  return { title: t, access: TITLES[t].access, depts: TITLES[t].depts.slice() };
}

/** Title, access and departments for a membership row (fills in old rows that predate access levels). */
function roleOf(m) {
  if (m.access && ACCESS[m.access]) return { title: titleOf(m.position), access: m.access, depts: cleanDepts(m.departments) };
  if (LEGACY[m.position]) { const l = LEGACY[m.position]; return { title: l.title, access: l.access, depts: l.depts.slice() }; }
  return defaultRole(m.position);
}

/** Effective permissions for a role. */
function permsFor(role) {
  const a = ACCESS[role.access] || ACCESS.viewonly;
  const depts = a.depts === 'all' ? 'all' : a.depts === 'member' ? (role.depts.indexOf('all') !== -1 ? 'all' : role.depts) : [];
  return { access: role.access, accessLabel: a.label, manageCrew: a.manageCrew, createRoutine: a.createRoutine,
           editAll: a.editAll, hires: a.hires, depts, contractor: !!a.contractor, viewOnly: !!a.viewOnly,
           canReport: !a.viewOnly };
}

function permsOfMember(m) { return permsFor(roleOf(m)); }

/** Catalog for the website: titles grouped, access levels, departments. */
function roleCatalog() {
  return {
    titles: TITLE_LIST.map(t => ({ group: t[0], title: t[1], access: t[2], depts: t[3], help: t[4] })),
    access: Object.keys(ACCESS).map(k => ({ key: k, label: ACCESS[k].label, help: ACCESS[k].help, usesDepts: ACCESS[k].depts === 'member' })),
    departments: DEPT_KEYS.map(k => ({ key: k, label: DEPT_LABELS[k] }))
  };
}

// ───────────────────────── ONE-TIME SETUP ─────────────────────────
/**
 * Edit these values and run once. Safe to run again: it never duplicates data.
 * - Creates all tabs.
 * - If this sheet holds the old single-vessel Karyatis data, moves it into a vessel
 *   named VESSEL_NAME. Existing logins and passwords keep working.
 * - Makes ADMIN_EMAIL the CJM platform admin (creates the account with ADMIN_PASSWORD if new).
 * Clear the password from the code after running.
 */
function setupPlatform() {
  const ADMIN_NAME = 'Jonathan Carballo';
  const ADMIN_EMAIL = 'you@example.com';
  const ADMIN_PASSWORD = 'change-me-now';    // only used if this email has no account yet
  const VESSEL_NAME = 'Karyatis';             // name for the vessel that old data moves into

  if (ADMIN_EMAIL === 'you@example.com') throw new Error('Edit ADMIN_EMAIL in setupPlatform() first');
  createSheets();
  const log = [];

  const ss = SpreadsheetApp.getActive();
  const oldCrew = ss.getSheetByName('Crew');
  if (oldCrew && readTable('Users').length === 0) {
    const crew = readSheetRows(oldCrew);
    const vesselId = newId('V');
    insert('Vessels', { id: vesselId, name: VESSEL_NAME, type: 'Motor yacht', length: '', homePort: '',
                        active: 'TRUE', createdAt: nowIso(), createdBy: '' });
    crew.forEach(c => {
      const removed = c.active === 'REMOVED';
      insert('Users', { id: c.id, name: c.name, email: String(c.email).toLowerCase(),
        passwordHash: c.passwordHash, salt: c.salt, active: removed ? 'FALSE' : (isTrue(c.active) ? 'TRUE' : 'FALSE'),
        isAdmin: 'FALSE', createdAt: c.createdAt || nowIso() });
      const role = roleOf({ position: c.role });
      insert('Memberships', { id: newId('M'), vesselId, userId: c.id, position: role.title,
        status: removed || !isTrue(c.active) ? 'left' : 'active', joinedAt: c.createdAt || nowIso(),
        leftAt: removed ? nowIso() : '', invitedBy: '', access: role.access, departments: role.depts.join(',') });
    });
    fillBlankColumn('Tasks', 'vesselId', vesselId);
    fillBlankColumn('Audit', 'vesselId', vesselId);
    oldCrew.setName('Crew (old, not used)');
    log.push('Moved ' + crew.length + ' crew and all tasks into vessel "' + VESSEL_NAME + '"');
  }

  const email = ADMIN_EMAIL.toLowerCase().trim();
  const users = readTable('Users');
  const admin = users.find(u => u.email === email);
  if (admin) {
    admin.isAdmin = 'TRUE'; admin.active = 'TRUE';
    update('Users', admin._row, admin);
    log.push(email + ' is now platform admin');
  } else {
    const salt = Utilities.getUuid();
    insert('Users', { id: newId('U'), name: ADMIN_NAME, email, passwordHash: hash(ADMIN_PASSWORD, salt), salt,
                      active: 'TRUE', isAdmin: 'TRUE', createdAt: nowIso() });
    log.push('Created platform admin ' + email);
  }
  installDailyTrigger();
  Logger.log(log.join('\n'));
  return log;
}

function createSheets() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(name => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange('A:Z').setNumberFormat('@');
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
}

function fillBlankColumn(name, column, value) {
  readTable(name).forEach(r => {
    if (!r[column]) { r[column] = value; update(name, r._row, r); }
  });
}

function installDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => ['dailyReminders', 'dailyBackups'].indexOf(t.getHandlerFunction()) !== -1)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyReminders').timeBased().everyDays(1).atHour(CONFIG.DIGEST_HOUR).create();
  ScriptApp.newTrigger('dailyBackups').timeBased().everyDays(1).atHour(CONFIG.BACKUP_HOUR).create();
}

// ───────────────────────── API ─────────────────────────
function doGet() {
  return json({ ok: true, app: CONFIG.APP_NAME, version: SCRIPT_VERSION });
}

let REQUEST_ORIGIN = ''; // the website's own address, sent with each request; used only when CONFIG.APP_URL is blank

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return json({ ok: false, error: 'Bad request' }); }
  REQUEST_ORIGIN = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(String(req.origin || '')) ? String(req.origin) : '';

  try {
    const pub = {
      version:        () => ({ ok: true, version: SCRIPT_VERSION }),
      login:          () => withLock(() => login(req.email, req.password, req.vesselId)),
      verifyLoginCode: () => withLock(() => verifyLoginCode(req.challenge, req.code)),
      resendLoginCode: () => resendLoginCode(req.challenge),
      requestReset:   () => requestReset(req.email),
      confirmReset:   () => withLock(() => confirmReset(req.email, req.code, req.newPassword)),
      requestAccount: () => withLock(() => requestAccount(req.request || {})),
      getSetup:       () => getSetup(req.setupToken),
      completeSetup:  () => withLock(() => completeSetup(req.setupToken, req.newPassword)),
      publicReviews:  () => publicReviews(req.shareId),
      getWorkReview:  () => getWorkReview(req.reviewToken),
      answerWorkReview: () => withLock(() => answerWorkReview(req.reviewToken, req.answer || {})),
      workReviewFile: () => workReviewFile(req.reviewToken, req.id),
      catalog:        () => ({ ok: true, catalog: roleCatalog() })
    };
    if (pub[req.action]) return json(pub[req.action]());

    const user = auth(req.token);
    const V = () => vesselCtx(user, req.vesselId);
    const handlers = {
      logout:         () => withLock(() => logout(req.token)),
      bootstrap:      () => bootstrap(user, req.vesselId),
      changePassword: () => withLock(() => changePassword(user, req.oldPassword, req.newPassword)),
      respondInvite:  () => withLock(() => respondInvite(user, req.membershipId, req.accept)),

      // maintenance (vessel)
      listTasks:      () => ({ ok: true, tasks: listTasks(V(), user) }),
      calendar:       () => calendar(V(), req.from, req.to),
      getTask:        () => getTask(V(), user, req.id),
      createTask:     () => withLock(() => createTask(V(), user, req.task || {})),
      updateTask:     () => withLock(() => updateTask(V(), user, req.id, req.task || {})),
      completeTask:   () => withLock(() => completeTask(V(), user, req)),
      addNote:        () => withLock(() => addNote(V(), user, req.taskId, req.text, req.files)),
      getAttachment:  () => getAttachment(V(), user, req.id),
      requestTaskReview: () => withLock(() => requestTaskReview(V(), user, req.completionId, req.message, true)),
      listTaskReviews:   () => listTaskReviews(V(), user),
      submitTaskReview:  () => withLock(() => submitTaskReview(V(), user, req.reviewId, req.score, req.text)),
      skipTaskReview:    () => withLock(() => skipTaskReview(V(), user, req.reviewId)),
      emailMyRecord:     () => emailMyRecord(user),

      // crew suggestions, unlisted work and jobs on other boats
      submitWork:     () => withLock(() => submitWork(user, req.work || {})),
      myWork:         () => ({ ok: true, submissions: mySubmissions(user) }),
      cancelWork:     () => withLock(() => cancelWork(user, req.id)),
      decideWork:     () => withLock(() => decideWork(V(), user, req.id, req.decision || {})),
      getWorkFile:    () => getWorkFile(user, req.id),

      // vessel crew
      listCrew:       () => ({ ok: true, crew: listCrew(V()) }),
      inviteMember:   () => withLock(() => inviteMember(V(), user, req.member || {})),
      setPosition:    () => withLock(() => setRole(V(), user, req.userId, defaultRole(req.position))),
      setRole:        () => withLock(() => setRole(V(), user, req.userId, req.role || {})),
      removeMember:   () => withLock(() => removeMember(V(), user, req.userId)),
      resendSetup:    () => withLock(() => resendSetup(V(), user, req.userId)),
      cancelInvite:   () => withLock(() => cancelInvite(V(), user, req.userId)),
      listRequests:   () => listRequests(user, req.vesselId),
      approveRequest: () => withLock(() => approveRequest(user, req.id, req.vesselId, req.position, req.role)),
      declineRequest: () => withLock(() => declineRequest(user, req.id)),

      // profiles, directory, reviews
      getMyProfile:   () => getProfile(user, user.id),
      saveProfile:    () => withLock(() => saveProfile(user, req.profile || {})),
      getProfile:     () => getProfile(user, req.userId),
      searchCrew:     () => searchCrew(user, req),
      saveReview:     () => withLock(() => saveReview(user, req.userId, req.rating, req.text)),
      deleteReview:   () => withLock(() => deleteReview(user, req.id)),

      // platform admin
      adminOverview:  () => { requireAdmin(user); return adminOverview(); },
      createVessel:   () => { requireAdmin(user); return withLock(() => createVessel(user, req.vessel || {})); },
      updateVessel:   () => { requireAdmin(user); return withLock(() => updateVessel(user, req.id, req.vessel || {})); },
      setUserActive:  () => { requireAdmin(user); return withLock(() => setUserActive(user, req.userId, req.active)); },
      deleteUser:     () => { requireAdmin(user); return withLock(() => deleteUser(user, req.userId, req.confirmEmail)); },
      deleteVessel:   () => { requireAdmin(user); return withLock(() => deleteVessel(user, req.id, req.confirmName)); },
      exportVessel:   () => { requireAdmin(user); return exportVessel(user, req.id, req.withFiles !== false); },
      importVessel:   () => { requireAdmin(user); return withLock(() => importVessel(user, req.package)); },

      // rotation & handover
      rotationView:          () => rotationView(V(), user, req),
      saveRotation:          () => withLock(() => saveRotation(V(), user, req.rotation || {})),
      setManning:            () => withLock(() => setManning(V(), user, req.rules || {})),
      requestRotationChange: () => withLock(() => requestRotationChange(V(), user, req.change || {})),
      decideRotationChange:  () => withLock(() => decideRotationChange(V(), user, req.id, !!req.approve)),
      startHandover:         () => withLock(() => startHandover(V(), user, req)),
      sendHandover:          () => withLock(() => sendHandover(V(), user, req)),
      acceptHandover:        () => withLock(() => acceptHandover(V(), user, req.id)),
      sendBackupNow:  () => { requireAdmin(user); return sendBackupNow(user, req.backupVesselId); },

      // new yacht requests from owners and captains
      requestVessel:        () => withLock(() => requestVessel(user, req.vessel || {})),
      listVesselRequests:   () => listVesselRequests(user),
      cancelVesselRequest:  () => withLock(() => cancelVesselRequest(user, req.id)),
      approveVesselRequest: () => { requireAdmin(user); return withLock(() => approveVesselRequest(user, req.id, req.vessel || {})); },
      declineVesselRequest: () => { requireAdmin(user); return withLock(() => declineVesselRequest(user, req.id, req.note)); }
    };
    const fn = handlers[req.action];
    if (!fn) return json({ ok: false, error: 'Unknown action "' + req.action + '". The Google Script is out of date: in Apps Script, Deploy → Manage deployments → Edit → New version.' });
    return json(fn());
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

// ───────────────────────── AUTH ─────────────────────────
function login(email, password, vesselId) {
  email = String(email || '').toLowerCase().trim();
  const user = readTable('Users').find(u => u.email === email && isTrue(u.active));
  if (!user || !user.passwordHash || hash(password || '', user.salt) !== user.passwordHash) {
    return { ok: false, error: 'Invalid email or password' };
  }
  if (needsLoginCode(user)) return sendLoginCode(user, vesselId, Utilities.getUuid().replace(/-/g, ''));
  return finishLogin(user, vesselId);
}

function finishLogin(user, vesselId) {
  const token = startSession(user);
  return Object.assign({ token }, bootstrap(user, vesselId));
}

// ───────────────────────── LOGIN CODE (two-step login) ─────────────────────────
/** CJM admins, captains (Command) and owners (Owner oversight) confirm every login with an emailed code. */
function needsLoginCode(user) {
  if (isDemoEmail(user.email)) return false; // demo/test accounts cannot receive email
  if (isTrue(user.isAdmin)) return true;
  return readTable('Memberships').some(m => m.userId === user.id && m.status === 'active' &&
                                             ['command', 'oversight'].indexOf(roleOf(m).access) !== -1);
}

function maskEmail(e) {
  const [n, d] = String(e).split('@');
  return (n.length <= 2 ? n.charAt(0) : n.slice(0, 2)) + '•••@' + d;
}

function sendLoginCode(user, vesselId, challenge) {
  const cache = CacheService.getScriptCache();
  const sent = Number(cache.get('lcn_' + user.id) || 0);
  if (sent >= 5) return { ok: false, error: 'Too many login codes requested. Wait 15 minutes and try again.' };
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const ttl = CONFIG.LOGIN_CODE_MINUTES * 60;
  const mailed = sendMail(user.email, CONFIG.APP_NAME + ' login code: ' + code,
    '<p>Your ' + esc(CONFIG.APP_NAME) + ' login code is:</p>' +
    '<p style="font-size:28px;font-weight:bold;letter-spacing:4px">' + code + '</p>' +
    '<p style="color:#666">It works for ' + CONFIG.LOGIN_CODE_MINUTES + ' minutes. If you did not just try to log in, ' +
    'someone may have your password: change it in My profile → Password.</p>');
  if (!mailed) return { ok: false, error: 'We could not email your login code. Try again in a minute.' };
  cache.put('lcn_' + user.id, String(sent + 1), 900);
  cache.put('lc_' + challenge, JSON.stringify({ userId: user.id, hash: hash(code, user.salt), attempts: 0, vesselId: vesselId || '',
                                               sentAt: Date.now() }), ttl);
  return { ok: true, needCode: true, challenge, sentTo: maskEmail(user.email), minutes: CONFIG.LOGIN_CODE_MINUTES };
}

function verifyLoginCode(challenge, code) {
  const cache = CacheService.getScriptCache();
  const key = 'lc_' + String(challenge || '');
  const raw = cache.get(key);
  if (!raw) throw new Error('This login code has expired. Log in again to get a new one.');
  const rec = JSON.parse(raw);
  const user = readTable('Users').find(u => u.id === rec.userId && isTrue(u.active));
  if (!user) throw new Error('Account inactive');
  if (hash(String(code || '').replace(/\D/g, ''), user.salt) !== rec.hash) {
    rec.attempts++;
    audit(user.id, 'loginCodeFailed', '', 'Attempt ' + rec.attempts, '');
    if (rec.attempts >= 5) { cache.remove(key); throw new Error('Too many wrong codes. Log in again to get a new one.'); }
    cache.put(key, JSON.stringify(rec), CONFIG.LOGIN_CODE_MINUTES * 60);
    throw new Error('That code is not right. ' + (5 - rec.attempts) + ' tries left.');
  }
  cache.remove(key);
  audit(user.id, 'login', '', 'Login confirmed with emailed code', '');
  return finishLogin(user, rec.vesselId);
}

function resendLoginCode(challenge) {
  const cache = CacheService.getScriptCache();
  const raw = cache.get('lc_' + String(challenge || ''));
  if (!raw) throw new Error('This login has expired. Log in again.');
  const rec = JSON.parse(raw);
  if (Date.now() - rec.sentAt < 30000) throw new Error('Wait 30 seconds before asking for a new code.');
  const user = readTable('Users').find(u => u.id === rec.userId && isTrue(u.active));
  if (!user) throw new Error('Account inactive');
  return sendLoginCode(user, rec.vesselId, challenge);
}

/** New passwords: at least PASSWORD_MIN characters with letters and numbers. Existing passwords keep working. */
function checkPassword(pw) {
  pw = String(pw || '');
  if (pw.length < CONFIG.PASSWORD_MIN || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
    throw new Error('Password must be at least ' + CONFIG.PASSWORD_MIN + ' characters and include both letters and numbers.');
  }
  if (pw.length > 200) throw new Error('Password is too long');
}

function startSession(user) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  const expires = new Date(Date.now() + CONFIG.SESSION_DAYS * 86400000).toISOString();
  insert('Sessions', { token, userId: user.id, expiresAt: expires });
  CacheService.getScriptCache().put('s_' + token, JSON.stringify({ userId: user.id, expiresAt: expires }), 21600);
  return token;
}

function auth(token) {
  if (!token) throw new Error('Not logged in');
  const cache = CacheService.getScriptCache();
  let s = null;
  const hit = cache.get('s_' + token);
  if (hit) s = JSON.parse(hit);
  else {
    s = readTable('Sessions').find(x => x.token === token);
    if (s) cache.put('s_' + token, JSON.stringify({ userId: s.userId, expiresAt: s.expiresAt }), 21600);
  }
  if (!s || new Date(s.expiresAt) < new Date()) throw new Error('Session expired');
  const user = readTable('Users').find(u => u.id === s.userId && isTrue(u.active));
  if (!user) throw new Error('Account inactive');
  return user;
}

function logout(token) {
  CacheService.getScriptCache().remove('s_' + token);
  const s = readTable('Sessions').find(x => x.token === token);
  if (s) { sheet('Sessions').deleteRow(s._row); delete TABLE_CACHE.Sessions; }
  return { ok: true };
}

function purgeExpiredSessions() {
  const now = new Date();
  readTable('Sessions').filter(s => new Date(s.expiresAt) < now)
    .sort((a, b) => b._row - a._row)
    .forEach(s => sheet('Sessions').deleteRow(s._row));
  delete TABLE_CACHE.Sessions;
}

function endSessionsFor(userId) {
  const cache = CacheService.getScriptCache();
  readTable('Sessions').filter(s => s.userId === userId).forEach(s => cache.remove('s_' + s.token));
}

function changePassword(user, oldPassword, newPassword) {
  if (user.passwordHash && hash(oldPassword || '', user.salt) !== user.passwordHash) throw new Error('Current password is wrong');
  setPassword(user, newPassword);
  audit(user.id, 'changePassword', '', '', '');
  return { ok: true };
}

function setPassword(user, newPassword) {
  checkPassword(newPassword);
  user.salt = Utilities.getUuid();
  user.passwordHash = hash(newPassword, user.salt);
  update('Users', user._row, user);
}

function requireAdmin(user) {
  if (!isTrue(user.isAdmin)) throw new Error('CJM admin only');
}

function hash(password, salt) {
  let h = salt + password;
  for (let i = 0; i < 50; i++) {
    h = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset.UTF_8));
  }
  return h;
}

// ───────────────────────── FORGOT PASSWORD ─────────────────────────
function requestReset(email) {
  email = String(email || '').toLowerCase().trim();
  const generic = { ok: true, message: 'If that email has an account, a reset code is on its way.' };
  if (!email) return generic;
  const cache = CacheService.getScriptCache();
  const tries = Number(cache.get('rr_' + email) || 0);
  if (tries >= 3) return { ok: false, error: 'Too many reset requests. Try again in 15 minutes.' };
  cache.put('rr_' + email, String(tries + 1), 900);
  const user = readTable('Users').find(u => u.email === email && isTrue(u.active));
  if (!user) return generic;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('rc_' + email, JSON.stringify({ hash: hash(code, user.salt), attempts: 0 }), 900);
  sendMail(user.email, CONFIG.APP_NAME + ' password reset code',
    '<p>Your ' + CONFIG.APP_NAME + ' reset code is:</p>' +
    '<p style="font-size:28px;font-weight:bold;letter-spacing:4px">' + code + '</p>' +
    '<p style="color:#666">It expires in 15 minutes. If you did not ask for this, ignore this email.</p>');
  return generic;
}

function confirmReset(email, code, newPassword) {
  email = String(email || '').toLowerCase().trim();
  const cache = CacheService.getScriptCache();
  const raw = cache.get('rc_' + email);
  const user = readTable('Users').find(u => u.email === email && isTrue(u.active));
  if (!raw || !user) throw new Error('Code expired or not valid. Request a new one.');
  const rec = JSON.parse(raw);
  if (rec.hash !== hash(String(code || '').trim(), user.salt)) {
    rec.attempts++;
    if (rec.attempts >= 5) cache.remove('rc_' + email); else cache.put('rc_' + email, JSON.stringify(rec), 900);
    throw new Error('That code is not right.');
  }
  setPassword(user, newPassword);
  cache.remove('rc_' + email);
  audit(user.id, 'resetPasswordByEmail', '', '', '');
  return finishLogin(user, ''); // the emailed reset code already proved the email address
}

// ───────────────────────── ACCOUNT SETUP LINKS ─────────────────────────
function makeSetupLink(userId) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const expires = new Date(Date.now() + CONFIG.SETUP_LINK_DAYS * 86400000).toISOString();
  insert('Tokens', { token, userId, purpose: 'setup', expiresAt: expires, used: 'FALSE' });
  return siteUrl() + '/?setup=' + token;
}

function findSetupToken(token) {
  const t = readTable('Tokens').find(x => x.token === String(token || '') && x.purpose === 'setup');
  if (!t || isTrue(t.used) || new Date(t.expiresAt) < new Date()) throw new Error('This setup link has expired. Ask your captain to send a new one, or use Forgot password.');
  const user = readTable('Users').find(u => u.id === t.userId && isTrue(u.active));
  if (!user) throw new Error('This account is no longer active.');
  return { t, user };
}

function getSetup(token) {
  const { user } = findSetupToken(token);
  return { ok: true, name: user.name, email: user.email };
}

function completeSetup(token, newPassword) {
  const { t, user } = findSetupToken(token);
  setPassword(user, newPassword);
  t.used = 'TRUE';
  update('Tokens', t._row, t);
  audit(user.id, 'accountSetup', '', '', '');
  return finishLogin(user, ''); // the emailed setup link already proved the email address
}

// ───────────────────────── BOOTSTRAP ─────────────────────────
function bootstrap(user, vesselId) {
  const vessels = readTable('Vessels').filter(v => isTrue(v.active));
  const vName = {};
  vessels.forEach(v => vName[v.id] = v.name);
  const mine = readTable('Memberships').filter(m => m.userId === user.id && vName[m.vesselId]);
  const memberships = mine.filter(m => m.status === 'active')
    .map(m => ({ membershipId: m.id, vesselId: m.vesselId, vesselName: vName[m.vesselId], position: titleOf(m.position),
                 accessLabel: permsOfMember(m).accessLabel }));
  const invites = mine.filter(m => m.status === 'invited').map(m => {
    const by = readTable('Users').find(u => u.id === m.invitedBy);
    return { membershipId: m.id, vesselId: m.vesselId, vesselName: vName[m.vesselId],
             position: titleOf(m.position), accessLabel: permsOfMember(m).accessLabel, invitedBy: by ? by.name : '' };
  });

  const out = {
    ok: true,
    user: publicUser(user),
    memberships,
    invites,
    vessels: isTrue(user.isAdmin) ? vessels.map(v => ({ vesselId: v.id, vesselName: v.name })) : undefined,
    pendingRequests: countPendingRequests(user),
    canRequestVessel: canRequestVessel(user),
    catalog: roleCatalog()
  };

  let pick = vesselId;
  if (!pick && memberships.length === 1) pick = memberships[0].vesselId;
  if (pick) {
    try {
      const c = vesselCtx(user, pick);
      out.vessel = { id: c.vessel.id, name: c.vessel.name, type: c.vessel.type, length: c.vessel.length, homePort: c.vessel.homePort };
      out.position = c.position;
      out.perms = c.perms;
      out.tasks = listTasks(c, user);
      out.crew = listCrew(c);
      out.vesselRequests = c.perms.manageCrew ? requestsVisibleTo(user, c.vessel.id).length : 0;
      out.canReviewWork = isVesselReviewer(c.vessel.id, user.id);
      out.pendingTaskReviews = out.canReviewWork ? pendingReviewsFor(c.vessel.id, user.id).length + pendingWorkFor(c.vessel.id, user.id).length : 0;
      out.canSubmitWork = !!c.membership && !c.perms.viewOnly;
    } catch (e) { /* not a member any more: frontend shows the vessel picker */ }
  }
  return out;
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, isAdmin: isTrue(u.isAdmin), canSearch: canSearch(u) };
}

// ───────────────────────── VESSEL CONTEXT ─────────────────────────
function vesselCtx(user, vesselId) {
  if (!vesselId) throw new Error('Choose a vessel first');
  const vessel = readTable('Vessels').find(v => v.id === vesselId && isTrue(v.active));
  if (!vessel) throw new Error('Vessel not found');
  const m = readTable('Memberships').find(x => x.vesselId === vesselId && x.userId === user.id && x.status === 'active');
  if (!m && !isTrue(user.isAdmin)) throw new Error('You are not on this vessel');
  const role = m ? roleOf(m) : { title: 'CJM admin', access: 'command', depts: [] }; // CJM admin acts with Command rights
  return { vessel, membership: m || null, position: role.title, role, perms: permsFor(role),
           isAdmin: isTrue(user.isAdmin), userId: user.id };
}

function inMyDept(c, task) {
  const d = DEPARTMENTS[task.system] || 'any';
  if (c.perms.depts === 'all') return true;
  if (d === 'any') return c.perms.depts.length > 0;
  return c.perms.depts.indexOf(d) !== -1;
}

function canSignOff(c, user, task) {
  if (c.perms.viewOnly) return false;
  return task.state === 'Open' && (task.assignedTo === user.id || inMyDept(c, task));
}

function canEdit(c, user, task) {
  return c.perms.editAll || task.createdBy === user.id || (c.perms.createRoutine && inMyDept(c, task));
}

function canSearch(user) {
  if (isTrue(user.isAdmin)) return true;
  return readTable('Memberships').some(m => m.userId === user.id && m.status === 'active' && permsOfMember(m).hires);
}

// ───────────────────────── VESSEL CREW ─────────────────────────
function listCrew(c) {
  const users = {};
  readTable('Users').forEach(u => users[u.id] = u);
  const titleOrder = TITLE_LIST.map(t => t[1]);
  return readTable('Memberships')
    .filter(m => m.vesselId === c.vessel.id && (m.status === 'active' || m.status === 'invited') && users[m.userId])
    .filter(m => !c.perms.contractor || m.userId === c.userId || permsOfMember(m).manageCrew)
    .map(m => {
      const u = users[m.userId], role = roleOf(m), pr = permsFor(role);
      return { id: u.id, name: u.name, email: c.perms.contractor ? '' : u.email, position: role.title, title: role.title,
               access: role.access, accessLabel: pr.accessLabel, departments: role.depts, status: m.status,
               joinedAt: m.joinedAt, active: isTrue(u.active), needsSetup: !u.passwordHash };
    })
    .sort((a, b) => (ACCESS[a.access].rank - ACCESS[b.access].rank) || (titleOrder.indexOf(a.title) - titleOrder.indexOf(b.title)));
}

function requireManager(c) {
  if (!c.perms.manageCrew) throw new Error('Only the Captain or Owner can manage crew');
}

/** Builds a full role from what the Captain chose; title alone never decides access. */
function resolveRole(input, fallbackTitle) {
  input = input || {};
  const title = titleOf(input.title || input.position || fallbackTitle);
  const base = defaultRole(title);
  const access = ACCESS[input.access] ? input.access : base.access;
  const depts = input.departments !== undefined ? cleanDepts(input.departments) : (input.access && input.access !== base.access ? [] : base.depts);
  return { title, access, depts };
}

function canGrant(c, role) {
  if (!ACCESS[role.access]) throw new Error('Unknown access level');
  if (role.access === 'oversight' && !(c.isAdmin || c.perms.access === 'oversight')) {
    throw new Error('Only an Owner or manager with Owner oversight can grant Owner oversight');
  }
  if (role.access === 'command' && !(c.isAdmin || c.perms.access === 'oversight' || c.perms.access === 'command')) {
    throw new Error('Only Command or Owner oversight can grant Command access');
  }
}

function activeMembership(vesselId, userId) {
  return readTable('Memberships').find(m => m.vesselId === vesselId && m.userId === userId &&
    (m.status === 'active' || m.status === 'invited'));
}

function otherManagers(vesselId, exceptUserId) {
  return readTable('Memberships').filter(m => m.vesselId === vesselId && m.status === 'active' &&
    m.userId !== exceptUserId && permsOfMember(m).manageCrew).length;
}

/**
 * Adds someone to a vessel by email.
 * Existing account → invitation they accept after logging in (keeps their profile and reviews).
 * New person → account created and a setup link returned (and emailed when possible).
 */
function addToVessel(byUser, vessel, email, name, role) {
  const position = role ? role.title : '';
  const roleCols = role ? { access: role.access, departments: role.depts.join(',') } : {};
  email = String(email || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email');
  let user = readTable('Users').find(u => u.email === email);
  if (user) {
    if (!isTrue(user.active)) throw new Error('That account is deactivated. Ask CJM to reactivate it.');
    const existing = activeMembership(vessel.id, user.id);
    if (existing) throw new Error(user.name + (existing.status === 'invited' ? ' already has an invitation' : ' is already on this vessel'));
    if (!user.passwordHash) {
      // account exists but was never set up: add directly and send a fresh setup link
      insert('Memberships', Object.assign({ id: newId('M'), vesselId: vessel.id, userId: user.id, position, status: 'active',
                              joinedAt: nowIso(), leftAt: '', invitedBy: byUser.id }, roleCols));
      const link = makeSetupLink(user.id);
      const emailed = mailSetup(user, vessel, position, byUser, link);
      return { ok: true, status: 'created', name: user.name, email: user.email, setupLink: link, emailed };
    }
    insert('Memberships', Object.assign({ id: newId('M'), vesselId: vessel.id, userId: user.id, position, status: 'invited',
                            joinedAt: '', leftAt: '', invitedBy: byUser.id }, roleCols));
    const emailed = sendMail(user.email, 'Invitation to join ' + vessel.name,
      '<p>' + esc(byUser.name) + ' invited you to join <b>' + esc(vessel.name) + '</b> as <b>' + esc(position) + '</b>.</p>' +
      '<p>Log in to ' + esc(CONFIG.APP_NAME) + ' to accept. Your profile and reviews come with you.</p>' + appLink());
    return { ok: true, status: 'invited', name: user.name, emailed };
  }
  if (!name || !String(name).trim()) throw new Error('Enter their name. This email does not have an account yet.');
  user = { id: newId('U'), name: String(name).trim(), email, passwordHash: '', salt: Utilities.getUuid(),
           active: 'TRUE', isAdmin: 'FALSE', createdAt: nowIso() };
  insert('Users', user);
  if (vessel) {
    insert('Memberships', Object.assign({ id: newId('M'), vesselId: vessel.id, userId: user.id, position, status: 'active',
                            joinedAt: nowIso(), leftAt: '', invitedBy: byUser.id }, roleCols));
  }
  const link = makeSetupLink(user.id);
  const emailed = mailSetup(user, vessel, position, byUser, link);
  return { ok: true, status: 'created', name: user.name, email: user.email, setupLink: link, emailed };
}

/** Emails the sign-in (set password) link. Returns false if there is no full link to send or the email failed. */
function mailSetup(user, vessel, position, byUser, link) {
  if (!/^https?:\/\//.test(link)) return false; // no site address known: the screen shows the link to pass on instead
  const where = vessel ? ' on <b>' + esc(vessel.name) + '</b> as <b>' + esc(position) + '</b>' : '';
  return sendMail(user.email, 'Your ' + CONFIG.APP_NAME + ' account: set your password',
    '<p>Hello ' + esc(user.name) + ',</p>' +
    '<p>' + esc(byUser.name) + ' set up a ' + esc(CONFIG.APP_NAME) + ' account for you' + where + '.</p>' +
    '<p><a href="' + link + '" style="display:inline-block;background:#12324a;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:16px">Set your password</a></p>' +
    '<p>If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">' + esc(link) + '</span></p>' +
    '<p style="color:#666">Your login email is ' + esc(user.email) + '. This link works for ' + CONFIG.SETUP_LINK_DAYS + ' days and can be used once. ' +
    'After that, use Forgot password on the login page.</p>');
}

function inviteMember(c, user, m) {
  requireManager(c);
  const role = resolveRole(m.role || m, 'Deckhand');
  canGrant(c, role);
  const r = addToVessel(user, c.vessel, m.email, m.name, role);
  audit(user.id, 'inviteMember', '', r.name + ' as ' + role.title + ', ' + ACCESS[role.access].label + ' (' + r.status + ')', c.vessel.id);
  return r;
}

function setRole(c, user, userId, input) {
  requireManager(c);
  const m = activeMembership(c.vessel.id, userId);
  if (!m) throw new Error('Crew member not found');
  const old = roleOf(m);
  const role = resolveRole(Object.assign({ title: old.title }, input), old.title);
  if (input.access === undefined && input.departments === undefined && input.title && input.title !== old.title) {
    // changing only the title never changes access
    role.access = old.access; role.depts = old.depts;
  }
  if (old.access === 'oversight' && !(c.isAdmin || c.perms.access === 'oversight')) throw new Error('Only an Owner can change Owner oversight');
  if (role.access !== old.access) canGrant(c, role);
  if (m.status === 'active' && ACCESS[old.access].manageCrew && !ACCESS[role.access].manageCrew && otherManagers(c.vessel.id, userId) === 0) {
    throw new Error('Each vessel needs at least one person with Command or Owner oversight');
  }
  if (userId === user.id && ACCESS[old.access].manageCrew && !ACCESS[role.access].manageCrew) throw new Error('You cannot remove your own Command access');
  m.position = role.title; m.access = role.access; m.departments = role.depts.join(',');
  update('Memberships', m._row, m);
  audit(user.id, 'setRole', '', userName(userId) + ': ' + old.title + ' / ' + ACCESS[old.access].label + ' → ' +
    role.title + ' / ' + ACCESS[role.access].label + (role.depts.length ? ' (' + role.depts.join(', ') + ')' : ''), c.vessel.id);
  return { ok: true };
}

function removeMember(c, user, userId) {
  requireManager(c);
  if (userId === user.id) throw new Error('You cannot remove yourself');
  const m = activeMembership(c.vessel.id, userId);
  if (!m) throw new Error('Crew member not found');
  const rp = permsOfMember(m);
  if (rp.access === 'oversight' && !(c.isAdmin || c.perms.access === 'oversight')) throw new Error('Only an Owner can remove an Owner');
  if (m.status === 'active' && rp.manageCrew && otherManagers(c.vessel.id, userId) === 0) {
    throw new Error('Each vessel needs at least one person with Command or Owner oversight');
  }
  m.status = m.status === 'invited' ? 'declined' : 'left';
  m.leftAt = nowIso();
  update('Memberships', m._row, m);
  readTable('Tasks').filter(t => t.vesselId === c.vessel.id && t.assignedTo === userId && t.state === 'Open')
    .forEach(t => { t.assignedTo = ''; update('Tasks', t._row, t); });
  audit(user.id, 'removeMember', '', userName(userId), c.vessel.id);
  return { ok: true };
}

function cancelInvite(c, user, userId) {
  return removeMember(c, user, userId);
}

function resendSetup(c, user, userId) {
  requireManager(c);
  const m = activeMembership(c.vessel.id, userId);
  const u = readTable('Users').find(x => x.id === userId);
  if (!m || !u) throw new Error('Crew member not found');
  if (u.passwordHash) throw new Error(u.name + ' has already set up their account');
  const link = makeSetupLink(u.id);
  const emailed = mailSetup(u, c.vessel, titleOf(m.position), user, link);
  return { ok: true, setupLink: link, email: u.email, emailed };
}

function respondInvite(user, membershipId, accept) {
  const m = readTable('Memberships').find(x => x.id === membershipId && x.userId === user.id && x.status === 'invited');
  if (!m) throw new Error('Invitation not found');
  m.status = accept ? 'active' : 'declined';
  m.joinedAt = accept ? nowIso() : '';
  update('Memberships', m._row, m);
  audit(user.id, accept ? 'acceptInvite' : 'declineInvite', '', positionOf(m.position), m.vesselId);
  return bootstrap(user, accept ? m.vesselId : '');
}

function userName(id) {
  const u = readTable('Users').find(x => x.id === id);
  return u ? u.name : id;
}

// ───────────────────────── ACCOUNT REQUESTS ─────────────────────────
const REQUEST_KINDS = ['Crew', 'Captain', 'Owner', 'Contractor'];

function requestAccount(r) {
  const email = String(r.email || '').toLowerCase().trim();
  const name = String(r.name || '').trim();
  if (!name) throw new Error('Enter your name');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email');
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('ra_' + email) || 0);
  if (n >= 3) throw new Error('Too many requests from this email. Try again later.');
  cache.put('ra_' + email, String(n + 1), 3600);
  const kind = REQUEST_KINDS.indexOf(r.kind) !== -1 ? r.kind : 'Crew';
  insert('Requests', {
    id: newId('R'), name: name.slice(0, 100), email, kind,
    position: TITLES[r.position] ? r.position : '',
    vesselName: String(r.vesselName || '').trim().slice(0, 100),
    message: String(r.message || '').trim().slice(0, 1000),
    status: 'pending', createdAt: nowIso(), handledBy: '', handledAt: ''
  });
  notifyNewRequest({ name, email, kind, position: TITLES[r.position] ? r.position : '', vesselName: String(r.vesselName || '').trim(),
                     message: String(r.message || '').trim() });
  return { ok: true, message: 'Request sent. You will get an email when your account is ready.' };
}

function normVessel(s) {
  return String(s || '').toLowerCase().replace(/\b(m\/?y|s\/?y|mv|sy|my)\b/g, '').replace(/[^a-z0-9]/g, '');
}

function requestsVisibleTo(user, vesselId) {
  const pending = readTable('Requests').filter(r => r.status === 'pending');
  if (isTrue(user.isAdmin) && !vesselId) return pending;
  const managed = readTable('Memberships').filter(m => m.userId === user.id && m.status === 'active' &&
    permsOfMember(m).manageCrew && (!vesselId || m.vesselId === vesselId)).map(m => m.vesselId);
  if (isTrue(user.isAdmin) && vesselId && managed.indexOf(vesselId) === -1) managed.push(vesselId);
  if (!managed.length) return [];
  const names = readTable('Vessels').filter(v => managed.indexOf(v.id) !== -1).map(v => normVessel(v.name));
  return pending.filter(r => r.vesselName && names.indexOf(normVessel(r.vesselName)) !== -1);
}

function countPendingRequests(user) {
  const yachts = isTrue(user.isAdmin) ? readTable('VesselRequests').filter(r => r.status === 'pending').length : 0;
  return requestsVisibleTo(user, '').length + yachts;
}

function listRequests(user, vesselId) {
  return { ok: true, requests: requestsVisibleTo(user, vesselId || '').map(r => ({
    id: r.id, name: r.name, email: r.email, kind: r.kind, position: r.position, vesselName: r.vesselName,
    message: r.message, createdAt: r.createdAt })) };
}

function approveRequest(user, id, vesselId, position, roleInput) {
  const r = requestsVisibleTo(user, '').find(x => x.id === id);
  if (!r) throw new Error('Request not found or already handled');
  let vessel = null;
  if (vesselId) {
    const c = vesselCtx(user, vesselId);
    requireManager(c);
    const kindTitle = { Owner: 'Yacht Owner', Captain: 'Captain / Master', Contractor: 'Independent Contractor / External Technician' }[r.kind] || 'Deckhand';
    var role = resolveRole(roleInput || { title: position || r.position || kindTitle }, kindTitle);
    canGrant(c, role);
    vessel = c.vessel;
  } else if (!isTrue(user.isAdmin)) {
    throw new Error('Choose the vessel to add them to');
  }
  let res;
  if (!vessel) {
    const exists = readTable('Users').some(u => u.email === r.email);
    if (exists) throw new Error('This email already has an account. Add them to a vessel instead.');
    res = addToVessel(user, null, r.email, r.name, '');
  } else {
    res = addToVessel(user, vessel, r.email, r.name, role);
  }
  r.status = 'approved'; r.handledBy = user.id; r.handledAt = nowIso();
  update('Requests', r._row, r);
  audit(user.id, 'approveRequest', '', r.name + ' <' + r.email + '>', vessel ? vessel.id : '');
  return res;
}

function declineRequest(user, id) {
  const r = requestsVisibleTo(user, '').find(x => x.id === id);
  if (!r) throw new Error('Request not found or already handled');
  r.status = 'declined'; r.handledBy = user.id; r.handledAt = nowIso();
  update('Requests', r._row, r);
  audit(user.id, 'declineRequest', '', r.name + ' <' + r.email + '>', '');
  return { ok: true };
}

// ───────────────────────── PROFILES ─────────────────────────
const AVAILABILITY = ['Available', 'Open to offers', 'Employed'];

function profileOf(userId) {
  return readTable('Profiles').find(p => p.userId === userId) || null;
}

function parseList(s) {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

function vesselHistory(userId) {
  const vessels = {};
  readTable('Vessels').forEach(v => vessels[v.id] = v);
  return readTable('Memberships')
    .filter(m => m.userId === userId && (m.status === 'active' || m.status === 'left') && vessels[m.vesselId])
    .map(m => ({ vesselId: m.vesselId, vesselName: vessels[m.vesselId].name, vesselType: vessels[m.vesselId].type,
                 length: vessels[m.vesselId].length, position: titleOf(m.position),
                 from: (m.joinedAt || '').slice(0, 10), to: m.status === 'left' ? (m.leftAt || '').slice(0, 10) : '',
                 current: m.status === 'active', contractor: permsOfMember(m).contractor,
                 days: seaDays(m) }))
    .sort((a, b) => (b.from || '') < (a.from || '') ? -1 : 1);
}

function sharedVessels(aId, bId, statuses) {
  const ms = readTable('Memberships').filter(m => statuses.indexOf(m.status) !== -1);
  const a = ms.filter(m => m.userId === aId).map(m => m.vesselId);
  return ms.filter(m => m.userId === bId && a.indexOf(m.vesselId) !== -1).map(m => m.vesselId);
}

function canViewProfile(viewer, targetId) {
  return viewer.id === targetId || canSearch(viewer) || sharedVessels(viewer.id, targetId, ['active']).length > 0;
}

/** A reviewer must be (or have been) Owner/Captain on a vessel the crew member served on. */
function reviewVesselFor(viewer, targetId) {
  if (viewer.id === targetId) return '';
  const ms = readTable('Memberships');
  const mine = ms.filter(m => m.userId === viewer.id && (m.status === 'active' || m.status === 'left') &&
    permsOfMember(m).hires).map(m => m.vesselId);
  const theirs = ms.find(m => m.userId === targetId && (m.status === 'active' || m.status === 'left') &&
    mine.indexOf(m.vesselId) !== -1);
  return theirs ? theirs.vesselId : '';
}

function ratingSummary(userId) {
  const rs = readTable('Reviews').filter(r => r.userId === userId);
  const avg = rs.length ? rs.reduce((s, r) => s + Number(r.rating), 0) / rs.length : 0;
  return { rating: Math.round(avg * 10) / 10, reviewCount: rs.length };
}

function getProfile(viewer, userId) {
  const target = readTable('Users').find(u => u.id === userId && isTrue(u.active));
  if (!target) throw new Error('Profile not found');
  if (!canViewProfile(viewer, userId)) throw new Error('Only owners and captains can view crew profiles');
  const p = profileOf(userId) || {};
  const self = viewer.id === userId;
  const showContact = self || isTrue(p.showContact) || isTrue(viewer.isAdmin);
  const users = {};
  readTable('Users').forEach(u => users[u.id] = u);
  const vessels = {};
  readTable('Vessels').forEach(v => vessels[v.id] = v.name);
  const reviews = readTable('Reviews').filter(r => r.userId === userId)
    .sort((a, b) => a.createdAt < b.createdAt ? 1 : -1)
    .map(r => ({ id: r.id, rating: Number(r.rating), text: r.text, createdAt: r.createdAt,
                 reviewer: users[r.reviewerId] ? users[r.reviewerId].name : 'Former reviewer',
                 vesselName: vessels[r.vesselId] || '', mine: r.reviewerId === viewer.id }));
  const reviewVessel = reviewVesselFor(viewer, userId);
  return {
    ok: true,
    profile: {
      userId, name: target.name,
      email: showContact ? target.email : '',
      phone: showContact ? (p.phone || '') : '',
      photo: p.photo || '', headline: p.headline || '', bio: p.bio || '', location: p.location || '',
      operatingArea: p.operatingArea || '',
      yearsExperience: p.yearsExperience || '', availability: p.availability || '',
      showContact: isTrue(p.showContact), languages: p.languages || '',
      certifications: parseList(p.certifications), experience: parseList(p.experience),
      vesselHistory: vesselHistory(userId), updatedAt: p.updatedAt || '',
      shareReviews: isTrue(p.shareReviews),
      shareId: isTrue(p.shareReviews) ? (p.shareId || '') : ''
    },
    reviews,
    summary: ratingSummary(userId),
    performance: performanceOf(userId, true),
    self,
    canReview: !!reviewVessel,
    canModerate: isTrue(viewer.isAdmin)
  };
}

function clip(s, n) { return String(s == null ? '' : s).trim().slice(0, n); }

function saveProfile(user, p) {
  if (p.name !== undefined) {
    const name = clip(p.name, 100);
    if (!name) throw new Error('Name cannot be empty');
    user.name = name;
    update('Users', user._row, user);
  }
  let row = profileOf(user.id);
  const isNew = !row;
  row = row || { userId: user.id };
  if (p.photo !== undefined) {
    const photo = String(p.photo || '');
    if (photo && !/^data:image\/(jpeg|png|webp);base64,/.test(photo)) throw new Error('Photo must be an image');
    if (photo.length > 45000) throw new Error('Photo is too large');
    row.photo = photo;
  }
  ['headline', 'location', 'operatingArea', 'phone', 'languages'].forEach(k => { if (p[k] !== undefined) row[k] = clip(p[k], 150); });
  if (p.bio !== undefined) row.bio = clip(p.bio, 2000);
  if (p.yearsExperience !== undefined) row.yearsExperience = clip(p.yearsExperience, 3).replace(/\D/g, '');
  if (p.availability !== undefined) row.availability = AVAILABILITY.indexOf(p.availability) !== -1 ? p.availability : '';
  if (p.showContact !== undefined) row.showContact = p.showContact ? 'TRUE' : 'FALSE';
  if (p.shareReviews !== undefined) {
    row.shareReviews = p.shareReviews ? 'TRUE' : 'FALSE';
    if (p.shareReviews && !row.shareId) row.shareId = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  }
  if (p.certifications !== undefined) {
    row.certifications = JSON.stringify((p.certifications || []).slice(0, 40)
      .map(x => ({ name: clip(x.name, 120), expires: /^\d{4}-\d{2}-\d{2}$/.test(x.expires || '') ? x.expires : '' }))
      .filter(x => x.name));
  }
  if (p.experience !== undefined) {
    row.experience = JSON.stringify((p.experience || []).slice(0, 40)
      .map(x => ({ vessel: clip(x.vessel, 100), position: clip(x.position, 60), years: clip(x.years, 30), notes: clip(x.notes, 300) }))
      .filter(x => x.vessel || x.position));
  }
  row.updatedAt = nowIso();
  if (isNew) insert('Profiles', row); else update('Profiles', row._row, row);
  return getProfile(user, user.id);
}

function searchCrew(viewer, req) {
  if (!canSearch(viewer)) throw new Error('Only owners and captains can search crew');
  const words = String(req.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const profiles = {};
  readTable('Profiles').forEach(p => profiles[p.userId] = p);
  const vessels = {};
  readTable('Vessels').forEach(v => vessels[v.id] = v.name);
  const current = {};
  readTable('Memberships').forEach(m => {
    if (m.status !== 'active' && m.status !== 'left') return;
    (current[m.userId] = current[m.userId] || []).push({ position: titleOf(m.position), active: m.status === 'active',
                                                          vessel: vessels[m.vesselId] || '' });
  });
  const reviews = {};
  readTable('Reviews').forEach(r => (reviews[r.userId] = reviews[r.userId] || []).push(Number(r.rating)));
  const work = {};
  readTable('TaskReviews').forEach(r => { if (r.status === 'reviewed') (work[r.userId] = work[r.userId] || []).push(Number(r.score)); });

  const showDemo = isTrue(viewer.isAdmin) || isDemoEmail(viewer.email); // demo crew never show up for real customers
  const results = readTable('Users').filter(u => isTrue(u.active) && u.id !== viewer.id && (showDemo || !isDemoEmail(u.email))).map(u => {
    const p = profiles[u.id] || {};
    const ms = current[u.id] || [];
    const positions = ms.map(m => m.position).filter((x, i, a) => a.indexOf(x) === i);
    const certs = parseList(p.certifications).map(x => x.name);
    const exp = parseList(p.experience).map(x => [x.vessel, x.position, x.notes].join(' '));
    const text = [u.name, p.headline, p.bio, p.location, p.operatingArea, p.languages, p.availability, positions.join(' '),
                  certs.join(' '), exp.join(' '), ms.map(m => m.vessel).join(' ')].join(' ').toLowerCase();
    const rs = reviews[u.id] || [];
    return {
      userId: u.id, name: u.name, photo: p.photo || '', headline: p.headline || '', location: p.location || '',
      operatingArea: p.operatingArea || '',
      availability: p.availability || '', yearsExperience: p.yearsExperience || '',
      positions, currentPosition: (ms.find(m => m.active) || {}).position || '',
      certCount: certs.length, rating: rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) / rs.length * 10) / 10 : 0,
      reviewCount: rs.length, hasProfile: !!profiles[u.id], _text: text,
      workCount: (work[u.id] || []).length,
      workScore: (work[u.id] || []).length ? Math.round((work[u.id].reduce((a, b) => a + b, 0) / work[u.id].length) * 10) / 10 : 0
    };
  }).filter(r => (r.hasProfile || r.positions.length) &&
    words.every(w => r._text.indexOf(w) !== -1) &&
    (!req.position || r.positions.indexOf(req.position) !== -1 || r.headline.toLowerCase().indexOf(req.position.toLowerCase()) !== -1) &&
    (!req.availability || r.availability === req.availability));

  const order = { 'Available': 0, 'Open to offers': 1, 'Employed': 2, '': 3 };
  results.sort((a, b) => (order[a.availability] - order[b.availability]) || (b.rating - a.rating) || (a.name < b.name ? -1 : 1));
  return { ok: true, total: results.length, results: results.slice(0, 40).map(r => { delete r._text; return r; }) };
}

function saveReview(viewer, userId, rating, text) {
  const vesselId = reviewVesselFor(viewer, userId);
  if (!vesselId) throw new Error('You can review crew who served on a vessel where you are Owner or Captain');
  rating = Math.round(Number(rating));
  if (!(rating >= 1 && rating <= 5)) throw new Error('Choose 1 to 5 stars');
  const existing = readTable('Reviews').find(r => r.userId === userId && r.reviewerId === viewer.id);
  const body = clip(text, 1000);
  if (existing) {
    existing.rating = String(rating); existing.text = body; existing.updatedAt = nowIso(); existing.vesselId = vesselId;
    update('Reviews', existing._row, existing);
  } else {
    insert('Reviews', { id: newId('RV'), userId, reviewerId: viewer.id, vesselId, rating: String(rating),
                        text: body, createdAt: nowIso(), updatedAt: '' });
  }
  return getProfile(viewer, userId);
}

function deleteReview(viewer, id) {
  const r = readTable('Reviews').find(x => x.id === id);
  if (!r) throw new Error('Review not found');
  if (r.reviewerId !== viewer.id && !isTrue(viewer.isAdmin)) throw new Error('You can only delete your own review');
  sheet('Reviews').deleteRow(r._row);
  delete TABLE_CACHE.Reviews;
  audit(viewer.id, 'deleteReview', '', userName(r.userId), r.vesselId);
  return getProfile(viewer, r.userId);
}

/**
 * Read-only reviews page opened from the QR code on a business card. No login.
 * Only works when the crew member has turned on review sharing. Reviewers are shown
 * by position and vessel, not by name.
 */
function publicReviews(shareId) {
  shareId = String(shareId || '');
  const p = shareId.length >= 12 && readTable('Profiles').find(x => x.shareId === shareId && isTrue(x.shareReviews));
  const user = p && readTable('Users').find(u => u.id === p.userId && isTrue(u.active));
  if (!user) throw new Error('These reviews are not available. The link may be old, or sharing was turned off.');
  const vessels = {};
  readTable('Vessels').forEach(v => vessels[v.id] = v.name);
  const ms = readTable('Memberships');
  const roleOf = (reviewerId, vesselId) => {
    const m = ms.find(x => x.userId === reviewerId && x.vesselId === vesselId);
    return m ? titleOf(m.position) : 'Captain / Master';
  };
  const reviews = readTable('Reviews').filter(r => r.userId === user.id)
    .sort((a, b) => a.createdAt < b.createdAt ? 1 : -1)
    .map(r => ({ rating: Number(r.rating), text: r.text, date: (r.createdAt || '').slice(0, 10),
                 by: roleOf(r.reviewerId, r.vesselId), vesselName: vessels[r.vesselId] || '' }));
  const current = vesselHistory(user.id).find(v => v.current);
  return {
    ok: true,
    name: user.name, photo: p.photo || '', headline: p.headline || (current ? current.position : ''),
    location: p.location || '', operatingArea: p.operatingArea || '', yearsExperience: p.yearsExperience || '',
    summary: ratingSummary(user.id), reviews,
    performance: performanceOf(user.id, false)
  };
}

// ───────────────────────── WORK REVIEWS (1–10, requested by crew) ─────────────────────────
/** Owners and Captains on the vessel (active members), excluding someone. */
function vesselReviewers(vesselId, exceptUserId) {
  const users = {};
  readTable('Users').forEach(u => users[u.id] = u);
  return readTable('Memberships').filter(m => m.vesselId === vesselId && m.status === 'active' && m.userId !== exceptUserId &&
    permsOfMember(m).hires && users[m.userId] && isTrue(users[m.userId].active))
    .map(m => users[m.userId]);
}

function isVesselReviewer(vesselId, userId) {
  return readTable('Memberships').some(m => m.vesselId === vesselId && m.userId === userId && m.status === 'active' &&
    permsOfMember(m).hires);
}

function pendingReviewsFor(vesselId, reviewerId) {
  return readTable('TaskReviews').filter(r => r.vesselId === vesselId && r.status === 'requested' && r.userId !== reviewerId);
}

function requestTaskReview(c, user, completionId, message, returnTask) {
  const x = readTable('Completions').find(k => k.id === completionId);
  const t = x && taskIn(c, x.taskId);
  if (!x || !t) throw new Error('Sign-off not found');
  if (x.performedBy !== user.id) throw new Error('You can only ask for a review of your own work');
  if (readTable('TaskReviews').some(r => r.completionId === completionId)) throw new Error('A review was already requested for this work');
  if (x.performedDate < addInterval(today(), -CONFIG.REVIEW_REQUEST_DAYS, 'days')) {
    throw new Error('Reviews can be requested within ' + CONFIG.REVIEW_REQUEST_DAYS + ' days of the work');
  }
  const reviewers = vesselReviewers(c.vessel.id, user.id);
  if (!reviewers.length) throw new Error('This vessel has no Captain or Owner to review your work');
  insert('TaskReviews', { id: newId('W'), vesselId: c.vessel.id, taskId: t.id, completionId, userId: user.id,
    requestedAt: nowIso(), message: clip(message, 500), status: 'requested', reviewerId: '', score: '', text: '', reviewedAt: '' });
  audit(user.id, 'requestReview', t.id, 'Work on ' + x.performedDate, c.vessel.id);
  if (CONFIG.REVIEW_EMAILS) {
    sendMail(reviewers.map(r => r.email).join(','), 'Review requested: ' + user.name + ', ' + t.title,
      '<p><b>' + esc(user.name) + '</b> asked you to review their work on <b>' + esc(t.title) + '</b> (' + esc(c.vessel.name) +
      ', ' + x.performedDate + ').</p>' + (message ? '<p><i>' + esc(clip(message, 500)) + '</i></p>' : '') +
      '<p>Reviews are optional. They become part of the crew member\'s record.</p>' + appLink());
  }
  return returnTask ? getTask(c, user, t.id) : { ok: true };
}

function requireReviewer(c, user) {
  if (!isVesselReviewer(c.vessel.id, user.id)) throw new Error('Only the Captain or Owner of this vessel can review work');
}

function reviewView(r, names, tasks, comps) {
  const t = tasks[r.taskId] || {};
  const x = comps[r.completionId] || {};
  return { id: r.id, crewId: r.userId, crewName: names[r.userId] || '', task: t.title || '', system: t.system || '',
           taskId: r.taskId, performedDate: x.performedDate || '', timing: x.timing || '', workNotes: x.notes || '',
           message: r.message, requestedAt: r.requestedAt, status: r.status, score: r.score ? Number(r.score) : null,
           text: r.text, reviewedAt: r.reviewedAt, reviewer: names[r.reviewerId] || '' };
}

function listTaskReviews(c, user) {
  requireReviewer(c, user);
  const names = crewNames();
  const tasks = {}; vesselTasks(c).forEach(t => tasks[t.id] = t);
  const comps = {}; readTable('Completions').forEach(x => comps[x.id] = x);
  const all = readTable('TaskReviews').filter(r => r.vesselId === c.vessel.id && r.userId !== user.id);
  return {
    ok: true,
    pending: all.filter(r => r.status === 'requested').sort((a, b) => a.requestedAt < b.requestedAt ? -1 : 1)
      .map(r => reviewView(r, names, tasks, comps)),
    done: all.filter(r => r.status !== 'requested').sort((a, b) => a.reviewedAt < b.reviewedAt ? 1 : -1).slice(0, 30)
      .map(r => reviewView(r, names, tasks, comps)),
    approvals: approvalsFor(c, user)
  };
}

function submitTaskReview(c, user, id, score, text) {
  requireReviewer(c, user);
  const r = readTable('TaskReviews').find(x => x.id === id && x.vesselId === c.vessel.id);
  if (!r) throw new Error('Review request not found');
  if (r.userId === user.id) throw new Error('You cannot review your own work');
  if (r.status === 'reviewed' && r.reviewerId !== user.id) throw new Error('Another reviewer already reviewed this work');
  score = Math.round(Number(score));
  if (!(score >= 1 && score <= 10)) throw new Error('Choose a score from 1 to 10');
  const first = r.status !== 'reviewed';
  r.status = 'reviewed'; r.reviewerId = user.id; r.score = String(score); r.text = clip(text, 1000); r.reviewedAt = nowIso();
  update('TaskReviews', r._row, r);
  audit(user.id, 'reviewWork', r.taskId, userName(r.userId) + ': ' + score + '/10', c.vessel.id);
  if (first && CONFIG.REVIEW_EMAILS) {
    const crew = readTable('Users').find(u => u.id === r.userId);
    const t = readTable('Tasks').find(k => k.id === r.taskId) || {};
    if (crew && isTrue(crew.active)) {
      sendMail(crew.email, 'Your work was reviewed: ' + score + '/10',
        '<p>' + esc(user.name) + ' reviewed your work on <b>' + esc(t.title || '') + '</b> (' + esc(c.vessel.name) + ').</p>' +
        '<p style="font-size:22px;font-weight:bold">' + score + ' / 10</p>' + (r.text ? '<p><i>' + esc(r.text) + '</i></p>' : '') +
        '<p>It is now part of your CJM Marine record.</p>' + appLink());
    }
  }
  return listTaskReviews(c, user);
}

function skipTaskReview(c, user, id) {
  requireReviewer(c, user);
  const r = readTable('TaskReviews').find(x => x.id === id && x.vesselId === c.vessel.id && x.status === 'requested');
  if (!r) throw new Error('Review request not found');
  if (r.userId === user.id) throw new Error('You cannot close your own request');
  r.status = 'skipped'; r.reviewerId = user.id; r.reviewedAt = nowIso();
  update('TaskReviews', r._row, r);
  audit(user.id, 'skipReview', r.taskId, userName(r.userId), c.vessel.id);
  return listTaskReviews(c, user);
}

/** Reviewed work for a crew member. withNames=false hides reviewer names (public page). */
function performanceOf(userId, withNames) {
  const names = crewNames();
  const tasks = {}; readTable('Tasks').forEach(t => tasks[t.id] = t);
  const comps = {}; readTable('Completions').forEach(x => comps[x.id] = x);
  const vessels = {}; readTable('Vessels').forEach(v => vessels[v.id] = v.name);
  const ms = readTable('Memberships');
  const roleOf = (uid, vid) => { const m = ms.find(x => x.userId === uid && x.vesselId === vid); return m ? titleOf(m.position) : 'Captain / Master'; };
  const items = readTable('TaskReviews').filter(r => r.userId === userId && r.status === 'reviewed')
    .sort((a, b) => a.reviewedAt < b.reviewedAt ? 1 : -1)
    .map(r => ({ date: (comps[r.completionId] || {}).performedDate || r.workDate || (r.reviewedAt || '').slice(0, 10),
                 task: (tasks[r.taskId] || {}).title || r.taskTitle || '', system: (tasks[r.taskId] || {}).system || '',
                 vesselName: vessels[r.vesselId] || r.vesselName || '', score: Number(r.score), text: r.text,
                 by: r.reviewerLabel ? r.reviewerLabel + (withNames && r.reviewerName ? ' ' + r.reviewerName : '') + ' (confirmed by email)'
                   : roleOf(r.reviewerId, r.vesselId) + (withNames && names[r.reviewerId] ? ' ' + names[r.reviewerId] : '') }));
  const avg = items.length ? items.reduce((s, x) => s + x.score, 0) / items.length : 0;
  return { average: Math.round(avg * 10) / 10, count: items.length, items };
}

// ───────────────────────── CREW RECORD BACKUP (weekly, per person) ─────────────────────────
function seaTime(userId) {
  return vesselHistory(userId);
}

function fmtDays(d) {
  if (d < 31) return d + ' days';
  const months = Math.round(d / 30.44);
  return months < 12 ? months + ' months' : (Math.floor(months / 12) + ' yr' + (months % 12 ? ' ' + (months % 12) + ' mo' : ''));
}

function buildCrewRecord(user, stamp) {
  const p = profileOf(user.id) || {};
  const sea = seaTime(user.id);
  const certs = parseList(p.certifications);
  const perf = performanceOf(user.id, true);
  const stars = getStarsFor(user.id);
  const tasks = {}; readTable('Tasks').forEach(t => tasks[t.id] = t);
  const vessels = {}; readTable('Vessels').forEach(v => vessels[v.id] = v.name);
  const since = addInterval(today(), -365, 'days');
  const work = readTable('Completions').filter(x => x.performedBy === user.id && x.performedDate >= since && tasks[x.taskId])
    .sort((a, b) => a.performedDate < b.performedDate ? 1 : -1)
    .map(x => [x.performedDate, vessels[tasks[x.taskId].vesselId] || '', tasks[x.taskId].title, tasks[x.taskId].system, x.timing, x.notes]);
  const totalDays = sea.reduce((s, v) => s + v.days, 0);

  const ss = SpreadsheetApp.create(user.name + ' CJM Marine record ' + stamp);
  const tabs = [
    ['Profile', ['Field', 'Value'], [
      ['Name', user.name], ['Email', user.email], ['Phone', p.phone || ''], ['Headline', p.headline || ''],
      ['Based in', p.location || ''], ['Operates in', p.operatingArea || ''], ['Years at sea', p.yearsExperience || ''], ['Languages', p.languages || ''],
      ['Availability', p.availability || ''], ['Sea time on CJM Marine', fmtDays(totalDays)],
      ['Work reviews', perf.count ? perf.average + ' / 10 average from ' + perf.count : 'None yet'],
      ['Captain recommendations', stars.count ? stars.average + ' / 5 from ' + stars.count : 'None yet'],
      ['About', p.bio || ''], ['Record date', stamp]]],
    ['Sea time', ['Vessel', 'Type', 'Length', 'Position', 'From', 'To', 'Days aboard', 'Time aboard'],
      sea.map(v => [v.vesselName, v.vesselType, v.length, v.position, v.from, v.current ? 'Present' : v.to,
                    v.contractor ? '' : String(v.days), v.contractor ? 'Contractor work (not sea time)' : fmtDays(v.days)])
        .concat(parseList(p.experience).map(x => [x.vessel, '', '', x.position, '', '', '', x.years + ' (self-reported)']))],
    ['Certifications', ['Certificate', 'Expires', 'Status'],
      certs.map(x => [x.name, x.expires, !x.expires ? 'No expiry' : x.expires < today() ? 'EXPIRED' :
                      daysBetween(today(), x.expires) <= 90 ? 'Expires within 90 days' : 'Valid'])],
    ['Work reviews', ['Work date', 'Vessel', 'Task', 'System', 'Score (1-10)', 'Review', 'Reviewed by'],
      perf.items.map(x => [x.date, x.vesselName, x.task, x.system, String(x.score), x.text, x.by])],
    ['Recommendations', ['Date', 'Vessel', 'Stars (1-5)', 'Review', 'Reviewed by'],
      stars.items.map(x => [x.date, x.vesselName, String(x.rating), x.text, x.by])],
    ['Work log (12 months)', ['Date', 'Vessel', 'Task', 'System', 'Timing', 'Notes'], work]
  ];
  tabs.forEach((tab, i) => {
    const sh = i === 0 ? ss.getSheets()[0].setName(tab[0]) : ss.insertSheet(tab[0]);
    const width = tab[1].length;
    const rows = [tab[1]].concat(tab[2].length ? tab[2] : [['None yet']]);
    const grid = rows.map(r => { const x = r.map(v => v == null ? '' : String(v)); while (x.length < width) x.push(''); return x.slice(0, width); });
    sh.getRange(1, 1, grid.length, width).setNumberFormat('@').setValues(grid);
    sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#12324a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, width);
  });
  const root = backupFolder(null);
  const crewRoot = (() => { const it = root.getFoldersByName('Crew records'); return it.hasNext() ? it.next() : root.createFolder('Crew records'); })();
  const label = user.name + ' (' + user.email + ')';
  const folder = (() => { const it = crewRoot.getFoldersByName(label); return it.hasNext() ? it.next() : crewRoot.createFolder(label); })();
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  return { id: ss.getId(), url: ss.getUrl(), folder,
           counts: { vessels: sea.length, days: totalDays, certs: certs.length, reviews: perf.count, average: perf.average,
                     expired: certs.filter(x => x.expires && x.expires < today()).length } };
}

function getStarsFor(userId) {
  const vessels = {}; readTable('Vessels').forEach(v => vessels[v.id] = v.name);
  const names = crewNames();
  const items = readTable('Reviews').filter(r => r.userId === userId)
    .sort((a, b) => a.createdAt < b.createdAt ? 1 : -1)
    .map(r => ({ date: (r.createdAt || '').slice(0, 10), vesselName: vessels[r.vesselId] || '', rating: Number(r.rating),
                 text: r.text, by: names[r.reviewerId] || '' }));
  const avg = items.length ? items.reduce((s, x) => s + x.rating, 0) / items.length : 0;
  return { average: Math.round(avg * 10) / 10, count: items.length, items };
}

function sendCrewRecord(user) {
  const stamp = today();
  const file = buildCrewRecord(user, stamp);
  shareFolder(file.folder, [user.email]);
  const xlsx = exportXlsx(file.id, user.name.replace(/[^\w]+/g, '-') + '-record-' + stamp + '.xlsx');
  const c = file.counts;
  const sent = sendMail(user.email, 'Your ' + CONFIG.APP_NAME + ' record, ' + stamp,
    '<p>Hello ' + esc(user.name.split(' ')[0]) + ',</p>' +
    '<p>Here is your crew record: sea time, certifications, work reviews and recommendations. Keep it for your files.</p>' +
    '<ul><li>' + c.vessels + ' vessel' + (c.vessels === 1 ? '' : 's') + ', ' + fmtDays(c.days) + ' aboard on CJM Marine</li>' +
    '<li>' + c.certs + ' certification' + (c.certs === 1 ? '' : 's') + (c.expired ? ' (<b style="color:#b8322a">' + c.expired + ' expired</b>)' : '') + '</li>' +
    '<li>' + (c.reviews ? c.reviews + ' work review' + (c.reviews === 1 ? '' : 's') + ', ' + c.average + ' / 10 average' : 'No work reviews yet') + '</li></ul>' +
    '<p><a href="' + file.url + '">Open in Google Sheets</a></p>' +
    '<p style="color:#666">An Excel copy is attached. It opens in Google Sheets, Excel or Numbers even if the website is down.</p>' + appLink(),
    xlsx ? [xlsx] : []);
  PropertiesService.getScriptProperties().setProperty('cr_' + user.id, stamp);
  return { ok: sent, url: file.url };
}

function hasCrewRecord(u, profiles, memberIds) {
  return isTrue(u.active) && u.passwordHash && !isDemoEmail(u.email) && (profiles[u.id] || memberIds[u.id]);
}

/** Daily trigger. Sends each crew member their record when it is CREW_RECORD_EVERY_DAYS old. */
function crewRecordBackups() {
  const props = PropertiesService.getScriptProperties();
  const profiles = {}; readTable('Profiles').forEach(p => profiles[p.userId] = 1);
  const memberIds = {}; readTable('Memberships').forEach(m => { if (m.status === 'active' || m.status === 'left') memberIds[m.userId] = 1; });
  const due = readTable('Users').filter(u => hasCrewRecord(u, profiles, memberIds)).filter(u => {
    const last = props.getProperty('cr_' + u.id);
    return !last || daysBetween(last, today()) >= CONFIG.CREW_RECORD_EVERY_DAYS;
  }).slice(0, CONFIG.CREW_RECORD_PER_RUN);
  due.forEach(u => { try { sendCrewRecord(u); } catch (e) { Logger.log('Crew record failed for ' + u.email + ': ' + e.message); } });
  return { sent: due.length };
}

function emailMyRecord(user) {
  const cache = CacheService.getScriptCache();
  if (cache.get('mr_' + user.id)) throw new Error('Your record was just sent. Check your inbox; you can send it again in an hour.');
  cache.put('mr_' + user.id, '1', 3600);
  const r = sendCrewRecord(user);
  audit(user.id, 'emailRecord', '', '', '');
  return { ok: true, url: r.url, message: 'Your record is on its way to ' + user.email + '.' };
}

// ───────────────────────── PLATFORM ADMIN ─────────────────────────
function adminOverview() {
  const users = readTable('Users');
  const ms = readTable('Memberships');
  const tasks = readTable('Tasks').filter(t => t.state === 'Open');
  const vName = {};
  const vessels = readTable('Vessels').filter(v => !v.deletedAt).map(v => {
    vName[v.id] = v.name;
    const vt = tasks.filter(t => t.vesselId === v.id);
    const managers = ms.filter(m => m.vesselId === v.id && m.status === 'active' && permsOfMember(m).manageCrew)
      .map(m => { const u = users.find(x => x.id === m.userId); return u ? u.name + ' (' + titleOf(m.position) + ')' : ''; })
      .filter(Boolean);
    return {
      id: v.id, name: v.name, type: v.type, length: v.length, homePort: v.homePort, active: isTrue(v.active),
      crew: ms.filter(m => m.vesselId === v.id && m.status === 'active').length,
      openTasks: vt.length, overdue: vt.filter(t => t.dueDate && t.dueDate < today()).length, managers
    };
  });
  return {
    ok: true, vessels,
    users: users.filter(u => !isDeletedUser(u)).map(u => ({
      id: u.id, name: u.name, email: u.email, active: isTrue(u.active), isAdmin: isTrue(u.isAdmin),
      needsSetup: !u.passwordHash,
      vessels: ms.filter(m => m.userId === u.id && m.status === 'active').map(m => (vName[m.vesselId] || '?') + ', ' + titleOf(m.position) + ' (' + permsOfMember(m).accessLabel + ')')
    })).sort((a, b) => a.name < b.name ? -1 : 1)
  };
}

function createVessel(user, v) {
  const name = clip(v.name, 100);
  if (!name) throw new Error('Vessel name required');
  if (readTable('Vessels').some(x => isTrue(x.active) && normVessel(x.name) === normVessel(name))) {
    throw new Error('A vessel with that name already exists');
  }
  const vessel = { id: newId('V'), name, type: clip(v.type, 60), length: clip(v.length, 20), homePort: clip(v.homePort, 80),
                   active: 'TRUE', createdAt: nowIso(), createdBy: user.id };
  insert('Vessels', vessel);
  audit(user.id, 'createVessel', '', name, vessel.id);
  let manager = null;
  if (v.managerEmail) {
    const want = titleOf(v.managerPosition === 'Owner' ? 'Yacht Owner' : v.managerPosition || 'Captain / Master');
    const pos = defaultRole(['Yacht Owner', 'Yacht Manager (shore-based)', 'Captain / Master', 'Staff Captain'].indexOf(want) !== -1 ? want : 'Captain / Master');
    const email = String(v.managerEmail).toLowerCase().trim();
    const pending = readTable('Requests').filter(r => r.status === 'pending' && r.email === email);
    manager = addToVessel(user, vessel, email, v.managerName || (pending[0] && pending[0].name), pos);
    pending.forEach(r => { r.status = 'approved'; r.handledBy = user.id; r.handledAt = nowIso(); update('Requests', r._row, r); });
  }
  return { ok: true, vessel: { id: vessel.id, name }, manager };
}

function updateVessel(user, id, v) {
  const vessel = readTable('Vessels').find(x => x.id === id && !x.deletedAt);
  if (!vessel) throw new Error('Vessel not found');
  ['name', 'type', 'length', 'homePort'].forEach(k => { if (v[k] !== undefined) vessel[k] = clip(v[k], 100); });
  if (v.active !== undefined) vessel.active = v.active ? 'TRUE' : 'FALSE';
  if (!vessel.name) throw new Error('Vessel name required');
  update('Vessels', vessel._row, vessel);
  audit(user.id, 'updateVessel', '', vessel.name, vessel.id);
  return { ok: true };
}

function setUserActive(user, userId, active) {
  if (userId === user.id) throw new Error('You cannot deactivate yourself');
  const u = readTable('Users').find(x => x.id === userId);
  if (!u || isDeletedUser(u)) throw new Error('User not found');
  u.active = active ? 'TRUE' : 'FALSE';
  update('Users', u._row, u);
  if (!active) endSessionsFor(userId);
  audit(user.id, active ? 'activateUser' : 'deactivateUser', '', u.name, '');
  return { ok: true };
}

// ───────────────────────── TASKS ─────────────────────────
function crewNames() {
  const m = {};
  readTable('Users').forEach(u => m[u.id] = u.name);
  return m;
}

function vesselTasks(c) {
  return readTable('Tasks').filter(t => t.vesselId === c.vessel.id &&
    (!c.perms.contractor || t.assignedTo === c.userId || t.createdBy === c.userId));
}

function taskIn(c, id) {
  const t = vesselTasks(c).find(x => x.id === id);
  if (!t) throw new Error('Task not found');
  return t;
}

function listTasks(c, user) {
  const names = crewNames();
  return vesselTasks(c).map(t => decorate(c, t, names, user))
    .sort((a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1);
}

function getTask(c, user, id) {
  const names = crewNames();
  const t = taskIn(c, id);
  const files = {};
  readTable('Attachments').filter(a => a.taskId === id && a.vesselId === c.vessel.id)
    .forEach(a => (files[a.noteId] = files[a.noteId] || []).push(attachmentView(a)));
  const notes = readTable('Notes').filter(n => n.taskId === id)
    .map(n => ({ id: n.id, text: n.text, createdAt: n.createdAt, by: names[n.userId] || n.userId, attachments: files[n.id] || [] }));
  const reviews = {};
  readTable('TaskReviews').filter(r => r.taskId === id).forEach(r => reviews[r.completionId] = r);
  const hasReviewer = vesselReviewers(c.vessel.id, user.id).length > 0;
  const oldest = addInterval(today(), -CONFIG.REVIEW_REQUEST_DAYS, 'days');
  const canSee = (x) => x.performedBy === user.id || isVesselReviewer(c.vessel.id, user.id);
  const completions = readTable('Completions').filter(x => x.taskId === id)
    .map(x => {
      const r = reviews[x.id];
      return { id: x.id, dueDate: x.dueDate, performedDate: x.performedDate, timing: x.timing,
               notes: x.notes, by: names[x.performedBy] || x.performedBy, loggedAt: x.loggedAt,
               mine: x.performedBy === user.id,
               review: r && canSee(x) ? { status: r.status, score: r.status === 'reviewed' ? Number(r.score) : null,
                                          text: r.status === 'reviewed' ? r.text : '' } : (r ? { status: 'private' } : null),
               canRequestReview: !r && x.performedBy === user.id && hasReviewer && x.performedDate >= oldest };
    });
  const history = readTable('Audit').filter(a => a.taskId === id)
    .map(a => ({ timestamp: a.timestamp, action: a.action, details: a.details, by: names[a.userId] || a.userId }));
  return { ok: true, task: decorate(c, t, names, user), notes, completions, history, canRequestReview: hasReviewer };
}

function crewOnVessel(c, userId) {
  return !userId || readTable('Memberships').some(m => m.vesselId === c.vessel.id && m.userId === userId && m.status === 'active');
}

function createTask(c, user, t) {
  if (!t.title) throw new Error('Title required');
  if (c.perms.viewOnly) throw new Error('View-only access cannot create tasks or report issues');
  const type = t.type === 'Issue' ? 'Issue' : 'Routine';
  if (type === 'Routine' && !c.perms.createRoutine) throw new Error('Your access level can report issues but not schedule maintenance');
  if (t.assignedTo && (!c.perms.createRoutine || !crewOnVessel(c, t.assignedTo))) t.assignedTo = '';
  const recurring = !!t.recurring && type === 'Routine';
  if (type === 'Routine' && !t.dueDate) throw new Error('Due date required');
  if (recurring) validateInterval(t.intervalValue, t.intervalUnit);
  if (t.dueDate) validateDate(t.dueDate);
  const task = {
    id: newId('T'), title: clip(t.title, 200), description: clip(t.description, 3000), system: clip(t.system, 60),
    type, dueDate: t.dueDate || '', dueTime: t.dueTime || '',
    recurring: recurring ? 'TRUE' : 'FALSE',
    intervalValue: recurring ? t.intervalValue : '', intervalUnit: recurring ? t.intervalUnit : '',
    assignedTo: t.assignedTo || '', state: 'Open', createdBy: user.id, createdAt: nowIso(),
    lastPerformed: '', lastPerformedBy: '', resolution: '', reminderLog: '', vesselId: c.vessel.id
  };
  insert('Tasks', task);
  audit(user.id, 'create', task.id, type + ': ' + task.title, c.vessel.id);
  if (t.note) addNote(c, user, task.id, t.note);
  return { ok: true, task: decorate(c, task, crewNames(), user) };
}

function updateTask(c, user, id, changes) {
  const t = taskIn(c, id);
  if (!canEdit(c, user, t)) throw new Error('Your access level cannot edit this task');
  if (changes.assignedTo !== undefined && changes.assignedTo !== t.assignedTo) {
    if (!c.perms.createRoutine) throw new Error('Your access level cannot assign tasks');
    if (!crewOnVessel(c, changes.assignedTo)) throw new Error('That person is not on this vessel');
  }
  if (t.type === 'Issue') delete changes.recurring;
  const editable = ['title', 'description', 'system', 'dueDate', 'dueTime', 'recurring',
                    'intervalValue', 'intervalUnit', 'assignedTo'];
  const changed = [];
  editable.forEach(k => {
    if (changes[k] === undefined) return;
    const v = k === 'recurring' ? (changes[k] ? 'TRUE' : 'FALSE') : String(changes[k]);
    if (String(t[k]) !== v) { changed.push(k + ': ' + t[k] + ' → ' + v); t[k] = v; }
  });
  if (!changed.length) return { ok: true, task: decorate(c, t, crewNames(), user) };
  if (t.dueDate) validateDate(t.dueDate);
  if (isTrue(t.recurring)) validateInterval(t.intervalValue, t.intervalUnit);
  if (changed.some(x => x.indexOf('dueDate') === 0)) t.reminderLog = '';
  update('Tasks', t._row, t);
  audit(user.id, 'update', id, changed.join('; '), c.vessel.id);
  return { ok: true, task: decorate(c, t, crewNames(), user) };
}

function completeTask(c, user, req) {
  const t = taskIn(c, req.id);
  if (t.state !== 'Open') throw new Error('Task is already ' + t.state.toLowerCase());
  if (!canSignOff(c, user, t)) {
    if (c.perms.viewOnly) throw new Error('View-only access cannot sign off tasks');
    const label = DEPT_LABELS[DEPARTMENTS[t.system]];
    throw new Error('Only the assigned person' + (label ? ' or ' + label.toLowerCase() + ' crew with sign-off rights' : ' or an officer') + ' can sign this off');
  }
  const performed = req.performedDate || today();
  validateDate(performed);
  if (performed > today()) throw new Error('Performed date cannot be in the future');
  if (t.type === 'Issue' && !req.resolution) throw new Error('Resolution required to close an issue');

  let timing = 'No due date';
  if (t.dueDate) {
    const late = daysBetween(t.dueDate, performed);
    timing = late > 0 ? 'Late by ' + late + 'd' : 'On time';
  }
  const completionId = newId('X');
  insert('Completions', {
    id: completionId, taskId: t.id, dueDate: t.dueDate, performedDate: performed,
    performedBy: user.id, timing, notes: clip(req.notes, 2000), loggedAt: nowIso()
  });
  const oldDue = t.dueDate;
  t.lastPerformed = performed;
  t.lastPerformedBy = user.id;
  t.reminderLog = '';
  let detail;
  if (t.type === 'Issue') {
    t.state = 'Resolved';
    t.resolution = clip(req.resolution, 2000);
    detail = 'Resolved ' + performed + ': ' + t.resolution;
  } else if (isTrue(t.recurring)) {
    const base = CONFIG.RECUR_FROM === 'due' && oldDue ? oldDue : performed;
    t.dueDate = addInterval(base, t.intervalValue, t.intervalUnit);
    detail = 'Performed ' + performed + ' (' + timing + '). Next due ' + t.dueDate;
  } else {
    t.state = 'Completed';
    detail = 'Performed ' + performed + ' (' + timing + ')';
  }
  update('Tasks', t._row, t);
  audit(user.id, 'complete', t.id, detail, c.vessel.id);
  if (req.notes) addNote(c, user, t.id, req.notes);
  let reviewRequested = false;
  if (req.requestReview) {
    try { requestTaskReview(c, user, completionId, req.reviewMessage, false); reviewRequested = true; } catch (e) { /* no reviewer on board */ }
  }
  return { ok: true, task: decorate(c, t, crewNames(), user), reviewRequested };
}

function addNote(c, user, taskId, text, files) {
  files = Array.isArray(files) ? files : [];
  if ((!text || !String(text).trim()) && !files.length) throw new Error('Note is empty');
  if (files.length > ATTACH_MAX_FILES) throw new Error('Attach up to ' + ATTACH_MAX_FILES + ' files per note');
  files.forEach(checkAttachment);
  taskIn(c, taskId);
  const note = { id: newId('N'), taskId, userId: user.id, text: clip(text, 3000), createdAt: nowIso() };
  insert('Notes', note);
  const saved = files.map(f => saveAttachment(c, user, taskId, note.id, f));
  audit(user.id, 'note', taskId, (note.text.slice(0, 100) || '(no text)') +
        (saved.length ? ' [+' + saved.length + ' file' + (saved.length > 1 ? 's' : '') + ': ' + saved.map(a => a.name).join(', ').slice(0, 120) + ']' : ''), c.vessel.id);
  return { ok: true, note: Object.assign({}, note, { attachments: saved }) };
}

// ───────────────────────── ATTACHMENTS (photos and files on notes) ─────────────────────────
const ATTACH_MAX_FILES = 6;
const ATTACH_MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
const ATTACH_TYPES = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|text\/plain|text\/csv|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|application\/msword|application\/vnd\.ms-excel|video\/(mp4|quicktime))$/;

function checkAttachment(f) {
  if (!f || !f.name || !f.data) throw new Error('A file was empty');
  if (!ATTACH_TYPES.test(String(f.mimeType || ''))) throw new Error('"' + clip(f.name, 60) + '" is not a supported file type. Use photos, PDF, Word, Excel, text or short videos.');
  if (String(f.data).length > ATTACH_MAX_BYTES * 1.37) throw new Error('"' + clip(f.name, 60) + '" is larger than 10 MB');
  if (f.thumb && !/^data:image\/(jpeg|png|webp);base64,/.test(f.thumb)) throw new Error('Bad preview image');
}

function saveAttachment(c, user, taskId, noteId, f) {
  const name = clip(String(f.name).replace(/[\\/:*?"<>|]+/g, '_'), 120);
  const mimeType = String(f.mimeType);
  const bytes = Utilities.base64Decode(String(f.data));
  if (bytes.length > ATTACH_MAX_BYTES) throw new Error('"' + name + '" is larger than 10 MB');
  const fileId = storeFile(c.vessel, name, mimeType, String(f.data), bytes);
  const thumb = f.thumb && String(f.thumb).length < 40000 ? String(f.thumb) : '';
  const a = { id: newId('A'), vesselId: c.vessel.id, taskId, noteId, fileId, name, mimeType, size: String(bytes.length),
              thumb, userId: user.id, createdAt: nowIso() };
  insert('Attachments', a);
  return attachmentView(a);
}

function attachmentView(a) {
  return { id: a.id, name: a.name, mimeType: a.mimeType, size: Number(a.size) || 0, thumb: a.thumb || '' };
}

/** Saves file contents. Production: a private file in Google Drive. Staging: a row in StoredFiles (Drive is off). */
function storeFile(vessel, name, mimeType, b64, bytes) {
  if (CONFIG.STAGING) {
    const id = newId('F');
    insert('StoredFiles', { id, data: b64 });
    return 'stg:' + id;
  }
  const root = (() => { const it = DriveApp.getFoldersByName(CONFIG.ATTACH_FOLDER); return it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.ATTACH_FOLDER); })();
  const sub = (() => { const it = root.getFoldersByName(vessel.name); return it.hasNext() ? it.next() : root.createFolder(vessel.name); })();
  return sub.createFile(Utilities.newBlob(bytes, mimeType, name)).getId();
}

function readFile(fileId) {
  if (String(fileId).indexOf('stg:') === 0) {
    const row = readTable('StoredFiles').find(r => r.id === fileId.slice(4));
    if (!row) throw new Error('File not found');
    return row.data;
  }
  return Utilities.base64Encode(DriveApp.getFileById(fileId).getBlob().getBytes());
}

/** Returns a file to someone who can see the task it belongs to. */
function getAttachment(c, user, id) {
  const a = readTable('Attachments').find(x => x.id === id && x.vesselId === c.vessel.id);
  if (!a) throw new Error('File not found');
  if (String(a.taskId).indexOf('HO:') === 0) {
    const h = handoversVisible(c, user).find(x => 'HO:' + x.id === a.taskId);
    if (!h) throw new Error('File not found');
  } else taskIn(c, a.taskId); // same visibility as the task (contractors: own jobs only)
  return { ok: true, name: a.name, mimeType: a.mimeType, data: readFile(a.fileId) };
}

function calendar(c, from, to) {
  validateDate(from); validateDate(to);
  const events = [];
  const tasks = vesselTasks(c);
  tasks.forEach(t => {
    if (t.state !== 'Open' || !t.dueDate) return;
    let date = t.dueDate, first = true, guard = 0;
    while (date <= to && guard++ < 500) {
      if (date >= from) {
        events.push({ taskId: t.id, title: t.title, system: t.system, type: t.type,
                      date, time: t.dueTime, projected: !first, color: first ? colorFor(t) : 'projected' });
      }
      if (!isTrue(t.recurring)) break;
      date = addInterval(date, t.intervalValue, t.intervalUnit);
      first = false;
    }
  });
  const titles = {};
  tasks.forEach(t => titles[t.id] = t.title);
  const names = crewNames();
  readTable('Completions').forEach(x => {
    if (titles[x.taskId] !== undefined && x.performedDate >= from && x.performedDate <= to) {
      events.push({ taskId: x.taskId, title: titles[x.taskId], date: x.performedDate,
                    color: 'done', completed: true, timing: x.timing, by: names[x.performedBy] || '' });
    }
  });
  events.sort((a, b) => a.date < b.date ? -1 : 1);
  return { ok: true, today: today(), events };
}

function colorFor(t) {
  if (t.state !== 'Open') return 'done';
  if (!t.dueDate) return 'none';
  const d = daysBetween(today(), t.dueDate);
  if (d < 0) return 'red';
  if (d <= CONFIG.AMBER_DAYS) return 'amber';
  return 'green';
}

function decorate(c, t, names, user) {
  const out = {};
  SHEETS.Tasks.forEach(k => { if (k !== 'reminderLog') out[k] = t[k]; });
  out.recurring = isTrue(t.recurring);
  out.color = colorFor(t);
  out.daysUntilDue = t.dueDate ? daysBetween(today(), t.dueDate) : null;
  out.createdByName = names[t.createdBy] || '';
  out.assignedToName = names[t.assignedTo] || '';
  out.lastPerformedByName = names[t.lastPerformedBy] || '';
  out.department = DEPARTMENTS[t.system] || 'any';
  out.departmentLabel = DEPT_LABELS[out.department] || '';
  out.canSignOff = canSignOff(c, user, t);
  out.canEdit = canEdit(c, user, t);
  return out;
}

// ───────────────────────── REMINDERS ─────────────────────────
function dailyReminders() {
  try { withLock(purgeExpiredSessions); } catch (e) {}
  const t = today();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const vessels = readTable('Vessels').filter(v => isTrue(v.active));
    const users = {};
    readTable('Users').forEach(u => users[u.id] = u);
    const members = readTable('Memberships').filter(m => m.status === 'active');
    const tasks = readTable('Tasks');

    vessels.forEach(v => {
      const overdue = [], upcoming = [];
      tasks.filter(task => task.vesselId === v.id).forEach(task => {
        if (task.state !== 'Open' || !task.dueDate) return;
        const d = daysBetween(t, task.dueDate);
        let log = {};
        try { log = task.reminderLog ? JSON.parse(task.reminderLog) : {}; } catch (e) {}
        if (log.dueDate !== task.dueDate) log = { dueDate: task.dueDate, sent: [], lastOverdue: '' };
        let send = false;
        if (d < 0) {
          if (!log.lastOverdue || daysBetween(log.lastOverdue, t) >= CONFIG.OVERDUE_REMIND_EVERY) {
            log.lastOverdue = t; send = true; overdue.push({ task, d });
          }
        } else {
          const hits = CONFIG.REMINDER_DAYS.filter(m => d <= m && log.sent.indexOf(m) === -1);
          if (hits.length) { log.sent = log.sent.concat(hits); send = true; upcoming.push({ task, d }); }
        }
        if (send) { task.reminderLog = JSON.stringify(log); update('Tasks', task._row, task); }
      });
      if (!overdue.length && !upcoming.length) return;
      const emails = members.filter(m => m.vesselId === v.id && !permsOfMember(m).contractor && users[m.userId] && isTrue(users[m.userId].active))
        .map(m => users[m.userId].email).filter(Boolean);
      if (!emails.length) return;

      const row = (x, color) =>
        '<tr><td style="padding:6px 10px;border-left:6px solid ' + color + '">' + esc(x.task.title) +
        (x.task.system ? ' <span style="color:#777">(' + esc(x.task.system) + ')</span>' : '') +
        '</td><td style="padding:6px 10px">' + x.task.dueDate + '</td><td style="padding:6px 10px">' +
        (x.d < 0 ? Math.abs(x.d) + ' days overdue' : x.d === 0 ? 'Due today' : 'Due in ' + x.d + ' days') + '</td></tr>';
      let html = '<h2>' + esc(v.name) + ' maintenance reminders</h2><table style="border-collapse:collapse">';
      overdue.sort((a, b) => a.d - b.d).forEach(x => html += row(x, '#d32f2f'));
      upcoming.sort((a, b) => a.d - b.d).forEach(x => html += row(x, x.d <= CONFIG.AMBER_DAYS ? '#f9a825' : '#2e7d32'));
      html += '</table>' + appLink();
      sendMail(emails.join(','), v.name + ': ' + (overdue.length ? overdue.length + ' overdue, ' : '') +
               upcoming.length + ' coming due', html);
    });
  } finally {
    lock.releaseLock();
  }
}

// ───────────────────────── DAILY GOOGLE SHEETS BACKUP ─────────────────────────
/**
 * Run once from the Apps Script editor after upgrading to 2.1:
 * approves the new Drive permissions, installs the daily backup, and sends a first backup now.
 */
function setupBackups() {
  installDailyTrigger();
  const r = runBackups();
  Logger.log('Backups sent for ' + r.vessels + ' vessel(s). Files are in Drive → "' + CONFIG.BACKUP_FOLDER + '".');
  const c = crewRecordBackups();
  Logger.log('Crew records sent: ' + c.sent + ' (each crew member gets theirs every ' + CONFIG.CREW_RECORD_EVERY_DAYS + ' days).');
  return r;
}

/** Daily trigger. One Google Sheet per vessel, emailed to its Captain(s); one combined email to CJM admins. */
function dailyBackups() {
  runBackups();
  try { crewRecordBackups(); } catch (e) { Logger.log('Crew records: ' + e.message); }
}

function runBackups(onlyVesselId) {
  const users = {};
  readTable('Users').forEach(u => users[u.id] = u);
  const admins = Object.keys(users).map(k => users[k]).filter(u => isTrue(u.isAdmin) && isTrue(u.active)).map(u => u.email);
  const members = readTable('Memberships').filter(m => m.status === 'active');
  const vessels = readTable('Vessels').filter(v => isTrue(v.active) && (!onlyVesselId || v.id === onlyVesselId));
  const stamp = today();
  const root = backupFolder(null);
  const forAdmin = [];

  vessels.forEach(v => {
    const file = buildBackupSheet(v, users, stamp, root);
    const xlsx = exportXlsx(file.id, v.name + ' backup ' + stamp + '.xlsx');
    const to = members.filter(m => m.vesselId === v.id && CONFIG.BACKUP_TO.indexOf(roleOf(m).access) !== -1 &&
                                   users[m.userId] && isTrue(users[m.userId].active))
      .map(m => users[m.userId].email).filter(e => admins.indexOf(e) === -1);
    shareFolder(file.folder, to.filter(e => !isDemoEmail(e)));
    if (to.length) {
      sendMail(to.join(','), v.name + ' maintenance backup ' + stamp,
        backupSummaryHtml(v, file) + '<p><a href="' + file.url + '">Open in Google Sheets</a></p>' +
        '<p style="color:#666">An Excel copy is attached for offline use.</p>' + appLink(), xlsx ? [xlsx] : []);
    }
    forAdmin.push({ v, file, xlsx });
  });

  if (admins.length && forAdmin.length) {
    sendMail(admins.join(','), CONFIG.APP_NAME + ' daily backup ' + stamp + ' (' + forAdmin.length + ' vessel' + (forAdmin.length > 1 ? 's' : '') + ')',
      forAdmin.map(x => backupSummaryHtml(x.v, x.file) + '<p><a href="' + x.file.url + '">Open ' + esc(x.v.name) + ' in Google Sheets</a></p>').join('<hr>') +
      '<p style="color:#666">Excel copies are attached. All backups are in your Google Drive folder "' + esc(CONFIG.BACKUP_FOLDER) + '".</p>',
      forAdmin.map(x => x.xlsx).filter(Boolean));
  }
  cleanupBackups(root);
  return { ok: true, vessels: forAdmin.length,
           files: forAdmin.map(x => ({ vessel: x.v.name, url: x.file.url, counts: x.file.counts })) };
}

function sendBackupNow(user, vesselId) {
  const r = runBackups(vesselId || '');
  audit(user.id, 'sendBackup', '', r.vessels + ' vessel(s)', vesselId || '');
  return r;
}

function backupFolder(vessel) {
  const name = CONFIG.BACKUP_FOLDER;
  const it = DriveApp.getFoldersByName(name);
  const root = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  if (!vessel) return root;
  const sub = root.getFoldersByName(vessel.name);
  return sub.hasNext() ? sub.next() : root.createFolder(vessel.name);
}

function shareFolder(folder, emails) {
  if (!emails.length) return;
  let have = [];
  try { have = folder.getViewers().concat(folder.getEditors()).map(u => String(u.getEmail()).toLowerCase()); } catch (e) {}
  emails.filter(e => have.indexOf(e.toLowerCase()) === -1).forEach(e => {
    try { folder.addViewer(e); } catch (err) { Logger.log('Could not share backups with ' + e + ': ' + err.message); }
  });
}

function buildBackupSheet(v, users, stamp, root) {
  const name = (u) => (users[u] ? users[u].name : '');
  const tasks = readTable('Tasks').filter(t => t.vesselId === v.id);
  const open = tasks.filter(t => t.state === 'Open');
  const notes = readTable('Notes');
  const lastNote = {};
  notes.forEach(n => { if (!lastNote[n.taskId] || lastNote[n.taskId].createdAt < n.createdAt) lastNote[n.taskId] = n; });
  const label = { red: 'Overdue', amber: 'Due soon', green: 'On schedule', none: 'Open', done: 'Closed' };
  const every = (t) => isTrue(t.recurring) ? 'Every ' + t.intervalValue + ' ' + t.intervalUnit : 'One-time';
  const days = (t) => t.dueDate ? daysBetween(today(), t.dueDate) : '';

  const routine = open.filter(t => t.type !== 'Issue')
    .sort((a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1)
    .map(t => [label[colorFor(t)], t.title, t.system, t.dueDate, t.dueTime, days(t), every(t), name(t.assignedTo),
               t.lastPerformed, name(t.lastPerformedBy), t.description]);
  const issues = open.filter(t => t.type === 'Issue')
    .sort((a, b) => a.createdAt < b.createdAt ? -1 : 1)
    .map(t => [label[colorFor(t)], t.title, t.system, (t.createdAt || '').slice(0, 10), name(t.createdBy), name(t.assignedTo),
               t.dueDate, t.description, lastNote[t.id] ? lastNote[t.id].text : '', lastNote[t.id] ? (lastNote[t.id].createdAt || '').slice(0, 10) : '']);
  const ids = {};
  tasks.forEach(t => ids[t.id] = t);
  const since = addInterval(today(), -30, 'days');
  const signoffs = readTable('Completions').filter(c => ids[c.taskId] && c.performedDate >= since)
    .sort((a, b) => a.performedDate < b.performedDate ? 1 : -1)
    .map(c => [c.performedDate, ids[c.taskId].title, ids[c.taskId].system, c.dueDate, c.timing, name(c.performedBy), c.notes]);

  const ss = SpreadsheetApp.create(v.name + ' backup ' + stamp);
  const tabs = [
    ['Open tasks', ['Status', 'Task', 'System', 'Due date', 'Due time', 'Days to due', 'Schedule', 'Assigned to', 'Last done', 'Last done by', 'Description'], routine, 0],
    ['Open issues', ['Status', 'Issue', 'System', 'Reported', 'Reported by', 'Assigned to', 'Fix by', 'Description', 'Latest note', 'Note date'], issues, 0],
    ['Sign-offs (30 days)', ['Performed', 'Task', 'System', 'Was due', 'Timing', 'By', 'Notes'], signoffs, -1]
  ];
  const fills = { 'Overdue': '#f6d5d2', 'Due soon': '#fbecc6', 'On schedule': '#dcefdf', 'Open': '#e6e1f3' };
  tabs.forEach((tab, i) => {
    const sh = i === 0 ? ss.getSheets()[0].setName(tab[0]) : ss.insertSheet(tab[0]);
    const rows = [tab[1]].concat(tab[2].length ? tab[2] : [[tab[2] === signoffs ? 'No sign-offs in the last 30 days' : 'None']]);
    const width = tab[1].length;
    const grid = rows.map(r => { const x = r.map(c => c === undefined || c === null ? '' : String(c)); while (x.length < width) x.push(''); return x.slice(0, width); });
    sh.getRange(1, 1, grid.length, width).setNumberFormat('@').setValues(grid);
    sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#12324a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    if (tab[3] === 0 && tab[2].length) {
      sh.getRange(2, 1, tab[2].length, 1).setBackgrounds(tab[2].map(r => [fills[r[0]] || '#ffffff']));
    }
    sh.autoResizeColumns(1, width);
  });
  const info = ss.insertSheet('About', 0);
  info.getRange(1, 1, 6, 2).setValues([
    ['Vessel', v.name], ['Backup date', stamp], ['Open tasks', String(routine.length)],
    ['Open issues', String(issues.length)], ['Overdue', String(open.filter(t => colorFor(t) === 'red').length)],
    ['Source', CONFIG.APP_NAME + (CONFIG.APP_URL ? ' ' + CONFIG.APP_URL : '')]]);
  info.getRange(1, 1, 6, 1).setFontWeight('bold');
  info.autoResizeColumns(1, 2);

  const file = DriveApp.getFileById(ss.getId());
  const folder = backupFolder(v);
  file.moveTo(folder);
  return { id: ss.getId(), url: ss.getUrl(), folder,
           counts: { tasks: routine.length, issues: issues.length, overdue: open.filter(t => colorFor(t) === 'red').length, signoffs: signoffs.length } };
}

function exportXlsx(id, filename) {
  try {
    SpreadsheetApp.flush();
    const res = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    return res.getBlob().setName(filename);
  } catch (e) {
    Logger.log('Excel export failed: ' + e.message);
    return null;
  }
}

function backupSummaryHtml(v, file) {
  const c = file.counts;
  return '<h3 style="margin:0 0 6px">' + esc(v.name) + '</h3>' +
    '<p style="margin:0">' + c.tasks + ' open tasks, ' + c.issues + ' open issues, ' +
    (c.overdue ? '<b style="color:#b8322a">' + c.overdue + ' overdue</b>' : '0 overdue') + ', ' +
    c.signoffs + ' sign-offs in the last 30 days.</p>';
}

function cleanupBackups(folder, depth) {
  depth = depth || 0;
  const cutoff = new Date(Date.now() - CONFIG.BACKUP_KEEP_DAYS * 86400000);
  if (depth > 0) {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      if (f.getDateCreated() < cutoff) f.setTrashed(true);
    }
  }
  if (depth >= 3) return;
  const subs = folder.getFolders();
  while (subs.hasNext()) cleanupBackups(subs.next(), depth + 1);
}

// ───────────────────────── AUDIT / MAIL ─────────────────────────
function audit(userId, action, taskId, details, vesselId) {
  insert('Audit', { timestamp: nowIso(), userId, action, taskId, details, vesselId: vesselId || '' });
}

/** Address of the website for links in emails: CONFIG.APP_URL, or the site the request came from. */
function siteUrl() {
  return String(CONFIG.APP_URL || REQUEST_ORIGIN || '').replace(/\/+$/, '');
}

function appLink() {
  return siteUrl() ? '<p><a href="' + siteUrl() + '">Open ' + esc(CONFIG.APP_NAME) + '</a></p>' : '';
}

/** Demo and test accounts use reserved domains (.test, .invalid, example.com) and never receive email. */
function isDemoEmail(e) { return /@([^@\s,]+\.)?(test|invalid|example\.(com|org|net))$/i.test(String(e || '').trim()); }

function sendMail(to, subject, html, attachments) {
  to = String(to || '').split(',').map(x => x.trim()).filter(x => x && !isDemoEmail(x)).join(',');
  if (!to) return true; // only demo/test recipients: nothing is sent
  try {
    MailApp.sendEmail({ to, subject, name: CONFIG.APP_NAME, attachments: attachments || [],
      htmlBody: '<div style="font-family:Arial,sans-serif;color:#12324a">' + html + '</div>' });
    return true;
  } catch (e) {
    Logger.log('Email failed: ' + e.message);
    return false;
  }
}

// ───────────────────────── SHEET HELPERS ─────────────────────────
const TABLE_CACHE = {}; // lives for one request only

const HEADERS_CHECKED = {};

const AUTO_TABS = ['TaskReviews', 'Attachments', 'StoredFiles', 'VesselRequests', 'Rotations', 'RotationChanges', 'RotationRules', 'Handovers', 'WorkSubmissions'];

function sheet(name) {
  let sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh && AUTO_TABS.indexOf(name) !== -1) {
    sh = SpreadsheetApp.getActive().insertSheet(name);
    sh.getRange('A:Z').setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  if (!sh) throw new Error('Missing tab "' + name + '". Run setupPlatform() in Apps Script.');
  if (!HEADERS_CHECKED[name] && SHEETS[name]) {
    HEADERS_CHECKED[name] = true;
    const want = SHEETS[name];
    const have = sh.getRange(1, 1, 1, want.length).getValues()[0];
    if (want.some((h, i) => have[i] !== h)) sh.getRange(1, 1, 1, want.length).setValues([want]).setFontWeight('bold');
  }
  return sh;
}

function readSheetRows(sh) {
  const values = sh.getDataRange().getValues();
  const headers = values.shift() || [];
  return values.filter(r => r.some(v => v !== '')).map((r, i) => {
    const o = { _row: i + 2 };
    headers.forEach((h, j) => {
      const v = r[j];
      o[h] = v == null ? '' : v instanceof Date ? Utilities.formatDate(v, tz(), 'yyyy-MM-dd') : String(v);
    });
    return o;
  });
}

function readTable(name) {
  if (!TABLE_CACHE[name]) TABLE_CACHE[name] = readSheetRows(sheet(name));
  return TABLE_CACHE[name].map(o => Object.assign({}, o));
}

function insert(name, obj) {
  delete TABLE_CACHE[name];
  sheet(name).appendRow(SHEETS[name].map(h => obj[h] === undefined || obj[h] === null ? '' : String(obj[h])));
}

function update(name, row, obj) {
  delete TABLE_CACHE[name];
  sheet(name).getRange(row, 1, 1, SHEETS[name].length)
    .setValues([SHEETS[name].map(h => obj[h] === undefined || obj[h] === null ? '' : String(obj[h]))]);
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ───────────────────────── DATE / MISC ─────────────────────────
function tz() { return Session.getScriptTimeZone(); }
function today() { return Utilities.formatDate(new Date(), tz(), 'yyyy-MM-dd'); }
function nowIso() { return new Date().toISOString(); }

function parseDate(s) {
  const p = String(s).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2], 12);
}

function fmtDate(d) { return Utilities.formatDate(d, tz(), 'yyyy-MM-dd'); }

function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }

function addInterval(dateStr, value, unit) {
  const d = parseDate(dateStr), n = Number(value);
  if (unit === 'days') d.setDate(d.getDate() + n);
  else if (unit === 'weeks') d.setDate(d.getDate() + 7 * n);
  else if (unit === 'months') d.setMonth(d.getMonth() + n);
  else if (unit === 'years') d.setFullYear(d.getFullYear() + n);
  else throw new Error('Bad interval unit');
  return fmtDate(d);
}

function validateDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) throw new Error('Dates must be yyyy-MM-dd');
}

function validateInterval(value, unit) {
  if (!(Number(value) > 0)) throw new Error('Recurring tasks need an interval greater than 0');
  if (['days', 'weeks', 'months', 'years'].indexOf(unit) === -1) throw new Error('Interval unit must be days, weeks, months or years');
}

function isTrue(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function newId(prefix) { return prefix + '-' + Utilities.getUuid().slice(0, 8).toUpperCase(); }
function esc(s) { return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run this once from the Apps Script editor (choose "authorizeDrive" next to Run, then press Run)
 * to show Google's permission window for Google Drive. Photos and files on notes need it.
 */
function authorizeDrive() { DriveApp.getRootFolder(); }


// ═════════════════════════ DEMO VESSEL (for showing customers) ═════════════════════════
/**
 * Run once from the Apps Script editor: choose "createDemoVessel" next to Run, then press Run.
 * Builds M/Y Meridian Star (118 ft) with 5 crew, an owner and a contractor, a full maintenance program,
 * history, notes, work reviews and crew profiles. Every demo account uses an @meridianstar.test address:
 * that domain cannot receive mail and the script never emails it. Demo crew are hidden from real customers in Find crew.
 * Log in as any of them with DEMO_PASSWORD. To take it all down later, run removeDemoVessel.
 */
const DEMO_VESSEL = 'M/Y Meridian Star';
const DEMO_PASSWORD = 'Meridian2026';

function createDemoVessel() {
  return withLock(() => {
    if (readTable('Vessels').some(v => v.name === DEMO_VESSEL)) throw new Error(DEMO_VESSEL + ' already exists. Run removeDemoVessel first to rebuild it.');
    const admin = readTable('Users').find(u => isTrue(u.isAdmin) && isTrue(u.active));
    const D = (n) => addInterval(today(), n, 'days');
    const at = (n, hh) => D(n) + 'T' + (hh || '14') + ':00:00Z';
    const P = {};
    const person = (key, name, email, profile) => {
      if (readTable('Users').some(u => u.email === email)) throw new Error(email + ' already exists');
      const salt = Utilities.getUuid(), id = newId('U');
      insert('Users', { id, name, email, passwordHash: hash(DEMO_PASSWORD, salt), salt, active: 'TRUE', isAdmin: 'FALSE', createdAt: at(-700) });
      P[key] = id;
      if (profile) insert('Profiles', Object.assign({ userId: id, photo: '', showContact: 'TRUE', updatedAt: at(-3), shareReviews: 'FALSE', shareId: '' }, profile,
        { certifications: JSON.stringify(profile.certifications || []), experience: JSON.stringify(profile.experience || []) }));
    };
    person('captain', 'Ryan Calder', 'ryan.calder@meridianstar.test', {
      headline: 'Captain / Master 3000GT', location: 'Fort Lauderdale, FL', operatingArea: 'Florida, Bahamas, Caribbean, Mediterranean',
      yearsExperience: '18', availability: 'Employed', phone: '+1 (555) 010-0101', languages: 'English, Spanish',
      bio: 'Eighteen years on motor yachts from 30 to 60 m. Runs a tight maintenance program and a calm bridge. Med and Caribbean seasons, Atlantic crossings.',
      shareReviews: 'TRUE', shareId: 'demoryancalder01',
      certifications: [{ name: 'Master 3000GT (Yacht)', expires: D(1100) }, { name: 'STCW Basic Safety Training', expires: D(640) },
                       { name: 'ENG1 Medical', expires: D(38) }, { name: 'GMDSS GOC', expires: D(1500) }, { name: 'Ship Security Officer', expires: '' }],
      experience: [{ vessel: 'M/Y Atlantic Breeze (52 m)', position: 'Captain', years: '2019–2024', notes: 'Two Atlantic crossings, Med and Caribbean seasons' },
                   { vessel: 'M/Y Solara (40 m)', position: 'Chief Officer', years: '2014–2019', notes: '' }] });
    person('chief', 'Marco Bellini', 'marco.bellini@meridianstar.test', {
      headline: 'Chief Engineer Y2', location: 'Fort Lauderdale, FL', operatingArea: 'Florida, Bahamas, Mediterranean',
      yearsExperience: '14', availability: 'Employed', phone: '+1 (555) 010-0102', languages: 'Italian, English',
      bio: 'MTU and CAT specialist. Keeps clean engine rooms and complete logs. Refit experience in Viareggio and Fort Lauderdale.',
      certifications: [{ name: 'Y2 Engineer Certificate of Competency', expires: D(900) }, { name: 'STCW Basic Safety Training', expires: D(420) },
                       { name: 'ENG1 Medical', expires: D(-12) }, { name: 'MTU Series 2000 factory course', expires: '' }],
      experience: [{ vessel: 'M/Y Corsara (45 m)', position: 'Chief Engineer', years: '2018–2024', notes: 'Full refit, new stabilizers' }] });
    person('bosun', 'Jake Turner', 'jake.turner@meridianstar.test', {
      headline: 'Bosun, RYA Yachtmaster Offshore', location: 'Palma de Mallorca', operatingArea: 'Mediterranean, Caribbean, Florida',
      yearsExperience: '8', availability: 'Employed', phone: '+1 (555) 010-0103', languages: 'English',
      bio: 'Deck lead who loves a well-kept tender and a perfect varnish. PWC and watersports instructor.',
      certifications: [{ name: 'RYA Yachtmaster Offshore', expires: '' }, { name: 'STCW Basic Safety Training', expires: D(300) },
                       { name: 'PWC Instructor', expires: D(200) }, { name: 'ENG1 Medical', expires: D(260) }],
      experience: [{ vessel: 'M/Y Blue Haven (38 m)', position: 'Lead Deckhand', years: '2019–2023', notes: '' }] });
    person('stew', 'Sophie Laurent', 'sophie.laurent@meridianstar.test', {
      headline: 'Chief Stewardess', location: 'Antibes, France', operatingArea: 'Mediterranean, Caribbean',
      yearsExperience: '10', availability: 'Employed', phone: '+1 (555) 010-0104', languages: 'French, English, Italian',
      bio: 'Five-star guest service, wine and floral. Builds calm, well-trained interior teams.',
      certifications: [{ name: 'GUEST Interior Management', expires: '' }, { name: 'WSET Level 3 Wines', expires: '' },
                       { name: 'STCW Basic Safety Training', expires: D(510) }, { name: 'Food Safety Level 2', expires: D(75) }, { name: 'ENG1 Medical', expires: D(330) }],
      experience: [{ vessel: 'M/Y Lumiere (47 m)', position: 'Second Stewardess', years: '2016–2021', notes: '' }] });
    person('deckhand', "Liam O'Neill", 'liam.oneill@meridianstar.test', {
      headline: 'Deckhand, RYA Powerboat Level 2', location: 'Fort Lauderdale, FL', operatingArea: 'Florida, Bahamas',
      yearsExperience: '2', availability: 'Open to offers', phone: '+1 (555) 010-0105', languages: 'English',
      bio: 'Second season on yachts. Tender driving, washdowns, line handling and a fast learner on the engineering side.',
      certifications: [{ name: 'STCW Basic Safety Training', expires: D(1200) }, { name: 'RYA Powerboat Level 2', expires: '' }, { name: 'ENG1 Medical', expires: D(500) }],
      experience: [{ vessel: 'M/Y Seabird (30 m)', position: 'Deckhand', years: '2024', notes: 'Bahamas season' }] });
    person('owner', 'Daniel Hart', 'daniel.hart@meridianstar.test', null);
    person('contractor', 'Coastline Stabilizer Service', 'service@coastline-stab.test', {
      headline: 'Stabilizer and hydraulics technician', location: 'Fort Lauderdale, FL', operatingArea: 'Florida', yearsExperience: '12',
      availability: 'Available', phone: '+1 (555) 010-0107', languages: 'English', certifications: [], experience: [] });

    const vid = newId('V');
    insert('Vessels', { id: vid, name: DEMO_VESSEL, type: 'Motor yacht', length: '118 ft (36 m)', homePort: 'Fort Lauderdale, FL',
                        active: 'TRUE', createdAt: at(-700), createdBy: admin ? admin.id : '' });
    const member = (key, title, access, depts, joined) => insert('Memberships', { id: newId('M'), vesselId: vid, userId: P[key], position: title, status: 'active',
      joinedAt: at(joined), leftAt: '', invitedBy: admin ? admin.id : '', access, departments: depts.join(',') });
    member('owner', 'Yacht Owner', 'oversight', [], -700);
    member('captain', 'Captain / Master', 'command', [], -540);
    member('chief', 'Chief Engineer', 'lead', ['engine'], -420);
    member('bosun', 'Bosun (Deck Supervisor)', 'lead', ['deck'], -300);
    member('stew', 'Chief Steward / Stewardess', 'lead', ['interior', 'galley'], -260);
    member('deckhand', 'Deckhand', 'supervised', [], -130);
    member('contractor', 'Independent Contractor / External Technician', 'contractor', [], -20);
    audit(admin ? admin.id : '', 'createVessel', '', DEMO_VESSEL + ' (demo)', vid);

    const NOTE = { done: ['All within limits, logged in engine book.', 'Done, no issues found.', 'Completed, photos in the notes.', 'Replaced as per OEM manual.', 'Checked and tested OK.'] };
    let n = 0;
    const task = (o) => {
      const id = newId('T'), issue = o.type === 'Issue', every = o.every || '', unit = o.unit || '';
      const t = { id, title: o.title, description: o.desc || '', system: o.system, type: issue ? 'Issue' : 'Routine',
        dueDate: issue ? '' : D(o.due), dueTime: '', recurring: every ? 'TRUE' : 'FALSE', intervalValue: every, intervalUnit: unit,
        assignedTo: o.to ? P[o.to] : '', state: o.state || 'Open', createdBy: P[o.by || 'captain'], createdAt: at(o.created || -360),
        lastPerformed: '', lastPerformedBy: '', resolution: o.resolution || '', reminderLog: '', vesselId: vid };
      audit(t.createdBy, 'create', id, t.type + ': ' + t.title, vid);
      // past sign-offs for recurring jobs, working back from the current due date
      const history = [];
      if (every && o.past) {
        let due = t.dueDate;
        for (let i = 0; i < o.past; i++) {
          due = addInterval(due, -every, unit);
          if (due < D(-330)) break;
          const late = (n++ % 5 === 3) ? 3 : 0;
          const performed = addInterval(due, late ? late : -1, 'days');
          if (performed > today()) continue;
          history.unshift({ due, performed, late });
        }
      }
      history.forEach((h, i) => {
        const cid = newId('X'), who = P[o.to || 'captain'], note = NOTE.done[(n + i) % NOTE.done.length];
        insert('Completions', { id: cid, taskId: id, dueDate: h.due, performedDate: h.performed, performedBy: who,
          timing: h.late ? 'Late by ' + h.late + 'd' : 'On time', notes: note, loggedAt: h.performed + 'T16:00:00Z' });
        insert('Notes', { id: newId('N'), taskId: id, userId: who, text: note, createdAt: h.performed + 'T16:00:00Z' });
        audit(who, 'complete', id, 'Performed ' + h.performed, vid);
        t.lastPerformed = h.performed; t.lastPerformedBy = who;
        if (o.review && i === history.length - 1 && who !== P.captain) {
          const r = o.review;
          insert('TaskReviews', { id: newId('R'), vesselId: vid, taskId: id, completionId: cid, userId: who, requestedAt: h.performed + 'T17:00:00Z',
            message: 'Could you review this one?', status: r.score ? 'reviewed' : 'requested', reviewerId: r.score ? P.captain : '',
            score: r.score ? String(r.score) : '', text: r.text || '', reviewedAt: r.score ? addInterval(h.performed, 1, 'days') + 'T09:00:00Z' : '' });
        }
      });
      if (o.issueDone) {
        const cid = newId('X');
        insert('Completions', { id: cid, taskId: id, dueDate: '', performedDate: D(o.issueDone), performedBy: P[o.to], timing: 'No due date',
          notes: o.resolution, loggedAt: at(o.issueDone) });
        t.lastPerformed = D(o.issueDone); t.lastPerformedBy = P[o.to];
        audit(P[o.to], 'complete', id, 'Resolved ' + D(o.issueDone) + ': ' + o.resolution, vid);
      }
      insert('Tasks', t);
      (o.notes || []).forEach(([who, text, day]) => {
        insert('Notes', { id: newId('N'), taskId: id, userId: P[who], text, createdAt: at(day) });
        audit(P[who], 'note', id, text.slice(0, 100), vid);
      });
      return id;
    };

    // Engineering
    task({ title: 'Main engines oil & filter change (port and starboard)', system: 'Main engines', due: -4, every: 3, unit: 'months', to: 'chief', by: 'chief', past: 3,
           desc: 'MTU 16V 2000 M96. 2 x 290 L oil, 4 oil filters per engine. Take oil samples for analysis.', review: { score: 9, text: 'Spotless job and samples sent the same day.' },
           notes: [['chief', 'Oil and filters aboard. Starting tomorrow 0700, engines need 12 h to cool.', -1]] });
    task({ title: 'Main engine raw-water pump impellers', system: 'Main engines', due: 6, every: 12, unit: 'months', to: 'chief', by: 'chief', past: 1 });
    task({ title: 'Main engine and shaft zinc anodes', system: 'Main engines', due: 45, every: 6, unit: 'months', to: 'chief', by: 'chief', past: 1 });
    task({ title: 'Generator 1 service (oil, filters, belts, impeller)', system: 'Generators', due: 3, every: 3, unit: 'months', to: 'chief', by: 'chief', past: 3,
           desc: 'Northern Lights 40 kW. Check exhaust elbow for carbon.' });
    task({ title: 'Generator 2 service (oil, filters, belts, impeller)', system: 'Generators', due: 33, every: 3, unit: 'months', to: 'chief', by: 'chief', past: 3 });
    task({ title: 'Fuel filter elements (Racor 30 micron)', system: 'Fuel', due: -1, every: 1, unit: 'months', to: 'chief', by: 'chief', past: 6 });
    task({ title: 'Fuel polishing and tank sounding', system: 'Fuel', due: 19, every: 3, unit: 'months', to: 'chief', by: 'chief', past: 2 });
    task({ title: 'Watermaker membrane flush and pre-filters', system: 'Plumbing & water', due: 2, every: 2, unit: 'weeks', to: 'deckhand', by: 'chief', past: 8,
           review: { score: 8, text: 'Good work. Log the TDS reading every time.' } });
    task({ title: 'Chiller seawater strainers', system: 'HVAC', due: 12, every: 1, unit: 'months', to: 'chief', by: 'chief', past: 6 });
    task({ title: 'Stabilizer hydraulic oil and seal inspection', system: 'Steering & stabilizers', due: 20, every: 6, unit: 'months', to: 'chief', by: 'chief', past: 1 });
    task({ title: 'House and start battery load test', system: 'Electrical', due: 60, every: 6, unit: 'months', to: 'chief', by: 'chief', past: 1 });
    task({ title: 'Radar, AIS and chart plotter function check', system: 'Navigation & electronics', due: 8, every: 1, unit: 'months', to: 'captain', by: 'captain', past: 6 });
    // Deck and safety
    task({ title: 'Life raft annual service (2 x 12-person)', system: 'Safety equipment', due: 41, every: 12, unit: 'months', to: 'bosun', by: 'captain', past: 1,
           desc: 'Book with the approved service station two weeks ahead. Swap with loan rafts.' });
    task({ title: 'EPIRB and SART battery and hydrostatic release check', system: 'Safety equipment', due: 18, every: 12, unit: 'months', to: 'captain', by: 'captain', past: 1 });
    task({ title: 'Fire extinguisher monthly inspection', system: 'Safety equipment', due: 5, every: 1, unit: 'months', to: 'deckhand', by: 'bosun', past: 6,
           review: { score: 10, text: 'Thorough, every tag signed and dated.' } });
    task({ title: 'Monthly fire and abandon-ship drill', system: 'Safety equipment', due: 11, every: 1, unit: 'months', to: 'captain', by: 'captain', past: 6 });
    task({ title: 'Teak deck clean and seal', system: 'Hull & deck', due: 16, every: 1, unit: 'months', to: 'deckhand', by: 'bosun', past: 6,
           review: { score: 0 } });
    task({ title: 'Anchor windlass service and chain inspection', system: 'Hull & deck', due: -7, every: 6, unit: 'months', to: 'bosun', by: 'bosun', past: 1,
           notes: [['bosun', 'Waiting on the new gypsy seal kit. ETA Friday.', -2]] });
    task({ title: 'Tender outboard 100-hour service', system: 'Tender & toys', due: 25, every: 3, unit: 'months', to: 'bosun', by: 'bosun', past: 2 });
    task({ title: 'Jet ski winterization check', system: 'Tender & toys', due: 70, every: 6, unit: 'months', to: 'bosun', by: 'bosun', past: 1 });
    // Interior, galley, medical
    task({ title: 'Guest cabins deep clean and linen rotation', system: 'Interior', due: 2, every: 1, unit: 'weeks', to: 'stew', by: 'stew', past: 10 });
    task({ title: 'Interior inventory count (linen, amenities, glassware)', system: 'Interior', due: 9, every: 1, unit: 'months', to: 'stew', by: 'stew', past: 5 });
    task({ title: 'Galley hood filters degrease', system: 'Galley', due: 4, every: 1, unit: 'months', to: 'stew', by: 'stew', past: 6 });
    task({ title: 'Medical kit expiry check', system: 'Medical', due: 27, every: 3, unit: 'months', to: 'captain', by: 'captain', past: 2 });
    // One-time and contractor
    task({ title: 'Annual stabilizer service (contractor visit)', system: 'Steering & stabilizers', due: 14, to: 'contractor', by: 'captain',
           desc: 'Coastline Stabilizer Service on board 0800. Chief Engineer to attend.' });
    task({ title: 'Haul-out survey preparation', system: 'Hull & deck', due: 55, to: 'bosun', by: 'captain', desc: 'Insurance survey at the yard. Empty bilges, open all hatches.' });
    // Open issues
    task({ title: 'Port generator running 8°C hot at full load', system: 'Generators', type: 'Issue', to: 'chief', by: 'deckhand', created: -6,
           notes: [['deckhand', 'Noticed the high temp alarm at 85% load during the passage to Nassau.', -6],
                   ['chief', 'Heat exchanger likely scaled. Descaling kit ordered, will strip it on Tuesday.', -4]] });
    task({ title: 'Bow thruster intermittent fault on the bridge panel', system: 'Electrical', type: 'Issue', to: 'chief', by: 'captain', created: -3,
           notes: [['captain', 'Lost bow thruster twice while docking. Works from the wing station.', -3]] });
    task({ title: 'Guest cabin 3 AC not cooling', system: 'HVAC', type: 'Issue', to: 'chief', by: 'stew', created: -1 });
    // Resolved issues
    task({ title: 'Starboard bilge pump float switch stuck', system: 'Plumbing & water', type: 'Issue', state: 'Resolved', to: 'chief', by: 'bosun', created: -24,
           issueDone: -21, resolution: 'Float switch replaced with a Rule 35A. Tested with water, alarm working.' });
    task({ title: 'Crew mess hot water heater not heating', system: 'Plumbing & water', type: 'Issue', state: 'Resolved', to: 'chief', by: 'stew', created: -50,
           issueDone: -46, resolution: 'Element burnt out. Replaced 3 kW element and thermostat.' });

    // Recommendations (1–5 stars) from the Captain and the Owner
    const rec = (who, by, rating, text, day) => insert('Reviews', { id: newId('RV'), userId: P[who], reviewerId: P[by], vesselId: vid,
      rating: String(rating), text, createdAt: at(day), updatedAt: at(day) });
    rec('captain', 'owner', 5, 'Ryan runs the boat like a watch. Guests always comment on the crew.', -60);
    rec('chief', 'captain', 5, 'The best-kept engine room I have sailed with. Never a surprise.', -40);
    rec('bosun', 'captain', 4, 'Strong deck lead, great with the tender and toys.', -35);
    rec('stew', 'captain', 5, 'Guests ask for Sophie by name.', -30);
    rec('deckhand', 'captain', 4, 'Hard-working, learns fast, ready for more responsibility.', -15);
    addDemoRotations_();
    return ['Created ' + DEMO_VESSEL + ' with rotations. Log in with any @meridianstar.test account, password ' + DEMO_PASSWORD + '.'];
  });
}

/** Archives the demo vessel and deactivates its demo accounts. History stays in the sheet; nothing real is touched. */
function removeDemoVessel() {
  return withLock(() => {
    const v = readTable('Vessels').find(x => x.name === DEMO_VESSEL);
    if (v) { v.active = 'FALSE'; v.name = DEMO_VESSEL + ' (removed ' + today() + ')'; update('Vessels', v._row, v); }
    readTable('Users').filter(u => /@(meridianstar|coastline-stab)\.test$/.test(u.email)).forEach(u => {
      u.active = 'FALSE'; u.email = u.email + '.removed' + Date.now(); update('Users', u._row, u);
    });
    return ['Demo vessel archived and demo accounts deactivated'];
  });
}

// ═════════════════════════ NEW YACHT REQUESTS ═════════════════════════
// Owners and captains ask CJM to add a yacht. A CJM admin approves (the yacht is created with the
// requester aboard as Captain or Owner) or declines. Both sides are emailed.
const VESSEL_TYPES = ['Motor yacht', 'Sailing yacht', 'Catamaran', 'Expedition yacht', 'Sport fisher', 'Other'];
const REQUEST_ROLES = { captain: 'Captain / Master', owner: 'Yacht Owner', manager: 'Yacht Manager (shore-based)' };

/** Captains and owners (Command or Owner oversight on any vessel), or accounts approved as an Owner or Captain who have no vessel yet. */
function canRequestVessel(user) {
  if (isTrue(user.isAdmin)) return false; // admins add yachts directly in the CJM admin tab
  const mine = readTable('Memberships').filter(m => m.userId === user.id && m.status === 'active');
  if (mine.some(m => ['command', 'oversight'].indexOf(roleOf(m).access) !== -1)) return true;
  if (mine.length) return false;
  return readTable('Requests').some(r => r.email === user.email && r.status === 'approved' && (r.kind === 'Owner' || r.kind === 'Captain'));
}

function vesselRequestView(r, names) {
  return { id: r.id, name: r.name, type: r.type, length: r.length, homePort: r.homePort, role: REQUEST_ROLES[r.role] || r.role,
           roleKey: r.role, message: r.message, status: r.status, createdAt: r.createdAt, handledAt: r.handledAt, note: r.note,
           vesselId: r.vesselId, by: names ? names[r.userId] || '' : undefined, userId: r.userId };
}

function requestVessel(user, v) {
  if (!canRequestVessel(user)) throw new Error('Only owners and captains can request a new yacht. Ask CJM Marine to set you up.');
  const name = clip(v.name, 100);
  if (!name) throw new Error('Enter the yacht name');
  if (!REQUEST_ROLES[v.role]) throw new Error('Choose your role on the yacht');
  if (readTable('Vessels').some(x => isTrue(x.active) && normVessel(x.name) === normVessel(name))) {
    throw new Error('A yacht named ' + name + ' is already on CJM Marine. Ask its captain to invite you, or contact CJM Marine.');
  }
  const mine = readTable('VesselRequests').filter(r => r.userId === user.id && r.status === 'pending');
  if (mine.some(r => normVessel(r.name) === normVessel(name))) throw new Error('You already asked for ' + name + '. CJM Marine will reply by email.');
  if (mine.length >= 5) throw new Error('You have 5 requests waiting. CJM Marine will review them first.');
  const r = { id: newId('VR'), userId: user.id, name, type: VESSEL_TYPES.indexOf(v.type) !== -1 ? v.type : 'Other',
              length: clip(v.length, 20), homePort: clip(v.homePort, 80), role: v.role, message: clip(v.message, 1000),
              status: 'pending', createdAt: nowIso(), handledBy: '', handledAt: '', vesselId: '', note: '' };
  insert('VesselRequests', r);
  audit(user.id, 'requestVessel', '', name, '');
  const admins = requestRecipients('');
  if (admins.length) {
    sendMail(admins.join(','), 'New yacht request: ' + name,
      '<p><b>' + esc(user.name) + '</b> (' + esc(user.email) + ') asked to add a yacht as <b>' + esc(REQUEST_ROLES[r.role]) + '</b>:</p>' +
      '<p><b>' + esc(name) + '</b><br>' + esc([r.type, r.length, r.homePort].filter(Boolean).join(', ')) + '</p>' +
      (r.message ? '<p>“' + esc(r.message) + '”</p>' : '') +
      '<p>Approve or decline it in the CJM admin tab.</p>' + appLink());
  }
  return { ok: true, request: vesselRequestView(r), message: 'Request sent. CJM Marine will email you when ' + name + ' is ready.' };
}

function listVesselRequests(user) {
  const names = crewNames();
  const all = readTable('VesselRequests').sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
  if (isTrue(user.isAdmin)) {
    const emails = {}; readTable('Users').forEach(u => emails[u.id] = u.email);
    return { ok: true, requests: all.filter((r, i) => r.status === 'pending' || i < 30)
      .map(r => Object.assign(vesselRequestView(r, names), { email: emails[r.userId] || '' })) };
  }
  return { ok: true, canRequest: canRequestVessel(user), requests: all.filter(r => r.userId === user.id).slice(0, 20).map(r => vesselRequestView(r)) };
}

function vesselRequestRow(id) {
  const r = readTable('VesselRequests').find(x => x.id === id);
  if (!r) throw new Error('Request not found');
  return r;
}

function cancelVesselRequest(user, id) {
  const r = vesselRequestRow(id);
  if (r.userId !== user.id) throw new Error('Request not found');
  if (r.status !== 'pending') throw new Error('This request was already ' + r.status);
  r.status = 'cancelled'; r.handledBy = user.id; r.handledAt = nowIso();
  update('VesselRequests', r._row, r);
  return { ok: true };
}

function approveVesselRequest(admin, id, edits) {
  const r = vesselRequestRow(id);
  if (r.status !== 'pending') throw new Error('This request was already ' + r.status);
  const requester = readTable('Users').find(u => u.id === r.userId && isTrue(u.active));
  if (!requester) throw new Error('The person who asked is no longer active');
  const made = createVessel(admin, { name: edits.name || r.name, type: edits.type || r.type,
                                     length: edits.length !== undefined ? edits.length : r.length,
                                     homePort: edits.homePort !== undefined ? edits.homePort : r.homePort });
  const role = defaultRole(REQUEST_ROLES[r.role] || 'Captain / Master');
  insert('Memberships', { id: newId('M'), vesselId: made.vessel.id, userId: requester.id, position: role.title, status: 'active',
                          joinedAt: nowIso(), leftAt: '', invitedBy: admin.id, access: role.access, departments: role.depts.join(',') });
  r.status = 'approved'; r.handledBy = admin.id; r.handledAt = nowIso(); r.vesselId = made.vessel.id;
  update('VesselRequests', r._row, r);
  audit(admin.id, 'approveVesselRequest', '', made.vessel.name + ' for ' + requester.name, made.vessel.id);
  sendMail(requester.email, made.vessel.name + ' is ready on ' + CONFIG.APP_NAME,
    '<p>Hello ' + esc(requester.name.split(' ')[0]) + ',</p>' +
    '<p><b>' + esc(made.vessel.name) + '</b> is set up, and you are aboard as <b>' + esc(role.title) + '</b>. ' +
    'Log in and pick it from your vessels to start its maintenance program and invite the crew.</p>' + appLink());
  return { ok: true, vessel: made.vessel };
}

function declineVesselRequest(admin, id, note) {
  const r = vesselRequestRow(id);
  if (r.status !== 'pending') throw new Error('This request was already ' + r.status);
  r.status = 'declined'; r.handledBy = admin.id; r.handledAt = nowIso(); r.note = clip(note, 500);
  update('VesselRequests', r._row, r);
  audit(admin.id, 'declineVesselRequest', '', r.name, '');
  const requester = readTable('Users').find(u => u.id === r.userId);
  if (requester) sendMail(requester.email, 'Your request for ' + r.name,
    '<p>Hello ' + esc(requester.name.split(' ')[0]) + ',</p><p>CJM Marine could not add <b>' + esc(r.name) + '</b> right now.</p>' +
    (r.note ? '<p>“' + esc(r.note) + '”</p>' : '') + '<p>Questions? Email support@cjm-aero.com.</p>');
  return { ok: true };
}

// ═════════════════════════ DELETE ACCOUNT (CJM admin) ═════════════════════════
/**
 * Erases a person's account and personal data: name, email, password, sessions, profile (photo, phone,
 * certificates, experience), vessel memberships, invitations, account and yacht requests, reviews about
 * them and their work reviews. Vessel maintenance history (tasks, sign-offs, notes, files, activity log)
 * is kept for the yacht's records and now shows "Deleted user". The same email can sign up again later.
 */
const DELETED_NAME = 'Deleted user';
function isDeletedUser(u) { return /@deleted\.invalid$/.test(String(u.email || '')); }

function deleteRowsWhere(name, test) {
  const rows = readTable(name).filter(test).sort((a, b) => b._row - a._row);
  rows.forEach(r => sheet(name).deleteRow(r._row));
  delete TABLE_CACHE[name];
  return rows.length;
}

function deleteUser(admin, userId, confirmEmail) {
  if (userId === admin.id) throw new Error('You cannot delete your own account');
  const u = readTable('Users').find(x => x.id === userId);
  if (!u || isDeletedUser(u)) throw new Error('Account not found');
  if (String(confirmEmail || '').toLowerCase().trim() !== u.email) throw new Error('Type their email address exactly to confirm');
  if (isTrue(u.isAdmin) && readTable('Users').filter(x => isTrue(x.isAdmin) && isTrue(x.active) && !isDeletedUser(x)).length <= 1) {
    throw new Error('This is the only CJM admin. Make someone else an admin first.');
  }
  // Vessels this person is the only captain/owner of (shown to the admin afterwards)
  const ms = readTable('Memberships').filter(m => m.status === 'active');
  const vName = {}; readTable('Vessels').forEach(v => vName[v.id] = v.name);
  const orphaned = ms.filter(m => m.userId === userId && permsOfMember(m).manageCrew)
    .filter(m => !ms.some(o => o.vesselId === m.vesselId && o.userId !== userId && permsOfMember(o).manageCrew))
    .map(m => vName[m.vesselId]).filter(Boolean);
  const email = u.email;

  endSessionsFor(userId);
  const counts = {
    sessions: deleteRowsWhere('Sessions', s => s.userId === userId),
    links: deleteRowsWhere('Tokens', t => t.userId === userId),
    profile: deleteRowsWhere('Profiles', p => p.userId === userId),
    memberships: deleteRowsWhere('Memberships', m => m.userId === userId),
    reviewsAbout: deleteRowsWhere('Reviews', r => r.userId === userId),
    workReviews: deleteRowsWhere('TaskReviews', r => r.userId === userId),
    accountRequests: deleteRowsWhere('Requests', r => r.email === email),
    yachtRequests: deleteRowsWhere('VesselRequests', r => r.userId === userId),
    jobRequests: deleteRowsWhere('WorkSubmissions', r => r.userId === userId)
  };
  // Open tasks assigned to them go back to "Anyone"
  readTable('Tasks').filter(t => t.assignedTo === userId && t.state === 'Open').forEach(t => { t.assignedTo = ''; update('Tasks', t._row, t); });
  // Keep the row as an anonymous placeholder so the vessel history still reads "Deleted user"
  const row = readTable('Users').find(x => x.id === userId);
  row.name = DELETED_NAME; row.email = 'deleted-' + userId.toLowerCase() + '@deleted.invalid';
  row.passwordHash = ''; row.salt = ''; row.active = 'FALSE'; row.isAdmin = 'FALSE';
  update('Users', row._row, row);
  PropertiesService.getScriptProperties().setProperty('cr_' + userId, '');
  audit(admin.id, 'deleteUser', '', 'Account ' + userId + ' deleted', '');
  return { ok: true, counts, orphaned,
           message: 'Account deleted.' + (orphaned.length ? ' ' + orphaned.join(', ') + ' now has no captain or owner on CJM Marine.' : '') };
}

// ═════════════════════════ DELETE VESSEL (CJM admin) ═════════════════════════
/**
 * Permanently removes a vessel's maintenance program: tasks, sign-offs, notes, attached files (moved to the
 * Drive trash), materials and purchase lists, open work-review requests, invitations and its activity log.
 * Crew keep what is theirs: time aboard (their membership ends today), star reviews and finished work reviews.
 * A minimal record (name, type, length) stays so their sea time still names the yacht.
 */
function deleteVessel(admin, id, confirmName) {
  const v = readTable('Vessels').find(x => x.id === id && !x.deletedAt);
  if (!v) throw new Error('Vessel not found');
  if (normVessel(confirmName) !== normVessel(v.name)) throw new Error('Type the vessel name exactly to confirm');
  const taskIds = {}; readTable('Tasks').filter(t => t.vesselId === id).forEach(t => taskIds[t.id] = t.title);
  const inV = (r) => taskIds[r.taskId] !== undefined;
  // keep the task name on finished work reviews (they belong to the crew member)
  readTable('TaskReviews').filter(r => r.vesselId === id && r.status === 'reviewed' && !r.taskTitle)
    .forEach(r => { r.taskTitle = taskIds[r.taskId] || ''; update('TaskReviews', r._row, r); });
  // trash attached files
  let files = 0;
  readTable('Attachments').filter(a => a.vesselId === id).forEach(a => {
    if (String(a.fileId).indexOf('stg:') === 0) { deleteRowsWhere('StoredFiles', f => 'stg:' + f.id === a.fileId); files++; return; }
    try { DriveApp.getFileById(a.fileId).setTrashed(true); files++; } catch (e) { Logger.log('Could not trash ' + a.fileId + ': ' + e.message); }
  });
  const counts = {
    tasks: deleteRowsWhere('Tasks', t => t.vesselId === id),
    signoffs: deleteRowsWhere('Completions', inV),
    notes: deleteRowsWhere('Notes', inV),
    files: deleteRowsWhere('Attachments', a => a.vesselId === id) && files,
    reviewRequests: deleteRowsWhere('TaskReviews', r => r.vesselId === id && r.status !== 'reviewed'),
    invitations: deleteRowsWhere('Memberships', m => m.vesselId === id && m.status === 'invited'),
    activity: deleteRowsWhere('Audit', a => a.vesselId === id)
  };
  ['Materials', 'Onboard', 'PurchaseLists', 'Rotations', 'RotationChanges', 'RotationRules', 'Handovers', 'WorkSubmissions'].forEach(n => { if (SHEETS[n]) counts[n.toLowerCase()] = deleteRowsWhere(n, r => r.vesselId === id && (n !== 'WorkSubmissions' || r.status === 'pending')); });
  // crew: their time aboard ends today
  let crew = 0;
  readTable('Memberships').filter(m => m.vesselId === id && m.status === 'active').forEach(m => {
    m.status = 'left'; m.leftAt = nowIso(); update('Memberships', m._row, m); crew++;
  });
  counts.crew = crew;
  const name = v.name;
  v.active = 'FALSE'; v.deletedAt = nowIso(); v.homePort = '';
  update('Vessels', v._row, v);
  audit(admin.id, 'deleteVessel', '', name + ' deleted (' + counts.tasks + ' tasks, ' + crew + ' crew)', '');
  return { ok: true, counts, message: name + ' deleted: ' + counts.tasks + ' tasks, ' + counts.signoffs + ' sign-offs, ' + counts.notes + ' notes and ' +
           files + ' files removed. ' + crew + ' crew keep their time aboard and reviews.' };
}

// ═════════════════════════ DOWNLOAD / UPLOAD VESSEL DATA (CJM admin) ═════════════════════════
// A vessel file (.json) holds the yacht, its tasks, sign-offs, notes, attached files, work reviews, crew list,
// star reviews and activity log, plus the name and email of everyone mentioned (no passwords or profiles).
// Uploading it restores a deleted yacht with its original records, or makes a copy if the yacht still exists.
const VESSEL_FILE = 'cjm-marine-vessel';
const EXPORT_FILE_LIMIT = 30 * 1024 * 1024; // attached files beyond this total are left out of the download
const VESSEL_TABLES = ['Tasks', 'Completions', 'Notes', 'Attachments', 'TaskReviews', 'Memberships', 'Reviews', 'Audit', 'Materials', 'Onboard', 'PurchaseLists'];

function stripRow(r) { const o = Object.assign({}, r); delete o._row; return o; }

function exportVessel(admin, id, withFiles) {
  const v = readTable('Vessels').find(x => x.id === id && !x.deletedAt);
  if (!v) throw new Error('Vessel not found');
  const tasks = readTable('Tasks').filter(t => t.vesselId === id);
  const tid = {}; tasks.forEach(t => tid[t.id] = 1);
  const pick = (n, f) => (SHEETS[n] ? readTable(n).filter(f).map(stripRow) : []);
  const data = {
    tasks: tasks.map(stripRow),
    completions: pick('Completions', r => tid[r.taskId]),
    notes: pick('Notes', r => tid[r.taskId]),
    attachments: pick('Attachments', a => a.vesselId === id),
    taskReviews: pick('TaskReviews', r => r.vesselId === id),
    memberships: pick('Memberships', m => m.vesselId === id),
    reviews: pick('Reviews', r => r.vesselId === id),
    audit: pick('Audit', a => a.vesselId === id || tid[a.taskId]),
    materials: pick('Materials', r => r.vesselId === id),
    onboard: pick('Onboard', r => r.vesselId === id),
    purchaseLists: pick('PurchaseLists', r => r.vesselId === id),
    rotations: pick('Rotations', r => r.vesselId === id && isTrue(r.active)),
    rotationChanges: pick('RotationChanges', r => r.vesselId === id),
    rotationRules: pick('RotationRules', r => r.vesselId === id)
  };
  let total = 0, skipped = 0;
  data.attachments.forEach(a => {
    if (!withFiles) return;
    try {
      const d = readFile(a.fileId);
      if (total + d.length > EXPORT_FILE_LIMIT) { skipped++; return; }
      a.data = d; total += d.length;
    } catch (e) { skipped++; }
  });
  const ids = {};
  const want = (x) => { if (x) ids[x] = 1; };
  data.tasks.forEach(t => { want(t.assignedTo); want(t.createdBy); want(t.lastPerformedBy); });
  data.completions.forEach(r => want(r.performedBy));
  data.notes.forEach(r => want(r.userId));
  data.attachments.forEach(r => want(r.userId));
  data.taskReviews.forEach(r => { want(r.userId); want(r.reviewerId); });
  data.memberships.forEach(r => { want(r.userId); want(r.invitedBy); });
  data.reviews.forEach(r => { want(r.userId); want(r.reviewerId); });
  data.audit.forEach(r => want(r.userId));
  data.materials.forEach(r => want(r.createdBy));
  data.onboard.forEach(r => want(r.updatedBy));
  data.purchaseLists.forEach(r => { want(r.createdBy); want(r.receivedBy); });
  data.rotations.forEach(r => { want(r.userId); want(r.reliefId); want(r.createdBy); });
  data.rotationChanges.forEach(r => { want(r.userId); want(r.handledBy); });
  const people = readTable('Users').filter(u => ids[u.id]).map(u => ({ id: u.id, name: u.name, email: u.email, deleted: isDeletedUser(u) }));
  audit(admin.id, 'exportVessel', '', v.name, v.id);
  return { ok: true, filesSkipped: skipped,
           package: Object.assign({ format: VESSEL_FILE, formatVersion: 1, exportedAt: nowIso(), scriptVersion: SCRIPT_VERSION,
                                    vessel: stripRow(v), people }, data) };
}

function importVessel(admin, pkg) {
  if (!pkg || pkg.format !== VESSEL_FILE || !pkg.vessel || !pkg.vessel.id) throw new Error('This is not a CJM Marine vessel file');
  if (Number(pkg.formatVersion) > 1) throw new Error('This file was made by a newer version. Update the Google Script first.');
  const list = (k) => (Array.isArray(pkg[k]) ? pkg[k] : []);
  // vessel: restore the deleted record, make a copy if it still exists, or add it fresh
  const vessels = readTable('Vessels');
  const old = vessels.find(x => x.id === pkg.vessel.id);
  let vid = pkg.vessel.id, mode;
  let name = clip(pkg.vessel.name, 100) || 'Restored vessel';
  const nameTaken = (n) => vessels.some(x => isTrue(x.active) && !x.deletedAt && normVessel(x.name) === normVessel(n) && x.id !== vid);
  if (old && !old.deletedAt) { mode = 'copy'; vid = newId('V'); name = name + ' (copy)'; }
  else mode = old ? 'restore' : 'new';
  if (nameTaken(name)) name = name + ' (restored ' + today() + ')';
  const vrow = { id: vid, name, type: clip(pkg.vessel.type, 60), length: clip(pkg.vessel.length, 20), homePort: clip(pkg.vessel.homePort, 80),
                 active: 'TRUE', createdAt: pkg.vessel.createdAt || nowIso(), createdBy: pkg.vessel.createdBy || admin.id, deletedAt: '' };
  if (mode === 'restore') update('Vessels', old._row, Object.assign(old, vrow)); else insert('Vessels', vrow);

  // people: same account (by id and email), else same email, else a new account without a password
  const users = readTable('Users');
  const umap = {}; let linked = 0, created = 0, tomb = '';
  list('people').forEach(p => {
    const email = String(p.email || '').toLowerCase().trim();
    if (p.deleted || /@deleted\.invalid$/.test(email) || !email) {
      if (!tomb) {
        const same = users.find(u => u.id === p.id && isDeletedUser(u));
        tomb = same ? same.id : newId('U');
        if (!same) insert('Users', { id: tomb, name: DELETED_NAME, email: 'deleted-' + tomb.toLowerCase() + '@deleted.invalid', passwordHash: '', salt: '', active: 'FALSE', isAdmin: 'FALSE', createdAt: nowIso() });
      }
      umap[p.id] = tomb; return;
    }
    const byId = users.find(u => u.id === p.id && u.email === email);
    const byEmail = byId || users.find(u => u.email === email && !isDeletedUser(u));
    if (byEmail) { umap[p.id] = byEmail.id; linked++; return; }
    const nid = users.some(u => u.id === p.id) ? newId('U') : p.id;
    const nu = { id: nid, name: clip(p.name, 100) || email, email, passwordHash: '', salt: Utilities.getUuid(), active: 'TRUE', isAdmin: 'FALSE', createdAt: nowIso() };
    insert('Users', nu); users.push(nu); umap[p.id] = nid; created++;
  });
  const U = (x) => (x ? umap[x] || '' : '');

  // keep original ids when free, so restored records match what crew kept (reviews, sea time)
  const existing = {};
  const idsOf = (n) => { if (!existing[n]) { existing[n] = {}; if (SHEETS[n]) readTable(n).forEach(r => existing[n][r.id] = r); } return existing[n]; };
  const fresh = (n, oldId, prefix) => (mode === 'copy' || idsOf(n)[oldId] ? newId(prefix) : oldId);
  const tmap = {}, cmap = {}, nmap = {}, counts = { tasks: 0, signoffs: 0, notes: 0, files: 0, filesMissing: 0, crew: 0, reviews: 0, workReviews: 0 };

  list('tasks').forEach(t => {
    const id = fresh('Tasks', t.id, 'T'); tmap[t.id] = id;
    insert('Tasks', Object.assign({}, t, { id, vesselId: vid, assignedTo: U(t.assignedTo), createdBy: U(t.createdBy), lastPerformedBy: U(t.lastPerformedBy), reminderLog: '' }));
    counts.tasks++;
  });
  list('completions').forEach(c => {
    if (!tmap[c.taskId]) return;
    const id = fresh('Completions', c.id, 'X'); cmap[c.id] = id;
    insert('Completions', Object.assign({}, c, { id, taskId: tmap[c.taskId], performedBy: U(c.performedBy) })); counts.signoffs++;
  });
  list('notes').forEach(n => {
    if (!tmap[n.taskId]) return;
    const id = fresh('Notes', n.id, 'N'); nmap[n.id] = id;
    insert('Notes', Object.assign({}, n, { id, taskId: tmap[n.taskId], userId: U(n.userId) })); counts.notes++;
  });
  const vessel = { id: vid, name };
  list('attachments').forEach(a => {
    if (!tmap[a.taskId] || !nmap[a.noteId]) return;
    if (!a.data) { counts.filesMissing++; return; }
    checkAttachment({ name: a.name, mimeType: a.mimeType, data: a.data, thumb: a.thumb });
    const fileId = storeFile(vessel, a.name, a.mimeType, a.data, Utilities.base64Decode(a.data));
    insert('Attachments', { id: fresh('Attachments', a.id, 'A'), vesselId: vid, taskId: tmap[a.taskId], noteId: nmap[a.noteId], fileId, name: a.name,
                            mimeType: a.mimeType, size: a.size, thumb: a.thumb || '', userId: U(a.userId), createdAt: a.createdAt });
    counts.files++;
  });
  // work reviews and star reviews belong to crew: relink kept ones, add missing ones
  list('taskReviews').forEach(r => {
    const keep = mode !== 'copy' && idsOf('TaskReviews')[r.id];
    const row = Object.assign({}, r, { vesselId: vid, taskId: tmap[r.taskId] || r.taskId, completionId: cmap[r.completionId] || r.completionId,
                                       userId: U(r.userId), reviewerId: U(r.reviewerId) });
    if (keep) update('TaskReviews', keep._row, Object.assign(keep, row)); else insert('TaskReviews', Object.assign(row, { id: fresh('TaskReviews', r.id, 'R') }));
    counts.workReviews++;
  });
  list('reviews').forEach(r => {
    if (mode === 'copy') return; // stars stay with the original yacht
    if (idsOf('Reviews')[r.id]) return; // still on the crew member's record
    insert('Reviews', Object.assign({}, r, { vesselId: vid, userId: U(r.userId), reviewerId: U(r.reviewerId) })); counts.reviews++;
  });
  // crew list: restore each person's status (time aboard continues from when it was saved)
  list('memberships').forEach(m => {
    const uid = U(m.userId);
    if (!uid) return;
    const keep = mode !== 'copy' && idsOf('Memberships')[m.id];
    const row = Object.assign({}, m, { vesselId: vid, userId: uid, invitedBy: U(m.invitedBy) || admin.id });
    if (keep) update('Memberships', keep._row, Object.assign(keep, row));
    else if (!readTable('Memberships').some(x => x.vesselId === vid && x.userId === uid && (x.status === 'active' || x.status === 'invited'))) {
      insert('Memberships', Object.assign(row, { id: fresh('Memberships', m.id, 'M') }));
    }
    if (m.status === 'active') counts.crew++;
  });
  list('audit').forEach(a => insert('Audit', Object.assign({}, a, { userId: U(a.userId), taskId: a.taskId ? tmap[a.taskId] || '' : '', vesselId: vid })));
  ['materials', 'onboard', 'purchaseLists'].forEach(k => {
    const n = k.charAt(0).toUpperCase() + k.slice(1);
    if (!SHEETS[n]) return;
    list(k).forEach(r => insert(n, Object.assign({}, r, { id: fresh(n, r.id, 'MT'), vesselId: vid, taskId: r.taskId ? tmap[r.taskId] || '' : undefined,
      createdBy: U(r.createdBy), updatedBy: U(r.updatedBy), receivedBy: U(r.receivedBy) })));
  });
  if (SHEETS.Rotations) {
    deleteRowsWhere('Rotations', r => r.vesselId === vid);
    deleteRowsWhere('RotationRules', r => r.vesselId === vid);
    list('rotations').forEach(r => { if (U(r.userId)) insert('Rotations', Object.assign({}, r, { id: newId('RO'), vesselId: vid, userId: U(r.userId), reliefId: U(r.reliefId), createdBy: U(r.createdBy) || admin.id })); });
    list('rotationChanges').forEach(r => { if (U(r.userId) && !(mode !== 'copy' && idsOf('RotationChanges')[r.id])) insert('RotationChanges', Object.assign({}, r, { id: fresh('RotationChanges', r.id, 'RC'), vesselId: vid, userId: U(r.userId), handledBy: U(r.handledBy) })); });
    list('rotationRules').forEach(r => insert('RotationRules', { vesselId: vid, group: r.group, min: r.min }));
  }
  audit(admin.id, 'importVessel', '', name + ' (' + mode + ')', vid);
  const what = { restore: 'restored', new: 'added', copy: 'added as a copy' }[mode];
  return { ok: true, mode, vessel: { id: vid, name }, counts, people: { linked, created },
           message: name + ' ' + what + ': ' + counts.tasks + ' tasks, ' + counts.signoffs + ' sign-offs, ' + counts.notes + ' notes, ' + counts.files + ' files, ' +
                    counts.crew + ' crew aboard.' + (created ? ' ' + created + ' new account(s) were created without passwords: use New setup link in the Crew tab.' : '') +
                    (counts.filesMissing ? ' ' + counts.filesMissing + ' file(s) were not in the download.' : '') };
}


// ───────────────────────── NEW REQUEST EMAILS ─────────────────────────
/** CJM admins + CONFIG.REQUEST_NOTIFY, plus captains/owners of a named vessel (they can approve those requests). */
function requestRecipients(vesselName) {
  const users = readTable('Users').filter(u => isTrue(u.active));
  const to = users.filter(u => isTrue(u.isAdmin)).map(u => u.email).concat(CONFIG.REQUEST_NOTIFY || []);
  if (vesselName) {
    const v = readTable('Vessels').find(x => isTrue(x.active) && !x.deletedAt && normVessel(x.name) === normVessel(vesselName));
    if (v) readTable('Memberships').filter(m => m.vesselId === v.id && m.status === 'active' && permsOfMember(m).manageCrew)
      .forEach(m => { const u = users.find(x => x.id === m.userId); if (u) to.push(u.email); });
  }
  const seen = {};
  return to.map(e => String(e || '').toLowerCase().trim()).filter(e => e && !seen[e] && (seen[e] = 1));
}

function notifyNewRequest(r) {
  const to = requestRecipients(r.vesselName);
  if (!to.length) return false;
  const link = siteUrl() ? siteUrl() + '/login' : '';
  return sendMail(to.join(','), 'New ' + r.kind.toLowerCase() + ' account request: ' + r.name,
    '<p><b>' + esc(r.name) + '</b> asked for a <b>' + esc(r.kind) + '</b> account on ' + esc(CONFIG.APP_NAME) + '.</p>' +
    '<table style="border-collapse:collapse">' +
    '<tr><td style="padding:2px 12px 2px 0;color:#666">Email</td><td>' + esc(r.email) + '</td></tr>' +
    (r.position ? '<tr><td style="padding:2px 12px 2px 0;color:#666">Position</td><td>' + esc(r.position) + '</td></tr>' : '') +
    (r.vesselName ? '<tr><td style="padding:2px 12px 2px 0;color:#666">Vessel</td><td>' + esc(r.vesselName) + '</td></tr>' : '') +
    '</table>' + (r.message ? '<p>“' + esc(r.message) + '”</p>' : '') +
    (link ? '<p><a href="' + link + '" style="display:inline-block;background:#12324a;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none">Review the request</a></p>' : '') +
    '<p style="color:#666">CJM admins: CJM admin tab → Account requests. Captains and owners: Crew tab → Account requests.</p>');
}

// ═════════════════════════ ROTATION & HANDOVER (staging prototype) ═════════════════════════
// Each crew member can have an on/off pattern (e.g. 70 days on, 70 off) from a start date, and a back-to-back
// relief who covers the off time. Approved leave/extra days override the pattern. At every changeover the
// outgoing crew member sends a handover that drafts itself from the maintenance log; the relief taps "Got it".
const ROTATION_PRESETS = [
  ['Permanent (no rotation)', 0, 0], ['2 months on / 2 off', 60, 60], ['10 weeks on / 10 off', 70, 70], ['3 months on / 1 off', 90, 30],
  ['6 weeks on / 3 off', 42, 21], ['4 weeks on / 2 off', 28, 14], ['2 weeks on / 2 off', 14, 14]
];
const ROTATION_GROUP = { 'Ownership & Command': 'Bridge', 'Combined & Specialist': 'Specialist' };
const ROTATION_MAX_DAYS = 120;
const HANDOVER_DAYS = 3; // remind this many days before going off

function rotationManager(c) { return c.perms.manageCrew; }
function crewGroup(m) {
  const t = TITLES[titleOf(m.position)];
  const g = t ? t.group : 'Deck';
  return ROTATION_GROUP[g] || g;
}
/** Crew who rotate: active members except owners/managers ashore, contractors and view-only. */
function rotationCrew(vesselId) {
  const users = {}; readTable('Users').forEach(u => users[u.id] = u);
  return readTable('Memberships').filter(m => m.vesselId === vesselId && m.status === 'active' && users[m.userId] && isTrue(users[m.userId].active))
    .filter(m => ['oversight', 'contractor', 'viewonly'].indexOf(roleOf(m).access) === -1)
    .map(m => ({ userId: m.userId, name: users[m.userId].name, title: titleOf(m.position), group: crewGroup(m), joinedAt: (m.joinedAt || '').slice(0, 10) }));
}
function rotationsFor(vesselId) {
  const map = {};
  readTable('Rotations').filter(r => r.vesselId === vesselId && isTrue(r.active)).forEach(r => map[r.userId] = r);
  return map;
}
function changesFor(vesselId) { return readTable('RotationChanges').filter(x => x.vesselId === vesselId); }

/** true = aboard on that date. No rotation = aboard (permanent crew). Approved leave/extra days win. */
function aboardOn(rot, changes, userId, date) {
  for (let i = 0; i < changes.length; i++) {
    const x = changes[i];
    if (x.userId === userId && x.status === 'approved' && date >= x.fromDate && date <= x.toDate) return x.type === 'extra';
  }
  if (!rot || !(Number(rot.onDays) > 0)) return true;
  const on = Number(rot.onDays), L = on + Number(rot.offDays || 0);
  if (!L) return true;
  const d = daysBetween(rot.startDate, date);
  return ((d % L) + L) % L < on;
}

/** Next date (after `from`) where this person's aboard/off status flips, within a year. */
function nextChange(rot, changes, userId, from) {
  const now = aboardOn(rot, changes, userId, from);
  let d = from;
  for (let i = 1; i <= 366; i++) {
    d = addInterval(from, i, 'days');
    if (aboardOn(rot, changes, userId, d) !== now) return { date: d, aboard: !now };
  }
  return null;
}

/** Days actually aboard between two dates (for sea time). */
function aboardDaysBetween(vesselId, userId, from, to) {
  const rot = rotationsFor(vesselId)[userId];
  const changes = changesFor(vesselId).filter(x => x.userId === userId);
  if (!rot && !changes.length) return null; // no rotation: whole membership counts
  let n = 0, d = from, guard = 0;
  while (d <= to && guard++ < 4000) { if (aboardOn(rot, changes, userId, d)) n++; d = addInterval(d, 1, 'days'); }
  return n;
}

function rotationView(c, user, req) {
  if (c.perms.contractor) throw new Error('Contractors do not have a rotation');
  const from = req.from && /^\d{4}-\d{2}-\d{2}$/.test(req.from) ? req.from : today();
  const days = Math.max(7, Math.min(ROTATION_MAX_DAYS, Number(req.days) || 56));
  const to = addInterval(from, days - 1, 'days');
  const crew = rotationCrew(c.vessel.id);
  const rots = rotationsFor(c.vessel.id);
  const changes = changesFor(c.vessel.id);
  const approved = changes.filter(x => x.status === 'approved');
  const names = crewNames();
  const dates = []; for (let i = 0; i < days; i++) dates.push(addInterval(from, i, 'days'));
  const rules = {}; readTable('RotationRules').filter(r => r.vesselId === c.vessel.id).forEach(r => rules[r.group] = Number(r.min) || 0);
  const rows = crew.map(p => {
    const rot = rots[p.userId];
    const cells = dates.map(d => {
      if (p.joinedAt && d < p.joinedAt) return 'n';
      const leave = approved.find(x => x.userId === p.userId && d >= x.fromDate && d <= x.toDate);
      if (leave) return leave.type === 'extra' ? 'x' : 'l';
      return aboardOn(rot, [], p.userId, d) ? 'a' : 'o';
    }).join('');
    const nc = nextChange(rot, approved, p.userId, today());
    return Object.assign({}, p, { cells, aboardToday: aboardOn(rot, approved, p.userId, today()),
      rotation: rot ? { onDays: Number(rot.onDays), offDays: Number(rot.offDays), startDate: rot.startDate, reliefId: rot.reliefId, reliefName: names[rot.reliefId] || '' } : null,
      next: nc });
  });
  // daily aboard counts and minimum-crew warnings
  const groups = {}; crew.forEach(p => groups[p.group] = 1);
  const totals = dates.map((d, i) => {
    const by = {}; rows.forEach(r => { const s = r.cells.charAt(i); if (s === 'a' || s === 'x') by[r.group] = (by[r.group] || 0) + 1; });
    const total = Object.keys(by).reduce((s, k) => s + by[k], 0);
    const short = Object.keys(rules).filter(g => rules[g] > 0 && g !== '_total' && (by[g] || 0) < rules[g]);
    if (rules._total && total < rules._total) short.push('Total');
    return { date: d, total, by, short };
  });
  const me = rows.find(r => r.userId === user.id) || null;
  const myHandovers = handoversVisible(c, user);
  let handoverDue = null;
  if (me && me.next && !me.next.aboard && daysBetween(today(), me.next.date) <= HANDOVER_DAYS) {
    const sent = myHandovers.some(h => h.fromUserId === user.id && h.status !== 'draft' && h.createdAt.slice(0, 10) >= addInterval(today(), -HANDOVER_DAYS - 2, 'days'));
    if (!sent) handoverDue = { offFrom: me.next.date, reliefId: (rots[user.id] || {}).reliefId || '', reliefName: names[(rots[user.id] || {}).reliefId] || '' };
  }
  return { ok: true, from, to, dates, rows, totals, rules, groups: Object.keys(groups), presets: ROTATION_PRESETS,
           canManage: rotationManager(c), me: me ? { userId: me.userId, aboardToday: me.aboardToday, next: me.next, rotation: me.rotation } : null,
           handoverDue,
           requests: changes.filter(x => rotationManager(c) || x.userId === user.id).sort((a, b) => a.requestedAt < b.requestedAt ? 1 : -1).slice(0, 40)
             .map(x => ({ id: x.id, userId: x.userId, name: names[x.userId] || '', type: x.type, fromDate: x.fromDate, toDate: x.toDate, note: x.note,
                          status: x.status, requestedAt: x.requestedAt, handledBy: names[x.handledBy] || '' })),
           handovers: myHandovers.slice(0, 20) };
}

function saveRotation(c, user, r) {
  if (!rotationManager(c)) throw new Error('Only the Captain can set rotations');
  const crew = rotationCrew(c.vessel.id);
  const who = crew.find(p => p.userId === r.userId);
  if (!who) throw new Error('That person is not rotating crew on this vessel');
  const on = Math.round(Number(r.onDays) || 0), off = Math.round(Number(r.offDays) || 0);
  const all = readTable('Rotations').filter(x => x.vesselId === c.vessel.id && isTrue(x.active));
  const retire = (uid) => all.filter(x => x.userId === uid).forEach(x => { x.active = 'FALSE'; x.updatedAt = nowIso(); update('Rotations', x._row, x); });
  if (!on) { // permanent
    retire(r.userId);
    audit(user.id, 'rotation', '', who.name + ': permanent (no rotation)', c.vessel.id);
    return { ok: true };
  }
  if (on < 1 || on > 365 || off < 1 || off > 365) throw new Error('Days on and off must be 1 to 365');
  validateDate(r.startDate);
  const relief = r.reliefId ? crew.find(p => p.userId === r.reliefId) : null;
  if (r.reliefId && (!relief || r.reliefId === r.userId)) throw new Error('Choose a relief from the rotating crew');
  retire(r.userId);
  insert('Rotations', { id: newId('RO'), vesselId: c.vessel.id, userId: r.userId, onDays: String(on), offDays: String(off), startDate: r.startDate,
                        reliefId: relief ? relief.userId : '', active: 'TRUE', createdBy: user.id, createdAt: nowIso(), updatedAt: nowIso() });
  if (relief) { // back-to-back: the relief works the opposite half of the same cycle
    retire(relief.userId);
    insert('Rotations', { id: newId('RO'), vesselId: c.vessel.id, userId: relief.userId, onDays: String(off), offDays: String(on),
                          startDate: addInterval(r.startDate, on, 'days'), reliefId: r.userId, active: 'TRUE', createdBy: user.id, createdAt: nowIso(), updatedAt: nowIso() });
  }
  audit(user.id, 'rotation', '', who.name + ': ' + on + ' on / ' + off + ' off from ' + r.startDate + (relief ? ', back-to-back with ' + relief.name : ''), c.vessel.id);
  return { ok: true };
}

function setManning(c, user, rules) {
  if (!rotationManager(c)) throw new Error('Only the Captain can set minimum crew');
  deleteRowsWhere('RotationRules', r => r.vesselId === c.vessel.id);
  Object.keys(rules || {}).forEach(g => {
    const n = Math.round(Number(rules[g]) || 0);
    if (n > 0 && n <= 100) insert('RotationRules', { vesselId: c.vessel.id, group: clip(g, 40), min: String(n) });
  });
  audit(user.id, 'manning', '', JSON.stringify(rules).slice(0, 150), c.vessel.id);
  return { ok: true };
}

function requestRotationChange(c, user, x) {
  if (c.perms.contractor) throw new Error('Contractors do not have a rotation');
  const type = ['leave', 'extra'].indexOf(x.type) !== -1 ? x.type : 'leave';
  validateDate(x.fromDate); validateDate(x.toDate);
  if (x.toDate < x.fromDate) throw new Error('The last day is before the first day');
  if (daysBetween(x.fromDate, x.toDate) > 180) throw new Error('Keep a request to 180 days or less');
  const forUser = x.userId && rotationManager(c) ? x.userId : user.id;
  if (!rotationCrew(c.vessel.id).some(p => p.userId === forUser)) throw new Error('Not rotating crew on this vessel');
  const auto = rotationManager(c); // the Captain's own entries are approved straight away
  const row = { id: newId('RC'), vesselId: c.vessel.id, userId: forUser, type, fromDate: x.fromDate, toDate: x.toDate, note: clip(x.note, 300),
                status: auto ? 'approved' : 'pending', requestedAt: nowIso(), handledBy: auto ? user.id : '', handledAt: auto ? nowIso() : '' };
  insert('RotationChanges', row);
  audit(user.id, 'rotationRequest', '', type + ' ' + x.fromDate + ' to ' + x.toDate + ' (' + row.status + ')', c.vessel.id);
  if (!auto) {
    const to = readTable('Memberships').filter(m => m.vesselId === c.vessel.id && m.status === 'active' && permsOfMember(m).manageCrew)
      .map(m => (readTable('Users').find(u => u.id === m.userId) || {}).email).filter(Boolean);
    if (to.length) sendMail(to.join(','), c.vessel.name + ': ' + (type === 'leave' ? 'leave' : 'extra days') + ' request from ' + user.name,
      '<p><b>' + esc(user.name) + '</b> asked for ' + (type === 'leave' ? 'leave' : 'extra days aboard') + ' from <b>' + x.fromDate + '</b> to <b>' + x.toDate + '</b>.</p>' +
      (row.note ? '<p>“' + esc(row.note) + '”</p>' : '') + '<p>Approve or decline it in the Rotation tab.</p>' + appLink());
  }
  return { ok: true, status: row.status };
}

function decideRotationChange(c, user, id, approve) {
  if (!rotationManager(c)) throw new Error('Only the Captain can approve rotation requests');
  const x = readTable('RotationChanges').find(r => r.id === id && r.vesselId === c.vessel.id);
  if (!x) throw new Error('Request not found');
  if (x.status !== 'pending') throw new Error('Already ' + x.status);
  x.status = approve ? 'approved' : 'declined'; x.handledBy = user.id; x.handledAt = nowIso();
  update('RotationChanges', x._row, x);
  const u = readTable('Users').find(v => v.id === x.userId);
  if (u) sendMail(u.email, c.vessel.name + ': your ' + (x.type === 'leave' ? 'leave' : 'extra days') + ' request was ' + x.status,
    '<p>' + esc(x.fromDate) + ' to ' + esc(x.toDate) + ': <b>' + x.status + '</b> by ' + esc(user.name) + '.</p>' + appLink());
  audit(user.id, 'rotationDecision', '', x.type + ' ' + x.fromDate + ' ' + x.status, c.vessel.id);
  return { ok: true };
}

// ───────────── Handover ─────────────
function handoverView(h, names) {
  let auto = {}; try { auto = JSON.parse(h.autoSummary || '{}'); } catch (e) {}
  const files = readTable('Attachments').filter(a => a.taskId === 'HO:' + h.id).map(attachmentView);
  return { id: h.id, fromUserId: h.fromUserId, fromName: names[h.fromUserId] || '', toUserId: h.toUserId, toName: names[h.toUserId] || '',
           changeDate: h.changeDate, auto, note: h.note, status: h.status, createdAt: h.createdAt, sentAt: h.sentAt, acceptedAt: h.acceptedAt,
           acceptedBy: names[h.acceptedBy] || '', files };
}
function handoversVisible(c, user) {
  const names = crewNames();
  return readTable('Handovers').filter(h => h.vesselId === c.vessel.id &&
      (rotationManager(c) && h.status !== 'draft' || h.fromUserId === user.id || (h.toUserId === user.id && h.status !== 'draft')))
    .sort((a, b) => a.createdAt < b.createdAt ? 1 : -1).map(h => handoverView(h, names));
}

/** Drafts the handover from what is already logged: open and overdue jobs, what is due soon, what this person signed off and noted. */
function draftSummary(c, user, since) {
  const tasks = vesselTasks(c).filter(t => t.state === 'Open');
  const mine = (t) => t.assignedTo === user.id || inMyDept(c, t);
  const pick = (t) => ({ id: t.id, title: t.title, system: t.system, dueDate: t.dueDate, color: colorFor(t), type: t.type });
  const soon = addInterval(today(), 21, 'days');
  const titles = {}; vesselTasks(c).forEach(t => titles[t.id] = t.title);
  return {
    since,
    overdue: tasks.filter(t => mine(t) && t.type !== 'Issue' && colorFor(t) === 'red').map(pick),
    issues: tasks.filter(t => mine(t) && t.type === 'Issue').map(pick),
    dueSoon: tasks.filter(t => mine(t) && t.type !== 'Issue' && t.dueDate && t.dueDate <= soon && colorFor(t) !== 'red')
      .sort((a, b) => a.dueDate < b.dueDate ? -1 : 1).slice(0, 15).map(pick),
    done: readTable('Completions').filter(x => x.performedBy === user.id && titles[x.taskId] !== undefined && x.performedDate >= since)
      .sort((a, b) => a.performedDate < b.performedDate ? 1 : -1).slice(0, 25).map(x => ({ taskId: x.taskId, title: titles[x.taskId], date: x.performedDate, notes: x.notes })),
    notes: readTable('Notes').filter(n => n.userId === user.id && titles[n.taskId] !== undefined && n.createdAt.slice(0, 10) >= since)
      .sort((a, b) => a.createdAt < b.createdAt ? 1 : -1).slice(0, 10).map(n => ({ taskId: n.taskId, title: titles[n.taskId], text: n.text, date: n.createdAt.slice(0, 10) }))
  };
}

function startHandover(c, user, req) {
  if (c.perms.contractor || c.perms.viewOnly) throw new Error('Contractors and view-only crew do not hand over');
  const rot = rotationsFor(c.vessel.id)[user.id];
  const crew = rotationCrew(c.vessel.id);
  const toUserId = req.toUserId || (rot && rot.reliefId) || '';
  if (toUserId && !crew.some(p => p.userId === toUserId)) throw new Error('Choose who you are handing over to');
  // reuse an open draft
  const draft = readTable('Handovers').find(h => h.vesselId === c.vessel.id && h.fromUserId === user.id && h.status === 'draft');
  const approved = changesFor(c.vessel.id).filter(x => x.status === 'approved');
  const nc = nextChange(rot, approved, user.id, today());
  // since: start of the current time aboard (or 30 days)
  let since = addInterval(today(), -30, 'days');
  if (rot && Number(rot.onDays) > 0) { let d = today(), g = 0; while (aboardOn(rot, approved, user.id, addInterval(d, -1, 'days')) && g++ < 365) d = addInterval(d, -1, 'days'); since = d; }
  const summary = JSON.stringify(draftSummary(c, user, since));
  const changeDate = nc && !nc.aboard ? nc.date : today();
  if (draft) {
    draft.autoSummary = summary; draft.toUserId = toUserId || draft.toUserId; draft.changeDate = changeDate;
    update('Handovers', draft._row, draft);
    return { ok: true, handover: handoverView(draft, crewNames()) };
  }
  const h = { id: newId('HO'), vesselId: c.vessel.id, fromUserId: user.id, toUserId, changeDate, autoSummary: summary, note: '', status: 'draft',
              createdAt: nowIso(), sentAt: '', acceptedAt: '', acceptedBy: '' };
  insert('Handovers', h);
  return { ok: true, handover: handoverView(h, crewNames()) };
}

function handoverRow(c, id) {
  const h = readTable('Handovers').find(x => x.id === id && x.vesselId === c.vessel.id);
  if (!h) throw new Error('Handover not found');
  return h;
}

function sendHandover(c, user, req) {
  const h = handoverRow(c, req.id);
  if (h.fromUserId !== user.id) throw new Error('Only the person handing over can send it');
  if (h.status !== 'draft') throw new Error('Already sent');
  const crew = rotationCrew(c.vessel.id);
  if (req.toUserId) { if (!crew.some(p => p.userId === req.toUserId)) throw new Error('Choose who you are handing over to'); h.toUserId = req.toUserId; }
  if (!h.toUserId) throw new Error('Choose who you are handing over to');
  if (h.toUserId === user.id) throw new Error('Choose someone else to hand over to');
  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length > ATTACH_MAX_FILES) throw new Error('Attach up to ' + ATTACH_MAX_FILES + ' files');
  files.forEach(checkAttachment);
  h.note = clip(req.note, 3000);
  files.forEach(f => saveAttachment(c, user, 'HO:' + h.id, '', f));
  h.status = 'sent'; h.sentAt = nowIso();
  update('Handovers', h._row, h);
  const names = crewNames();
  const users = {}; readTable('Users').forEach(u => users[u.id] = u);
  const to = [users[h.toUserId] && users[h.toUserId].email].concat(
    readTable('Memberships').filter(m => m.vesselId === c.vessel.id && m.status === 'active' && permsOfMember(m).manageCrew && m.userId !== user.id)
      .map(m => users[m.userId] && users[m.userId].email)).filter(Boolean);
  const s = JSON.parse(h.autoSummary || '{}');
  sendMail(to.join(','), c.vessel.name + ': handover from ' + user.name,
    '<p><b>' + esc(user.name) + '</b> handed over to <b>' + esc(names[h.toUserId] || '') + '</b>.</p>' +
    (h.note ? '<p>“' + esc(h.note) + '”</p>' : '') +
    '<p>' + (s.overdue || []).length + ' overdue, ' + (s.issues || []).length + ' open issues, ' + (s.dueSoon || []).length + ' due in the next 3 weeks, ' +
    (s.done || []).length + ' jobs signed off this rotation.</p><p>Open the Rotation tab to read it and tap “Got it”.</p>' + appLink());
  audit(user.id, 'handover', '', 'Handover to ' + (names[h.toUserId] || ''), c.vessel.id);
  return { ok: true, handover: handoverView(h, names) };
}

function acceptHandover(c, user, id) {
  const h = handoverRow(c, id);
  if (h.status !== 'sent') throw new Error(h.status === 'accepted' ? 'Already accepted' : 'Not sent yet');
  if (h.toUserId !== user.id && !rotationManager(c)) throw new Error('Only the person taking over can accept it');
  h.status = 'accepted'; h.acceptedAt = nowIso(); h.acceptedBy = user.id;
  update('Handovers', h._row, h);
  audit(user.id, 'handoverAccepted', '', 'From ' + (crewNames()[h.fromUserId] || ''), c.vessel.id);
  return { ok: true, handover: handoverView(h, crewNames()) };
}


/** Sea time for one membership: days actually aboard when the vessel uses rotations, else the whole span. */
function seaDays(m) {
  if (!m.joinedAt || permsOfMember(m).contractor) return 0;
  const from = m.joinedAt.slice(0, 10), to = m.status === 'left' && m.leftAt ? m.leftAt.slice(0, 10) : today();
  const rot = aboardDaysBetween(m.vesselId, m.userId, from, to);
  return rot === null ? Math.max(0, daysBetween(from, to)) : rot;
}

/**
 * Demo yacht: run once from the Apps Script editor (choose "addDemoRotations", then Run) to add rotation examples
 * to M/Y Meridian Star: the Bosun and Deckhand work 6 weeks on / 6 off back-to-back (the Bosun goes off in 2 days,
 * so his Rotation tab asks for a handover), the Chief Stewardess 6 weeks on / 3 off, minimum crew for Engineering and Deck,
 * and one leave request waiting for the Captain. Safe to run again.
 */
function addDemoRotations() { return withLock(addDemoRotations_); }
function addDemoRotations_() {
  {
    const v = readTable('Vessels').find(x => x.name === DEMO_VESSEL && isTrue(x.active) && !x.deletedAt);
    if (!v) throw new Error(DEMO_VESSEL + ' not found. Run createDemoVessel first.');
    const id = (email) => (readTable('Users').find(u => u.email === email) || {}).id;
    const bosun = id('jake.turner@meridianstar.test'), deck = id('liam.oneill@meridianstar.test'), stew = id('sophie.laurent@meridianstar.test'), cap = id('ryan.calder@meridianstar.test');
    if (!bosun || !deck || !stew || !cap) throw new Error('Demo crew not found');
    deleteRowsWhere('Rotations', r => r.vesselId === v.id);
    deleteRowsWhere('RotationChanges', r => r.vesselId === v.id);
    deleteRowsWhere('RotationRules', r => r.vesselId === v.id);
    const D = (n) => addInterval(today(), n, 'days'), now = nowIso();
    const rot = (u, on, off, start, relief) => insert('Rotations', { id: newId('RO'), vesselId: v.id, userId: u, onDays: String(on), offDays: String(off),
      startDate: D(start), reliefId: relief || '', active: 'TRUE', createdBy: cap, createdAt: now, updatedAt: now });
    rot(bosun, 42, 42, -40, deck);
    rot(deck, 42, 42, 2, bosun);
    rot(stew, 42, 21, -20, '');
    insert('RotationRules', { vesselId: v.id, group: 'Engineering', min: '1' });
    insert('RotationRules', { vesselId: v.id, group: 'Deck', min: '1' });
    addDemoWorkRequests_(v, deck, stew);
    insert('RotationChanges', { id: newId('RC'), vesselId: v.id, userId: stew, type: 'leave', fromDate: D(9), toDate: D(12),
      note: 'Sister’s wedding in Antibes', status: 'pending', requestedAt: now, handledBy: '', handledAt: '' });
    return ['Rotation examples added to ' + DEMO_VESSEL + '. Log in as jake.turner@meridianstar.test to see the handover prompt.'];
  }
}

// ═════════════════════════ CREW SUGGESTIONS, UNLISTED WORK, JOBS ON OTHER BOATS ═════════════════════════
// Three ways crew and contractors send work to a Captain or Owner. Nothing enters a vessel's log until they approve it.
//  - suggest:  crew propose a task; on approval it joins the task list (optionally recurring).
//  - done:     crew did work that was not in the system; on approval it is logged as performed, optionally scored 1–10.
//  - external: crew or contractors log a job on any boat and name its Captain or Owner by email.
//              If that person runs the boat on CJM Marine, it waits in their Reviews tab like "done".
//              If not, they get an email link to confirm and score it without an account, plus an optional invitation to join.
const WORK_KINDS = { suggest: 'Suggested task', done: 'Work done', external: 'Job on another boat' };
const WORK_PENDING_MAX = 30;      // waiting requests per person
const WORK_EXTERNAL_PER_DAY = 10; // emails to Captains outside CJM Marine, per person per day
const WORK_LINK_DAYS = 60;        // how long the emailed review link works
const WORK_ROLES = ['Captain', 'Owner', 'Yacht manager', 'Chief Officer', 'Chief Engineer'];

function emailOk(e) { return /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(e); }

/** The vessel a Captain/Owner email runs on CJM Marine (matched by boat name, or their only boat). */
function vesselForReviewer(email, boatName) {
  const u = readTable('Users').find(x => x.email === email && isTrue(x.active) && !isDeletedUser(x));
  if (!u) return null;
  const vs = readTable('Vessels').filter(v => isTrue(v.active) && !v.deletedAt);
  const theirs = readTable('Memberships').filter(m => m.userId === u.id && m.status === 'active' && permsOfMember(m).hires)
    .map(m => vs.find(v => v.id === m.vesselId)).filter(Boolean);
  return theirs.find(v => normVessel(v.name) === normVessel(boatName)) || (theirs.length === 1 ? theirs[0] : null);
}

function joinUrl(boatName) {
  return siteUrl() + '/login?request=1&as=captain&vessel=' + encodeURIComponent(boatName || '');
}

function submitWork(user, w) {
  const kind = WORK_KINDS[w.kind] ? w.kind : '';
  if (!kind) throw new Error('Choose what you are sending');
  const title = clip(w.title, 200);
  if (!title) throw new Error('Say what the job is');
  const mine = readTable('WorkSubmissions').filter(x => x.userId === user.id);
  if (mine.filter(x => x.status === 'pending').length >= WORK_PENDING_MAX) {
    throw new Error('You have ' + WORK_PENDING_MAX + ' requests waiting for an answer. Cancel some or wait for answers first.');
  }
  const files = Array.isArray(w.files) ? w.files : [];
  if (files.length > ATTACH_MAX_FILES) throw new Error('Attach up to ' + ATTACH_MAX_FILES + ' files');
  files.forEach(checkAttachment);

  let performedDate = '';
  if (kind !== 'suggest') {
    performedDate = w.performedDate || today();
    validateDate(performedDate);
    if (performedDate > today()) throw new Error('The date the job was done cannot be in the future');
    if (performedDate < addInterval(today(), -365, 'days')) throw new Error('Jobs older than a year cannot be sent for review');
  }

  let vessel = null, boatName = '', contactEmail = '', contactName = '';
  if (kind === 'external') {
    boatName = clip(w.boatName, 80);
    if (!boatName) throw new Error('Name the boat');
    contactEmail = String(w.contactEmail || '').trim().toLowerCase();
    if (!emailOk(contactEmail)) throw new Error('Enter the Captain or Owner\'s email address');
    if (contactEmail === user.email) throw new Error('Enter the Captain or Owner\'s email, not your own');
    contactName = clip(w.contactName, 80);
    const day = today();
    if (mine.filter(x => x.kind === 'external' && String(x.createdAt).slice(0, 10) === day).length >= WORK_EXTERNAL_PER_DAY) {
      throw new Error('You can send up to ' + WORK_EXTERNAL_PER_DAY + ' jobs on other boats a day');
    }
    vessel = vesselForReviewer(contactEmail, boatName);
  } else {
    const c = vesselCtx(user, w.vesselId);
    if (!c.membership) throw new Error('Only crew of this vessel can send this');
    if (c.perms.viewOnly) throw new Error('View-only access cannot log work or suggest tasks');
    vessel = c.vessel; boatName = vessel.name;
  }
  const reviewers = vessel ? vesselReviewers(vessel.id, user.id) : [];
  if (kind !== 'external' && !reviewers.length) throw new Error('This vessel has no Captain or Owner on CJM Marine to approve it');
  if (!reviewers.length) vessel = null;

  const recurring = kind === 'suggest' && !!w.recurring;
  if (recurring) validateInterval(w.intervalValue, w.intervalUnit);
  if (kind === 'suggest' && w.dueDate) validateDate(w.dueDate);

  const sub = {
    id: newId('J'), kind, vesselId: vessel ? vessel.id : '', boatName, userId: user.id, title,
    system: clip(w.system, 60), description: clip(w.description, 3000), performedDate,
    dueDate: kind === 'suggest' ? (w.dueDate || '') : '', recurring: recurring ? 'TRUE' : 'FALSE',
    intervalValue: recurring ? String(w.intervalValue) : '', intervalUnit: recurring ? String(w.intervalUnit) : '',
    wantScore: kind !== 'suggest' && w.wantScore !== false ? 'TRUE' : 'FALSE',
    contactEmail, contactName, token: '', tokenExpires: '', status: 'pending',
    decidedBy: '', decidedLabel: '', decidedAt: '', decisionNote: '', score: '', reviewText: '', taskId: '', completionId: '',
    createdAt: nowIso()
  };
  if (kind === 'external' && !vessel) {
    sub.token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    sub.tokenExpires = addInterval(today(), WORK_LINK_DAYS, 'days');
  }
  insert('WorkSubmissions', sub);
  const fileCtx = { vessel: vessel || { id: '', name: 'Jobs on other boats' } };
  files.forEach(f => saveAttachment(fileCtx, user, 'WS:' + sub.id, '', f));
  audit(user.id, 'submitWork', '', WORK_KINDS[kind] + ': ' + title + (vessel ? '' : ' (' + boatName + ', ' + contactEmail + ')'), sub.vesselId);

  const details = '<p><b>' + esc(title) + '</b>' + (sub.system ? ' (' + esc(sub.system) + ')' : '') +
    (performedDate ? '<br>Done ' + performedDate : '') + (sub.description ? '<br><i>' + esc(sub.description) + '</i>' : '') +
    (files.length ? '<br>' + files.length + ' photo' + (files.length > 1 ? 's or files' : ' or file') + ' attached' : '') + '</p>';
  let message;
  if (vessel) {
    const what = kind === 'suggest' ? 'suggested a task' : kind === 'done' ? 'logged work that is not in the task list' : 'logged a job on ' + esc(vessel.name);
    sendMail(reviewers.map(r => r.email).join(','), (kind === 'suggest' ? 'Task suggested: ' : 'Approve work: ') + user.name + ', ' + title,
      '<p><b>' + esc(user.name) + '</b> ' + what + ' and asks for your approval (' + esc(vessel.name) + ').</p>' + details +
      '<p>Nothing is added to the vessel\'s log until you approve it. Open the <b>Reviews</b> tab.</p>' + appLink());
    message = 'Sent to the Captain or Owner of ' + vessel.name + ' for approval.';
  } else {
    const link = siteUrl() + '/?w=' + sub.token;
    sendMail(contactEmail, user.name + ' asks you to confirm a job on ' + boatName,
      '<p>' + (contactName ? 'Hello ' + esc(contactName) + ',</p><p>' : '') + '<b>' + esc(user.name) + '</b> logged this job on <b>' + esc(boatName) +
      '</b> and named you as its Captain or Owner:</p>' + details +
      '<p><a href="' + link + '" style="display:inline-block;background:#12324a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Review the job</a></p>' +
      '<p>No account is needed. You can confirm it, give it a score from 1 to 10, or decline it. Your answer becomes part of their work record. ' +
      'The link works for ' + WORK_LINK_DAYS + ' days.</p>' +
      '<p style="color:#5b6b78">CJM Marine keeps yacht maintenance logs, crew and rotations in one place. If you would like ' + esc(boatName) +
      ' on it, you can <a href="' + joinUrl(boatName) + '">request it here</a>. This is optional.</p>');
    message = 'Emailed to ' + contactEmail + ' for review. ' + boatName + ' is not on CJM Marine, so they can answer from the email without an account.';
  }
  return { ok: true, message, submissions: mySubmissions(user) };
}

function workFiles(subId) {
  return readTable('Attachments').filter(a => a.taskId === 'WS:' + subId).map(attachmentView);
}

function mySubmissions(user) {
  const vs = {}; readTable('Vessels').forEach(v => vs[v.id] = v.name);
  const names = crewNames();
  const files = {};
  readTable('Attachments').forEach(a => { if (String(a.taskId).indexOf('WS:') === 0) (files[a.taskId.slice(3)] = files[a.taskId.slice(3)] || []).push(attachmentView(a)); });
  return readTable('WorkSubmissions').filter(x => x.userId === user.id && x.status !== 'cancelled')
    .sort((a, b) => a.createdAt < b.createdAt ? 1 : -1).slice(0, 60)
    .map(x => ({ id: x.id, kind: x.kind, kindLabel: WORK_KINDS[x.kind], title: x.title, system: x.system, description: x.description,
                 performedDate: x.performedDate, boatName: vs[x.vesselId] || x.boatName, onPlatform: !!x.vesselId,
                 contactEmail: x.vesselId ? '' : x.contactEmail,
                 status: x.status === 'pending' && x.tokenExpires && x.tokenExpires < today() ? 'expired' : x.status,
                 decidedBy: names[x.decidedBy] || x.decidedLabel || '', decidedAt: x.decidedAt, decisionNote: x.decisionNote,
                 score: x.score ? Number(x.score) : null, reviewText: x.reviewText, createdAt: x.createdAt,
                 attachments: files[x.id] || [] }));
}

function cancelWork(user, id) {
  const x = readTable('WorkSubmissions').find(r => r.id === id && r.userId === user.id);
  if (!x) throw new Error('Request not found');
  if (x.status !== 'pending') throw new Error('This request was already answered');
  x.status = 'cancelled'; x.token = '';
  update('WorkSubmissions', x._row, x);
  audit(user.id, 'cancelWork', '', x.title, x.vesselId);
  return { ok: true, submissions: mySubmissions(user) };
}

function pendingWorkFor(vesselId, reviewerId) {
  return readTable('WorkSubmissions').filter(x => x.vesselId === vesselId && x.status === 'pending' && x.userId !== reviewerId);
}

function approvalsFor(c, user) {
  const names = crewNames();
  const ms = readTable('Memberships').filter(m => m.vesselId === c.vessel.id && m.status === 'active');
  const view = (x) => {
    const m = ms.find(k => k.userId === x.userId);
    return { id: x.id, kind: x.kind, kindLabel: WORK_KINDS[x.kind], crewId: x.userId, crewName: names[x.userId] || '',
             crewTitle: m ? titleOf(m.position) : 'Not on your crew', onCrew: !!m,
             title: x.title, system: x.system, description: x.description, performedDate: x.performedDate,
             dueDate: x.dueDate, recurring: isTrue(x.recurring), intervalValue: x.intervalValue, intervalUnit: x.intervalUnit,
             wantScore: isTrue(x.wantScore), boatName: x.boatName, createdAt: x.createdAt, status: x.status,
             decidedBy: names[x.decidedBy] || '', decidedAt: x.decidedAt, decisionNote: x.decisionNote,
             score: x.score ? Number(x.score) : null, taskId: x.taskId, attachments: workFiles(x.id) };
  };
  const all = readTable('WorkSubmissions').filter(x => x.vesselId === c.vessel.id && x.userId !== user.id && x.status !== 'cancelled');
  return {
    pending: all.filter(x => x.status === 'pending').sort((a, b) => a.createdAt < b.createdAt ? -1 : 1).map(view),
    done: all.filter(x => x.status !== 'pending').sort((a, b) => a.decidedAt < b.decidedAt ? 1 : -1).slice(0, 20).map(view)
  };
}

function decideWork(c, user, id, d) {
  requireReviewer(c, user);
  const x = readTable('WorkSubmissions').find(r => r.id === id && r.vesselId === c.vessel.id);
  if (!x) throw new Error('Request not found');
  if (x.status !== 'pending') throw new Error('This request was already ' + (x.status === 'cancelled' ? 'withdrawn' : 'answered'));
  if (x.userId === user.id) throw new Error('You cannot approve your own request');
  const crew = readTable('Users').find(u => u.id === x.userId);
  const now = nowIso();
  x.decidedBy = user.id; x.decidedAt = now; x.decisionNote = clip(d.note, 500);

  if (!d.approve) {
    x.status = 'declined';
    update('WorkSubmissions', x._row, x);
    audit(user.id, 'declineWork', '', userName(x.userId) + ': ' + x.title, c.vessel.id);
    if (crew && isTrue(crew.active)) {
      sendMail(crew.email, 'Not approved: ' + x.title,
        '<p>' + esc(user.name) + ' did not approve <b>' + esc(x.title) + '</b> (' + esc(c.vessel.name) + ').</p>' +
        (x.decisionNote ? '<p><i>' + esc(x.decisionNote) + '</i></p>' : '') + appLink());
    }
    return listTaskReviews(c, user);
  }

  const title = clip(d.title || x.title, 200);
  const system = d.system !== undefined ? clip(d.system, 60) : x.system;
  let task, completionId = '', score = 0;
  if (x.kind === 'suggest') {
    const dueDate = d.dueDate || x.dueDate || today();
    validateDate(dueDate);
    const recurring = d.recurring !== undefined ? !!d.recurring : isTrue(x.recurring);
    const iv = d.intervalValue || x.intervalValue, iu = d.intervalUnit || x.intervalUnit;
    if (recurring) validateInterval(iv, iu);
    const assign = d.assignToThem !== false && crewOnVessel(c, x.userId) ? x.userId : '';
    task = { id: newId('T'), title, description: x.description, system, type: 'Routine', dueDate, dueTime: '',
             recurring: recurring ? 'TRUE' : 'FALSE', intervalValue: recurring ? String(iv) : '', intervalUnit: recurring ? String(iu) : '',
             assignedTo: assign, state: 'Open', createdBy: user.id, createdAt: now, lastPerformed: '', lastPerformedBy: '',
             resolution: '', reminderLog: '', vesselId: c.vessel.id };
    insert('Tasks', task);
    audit(user.id, 'create', task.id, 'Routine: ' + title + ' (suggested by ' + userName(x.userId) + ', approved by ' + user.name + ')', c.vessel.id);
  } else {
    if (d.score) {
      score = Math.round(Number(d.score));
      if (!(score >= 1 && score <= 10)) throw new Error('Choose a score from 1 to 10');
    }
    const repeat = !!d.recurring;
    if (repeat) validateInterval(d.intervalValue, d.intervalUnit);
    task = { id: newId('T'), title, description: x.description, system, type: 'Routine',
             dueDate: repeat ? addInterval(x.performedDate, d.intervalValue, d.intervalUnit) : '', dueTime: '',
             recurring: repeat ? 'TRUE' : 'FALSE', intervalValue: repeat ? String(d.intervalValue) : '', intervalUnit: repeat ? String(d.intervalUnit) : '',
             assignedTo: '', state: repeat ? 'Open' : 'Completed', createdBy: user.id, createdAt: now,
             lastPerformed: x.performedDate, lastPerformedBy: x.userId, resolution: '', reminderLog: '', vesselId: c.vessel.id };
    insert('Tasks', task);
    completionId = newId('X');
    insert('Completions', { id: completionId, taskId: task.id, dueDate: '', performedDate: x.performedDate, performedBy: x.userId,
                            timing: 'Not scheduled', notes: x.description, loggedAt: now });
    audit(user.id, 'complete', task.id, 'Performed ' + x.performedDate + ' by ' + userName(x.userId) + ' (logged by them, approved by ' + user.name + ')' +
          (repeat ? '. Next due ' + task.dueDate : ''), c.vessel.id);
    if (score) {
      insert('TaskReviews', { id: newId('W'), vesselId: c.vessel.id, taskId: task.id, completionId, userId: x.userId, requestedAt: x.createdAt,
        message: '', status: 'reviewed', reviewerId: user.id, score: String(score), text: clip(d.text, 1000), reviewedAt: now,
        taskTitle: title, vesselName: c.vessel.name, reviewerLabel: '', reviewerName: '', workDate: x.performedDate });
      audit(user.id, 'reviewWork', task.id, userName(x.userId) + ': ' + score + '/10', c.vessel.id);
    }
  }
  // The description and photos become a note on the task, credited to the person who sent them.
  const atts = readTable('Attachments').filter(a => a.taskId === 'WS:' + x.id);
  if (x.description || atts.length) {
    const note = { id: newId('N'), taskId: task.id, userId: x.userId, text: x.description, createdAt: x.createdAt };
    insert('Notes', note);
    atts.forEach(a => { a.taskId = task.id; a.noteId = note.id; a.vesselId = c.vessel.id; update('Attachments', a._row, a); });
  }
  x.status = 'approved'; x.taskId = task.id; x.completionId = completionId; x.title = title;
  x.score = score ? String(score) : ''; x.reviewText = score ? clip(d.text, 1000) : '';
  update('WorkSubmissions', x._row, x);
  if (crew && isTrue(crew.active)) {
    sendMail(crew.email, 'Approved: ' + title + (score ? ' (' + score + '/10)' : ''),
      '<p>' + esc(user.name) + ' approved <b>' + esc(title) + '</b> on ' + esc(c.vessel.name) + '. ' +
      (x.kind === 'suggest' ? 'It is now in the task list' + (task.assignedTo ? ' and assigned to you' : '') + ', due ' + task.dueDate + '.'
                            : 'It is now in the vessel\'s maintenance log.') + '</p>' +
      (score ? '<p style="font-size:22px;font-weight:bold">' + score + ' / 10</p>' + (x.reviewText ? '<p><i>' + esc(x.reviewText) + '</i></p>' : '') +
               '<p>The score is now part of your CJM Marine record.</p>' : '') +
      (x.decisionNote ? '<p><i>' + esc(x.decisionNote) + '</i></p>' : '') + appLink());
  }
  return listTaskReviews(c, user);
}

/** Files attached to a request: the sender, the vessel's Captain/Owner, or a CJM admin. */
function getWorkFile(user, id) {
  const a = readTable('Attachments').find(k => k.id === id && String(k.taskId).indexOf('WS:') === 0);
  const x = a && readTable('WorkSubmissions').find(k => 'WS:' + k.id === a.taskId);
  if (!x || !(x.userId === user.id || isTrue(user.isAdmin) || (x.vesselId && isVesselReviewer(x.vesselId, user.id)))) throw new Error('File not found');
  return { ok: true, name: a.name, mimeType: a.mimeType, data: readFile(a.fileId) };
}

// ── answered from the email link, no account ──
function workByToken(token) {
  const x = token && readTable('WorkSubmissions').find(k => k.token && k.token === String(token));
  if (!x) throw new Error('This link is not valid. The job may have been withdrawn.');
  return x;
}

function getWorkReview(token) {
  const x = workByToken(token);
  const u = readTable('Users').find(k => k.id === x.userId) || {};
  const pr = profileOf(x.userId) || {};
  return { ok: true, job: {
    title: x.title, system: x.system, description: x.description, performedDate: x.performedDate, boatName: x.boatName,
    contactName: x.contactName, crewName: u.name || '', crewHeadline: pr.headline || '', wantScore: isTrue(x.wantScore),
    status: x.status === 'pending' && x.tokenExpires < today() ? 'expired' : x.status,
    score: x.score ? Number(x.score) : null, reviewText: x.reviewText, decidedLabel: x.decidedLabel,
    attachments: workFiles(x.id) }, roles: WORK_ROLES, joinUrl: joinUrl(x.boatName) };
}

function answerWorkReview(token, a) {
  const x = workByToken(token);
  if (x.status === 'cancelled') throw new Error('This job was withdrawn');
  if (x.status !== 'pending') throw new Error('This job was already answered');
  if (x.tokenExpires < today()) throw new Error('This link has expired');
  const name = clip(a.name, 80);
  if (!name) throw new Error('Enter your name');
  const role = WORK_ROLES.indexOf(a.role) !== -1 ? a.role : 'Captain';
  let score = 0;
  if (a.approve && a.score) {
    score = Math.round(Number(a.score));
    if (!(score >= 1 && score <= 10)) throw new Error('Choose a score from 1 to 10');
  }
  const now = nowIso(), text = clip(a.text, 1000);
  x.status = a.approve ? 'approved' : 'declined'; x.decidedLabel = role + ' ' + name; x.decidedAt = now;
  x.score = score ? String(score) : ''; x.reviewText = a.approve ? text : ''; x.decisionNote = a.approve ? '' : text;
  update('WorkSubmissions', x._row, x);
  if (score) {
    insert('TaskReviews', { id: newId('W'), vesselId: '', taskId: '', completionId: '', userId: x.userId, requestedAt: x.createdAt,
      message: '', status: 'reviewed', reviewerId: '', score: String(score), text, reviewedAt: now, taskTitle: x.title,
      vesselName: x.boatName, reviewerLabel: role, reviewerName: name, workDate: x.performedDate });
  }
  audit('', a.approve ? 'approveWorkByEmail' : 'declineWorkByEmail', '', x.title + ' (' + x.boatName + ') by ' + x.contactEmail + (score ? ': ' + score + '/10' : ''), '');
  const crew = readTable('Users').find(u => u.id === x.userId);
  if (crew && isTrue(crew.active)) {
    sendMail(crew.email, (a.approve ? 'Confirmed: ' : 'Not confirmed: ') + x.title + (score ? ' (' + score + '/10)' : ''),
      '<p>' + esc(role + ' ' + name) + ' of ' + esc(x.boatName) + (a.approve ? ' confirmed' : ' did not confirm') + ' <b>' + esc(x.title) + '</b>.</p>' +
      (score ? '<p style="font-size:22px;font-weight:bold">' + score + ' / 10</p><p>The score is now part of your CJM Marine record.</p>' : '') +
      (text ? '<p><i>' + esc(text) + '</i></p>' : '') + appLink());
  }
  return getWorkReview(token);
}

function workReviewFile(token, id) {
  const x = workByToken(token);
  const a = readTable('Attachments').find(k => k.id === id && k.taskId === 'WS:' + x.id);
  if (!a) throw new Error('File not found');
  return { ok: true, name: a.name, mimeType: a.mimeType, data: readFile(a.fileId) };
}

/** Demo: a suggestion and a piece of unlisted work waiting for the Captain of the demo yacht. */
function addDemoWorkRequests_(v, deck, stew) {
  deleteRowsWhere('WorkSubmissions', r => r.vesselId === v.id);
  const now = nowIso(), base = { vesselId: v.id, boatName: v.name, contactEmail: '', contactName: '', token: '', tokenExpires: '',
    status: 'pending', decidedBy: '', decidedLabel: '', decidedAt: '', decisionNote: '', score: '', reviewText: '', taskId: '', completionId: '', createdAt: now };
  insert('WorkSubmissions', Object.assign({}, base, { id: newId('J'), kind: 'suggest', userId: deck, title: 'Check tender davit wire for broken strands',
    system: 'Tender & toys', description: 'Saw some fraying near the drum on the port davit. Suggest a monthly check.', performedDate: '',
    dueDate: addInterval(today(), 3, 'days'), recurring: 'TRUE', intervalValue: '1', intervalUnit: 'months', wantScore: 'FALSE' }));
  insert('WorkSubmissions', Object.assign({}, base, { id: newId('J'), kind: 'done', userId: stew, title: 'Descaled the crew mess coffee machine',
    system: 'Galley', description: 'Was tripping the breaker. Descaled and cleaned the group head; working normally now.',
    performedDate: addInterval(today(), -1, 'days'), dueDate: '', recurring: 'FALSE', intervalValue: '', intervalUnit: '', wantScore: 'TRUE' }));
}
