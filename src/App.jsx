import { useCallback, useEffect, useState } from 'react';
import { call, getToken, setToken } from './api.js';
import Login from './components/Login.jsx';
import Board from './components/Board.jsx';
import Calendar from './components/Calendar.jsx';
import TaskList from './components/TaskList.jsx';
import TaskForm from './components/TaskForm.jsx';
import TaskDetail from './components/TaskDetail.jsx';
import Crew from './components/Crew.jsx';

const TABS = [
  ['board', 'Board'],
  ['calendar', 'Calendar'],
  ['tasks', 'All tasks'],
  ['crew', 'Crew'],
];

// Older backends send role: 'admin' | 'crew' and no permissions.
function normalizeUser(u) {
  if (!u) return u;
  const position = u.position || (u.role === 'admin' ? 'Captain' : 'Deckhand');
  const captain = position === 'Captain', chief = position === 'Chief Engineer';
  const perms = u.perms || {
    manageCrew: captain,
    createRoutine: captain || chief || position === 'Engineer' || position === 'Bosun',
    editAll: captain || chief,
  };
  return { ...u, position, perms };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  const [tab, setTab] = useState('board');
  const [tasks, setTasks] = useState([]);
  const [crew, setCrew] = useState([]);
  const [version, setVersion] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | task
  const [error, setError] = useState('');

  const load = useCallback(async (r) => {
    // Works with older backends too: fill in anything the server didn't send.
    let { tasks: t, crew: c } = r;
    if (!t || !c) {
      try {
        [t, c] = await Promise.all([call('listTasks').then((x) => x.tasks), call('listCrew').then((x) => x.crew)]);
      } catch (e) { setError(e.message); }
    }
    setUser(normalizeUser(r.user));
    setTasks(t || []);
    setCrew((c || []).map(normalizeUser));
    setVersion((v) => v + 1);
    setError('');
  }, []);

  const fetchAll = useCallback(async () => {
    try { return await call('bootstrap'); }
    catch (e) {
      if (!/Unknown action/.test(e.message)) throw e;
      return call('me'); // older backend
    }
  }, []);

  const refresh = useCallback(async () => {
    try { await load(await fetchAll()); }
    catch (e) { setError(e.message); }
  }, [load, fetchAll]);

  useEffect(() => {
    if (!getToken()) { setChecking(false); return; }
    fetchAll()
      .then(load)
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [load, fetchAll]);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('karyatis-logout', onLogout);
    return () => window.removeEventListener('karyatis-logout', onLogout);
  }, []);

  async function logout() {
    try { await call('logout'); } catch { /* already gone */ }
    setToken(null);
    setUser(null);
  }

  if (checking) return <div className="splash"><span>Karyatis</span><small>Loading the log…</small></div>;
  if (!user) return <Login onLogin={load} />;

  return (
    <div className="app">
      <header className="masthead">
        <div className="vessel">
          <span className="vessel-name">Karyatis</span>
          <span className="vessel-sub">Maintenance log</span>
        </div>
        <div className="who">
          <span>{user.name}, {user.position}</span>
          <button className="link light" onClick={logout}>Log out</button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? 'tab active' : 'tab'} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
        <button className="btn primary new-task" onClick={() => setEditing('new')}>
          {user.perms.createRoutine ? 'New task' : 'Report issue'}
        </button>
      </nav>

      <main className="main">
        {error && <div className="alert">{error} <button className="link" onClick={refresh}>Retry</button></div>}
        {tab === 'board' && <Board tasks={tasks} onOpen={setOpenId} />}
        {tab === 'calendar' && <Calendar version={version} onOpen={setOpenId} />}
        {tab === 'tasks' && <TaskList tasks={tasks} onOpen={setOpenId} />}
        {tab === 'crew' && <Crew user={user} crew={crew} onChanged={refresh} />}
      </main>

      {openId && (
        <TaskDetail
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
          onEdit={(t) => { setOpenId(null); setEditing(t); }}
        />
      )}
      {editing && (
        <TaskForm
          initial={editing === 'new' ? null : editing}
          crew={crew}
          user={user}
          onClose={() => setEditing(null)}
          onSaved={(t) => { setEditing(null); refresh(); setOpenId(t.id); }}
        />
      )}
    </div>
  );
}
