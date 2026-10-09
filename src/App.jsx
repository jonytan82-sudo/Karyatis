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

  const refresh = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([call('listTasks'), call('listCrew')]);
      setTasks(t.tasks);
      setCrew(c.crew);
      setVersion((v) => v + 1);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    call('me')
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('karyatis-logout', onLogout);
    return () => window.removeEventListener('karyatis-logout', onLogout);
  }, []);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  async function logout() {
    try { await call('logout'); } catch { /* already gone */ }
    setToken(null);
    setUser(null);
  }

  if (checking) return <div className="splash">Karyatis</div>;
  if (!user) return <Login onLogin={(u) => setUser(u)} />;

  return (
    <div className="app">
      <header className="masthead">
        <div className="vessel">
          <span className="vessel-name">Karyatis</span>
          <span className="vessel-sub">Maintenance log</span>
        </div>
        <div className="who">
          <span>{user.name}</span>
          <button className="link light" onClick={logout}>Log out</button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? 'tab active' : 'tab'} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
        <button className="btn primary new-task" onClick={() => setEditing('new')}>New task</button>
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
          onClose={() => setEditing(null)}
          onSaved={(t) => { setEditing(null); refresh(); setOpenId(t.id); }}
        />
      )}
    </div>
  );
}
