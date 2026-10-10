import { useCallback, useEffect, useMemo, useState } from 'react';
import { call, getToken, getVessel, setToken, setVessel } from './api.js';
import Login from './components/Login.jsx';
import Board from './components/Board.jsx';
import Calendar from './components/Calendar.jsx';
import TaskList from './components/TaskList.jsx';
import TaskForm from './components/TaskForm.jsx';
import TaskDetail from './components/TaskDetail.jsx';
import Crew from './components/Crew.jsx';
import Vessels from './components/Vessels.jsx';
import Profile from './components/Profile.jsx';
import Directory from './components/Directory.jsx';
import Admin from './components/Admin.jsx';
import Invites from './components/Invites.jsx';

const VESSEL_TABS = ['board', 'calendar', 'tasks', 'crew'];

export default function App() {
  const [s, setS] = useState(null);             // bootstrap result
  const [checking, setChecking] = useState(!!getToken());
  const [tab, setTab] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback((r, keepTab) => {
    setS(r);
    setVessel(r.vessel ? r.vessel.id : '');
    setVersion((v) => v + 1);
    setError('');
    if (!keepTab) {
      const hasVessels = (r.memberships || []).length > 0 || (r.vessels || []).length > 0;
      setTab(r.vessel ? 'board' : hasVessels ? 'vessels' : 'profile');
    }
  }, []);

  const refresh = useCallback(async () => {
    try { load(await call('bootstrap', { vesselId: getVessel() }), true); }
    catch (e) { setError(e.message); }
  }, [load]);

  useEffect(() => {
    if (!getToken()) return;
    call('bootstrap', { vesselId: getVessel() })
      .then((r) => load(r))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [load]);

  useEffect(() => {
    const onLogout = () => { setS(null); setVessel(''); };
    window.addEventListener('cjm-logout', onLogout);
    return () => window.removeEventListener('cjm-logout', onLogout);
  }, []);

  const vesselOptions = useMemo(() => {
    if (!s) return [];
    const seen = {};
    const list = [];
    (s.memberships || []).forEach((m) => { seen[m.vesselId] = 1; list.push({ id: m.vesselId, name: m.vesselName, position: m.position }); });
    (s.vessels || []).forEach((v) => { if (!seen[v.vesselId]) list.push({ id: v.vesselId, name: v.vesselName, position: 'CJM admin' }); });
    return list;
  }, [s]);

  async function openVessel(id) {
    setBusy(true);
    try {
      setVessel(id);
      const r = await call('bootstrap', { vesselId: id });
      load(r);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function logout() {
    try { await call('logout'); } catch { /* already gone */ }
    setToken(null);
    setVessel('');
    setS(null);
  }

  if (checking) return <div className="splash"><span>CJM Marine</span><small>Loading…</small></div>;
  if (!s) return <Login onLogin={(r) => load(r)} />;

  const { user, vessel, perms, position } = s;
  const crew = s.crew || [];
  const tabs = [];
  if (vessel) tabs.push(['board', 'Board'], ['calendar', 'Calendar'], ['tasks', 'All tasks'], ['crew', 'Crew']);
  if (vesselOptions.length > 1 || (!vessel && vesselOptions.length)) tabs.push(['vessels', 'Vessels']);
  tabs.push(['profile', 'My profile']);
  if (user.canSearch) tabs.push(['directory', 'Find crew']);
  if (user.isAdmin) tabs.push(['admin', 'CJM admin']);
  const onVesselTab = vessel && VESSEL_TABS.includes(tab);

  return (
    <div className="app">
      <header className="masthead">
        <div className="vessel">
          <span className="brand">CJM Marine</span>
          {vessel
            ? <span className="vessel-name">{vessel.name}</span>
            : <span className="vessel-sub">Maintenance and crew</span>}
        </div>
        <div className="who">
          {vesselOptions.length > 1 && (
            <select className="switcher" aria-label="Switch vessel" value={vessel ? vessel.id : ''} disabled={busy}
              onChange={(e) => e.target.value && openVessel(e.target.value)}>
              {!vessel && <option value="">Choose vessel</option>}
              {vesselOptions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}
          <span>{user.name}{vessel && position ? `, ${position}` : ''}</span>
          <button className="link light" onClick={logout}>Log out</button>
        </div>
      </header>

      <nav className="tabs">
        {tabs.map(([key, label]) => (
          <button key={key} className={tab === key ? 'tab active' : 'tab'} onClick={() => setTab(key)}>
            {label}
            {key === 'crew' && s.vesselRequests > 0 && <span className="badge">{s.vesselRequests}</span>}
            {key === 'admin' && s.pendingRequests > 0 && <span className="badge">{s.pendingRequests}</span>}
          </button>
        ))}
        {onVesselTab && (
          <button className="btn primary new-task" onClick={() => setEditing('new')}>
            {perms.createRoutine ? 'New task' : 'Report issue'}
          </button>
        )}
      </nav>

      <main className="main">
        <Invites invites={s.invites || []} onDone={(r) => load(r)} />
        {error && <div className="alert">{error} <button className="link" onClick={refresh}>Retry</button></div>}
        {tab === 'board' && vessel && <Board tasks={s.tasks || []} onOpen={setOpenId} />}
        {tab === 'calendar' && vessel && <Calendar version={version} onOpen={setOpenId} />}
        {tab === 'tasks' && vessel && <TaskList tasks={s.tasks || []} onOpen={setOpenId} />}
        {tab === 'crew' && vessel && (
          <Crew user={user} vessel={vessel} position={position} perms={perms} crew={crew} onChanged={refresh} />
        )}
        {tab === 'vessels' && <Vessels options={vesselOptions} current={vessel} busy={busy} onOpen={openVessel} />}
        {tab === 'profile' && <Profile user={user} vessel={vessel} onChanged={refresh} />}
        {tab === 'directory' && user.canSearch && <Directory />}
        {tab === 'admin' && user.isAdmin && <Admin user={user} onOpenVessel={openVessel} onChanged={refresh} />}
      </main>

      {openId && vessel && (
        <TaskDetail
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
          onEdit={(t) => { setOpenId(null); setEditing(t); }}
        />
      )}
      {editing && vessel && (
        <TaskForm
          initial={editing === 'new' ? null : editing}
          crew={crew.filter((c) => c.status === 'active')}
          perms={perms}
          onClose={() => setEditing(null)}
          onSaved={(t) => { setEditing(null); refresh(); setOpenId(t.id); }}
        />
      )}
    </div>
  );
}
