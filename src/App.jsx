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
import WorkReviews from './components/WorkReviews.jsx';
import Invites from './components/Invites.jsx';
import Logo from './components/Logo.jsx';
import Icon from './components/Icons.jsx';
import Hero from './components/Hero.jsx';
import Landing from './components/Landing.jsx';

const VESSEL_TABS = ['board', 'calendar', 'tasks', 'crew', 'reviews'];
const ICONS = { board: 'gauge', calendar: 'calendar', tasks: 'check', crew: 'crew', reviews: 'star', vessels: 'yacht', profile: 'user', directory: 'search', admin: 'shield' };
const PHONE = '(max-width: 700px)';

function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

export default function App() {
  const [s, setS] = useState(null);             // bootstrap result
  const [checking, setChecking] = useState(!!getToken());
  const [tab, setTab] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const phone = usePhone();
  const [home, setHome] = useState(true); // phone: showing the menu screen

  // Phone back button returns to the menu.
  useEffect(() => {
    const onPop = () => setHome(true);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openTab = (key) => {
    setTab(key);
    if (phone) {
      setHome(false);
      window.history.pushState({ cjmSection: key }, '');
      window.scrollTo(0, 0);
    }
  };
  const backToMenu = () => {
    if (window.history.state && window.history.state.cjmSection) window.history.back();
    else setHome(true);
    window.scrollTo(0, 0);
  };

  const load = useCallback((r, keepTab) => {
    setS(r);
    setVessel(r.vessel ? r.vessel.id : '');
    setVersion((v) => v + 1);
    setError('');
    if (!keepTab) {
      const hasVessels = (r.memberships || []).length > 0 || (r.vessels || []).length > 0;
      setTab(r.vessel ? 'board' : hasVessels ? 'vessels' : 'profile');
      setHome(true);
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
    (s.memberships || []).forEach((m) => { seen[m.vesselId] = 1; list.push({ id: m.vesselId, name: m.vesselName, position: m.position, accessLabel: m.accessLabel }); });
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

  if (checking) return <div className="splash"><Logo size="lg" /><small>Loading…</small></div>;
  if (!s) {
    // Public landing page for visitors; the login form lives at /login (and opens for setup or sign-up links).
    const path = window.location.pathname.replace(/\/+$/, '');
    const q = new URLSearchParams(window.location.search);
    const wantsLogin = path === '/login' || q.has('setup') || q.has('request');
    if (!wantsLogin) return <Landing focus={path === '/privacy' ? 'privacy' : ''} />;
    return <Login onLogin={(r) => { if (path === '/login') window.history.replaceState(null, '', '/'); load(r); }} />;
  }

  const { user, vessel, perms, position } = s;
  const crew = s.crew || [];
  const tabs = [];
  if (vessel) tabs.push(['board', perms.contractor ? 'My jobs' : 'Board'], ['calendar', 'Calendar'], ['tasks', 'All tasks']);
  if (vessel && !perms.contractor) tabs.push(['crew', 'Crew']);
  if (vessel && s.canReviewWork) tabs.push(['reviews', 'Reviews']);
  if (vesselOptions.length > 1 || (!vessel && vesselOptions.length) || s.canRequestVessel) tabs.push(['vessels', 'Vessels']);
  tabs.push(['profile', 'My profile']);
  if (user.canSearch) tabs.push(['directory', 'Find crew']);
  if (user.isAdmin) tabs.push(['admin', 'CJM admin']);
  const onVesselTab = vessel && VESSEL_TABS.includes(tab);
  const badgeFor = (key) => (key === 'crew' ? s.vesselRequests : key === 'reviews' ? s.pendingTaskReviews : key === 'admin' ? s.pendingRequests : 0) || 0;
  const newTaskLabel = perms && (perms.createRoutine ? 'New task' : perms.contractor ? 'Record finding' : 'Report issue');
  const tabLabel = (tabs.find(([k]) => k === tab) || [])[1] || '';

  const switcher = vesselOptions.length > 1 && (
    <select className="switcher" aria-label="Switch vessel" value={vessel ? vessel.id : ''} disabled={busy}
      onChange={(e) => e.target.value && openVessel(e.target.value)}>
      {!vessel && <option value="">Choose vessel</option>}
      {vesselOptions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
    </select>
  );

  const notices = (
    <>
      {!s.catalog && (
        <div className="alert">
          <b>The Google Script is out of date.</b> This website needs version 2.3 or later, so job titles, access levels and work reviews
          will not work yet. {user.isAdmin ? 'In Apps Script: paste the latest Code.gs, save, then Deploy → Manage deployments → pencil → New version → Deploy.' : 'Please tell the CJM admin.'}
        </div>
      )}
      <Invites invites={s.invites || []} onDone={(r) => load(r)} />
      {error && <div className="alert">{error} <button className="link" onClick={refresh}>Retry</button></div>}
    </>
  );

  const content = (
    <>
      {tab === 'board' && vessel && <Board tasks={s.tasks || []} onOpen={setOpenId} />}
      {tab === 'calendar' && vessel && <Calendar version={version} onOpen={setOpenId} />}
      {tab === 'tasks' && vessel && <TaskList tasks={s.tasks || []} onOpen={setOpenId} />}
      {tab === 'reviews' && vessel && s.canReviewWork && <WorkReviews vessel={vessel} onChanged={refresh} />}
      {tab === 'crew' && vessel && !perms.contractor && (
        <Crew user={user} vessel={vessel} perms={perms} crew={crew} catalog={s.catalog} onChanged={refresh} />
      )}
      {tab === 'vessels' && <Vessels options={vesselOptions} current={vessel} busy={busy} onOpen={openVessel} canRequest={s.canRequestVessel} onChanged={refresh} />}
      {tab === 'profile' && <Profile user={user} vessel={vessel} onChanged={refresh} />}
      {tab === 'directory' && user.canSearch && <Directory catalog={s.catalog} />}
      {tab === 'admin' && user.isAdmin && <Admin user={user} catalog={s.catalog} onOpenVessel={openVessel} onChanged={refresh} />}
    </>
  );

  const overlays = (
    <>
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
    </>
  );

  // ── Phone: menu screen ──
  if (phone && home) {
    return (
      <div className="m-app">
        <header className="m-top">
          <Logo size="md" />
        </header>
        <section className="m-panel">
          <div className="m-who">
            <div className="m-who-text">
              <b>{vessel ? vessel.name : 'Welcome'}</b>
              <small>{user.name}{vessel && position ? `, ${position}` : ''}{vessel && perms && perms.contractor ? ' (contractor)' : ''}</small>
            </div>
            {switcher}
          </div>
          <div className="m-notices">{notices}</div>
          <nav className="m-menu" aria-label="Sections">
            {tabs.map(([key, label]) => (
              <button key={key} className="m-item" onClick={() => openTab(key)}>
                <Icon name={ICONS[key]} className="m-ico" />
                <span className="m-label">{label}</span>
                {badgeFor(key) > 0 && <span className="badge">{badgeFor(key)}</span>}
                <Icon name="chevron" className="m-chev" />
              </button>
            ))}
          </nav>
          {vessel && perms.canReport && (
            <button className="m-cta" onClick={() => setEditing('new')}><Icon name="plus" /> {newTaskLabel}</button>
          )}
          <Hero />
          <div className="m-foot">
            <span>Simplify. Organize. Perform.</span>
            <button className="m-logout" onClick={logout}><Icon name="logout" /> Log out</button>
          </div>
        </section>
        {overlays}
      </div>
    );
  }

  // ── Phone: one section ──
  if (phone) {
    return (
      <div className="m-app m-section">
        <header className="m-bar">
          <button className="m-back" onClick={backToMenu} aria-label="Back to menu"><Icon name="back" /></button>
          <div className="m-bar-title">
            <b>{tabLabel}</b>
            <small>{vessel && VESSEL_TABS.includes(tab) ? vessel.name : 'CJM Marine'}</small>
          </div>
          <Icon name={ICONS[tab]} className="m-bar-ico" />
        </header>
        <main className="main">
          {notices}
          {content}
        </main>
        {onVesselTab && perms.canReport && (
          <button className="btn primary new-task" onClick={() => setEditing('new')}>{newTaskLabel}</button>
        )}
        {overlays}
      </div>
    );
  }

  // ── Desktop / tablet ──
  return (
    <div className="app">
      <header className="masthead">
        <div className="vessel">
          <span className="brand"><Logo size="sm" /></span>
          {vessel
            ? <span className="vessel-name">{vessel.name}</span>
            : <span className="vessel-sub">Maintenance and crew</span>}
        </div>
        <div className="who">
          {switcher}
          <span>{user.name}{vessel && position ? `, ${position}` : ''}{vessel && perms && perms.contractor ? ' (contractor)' : ''}</span>
          <button className="link light" onClick={logout}>Log out</button>
        </div>
      </header>

      <nav className="tabs">
        {tabs.map(([key, label]) => (
          <button key={key} className={tab === key ? 'tab active' : 'tab'} onClick={() => openTab(key)}>
            {label}
            {badgeFor(key) > 0 && <span className="badge">{badgeFor(key)}</span>}
          </button>
        ))}
        {onVesselTab && perms.canReport && (
          <button className="btn primary new-task" onClick={() => setEditing('new')}>{newTaskLabel}</button>
        )}
      </nav>

      <main className="main">
        {notices}
        {content}
      </main>
      {overlays}
    </div>
  );
}
