/**
 * KARYATIS — Vessel Maintenance & Crew Task Tracker
 * Google Apps Script backend. Bind this to a Google Sheet, run setup(),
 * then createFirstAdmin(), then deploy as a Web App.
 *
 * The frontend (Netlify) talks to this with POST requests:
 *   fetch(WEB_APP_URL, { method: 'POST',
 *     headers: { 'Content-Type': 'text/plain' },   // avoids CORS preflight
 *     body: JSON.stringify({ action: 'listTasks', token }) })
 */

// ───────────────────────── CONFIG ─────────────────────────
const SCRIPT_VERSION = '1.4 (positions, remove crew)';
const CONFIG = {
  APP_NAME: 'Karyatis',
  APP_URL: '',                 // Netlify URL, used as a link in reminder emails
  AMBER_DAYS: 10,              // 0–10 days to due = amber, >10 = green, past due = red
  REMINDER_DAYS: [30, 10, 0],  // email milestones before the due date
  OVERDUE_REMIND_EVERY: 3,     // days between repeat emails for overdue items
  RECUR_FROM: 'performed',     // 'performed' = next due counts from date done; 'due' = from old due date
  SESSION_DAYS: 30,            // crew stay logged in this long
  DIGEST_HOUR: 7               // hour (script time zone) the daily reminder runs
};

const SHEETS = {
  Crew:        ['id', 'name', 'email', 'role', 'passwordHash', 'salt', 'active', 'createdAt'],
  Sessions:    ['token', 'crewId', 'expiresAt'],
  Tasks:       ['id', 'title', 'description', 'system', 'type', 'dueDate', 'dueTime',
                'recurring', 'intervalValue', 'intervalUnit', 'assignedTo', 'state',
                'createdBy', 'createdAt', 'lastPerformed', 'lastPerformedBy',
                'resolution', 'reminderLog'],
  Completions: ['id', 'taskId', 'dueDate', 'performedDate', 'performedBy', 'timing', 'notes', 'loggedAt'],
  Notes:       ['id', 'taskId', 'crewId', 'text', 'createdAt'],
  Audit:       ['timestamp', 'crewId', 'action', 'taskId', 'details']
};

// ───────────────────────── POSITIONS ─────────────────────────
// Crew.role stores the position. Old values 'admin'/'crew' map to Captain/Deckhand.
const DEPARTMENTS = {
  'Main engines': 'engine', 'Generators': 'engine', 'Electrical': 'engine', 'Fuel': 'engine',
  'Plumbing & water': 'engine', 'HVAC': 'engine', 'Steering & stabilizers': 'engine',
  'Navigation & electronics': 'engine',
  'Hull & deck': 'deck', 'Tender & toys': 'deck', 'Safety equipment': 'deck',
  'Galley': 'interior', 'Interior': 'interior',
  'Other': 'any', '': 'any'
};

// manageCrew: add crew, set positions, reset passwords
// createRoutine: create scheduled maintenance tasks and assign crew
// editAll: edit any task (otherwise: tasks in own departments or that they created)
// depts: departments they can sign off / close issues in ('all' = everything)
// Everyone can view everything, report issues, add notes, and sign off tasks assigned to them.
const POSITIONS = {
  'Captain':        { manageCrew: true,  createRoutine: true,  editAll: true,  depts: 'all' },
  'Chief Engineer': { manageCrew: false, createRoutine: true,  editAll: true,  depts: 'all' },
  'Engineer':       { manageCrew: false, createRoutine: true,  editAll: false, depts: ['engine'] },
  'Bosun':          { manageCrew: false, createRoutine: true,  editAll: false, depts: ['deck'] },
  'Interior':       { manageCrew: false, createRoutine: false, editAll: false, depts: ['interior'] },
  'Deckhand':       { manageCrew: false, createRoutine: false, editAll: false, depts: [] }
};

function positionOf(c) {
  if (POSITIONS[c.role]) return c.role;
  return c.role === 'admin' ? 'Captain' : 'Deckhand';
}

function perms(user) { return POSITIONS[positionOf(user)]; }

function inMyDept(user, task) {
  const p = perms(user), d = DEPARTMENTS[task.system] || 'any';
  if (p.depts === 'all') return true;
  if (d === 'any') return p.depts.length > 0;
  return p.depts.indexOf(d) !== -1;
}

function canSignOff(user, task) {
  return task.state === 'Open' && (task.assignedTo === user.id || inMyDept(user, task));
}

function canEdit(user, task) {
  const p = perms(user);
  return p.editAll || task.createdBy === user.id || (p.createRoutine && inMyDept(user, task));
}

// Task.type:  'Routine' (scheduled maintenance) | 'Issue' (ongoing problem)
// Task.state: 'Open' | 'Completed' (one-off done) | 'Resolved' (issue closed)
// intervalUnit: 'days' | 'weeks' | 'months' | 'years'

// ───────────────────────── SETUP ─────────────────────────
function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(name => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange('A:Z').setNumberFormat('@'); // store everything as plain text
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  installDailyTrigger();
}

/** Edit these three values, run once, then clear the password from the code. */
function createFirstAdmin() {
  const NAME = 'Captain', EMAIL = 'captain@example.com', PASSWORD = 'change-me-now';
  if (readTable('Crew').some(c => c.email.toLowerCase() === EMAIL.toLowerCase())) {
    throw new Error('That email already exists');
  }
  const salt = Utilities.getUuid();
  insert('Crew', {
    id: newId('C'), name: NAME, email: EMAIL.toLowerCase(), role: 'Captain',
    passwordHash: hash(PASSWORD, salt), salt, active: 'TRUE', createdAt: nowIso()
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
    if (req.action === 'login') return json(withLock(() => login(req.email, req.password)));

    const user = auth(req.token);
    const handlers = {
      logout:         () => withLock(() => logout(req.token)),
      me:             () => ({ ok: true, user: publicUser(user) }),
      bootstrap:      () => ({ ok: true, user: publicUser(user), tasks: listTasks(user, req).tasks, crew: listCrew().crew }),
      listTasks:      () => listTasks(user, req),
      calendar:       () => calendar(req.from, req.to),
      getTask:        () => getTask(user, req.id),
      createTask:     () => withLock(() => createTask(user, req.task || {})),
      updateTask:     () => withLock(() => updateTask(user, req.id, req.task || {})),
      completeTask:   () => withLock(() => completeTask(user, req)),
      addNote:        () => withLock(() => addNote(user, req.taskId, req.text)),
      listCrew:       () => listCrew(),
      changePassword: () => withLock(() => changePassword(user, req.oldPassword, req.newPassword)),
      addCrew:        () => { requireAdmin(user); return withLock(() => addCrew(user, req.crew || {})); },
      setPosition:    () => { requireAdmin(user); return withLock(() => setPosition(user, req.id, req.position)); },
      removeCrew:     () => { requireAdmin(user); return withLock(() => removeCrew(user, req.id)); },
      setCrewActive:  () => { requireAdmin(user); return withLock(() => setCrewActive(user, req.id, req.active)); },
      resetPassword:  () => { requireAdmin(user); return withLock(() => resetPassword(user, req.id, req.newPassword)); }
    };
    const fn = handlers[req.action];
    if (!fn) return json({ ok: false, error: 'Unknown action "' + req.action + '". The Google Script is out of date: in Apps Script, Deploy → Manage deployments → Edit → New version.' });
    return json(fn());
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

// ───────────────────────── AUTH ─────────────────────────
function login(email, password) {
  const crew = readTable('Crew').find(c =>
    c.email.toLowerCase() === String(email || '').toLowerCase().trim() && isTrue(c.active));
  if (!crew || hash(password || '', crew.salt) !== crew.passwordHash) {
    return { ok: false, error: 'Invalid email or password' };
  }
  const token = Utilities.getUuid() + Utilities.getUuid();
  const expires = new Date(Date.now() + CONFIG.SESSION_DAYS * 86400000).toISOString();
  insert('Sessions', { token, crewId: crew.id, expiresAt: expires });
  CacheService.getScriptCache().put('s_' + token, JSON.stringify({ crewId: crew.id, expiresAt: expires }), 21600);
  return { ok: true, token, user: publicUser(crew),
           tasks: listTasks(crew, {}).tasks, crew: listCrew().crew };
}

function auth(token) {
  if (!token) throw new Error('Not logged in');
  const cache = CacheService.getScriptCache();
  let s = null;
  const hit = cache.get('s_' + token);
  if (hit) s = JSON.parse(hit);
  else {
    s = readTable('Sessions').find(x => x.token === token);
    if (s) cache.put('s_' + token, JSON.stringify({ crewId: s.crewId, expiresAt: s.expiresAt }), 21600);
  }
  if (!s || new Date(s.expiresAt) < new Date()) throw new Error('Session expired');
  const crew = readTable('Crew').find(c => c.id === s.crewId && isTrue(c.active));
  if (!crew) throw new Error('Account inactive');
  return crew;
}

function logout(token) {
  const s = readTable('Sessions').find(x => x.token === token);
  CacheService.getScriptCache().remove('s_' + token);
  if (s) { delete TABLE_CACHE.Sessions; sheet('Sessions').deleteRow(s._row); }
  return { ok: true };
}

function purgeExpiredSessions() {
  const now = new Date();
  readTable('Sessions')
    .filter(s => new Date(s.expiresAt) < now)
    .sort((a, b) => b._row - a._row) // delete bottom-up so row numbers stay valid
    .forEach(s => sheet('Sessions').deleteRow(s._row));
  delete TABLE_CACHE.Sessions;
}

function requireAdmin(user) {
  if (!perms(user).manageCrew) throw new Error('Only the Captain can manage crew');
}

function hash(password, salt) {
  let h = salt + password;
  for (let i = 0; i < 50; i++) {
    h = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset.UTF_8));
  }
  return h;
}

// ───────────────────────── CREW ─────────────────────────
function listCrew() {
  return { ok: true, crew: readTable('Crew').filter(c => c.active !== 'REMOVED').map(publicUser) };
}

function addCrew(user, c) {
  if (!c.name || !c.email || !c.password) throw new Error('Name, email and password required');
  const email = c.email.toLowerCase().trim();
  if (readTable('Crew').some(x => x.email.toLowerCase() === email)) throw new Error('Email already exists');
  const salt = Utilities.getUuid();
  const crew = {
    id: newId('C'), name: c.name, email, role: POSITIONS[c.position] ? c.position : 'Deckhand',
    passwordHash: hash(c.password, salt), salt, active: 'TRUE', createdAt: nowIso()
  };
  insert('Crew', crew);
  audit(user.id, 'addCrew', '', crew.name + ' <' + email + '>');
  return { ok: true, crew: publicUser(crew) };
}

function setPosition(user, id, position) {
  if (!POSITIONS[position]) throw new Error('Unknown position');
  const all = readTable('Crew');
  const c = all.find(x => x.id === id);
  if (!c) throw new Error('Crew member not found');
  if (positionOf(c) === 'Captain' && position !== 'Captain' &&
      all.filter(x => isTrue(x.active) && positionOf(x) === 'Captain').length < 2) {
    throw new Error('There must be at least one Captain');
  }
  const old = positionOf(c);
  c.role = position;
  update('Crew', c._row, c);
  audit(user.id, 'setPosition', '', c.name + ': ' + old + ' → ' + position);
  return { ok: true };
}

/** Removes a crew member from the list. Their name stays on past notes and sign-offs. */
function removeCrew(user, id) {
  const all = readTable('Crew');
  const c = all.find(x => x.id === id);
  if (!c) throw new Error('Crew member not found');
  if (c.id === user.id) throw new Error('You cannot remove yourself');
  if (positionOf(c) === 'Captain' &&
      all.filter(x => isTrue(x.active) && positionOf(x) === 'Captain').length < 2) {
    throw new Error('There must be at least one Captain');
  }
  c.active = 'REMOVED';
  update('Crew', c._row, c);
  readTable('Tasks').filter(t => t.assignedTo === id && t.state === 'Open').forEach(t => {
    t.assignedTo = '';
    update('Tasks', t._row, t);
  });
  readTable('Sessions').filter(s => s.crewId === id).forEach(s => CacheService.getScriptCache().remove('s_' + s.token));
  audit(user.id, 'removeCrew', '', c.name);
  return { ok: true };
}

function setCrewActive(user, id, active) {
  const c = readTable('Crew').find(x => x.id === id);
  if (!c) throw new Error('Crew member not found');
  if (!active && c.id === user.id) throw new Error('You cannot deactivate yourself');
  c.active = active ? 'TRUE' : 'FALSE';
  update('Crew', c._row, c);
  audit(user.id, active ? 'activateCrew' : 'deactivateCrew', '', c.name);
  return { ok: true };
}

function resetPassword(user, id, newPassword) {
  if (!newPassword || newPassword.length < 6) throw new Error('Password must be at least 6 characters');
  const c = readTable('Crew').find(x => x.id === id);
  if (!c) throw new Error('Crew member not found');
  c.salt = Utilities.getUuid();
  c.passwordHash = hash(newPassword, c.salt);
  update('Crew', c._row, c);
  audit(user.id, 'resetPassword', '', c.name);
  return { ok: true };
}

function changePassword(user, oldPassword, newPassword) {
  if (hash(oldPassword || '', user.salt) !== user.passwordHash) throw new Error('Current password is wrong');
  if (!newPassword || newPassword.length < 6) throw new Error('Password must be at least 6 characters');
  user.salt = Utilities.getUuid();
  user.passwordHash = hash(newPassword, user.salt);
  update('Crew', user._row, user);
  audit(user.id, 'changePassword', '', '');
  return { ok: true };
}

function publicUser(c) {
  const position = positionOf(c), p = POSITIONS[position];
  return { id: c.id, name: c.name, email: c.email, position, active: isTrue(c.active),
           perms: { manageCrew: p.manageCrew, createRoutine: p.createRoutine, editAll: p.editAll } };
}

// ───────────────────────── TASKS ─────────────────────────
function listTasks(user, req) {
  const names = crewNames();
  let tasks = readTable('Tasks').map(t => decorate(t, names, user));
  if (req.state)      tasks = tasks.filter(t => t.state === req.state);
  if (req.type)       tasks = tasks.filter(t => t.type === req.type);
  if (req.color)      tasks = tasks.filter(t => t.color === req.color);
  if (req.assignedTo) tasks = tasks.filter(t => t.assignedTo === req.assignedTo);
  tasks.sort((a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1);
  return { ok: true, today: today(), tasks };
}

function getTask(user, id) {
  const names = crewNames();
  const t = readTable('Tasks').find(x => x.id === id);
  if (!t) throw new Error('Task not found');
  const notes = readTable('Notes').filter(n => n.taskId === id)
    .map(n => ({ id: n.id, text: n.text, createdAt: n.createdAt, by: names[n.crewId] || n.crewId }));
  const completions = readTable('Completions').filter(c => c.taskId === id)
    .map(c => ({ dueDate: c.dueDate, performedDate: c.performedDate, timing: c.timing,
                 notes: c.notes, by: names[c.performedBy] || c.performedBy, loggedAt: c.loggedAt }));
  const history = readTable('Audit').filter(a => a.taskId === id)
    .map(a => ({ timestamp: a.timestamp, action: a.action, details: a.details, by: names[a.crewId] || a.crewId }));
  return { ok: true, task: decorate(t, names, user), notes, completions, history };
}

function createTask(user, t) {
  if (!t.title) throw new Error('Title required');
  const type = t.type === 'Issue' ? 'Issue' : 'Routine';
  const p = perms(user);
  if (type === 'Routine' && !p.createRoutine) throw new Error('Your position can report issues but not schedule maintenance');
  if (t.assignedTo && !p.createRoutine) t.assignedTo = '';
  const recurring = !!t.recurring && type === 'Routine';
  if (type === 'Routine' && !t.dueDate) throw new Error('Due date required');
  if (recurring) validateInterval(t.intervalValue, t.intervalUnit);
  if (t.dueDate) validateDate(t.dueDate);

  const task = {
    id: newId('T'), title: t.title, description: t.description || '', system: t.system || '',
    type, dueDate: t.dueDate || '', dueTime: t.dueTime || '',
    recurring: recurring ? 'TRUE' : 'FALSE',
    intervalValue: recurring ? t.intervalValue : '', intervalUnit: recurring ? t.intervalUnit : '',
    assignedTo: t.assignedTo || '', state: 'Open', createdBy: user.id, createdAt: nowIso(),
    lastPerformed: '', lastPerformedBy: '', resolution: '', reminderLog: ''
  };
  insert('Tasks', task);
  audit(user.id, 'create', task.id, type + ': ' + task.title);
  if (t.note) addNote(user, task.id, t.note);
  return { ok: true, task: decorate(task, crewNames(), user) };
}

function updateTask(user, id, changes) {
  const t = readTable('Tasks').find(x => x.id === id);
  if (!t) throw new Error('Task not found');
  if (!canEdit(user, t)) throw new Error('Your position cannot edit this task');
  if (changes.assignedTo !== undefined && changes.assignedTo !== t.assignedTo && !perms(user).createRoutine) {
    throw new Error('Your position cannot assign tasks');
  }
  if (t.type === 'Issue') delete changes.recurring;
  const editable = ['title', 'description', 'system', 'dueDate', 'dueTime', 'recurring',
                    'intervalValue', 'intervalUnit', 'assignedTo'];
  const changed = [];
  editable.forEach(k => {
    if (changes[k] === undefined) return;
    let v = k === 'recurring' ? (changes[k] ? 'TRUE' : 'FALSE') : String(changes[k]);
    if (String(t[k]) !== v) { changed.push(k + ': ' + t[k] + ' → ' + v); t[k] = v; }
  });
  if (!changed.length) return { ok: true, task: decorate(t, crewNames(), user) };
  if (t.dueDate) validateDate(t.dueDate);
  if (isTrue(t.recurring)) validateInterval(t.intervalValue, t.intervalUnit);
  if (changed.some(c => c.indexOf('dueDate') === 0)) t.reminderLog = '';
  update('Tasks', t._row, t);
  audit(user.id, 'update', id, changed.join('; '));
  return { ok: true, task: decorate(t, crewNames(), user) };
}

/**
 * Sign off a task.
 * req: { id, performedDate (yyyy-MM-dd, default today), notes, resolution (required for Issues) }
 */
function completeTask(user, req) {
  const t = readTable('Tasks').find(x => x.id === req.id);
  if (!t) throw new Error('Task not found');
  if (t.state !== 'Open') throw new Error('Task is already ' + t.state.toLowerCase());
  if (!canSignOff(user, t)) {
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
    performedBy: user.id, timing, notes: req.notes || '', loggedAt: nowIso()
  });

  const oldDue = t.dueDate;
  t.lastPerformed = performed;
  t.lastPerformedBy = user.id;
  t.reminderLog = '';

  let detail;
  if (t.type === 'Issue') {
    t.state = 'Resolved';
    t.resolution = req.resolution;
    detail = 'Resolved ' + performed + ': ' + req.resolution;
  } else if (isTrue(t.recurring)) {
    const base = CONFIG.RECUR_FROM === 'due' && oldDue ? oldDue : performed;
    t.dueDate = addInterval(base, t.intervalValue, t.intervalUnit);
    detail = 'Performed ' + performed + ' (' + timing + '). Next due ' + t.dueDate;
  } else {
    t.state = 'Completed';
    detail = 'Performed ' + performed + ' (' + timing + ')';
  }
  update('Tasks', t._row, t);
  audit(user.id, 'complete', t.id, detail);
  if (req.notes) addNote(user, t.id, req.notes);
  return { ok: true, task: decorate(t, crewNames(), user) };
}

function addNote(user, taskId, text) {
  if (!text || !String(text).trim()) throw new Error('Note is empty');
  if (!readTable('Tasks').some(t => t.id === taskId)) throw new Error('Task not found');
  const note = { id: newId('N'), taskId, crewId: user.id, text: String(text).trim(), createdAt: nowIso() };
  insert('Notes', note);
  audit(user.id, 'note', taskId, note.text.slice(0, 100));
  return { ok: true, note };
}

/** Calendar events between two dates (yyyy-MM-dd), including projected future recurrences. */
function calendar(from, to) {
  validateDate(from); validateDate(to);
  const events = [];
  const tasks = readTable('Tasks');
  tasks.forEach(t => {
    if (t.state !== 'Open' || !t.dueDate) return;
    let date = t.dueDate, first = true, guard = 0;
    while (date <= to && guard++ < 500) {
      if (date >= from) {
        events.push({ taskId: t.id, title: t.title, system: t.system, type: t.type,
                      date, time: t.dueTime, projected: !first,
                      color: first ? colorFor(t) : 'projected' });
      }
      if (!isTrue(t.recurring)) break;
      date = addInterval(date, t.intervalValue, t.intervalUnit);
      first = false;
    }
  });
  const titles = {};
  tasks.forEach(t => titles[t.id] = t.title);
  const names = crewNames();
  readTable('Completions').forEach(c => {
    if (c.performedDate >= from && c.performedDate <= to) {
      events.push({ taskId: c.taskId, title: titles[c.taskId] || c.taskId, date: c.performedDate,
                    color: 'done', completed: true, timing: c.timing, by: names[c.performedBy] || '' });
    }
  });
  events.sort((a, b) => a.date < b.date ? -1 : 1);
  return { ok: true, today: today(), events };
}

// ───────────────────────── STATUS ─────────────────────────
function colorFor(t) {
  if (t.state !== 'Open') return 'done';
  if (!t.dueDate) return 'none';            // open issue with no due date
  const d = daysBetween(today(), t.dueDate);
  if (d < 0) return 'red';
  if (d <= CONFIG.AMBER_DAYS) return 'amber';
  return 'green';
}

function decorate(t, names, user) {
  const out = {};
  SHEETS.Tasks.forEach(k => { if (k !== 'reminderLog') out[k] = t[k]; });
  out.recurring = isTrue(t.recurring);
  out.color = colorFor(t);
  out.daysUntilDue = t.dueDate ? daysBetween(today(), t.dueDate) : null;
  out.createdByName = names[t.createdBy] || '';
  out.assignedToName = names[t.assignedTo] || '';
  out.lastPerformedByName = names[t.lastPerformedBy] || '';
  out.department = DEPARTMENTS[t.system] || 'any';
  if (user) { out.canSignOff = canSignOff(user, t); out.canEdit = canEdit(user, t); }
  return out;
}

// ───────────────────────── REMINDERS ─────────────────────────
/** Runs daily from the trigger. One digest email to all active crew. */
function dailyReminders() {
  try { withLock(purgeExpiredSessions); } catch (e) {}
  const t = today();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const overdue = [], upcoming = [];
    readTable('Tasks').forEach(task => {
      if (task.state !== 'Open' || !task.dueDate) return;
      const d = daysBetween(t, task.dueDate);
      let log = {};
      try { log = task.reminderLog ? JSON.parse(task.reminderLog) : {}; } catch (e) {}
      if (log.dueDate !== task.dueDate) log = { dueDate: task.dueDate, sent: [], lastOverdue: '' };

      let send = false;
      if (d < 0) {
        if (!log.lastOverdue || daysBetween(log.lastOverdue, t) >= CONFIG.OVERDUE_REMIND_EVERY) {
          log.lastOverdue = t; send = true;
          overdue.push({ task, d });
        }
      } else {
        const hits = CONFIG.REMINDER_DAYS.filter(m => d <= m && log.sent.indexOf(m) === -1);
        if (hits.length) {
          log.sent = log.sent.concat(hits); send = true; // mark skipped milestones too
          upcoming.push({ task, d });
        }
      }
      if (send) { task.reminderLog = JSON.stringify(log); update('Tasks', task._row, task); }
    });

    if (!overdue.length && !upcoming.length) return;
    const emails = readTable('Crew').filter(c => isTrue(c.active) && c.email).map(c => c.email);
    if (!emails.length) return;

    const row = (x, color) =>
      '<tr><td style="padding:6px 10px;border-left:6px solid ' + color + '">' + esc(x.task.title) +
      (x.task.system ? ' <span style="color:#777">(' + esc(x.task.system) + ')</span>' : '') +
      '</td><td style="padding:6px 10px">' + x.task.dueDate + '</td><td style="padding:6px 10px">' +
      (x.d < 0 ? Math.abs(x.d) + ' days overdue' : x.d === 0 ? 'Due today' : 'Due in ' + x.d + ' days') +
      '</td></tr>';

    let html = '<h2 style="font-family:sans-serif">' + CONFIG.APP_NAME + ' maintenance reminders</h2>' +
               '<table style="font-family:sans-serif;border-collapse:collapse">';
    overdue.sort((a, b) => a.d - b.d).forEach(x => html += row(x, '#d32f2f'));
    upcoming.sort((a, b) => a.d - b.d).forEach(x =>
      html += row(x, x.d <= CONFIG.AMBER_DAYS ? '#f9a825' : '#2e7d32'));
    html += '</table>';
    if (CONFIG.APP_URL) html += '<p><a href="' + CONFIG.APP_URL + '">Open ' + CONFIG.APP_NAME + '</a></p>';

    const subject = CONFIG.APP_NAME + ': ' +
      (overdue.length ? overdue.length + ' overdue, ' : '') + upcoming.length + ' coming due';
    MailApp.sendEmail({ to: emails.join(','), subject, htmlBody: html });
  } finally {
    lock.releaseLock();
  }
}

// ───────────────────────── AUDIT ─────────────────────────
function audit(crewId, action, taskId, details) {
  insert('Audit', { timestamp: nowIso(), crewId, action, taskId, details });
}

// ───────────────────────── SHEET HELPERS ─────────────────────────
function sheet(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet ' + name + ' — run setup()');
  return sh;
}

const TABLE_CACHE = {}; // lives for one request only

function readTable(name) {
  if (TABLE_CACHE[name]) return TABLE_CACHE[name].map(o => Object.assign({}, o));
  const rows = readTableRaw(name);
  TABLE_CACHE[name] = rows;
  return rows.map(o => Object.assign({}, o));
}

function readTableRaw(name) {
  const values = sheet(name).getDataRange().getValues();
  const headers = values.shift() || [];
  return values.filter(r => r.some(v => v !== '')).map((r, i) => {
    const o = { _row: i + 2 };
    headers.forEach((h, j) => {
      const v = r[j];
      o[h] = v instanceof Date ? Utilities.formatDate(v, tz(), 'yyyy-MM-dd') : String(v);
    });
    return o;
  });
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

function crewNames() {
  const m = {};
  readTable('Crew').forEach(c => m[c.id] = c.name);
  return m;
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ───────────────────────── DATE / MISC HELPERS ─────────────────────────
function tz() { return Session.getScriptTimeZone(); }
function today() { return Utilities.formatDate(new Date(), tz(), 'yyyy-MM-dd'); }
function nowIso() { return new Date().toISOString(); }

function parseDate(s) {
  const p = String(s).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2], 12); // noon avoids DST edge cases
}

function fmtDate(d) {
  return Utilities.formatDate(d, tz(), 'yyyy-MM-dd');
}

function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

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
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
