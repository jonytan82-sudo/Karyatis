/**
 * CJM MARINE — Multi-vessel maintenance platform and crew directory
 * Google Apps Script backend, bound to one Google Sheet.
 *
 * FIRST-TIME SETUP (or upgrading from the single-vessel Karyatis version):
 *   1. Paste this file into Extensions → Apps Script of your Google Sheet and save.
 *   2. Edit the four values at the top of setupPlatform() and run it once.
 *   3. Deploy → Manage deployments → edit → New version (or New deployment → Web app,
 *      Execute as: Me, Who has access: Anyone). Put the /exec URL in Netlify as VITE_API_URL.
 *
 * The frontend talks to this with POST requests:
 *   fetch(URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
 *                body: JSON.stringify({ action, token, vesselId, ... }) })
 */

const SCRIPT_VERSION = '2.0 (CJM Marine multi-vessel)';

// ───────────────────────── CONFIG ─────────────────────────
const CONFIG = {
  APP_NAME: 'CJM Marine',
  APP_URL: '',                 // your Netlify URL, e.g. https://karyatismx.netlify.app (used in emails)
  AMBER_DAYS: 10,              // 0–10 days to due = amber, >10 = green, past due = red
  REMINDER_DAYS: [30, 10, 0],  // email milestones before the due date
  OVERDUE_REMIND_EVERY: 3,     // days between repeat emails for overdue items
  RECUR_FROM: 'performed',     // 'performed' = next due counts from date done; 'due' = from old due date
  SESSION_DAYS: 30,            // people stay logged in this long
  SETUP_LINK_DAYS: 7,          // how long an account setup link works
  DIGEST_HOUR: 7               // hour (script time zone) the daily reminder runs
};

const SHEETS = {
  Users:       ['id', 'name', 'email', 'passwordHash', 'salt', 'active', 'isAdmin', 'createdAt'],
  Profiles:    ['userId', 'photo', 'headline', 'bio', 'location', 'yearsExperience', 'availability',
                'phone', 'showContact', 'languages', 'certifications', 'experience', 'updatedAt'],
  Vessels:     ['id', 'name', 'type', 'length', 'homePort', 'active', 'createdAt', 'createdBy'],
  Memberships: ['id', 'vesselId', 'userId', 'position', 'status', 'joinedAt', 'leftAt', 'invitedBy'],
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
  Audit:       ['timestamp', 'userId', 'action', 'taskId', 'details', 'vesselId']
};

// Membership.status: 'active' | 'invited' | 'left' | 'declined'
// Task.type: 'Routine' | 'Issue'.  Task.state: 'Open' | 'Completed' | 'Resolved'

// ───────────────────────── POSITIONS ─────────────────────────
const DEPARTMENTS = {
  'Main engines': 'engine', 'Generators': 'engine', 'Electrical': 'engine', 'Fuel': 'engine',
  'Plumbing & water': 'engine', 'HVAC': 'engine', 'Steering & stabilizers': 'engine',
  'Navigation & electronics': 'engine',
  'Hull & deck': 'deck', 'Tender & toys': 'deck', 'Safety equipment': 'deck',
  'Galley': 'interior', 'Interior': 'interior',
  'Other': 'any', '': 'any'
};

// manageCrew: add/invite/remove crew and set positions on the vessel
// createRoutine: schedule maintenance and assign crew
// editAll: edit any task (otherwise: own department, or tasks they created)
// depts: departments they can sign off ('all' = everything)
// hires: can search the crew directory and review crew
const POSITIONS = {
  'Owner':          { manageCrew: true,  createRoutine: false, editAll: false, depts: [],           hires: true },
  'Captain':        { manageCrew: true,  createRoutine: true,  editAll: true,  depts: 'all',        hires: true },
  'Chief Engineer': { manageCrew: false, createRoutine: true,  editAll: true,  depts: 'all',        hires: false },
  'Engineer':       { manageCrew: false, createRoutine: true,  editAll: false, depts: ['engine'],   hires: false },
  'Bosun':          { manageCrew: false, createRoutine: true,  editAll: false, depts: ['deck'],     hires: false },
  'Interior':       { manageCrew: false, createRoutine: false, editAll: false, depts: ['interior'], hires: false },
  'Deckhand':       { manageCrew: false, createRoutine: false, editAll: false, depts: [],           hires: false }
};
const MANAGERS = ['Owner', 'Captain'];

function positionOf(p) {
  if (POSITIONS[p]) return p;
  return p === 'admin' ? 'Captain' : 'Deckhand';
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
      insert('Memberships', { id: newId('M'), vesselId, userId: c.id, position: positionOf(c.role),
        status: removed || !isTrue(c.active) ? 'left' : 'active', joinedAt: c.createdAt || nowIso(),
        leftAt: removed ? nowIso() : '', invitedBy: '' });
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
    .filter(t => t.getHandlerFunction() === 'dailyReminders')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyReminders').timeBased().everyDays(1).atHour(CONFIG.DIGEST_HOUR).create();
}

// ───────────────────────── API ─────────────────────────
function doGet() {
  return json({ ok: true, app: CONFIG.APP_NAME, version: SCRIPT_VERSION });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return json({ ok: false, error: 'Bad request' }); }

  try {
    const pub = {
      version:        () => ({ ok: true, version: SCRIPT_VERSION }),
      login:          () => withLock(() => login(req.email, req.password, req.vesselId)),
      requestReset:   () => requestReset(req.email),
      confirmReset:   () => withLock(() => confirmReset(req.email, req.code, req.newPassword)),
      requestAccount: () => withLock(() => requestAccount(req.request || {})),
      getSetup:       () => getSetup(req.setupToken),
      completeSetup:  () => withLock(() => completeSetup(req.setupToken, req.newPassword))
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
      addNote:        () => withLock(() => addNote(V(), user, req.taskId, req.text)),

      // vessel crew
      listCrew:       () => ({ ok: true, crew: listCrew(V()) }),
      inviteMember:   () => withLock(() => inviteMember(V(), user, req.member || {})),
      setPosition:    () => withLock(() => setPosition(V(), user, req.userId, req.position)),
      removeMember:   () => withLock(() => removeMember(V(), user, req.userId)),
      resendSetup:    () => withLock(() => resendSetup(V(), user, req.userId)),
      cancelInvite:   () => withLock(() => cancelInvite(V(), user, req.userId)),
      listRequests:   () => listRequests(user, req.vesselId),
      approveRequest: () => withLock(() => approveRequest(user, req.id, req.vesselId, req.position)),
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
      setUserActive:  () => { requireAdmin(user); return withLock(() => setUserActive(user, req.userId, req.active)); }
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
  const token = startSession(user);
  return Object.assign({ token }, bootstrap(user, vesselId));
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
  if (!newPassword || String(newPassword).length < 6) throw new Error('Password must be at least 6 characters');
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
  return login(email, newPassword);
}

// ───────────────────────── ACCOUNT SETUP LINKS ─────────────────────────
function makeSetupLink(userId) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const expires = new Date(Date.now() + CONFIG.SETUP_LINK_DAYS * 86400000).toISOString();
  insert('Tokens', { token, userId, purpose: 'setup', expiresAt: expires, used: 'FALSE' });
  return (CONFIG.APP_URL ? CONFIG.APP_URL.replace(/\/$/, '') : '') + '/?setup=' + token;
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
  return login(user.email, newPassword);
}

// ───────────────────────── BOOTSTRAP ─────────────────────────
function bootstrap(user, vesselId) {
  const vessels = readTable('Vessels').filter(v => isTrue(v.active));
  const vName = {};
  vessels.forEach(v => vName[v.id] = v.name);
  const mine = readTable('Memberships').filter(m => m.userId === user.id && vName[m.vesselId]);
  const memberships = mine.filter(m => m.status === 'active')
    .map(m => ({ membershipId: m.id, vesselId: m.vesselId, vesselName: vName[m.vesselId], position: positionOf(m.position) }));
  const invites = mine.filter(m => m.status === 'invited').map(m => {
    const by = readTable('Users').find(u => u.id === m.invitedBy);
    return { membershipId: m.id, vesselId: m.vesselId, vesselName: vName[m.vesselId],
             position: positionOf(m.position), invitedBy: by ? by.name : '' };
  });

  const out = {
    ok: true,
    user: publicUser(user),
    memberships,
    invites,
    vessels: isTrue(user.isAdmin) ? vessels.map(v => ({ vesselId: v.id, vesselName: v.name })) : undefined,
    pendingRequests: countPendingRequests(user)
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
  const position = m ? positionOf(m.position) : 'Captain'; // CJM admin acts with Captain rights
  return { vessel, membership: m || null, position, perms: POSITIONS[position], isAdmin: isTrue(user.isAdmin) };
}

function inMyDept(c, task) {
  const d = DEPARTMENTS[task.system] || 'any';
  if (c.perms.depts === 'all') return true;
  if (d === 'any') return c.perms.depts.length > 0;
  return c.perms.depts.indexOf(d) !== -1;
}

function canSignOff(c, user, task) {
  return task.state === 'Open' && (task.assignedTo === user.id || inMyDept(c, task));
}

function canEdit(c, user, task) {
  return c.perms.editAll || task.createdBy === user.id || (c.perms.createRoutine && inMyDept(c, task));
}

function canSearch(user) {
  if (isTrue(user.isAdmin)) return true;
  return readTable('Memberships').some(m => m.userId === user.id && m.status === 'active' &&
    POSITIONS[positionOf(m.position)].hires);
}

// ───────────────────────── VESSEL CREW ─────────────────────────
function listCrew(c) {
  const users = {};
  readTable('Users').forEach(u => users[u.id] = u);
  return readTable('Memberships')
    .filter(m => m.vesselId === c.vessel.id && (m.status === 'active' || m.status === 'invited') && users[m.userId])
    .map(m => {
      const u = users[m.userId];
      return { id: u.id, name: u.name, email: u.email, position: positionOf(m.position), status: m.status,
               joinedAt: m.joinedAt, active: isTrue(u.active), needsSetup: !u.passwordHash };
    })
    .sort((a, b) => Object.keys(POSITIONS).indexOf(a.position) - Object.keys(POSITIONS).indexOf(b.position));
}

function requireManager(c) {
  if (!c.perms.manageCrew) throw new Error('Only the Captain or Owner can manage crew');
}

function canGrant(c, position) {
  if (!POSITIONS[position]) throw new Error('Unknown position');
  if (position === 'Owner' && !(c.isAdmin || c.position === 'Owner')) throw new Error('Only an Owner can add another Owner');
}

function activeMembership(vesselId, userId) {
  return readTable('Memberships').find(m => m.vesselId === vesselId && m.userId === userId &&
    (m.status === 'active' || m.status === 'invited'));
}

function otherManagers(vesselId, exceptUserId) {
  return readTable('Memberships').filter(m => m.vesselId === vesselId && m.status === 'active' &&
    m.userId !== exceptUserId && MANAGERS.indexOf(positionOf(m.position)) !== -1).length;
}

/**
 * Adds someone to a vessel by email.
 * Existing account → invitation they accept after logging in (keeps their profile and reviews).
 * New person → account created and a setup link returned (and emailed when possible).
 */
function addToVessel(byUser, vessel, email, name, position) {
  email = String(email || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email');
  let user = readTable('Users').find(u => u.email === email);
  if (user) {
    if (!isTrue(user.active)) throw new Error('That account is deactivated. Ask CJM to reactivate it.');
    const existing = activeMembership(vessel.id, user.id);
    if (existing) throw new Error(user.name + (existing.status === 'invited' ? ' already has an invitation' : ' is already on this vessel'));
    if (!user.passwordHash) {
      // account exists but was never set up: add directly and send a fresh setup link
      insert('Memberships', { id: newId('M'), vesselId: vessel.id, userId: user.id, position, status: 'active',
                              joinedAt: nowIso(), leftAt: '', invitedBy: byUser.id });
      const link = makeSetupLink(user.id);
      const emailed = mailSetup(user, vessel, position, byUser, link);
      return { ok: true, status: 'created', name: user.name, setupLink: link, emailed };
    }
    insert('Memberships', { id: newId('M'), vesselId: vessel.id, userId: user.id, position, status: 'invited',
                            joinedAt: '', leftAt: '', invitedBy: byUser.id });
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
    insert('Memberships', { id: newId('M'), vesselId: vessel.id, userId: user.id, position, status: 'active',
                            joinedAt: nowIso(), leftAt: '', invitedBy: byUser.id });
  }
  const link = makeSetupLink(user.id);
  const emailed = mailSetup(user, vessel, position, byUser, link);
  return { ok: true, status: 'created', name: user.name, setupLink: link, emailed };
}

function mailSetup(user, vessel, position, byUser, link) {
  const where = vessel ? ' on <b>' + esc(vessel.name) + '</b> as <b>' + esc(position) + '</b>' : '';
  const href = link.charAt(0) === '/' ? '' : link;
  return sendMail(user.email, 'Your ' + CONFIG.APP_NAME + ' account',
    '<p>Hello ' + esc(user.name) + ',</p>' +
    '<p>' + esc(byUser.name) + ' set up a ' + esc(CONFIG.APP_NAME) + ' account for you' + where + '.</p>' +
    (href ? '<p><a href="' + href + '" style="font-size:16px">Set your password</a></p>' +
            '<p style="color:#666">This link works for ' + CONFIG.SETUP_LINK_DAYS + ' days.</p>'
          : '<p>Your captain will send you a link to set your password.</p>'));
}

function inviteMember(c, user, m) {
  requireManager(c);
  const position = positionOf(m.position);
  canGrant(c, position);
  const r = addToVessel(user, c.vessel, m.email, m.name, position);
  audit(user.id, 'inviteMember', '', r.name + ' as ' + position + ' (' + r.status + ')', c.vessel.id);
  return r;
}

function setPosition(c, user, userId, position) {
  requireManager(c);
  position = positionOf(position);
  canGrant(c, position);
  const m = activeMembership(c.vessel.id, userId);
  if (!m) throw new Error('Crew member not found');
  const old = positionOf(m.position);
  if (old === 'Owner' && !(c.isAdmin || c.position === 'Owner')) throw new Error('Only an Owner can change an Owner');
  if (m.status === 'active' && MANAGERS.indexOf(old) !== -1 && MANAGERS.indexOf(position) === -1 &&
      otherManagers(c.vessel.id, userId) === 0) {
    throw new Error('Each vessel needs at least one Captain or Owner');
  }
  m.position = position;
  update('Memberships', m._row, m);
  audit(user.id, 'setPosition', '', userName(userId) + ': ' + old + ' → ' + position, c.vessel.id);
  return { ok: true };
}

function removeMember(c, user, userId) {
  requireManager(c);
  if (userId === user.id) throw new Error('You cannot remove yourself');
  const m = activeMembership(c.vessel.id, userId);
  if (!m) throw new Error('Crew member not found');
  const pos = positionOf(m.position);
  if (pos === 'Owner' && !(c.isAdmin || c.position === 'Owner')) throw new Error('Only an Owner can remove an Owner');
  if (m.status === 'active' && MANAGERS.indexOf(pos) !== -1 && otherManagers(c.vessel.id, userId) === 0) {
    throw new Error('Each vessel needs at least one Captain or Owner');
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
  const emailed = mailSetup(u, c.vessel, positionOf(m.position), user, link);
  return { ok: true, setupLink: link, emailed };
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
const REQUEST_KINDS = ['Crew', 'Captain', 'Owner'];

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
    position: POSITIONS[r.position] ? r.position : '',
    vesselName: String(r.vesselName || '').trim().slice(0, 100),
    message: String(r.message || '').trim().slice(0, 1000),
    status: 'pending', createdAt: nowIso(), handledBy: '', handledAt: ''
  });
  const admins = readTable('Users').filter(u => isTrue(u.isAdmin) && isTrue(u.active)).map(u => u.email);
  if (admins.length) {
    sendMail(admins.join(','), 'New account request: ' + name,
      '<p><b>' + esc(name) + '</b> (' + esc(email) + ') asked for a ' + esc(kind) + ' account' +
      (r.vesselName ? ' for <b>' + esc(r.vesselName) + '</b>' : '') + '.</p>' +
      (r.message ? '<p>' + esc(r.message) + '</p>' : '') + appLink());
  }
  return { ok: true, message: 'Request sent. You will get an email when your account is ready.' };
}

function normVessel(s) {
  return String(s || '').toLowerCase().replace(/\b(m\/?y|s\/?y|mv|sy|my)\b/g, '').replace(/[^a-z0-9]/g, '');
}

function requestsVisibleTo(user, vesselId) {
  const pending = readTable('Requests').filter(r => r.status === 'pending');
  if (isTrue(user.isAdmin) && !vesselId) return pending;
  const managed = readTable('Memberships').filter(m => m.userId === user.id && m.status === 'active' &&
    POSITIONS[positionOf(m.position)].manageCrew && (!vesselId || m.vesselId === vesselId)).map(m => m.vesselId);
  if (isTrue(user.isAdmin) && vesselId && managed.indexOf(vesselId) === -1) managed.push(vesselId);
  if (!managed.length) return [];
  const names = readTable('Vessels').filter(v => managed.indexOf(v.id) !== -1).map(v => normVessel(v.name));
  return pending.filter(r => r.vesselName && names.indexOf(normVessel(r.vesselName)) !== -1);
}

function countPendingRequests(user) {
  return requestsVisibleTo(user, '').length;
}

function listRequests(user, vesselId) {
  return { ok: true, requests: requestsVisibleTo(user, vesselId || '').map(r => ({
    id: r.id, name: r.name, email: r.email, kind: r.kind, position: r.position, vesselName: r.vesselName,
    message: r.message, createdAt: r.createdAt })) };
}

function approveRequest(user, id, vesselId, position) {
  const r = requestsVisibleTo(user, '').find(x => x.id === id);
  if (!r) throw new Error('Request not found or already handled');
  let vessel = null;
  if (vesselId) {
    const c = vesselCtx(user, vesselId);
    requireManager(c);
    position = positionOf(position || r.position || (r.kind === 'Owner' ? 'Owner' : r.kind === 'Captain' ? 'Captain' : 'Deckhand'));
    canGrant(c, position);
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
    res = addToVessel(user, vessel, r.email, r.name, position);
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
                 length: vessels[m.vesselId].length, position: positionOf(m.position),
                 from: (m.joinedAt || '').slice(0, 10), to: m.status === 'left' ? (m.leftAt || '').slice(0, 10) : '',
                 current: m.status === 'active' }))
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
    POSITIONS[positionOf(m.position)].hires).map(m => m.vesselId);
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
      yearsExperience: p.yearsExperience || '', availability: p.availability || '',
      showContact: isTrue(p.showContact), languages: p.languages || '',
      certifications: parseList(p.certifications), experience: parseList(p.experience),
      vesselHistory: vesselHistory(userId), updatedAt: p.updatedAt || ''
    },
    reviews,
    summary: ratingSummary(userId),
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
  ['headline', 'location', 'phone', 'languages'].forEach(k => { if (p[k] !== undefined) row[k] = clip(p[k], 150); });
  if (p.bio !== undefined) row.bio = clip(p.bio, 2000);
  if (p.yearsExperience !== undefined) row.yearsExperience = clip(p.yearsExperience, 3).replace(/\D/g, '');
  if (p.availability !== undefined) row.availability = AVAILABILITY.indexOf(p.availability) !== -1 ? p.availability : '';
  if (p.showContact !== undefined) row.showContact = p.showContact ? 'TRUE' : 'FALSE';
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
    (current[m.userId] = current[m.userId] || []).push({ position: positionOf(m.position), active: m.status === 'active',
                                                          vessel: vessels[m.vesselId] || '' });
  });
  const reviews = {};
  readTable('Reviews').forEach(r => (reviews[r.userId] = reviews[r.userId] || []).push(Number(r.rating)));

  const results = readTable('Users').filter(u => isTrue(u.active) && u.id !== viewer.id).map(u => {
    const p = profiles[u.id] || {};
    const ms = current[u.id] || [];
    const positions = ms.map(m => m.position).filter((x, i, a) => a.indexOf(x) === i);
    const certs = parseList(p.certifications).map(x => x.name);
    const exp = parseList(p.experience).map(x => [x.vessel, x.position, x.notes].join(' '));
    const text = [u.name, p.headline, p.bio, p.location, p.languages, p.availability, positions.join(' '),
                  certs.join(' '), exp.join(' '), ms.map(m => m.vessel).join(' ')].join(' ').toLowerCase();
    const rs = reviews[u.id] || [];
    return {
      userId: u.id, name: u.name, photo: p.photo || '', headline: p.headline || '', location: p.location || '',
      availability: p.availability || '', yearsExperience: p.yearsExperience || '',
      positions, currentPosition: (ms.find(m => m.active) || {}).position || '',
      certCount: certs.length, rating: rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) / rs.length * 10) / 10 : 0,
      reviewCount: rs.length, hasProfile: !!profiles[u.id], _text: text
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

// ───────────────────────── PLATFORM ADMIN ─────────────────────────
function adminOverview() {
  const users = readTable('Users');
  const ms = readTable('Memberships');
  const tasks = readTable('Tasks').filter(t => t.state === 'Open');
  const vName = {};
  const vessels = readTable('Vessels').map(v => {
    vName[v.id] = v.name;
    const vt = tasks.filter(t => t.vesselId === v.id);
    const managers = ms.filter(m => m.vesselId === v.id && m.status === 'active' && MANAGERS.indexOf(positionOf(m.position)) !== -1)
      .map(m => { const u = users.find(x => x.id === m.userId); return u ? u.name + ' (' + positionOf(m.position) + ')' : ''; })
      .filter(Boolean);
    return {
      id: v.id, name: v.name, type: v.type, length: v.length, homePort: v.homePort, active: isTrue(v.active),
      crew: ms.filter(m => m.vesselId === v.id && m.status === 'active').length,
      openTasks: vt.length, overdue: vt.filter(t => t.dueDate && t.dueDate < today()).length, managers
    };
  });
  return {
    ok: true, vessels,
    users: users.map(u => ({
      id: u.id, name: u.name, email: u.email, active: isTrue(u.active), isAdmin: isTrue(u.isAdmin),
      needsSetup: !u.passwordHash,
      vessels: ms.filter(m => m.userId === u.id && m.status === 'active').map(m => (vName[m.vesselId] || '?') + ' · ' + positionOf(m.position))
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
    const pos = v.managerPosition === 'Owner' ? 'Owner' : 'Captain';
    const email = String(v.managerEmail).toLowerCase().trim();
    const pending = readTable('Requests').filter(r => r.status === 'pending' && r.email === email);
    manager = addToVessel(user, vessel, email, v.managerName || (pending[0] && pending[0].name), pos);
    pending.forEach(r => { r.status = 'approved'; r.handledBy = user.id; r.handledAt = nowIso(); update('Requests', r._row, r); });
  }
  return { ok: true, vessel: { id: vessel.id, name }, manager };
}

function updateVessel(user, id, v) {
  const vessel = readTable('Vessels').find(x => x.id === id);
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
  if (!u) throw new Error('User not found');
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
  return readTable('Tasks').filter(t => t.vesselId === c.vessel.id);
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
  const notes = readTable('Notes').filter(n => n.taskId === id)
    .map(n => ({ id: n.id, text: n.text, createdAt: n.createdAt, by: names[n.userId] || n.userId }));
  const completions = readTable('Completions').filter(x => x.taskId === id)
    .map(x => ({ dueDate: x.dueDate, performedDate: x.performedDate, timing: x.timing,
                 notes: x.notes, by: names[x.performedBy] || x.performedBy, loggedAt: x.loggedAt }));
  const history = readTable('Audit').filter(a => a.taskId === id)
    .map(a => ({ timestamp: a.timestamp, action: a.action, details: a.details, by: names[a.userId] || a.userId }));
  return { ok: true, task: decorate(c, t, names, user), notes, completions, history };
}

function crewOnVessel(c, userId) {
  return !userId || readTable('Memberships').some(m => m.vesselId === c.vessel.id && m.userId === userId && m.status === 'active');
}

function createTask(c, user, t) {
  if (!t.title) throw new Error('Title required');
  const type = t.type === 'Issue' ? 'Issue' : 'Routine';
  if (type === 'Routine' && !c.perms.createRoutine) throw new Error('Your position can report issues but not schedule maintenance');
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
  if (!canEdit(c, user, t)) throw new Error('Your position cannot edit this task');
  if (changes.assignedTo !== undefined && changes.assignedTo !== t.assignedTo) {
    if (!c.perms.createRoutine) throw new Error('Your position cannot assign tasks');
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
    const label = { engine: 'engineering', deck: 'deck', interior: 'interior' }[DEPARTMENTS[t.system]];
    throw new Error('Only the assigned crew member' + (label ? ' or the ' + label + ' department' : ' or an officer') + ' can sign this off');
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
  insert('Completions', {
    id: newId('X'), taskId: t.id, dueDate: t.dueDate, performedDate: performed,
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
  return { ok: true, task: decorate(c, t, crewNames(), user) };
}

function addNote(c, user, taskId, text) {
  if (!text || !String(text).trim()) throw new Error('Note is empty');
  taskIn(c, taskId);
  const note = { id: newId('N'), taskId, userId: user.id, text: clip(text, 3000), createdAt: nowIso() };
  insert('Notes', note);
  audit(user.id, 'note', taskId, note.text.slice(0, 100), c.vessel.id);
  return { ok: true, note };
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
      const emails = members.filter(m => m.vesselId === v.id && users[m.userId] && isTrue(users[m.userId].active))
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

// ───────────────────────── AUDIT / MAIL ─────────────────────────
function audit(userId, action, taskId, details, vesselId) {
  insert('Audit', { timestamp: nowIso(), userId, action, taskId, details, vesselId: vesselId || '' });
}

function appLink() {
  return CONFIG.APP_URL ? '<p><a href="' + CONFIG.APP_URL + '">Open ' + esc(CONFIG.APP_NAME) + '</a></p>' : '';
}

function sendMail(to, subject, html) {
  try {
    MailApp.sendEmail({ to, subject, name: CONFIG.APP_NAME,
      htmlBody: '<div style="font-family:Arial,sans-serif;color:#12324a">' + html + '</div>' });
    return true;
  } catch (e) {
    Logger.log('Email failed: ' + e.message);
    return false;
  }
}

// ───────────────────────── SHEET HELPERS ─────────────────────────
const TABLE_CACHE = {}; // lives for one request only

function sheet(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run setupPlatform() in Apps Script.');
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
