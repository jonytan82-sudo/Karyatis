import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Rotation from './components/Rotation.jsx';
import Landing from './components/Landing.jsx';
import SubmitWork from './components/SubmitWork.jsx';
import ExternalReview from './components/ExternalReview.jsx';
import StarterProgram from './components/StarterProgram.jsx';
import RulesReview from './components/RulesReview.jsx';
import VesselDetails from './components/VesselDetails.jsx';
import { SuppliesPage } from './components/Supplies.jsx';
import WorkOrders from './components/WorkOrders.jsx';
import { InvoicePage } from './components/Invoice.jsx';

const REVIEW_TOKEN = new URLSearchParams(window.location.search).get('w') || '';
const INVOICE_TOKEN = new URLSearchParams(window.location.search).get('inv') || '';

const VESSEL_TABS = ['board', 'calendar', 'tasks', 'crew', 'rotation', 'reviews', 'supplies'];
const ICONS = { workorders: 'wrench', supplies: 'cart', rules: 'shield', board: 'gauge', calendar: 'calendar', tasks: 'check', crew: 'crew', rotation: 'rotation', reviews: 'star', vessels: 'yacht', profile: 'user', directory: 'search', admin: 'shield' };
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
  const [submitting, setSubmitting] = useState(false);
  const [sentMsg, setSentMsg] = useState('');
  const [profileSub, setProfileSub] = useState('');
  const [starter, setStarter] = useState(false);
  const [details, setDetails] = useState(false);
  const [spinning, setSpinning] = useState(false);
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
      setTab(r.vessel ? 'board' : hasVessels ? 'vessels' : r.user && r.user.consultant ? 'rules' : r.user && (r.user.contractor || r.user.onTeam) ? 'workorders' : 'profile');
      setHome(true);
    }
  }, []);

  const lastRefresh = useRef(0);
  const refresh = useCallback(async () => {
    lastRefresh.current = Date.now();
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

  // Phones keep the app open for days. Check again when the person comes back to it, and every few minutes while it is
  // on screen, so invitations, approvals and answers show up without closing the app. Not while a form is open.
  const busyRef = useRef(false);
  busyRef.current = !!(editing || openId || submitting || starter || details);
  useEffect(() => {
    let last = Date.now();
    const check = () => {
      if (document.visibilityState !== 'visible' || !getToken() || busyRef.current) return;
      if (Date.now() - last < 30000) return;
      last = Date.now();
      refresh();
      window.dispatchEvent(new Event('cjm-refresh'));
    };
    // something was saved: fetch the app's data again, unless a refresh already started after the save finished
    let changeTimer;
    const changed = (e) => {
      const at = (e.detail && e.detail.at) || Date.now();
      clearTimeout(changeTimer);
      changeTimer = setTimeout(() => { if (getToken() && lastRefresh.current < at) refresh(); }, 600);
    };
    window.addEventListener('cjm-changed', changed);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    const timer = setInterval(() => { last = 0; check(); }, 180000);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      clearInterval(timer);
      window.removeEventListener('cjm-changed', changed);
      clearTimeout(changeTimer);
    };
  }, [refresh]);

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

  // a notice opens Reviews, switching to that boat first when needed
  async function openReviews(vesselId) {
    if (!vessel || vessel.id !== vesselId) await openVessel(vesselId);
    setTab('reviews'); setHome(false);
  }

  async function logout() {
    try { await call('logout'); } catch { /* already gone */ }
    setToken(null);
    setVessel('');
    setS(null);
  }

  if (REVIEW_TOKEN) return <ExternalReview token={REVIEW_TOKEN} />;
  if (INVOICE_TOKEN) return <InvoicePage token={INVOICE_TOKEN} />;
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
  if (vessel && !perms.contractor) tabs.push(['rotation', 'Rotation']);
  if (vessel && s.canReviewWork) tabs.push(['reviews', 'Reviews']);
  if (vesselOptions.length > 1 || (!vessel && vesselOptions.length) || s.canRequestVessel) tabs.push(['vessels', 'Vessels']);
  if (user.contractor || user.onTeam) tabs.push(['workorders', 'Work orders']);
  if (vessel || vesselOptions.length) tabs.push(['supplies', 'Marine supplies']);
  if (user.consultant) tabs.push(['rules', 'Rules review']);
  tabs.push(['profile', 'My profile']);
  if (user.canSearch) tabs.push(['directory', 'Find crew']);
  if (user.isAdmin) tabs.push(['admin', 'CJM admin']);
  const onVesselTab = vessel && VESSEL_TABS.includes(tab);
  const badgeFor = (key) => (key === 'crew' ? s.vesselRequests : key === 'reviews' ? s.pendingTaskReviews : key === 'admin' ? s.pendingRequests : key === 'profile' ? s.jobUpdates : key === 'supplies' ? s.partsPending : key === 'workorders' ? (s.teamInvites || []).length : 0) || 0;
  const openJobs = () => { setProfileSub('jobs'); openTab('profile'); };
  const newTaskLabel = perms && (perms.createRoutine ? 'New task' : perms.contractor ? 'Record finding' : 'Report issue');
  const canSubmit = vessel && s.canSubmitWork;
  const submitLabel = perms && perms.createRoutine ? 'Suggest or log work' : 'Log work or suggest';
  const tabLabel = (tabs.find(([k]) => k === tab) || [])[1] || '';

  const refreshNow = async () => {
    setSpinning(true);
    window.dispatchEvent(new Event('cjm-refresh'));
    await refresh();
    setTimeout(() => setSpinning(false), 400);
  };
  const refreshBtn = (cls) => (
    <button className={`${cls} refresh-btn${spinning ? ' spinning' : ''}`} onClick={refreshNow} disabled={spinning} aria-label="Refresh" title="Get the latest">
      <Icon name="refresh" />
    </button>
  );

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
      <Invites invites={s.invites || []} teamInvites={s.teamInvites || []} onDone={(r) => load(r)} />
      {error && <div className="alert">{error} <button className="link" onClick={refresh}>Retry</button></div>}
      {(s.approvalsWaiting || []).filter((a) => !(tab === 'reviews' && !home && vessel && vessel.id === a.vesselId)).map((a) => {
        const parts = [
          a.workOrders ? `${a.workOrders} contractor work order${a.workOrders === 1 ? '' : 's'}${a.from.length ? ` from ${a.from.join(', ')}` : ''}` : '',
          a.jobs ? `${a.jobs} crew job${a.jobs === 1 ? '' : 's'}` : '',
          a.reviews ? `${a.reviews} task review${a.reviews === 1 ? '' : 's'}` : '',
        ].filter(Boolean);
        return (
          <div key={a.vesselId} className="approval-notice">
            <span><b>{a.vesselName}:</b> {parts.join(', ')} waiting for your approval.</span>
            <button className="btn primary" disabled={busy} onClick={() => openReviews(a.vesselId)}>Review now</button>
          </div>
        );
      })}
      {(s.emailedToMe || []).map((w) => (
        <div key={w.token} className="approval-notice">
          <span><b>{w.boatName}:</b> {w.from} asks you to approve {w.kind === 'workorder' ? 'a work order' : 'work'}, "{w.title}".</span>
          <a className="btn primary" href={`/?w=${w.token}`}>Review now</a>
        </div>
      ))}
      {s.jobUpdates > 0 && tab !== 'profile' && (
        <div className="ok job-news">
          {s.jobUpdates === 1 ? 'A captain answered one of your jobs.' : `Captains answered ${s.jobUpdates} of your jobs.`}{' '}
          <button className="link" onClick={openJobs}>See the result</button>
        </div>
      )}
      {sentMsg && <div className="ok">{sentMsg} <button className="link" onClick={() => setSentMsg('')}>OK</button></div>}
    </>
  );

  const content = (
    <>
      {tab === 'board' && vessel && <Board tasks={s.tasks || []} onOpen={setOpenId} onStarter={perms.createRoutine ? () => setStarter(true) : null}
        vessel={vessel} onDetails={s.canEditBoat ? () => setDetails(true) : null} />}
      {tab === 'calendar' && vessel && <Calendar version={version} onOpen={setOpenId} />}
      {tab === 'tasks' && vessel && <TaskList tasks={s.tasks || []} onOpen={setOpenId} onStarter={perms.createRoutine ? () => setStarter(true) : null}
        onDetails={s.canEditBoat ? () => setDetails(true) : null} />}
      {tab === 'rules' && user.consultant && <RulesReview user={user} />}
      {tab === 'workorders' && (user.contractor || user.onTeam) && <WorkOrders />}
      {tab === 'supplies' && <SuppliesPage key={vessel ? vessel.id : 'none'} supplies={s.supplies} vessel={vessel} isBuyer={!!s.isBuyer} pending={s.partsPending || 0} onOpenTask={setOpenId} onChanged={refresh} />}
      {tab === 'rotation' && vessel && !perms.contractor && <Rotation user={user} onOpenTask={setOpenId} />}
      {tab === 'reviews' && vessel && s.canReviewWork && <WorkReviews vessel={vessel} onChanged={refresh} />}
      {tab === 'crew' && vessel && !perms.contractor && (
        <Crew user={user} vessel={vessel} perms={perms} crew={crew} catalog={s.catalog} onChanged={refresh} />
      )}
      {tab === 'vessels' && <Vessels options={vesselOptions} current={vessel} busy={busy} onOpen={openVessel} canRequest={s.canRequestVessel} onChanged={refresh} />}
      {tab === 'profile' && <Profile key={profileSub} user={user} vessel={vessel} onChanged={refresh} startSub={profileSub} jobBadge={s.jobUpdates || 0}
        onJobsSeen={() => setS((v) => ({ ...v, jobUpdates: 0 }))} />}
      {tab === 'directory' && user.canSearch && <Directory catalog={s.catalog} />}
      {tab === 'admin' && user.isAdmin && <Admin user={user} catalog={s.catalog} onOpenVessel={openVessel} onChanged={refresh} pending={s.pendingRequests || 0} />}
    </>
  );

  const overlays = (
    <>
      {openId && vessel && (
        <TaskDetail
          id={openId}
          supplies={s.supplies}
          isBuyer={!!s.isBuyer}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
          onEdit={(t) => { setOpenId(null); setEditing(t); }}
        />
      )}
      {starter && vessel && (
        <StarterProgram vessel={vessel} tasks={s.tasks || []} perms={perms} rules={s.rules || []} canEditBoat={!!s.canEditBoat} onClose={() => setStarter(false)}
          onDone={(m) => { setStarter(false); setSentMsg(m); refresh(); }} />
      )}
      {details && vessel && (
        <VesselDetails vessel={vessel} onClose={() => setDetails(false)} onSaved={() => { setDetails(false); setSentMsg('Boat details saved.'); refresh(); }} />
      )}
      {submitting && (
        <SubmitWork vessel={vessel} kinds={vessel && s.canSubmitWork ? ['done', 'suggest', 'external'] : ['external']}
          onClose={() => setSubmitting(false)} onSent={(m) => { setSubmitting(false); setSentMsg(m); }} />
      )}
      {editing && vessel && (
        <TaskForm
          initial={editing === 'new' ? null : editing}
          crew={crew.filter((c) => c.status === 'active')}
          perms={perms}
          rules={s.rules || []}
          supplies={s.supplies}
          onClose={() => setEditing(null)}
          onSaved={(t, partsMsg) => { setEditing(null); refresh(); setOpenId(t.id); if (partsMsg) setSentMsg(partsMsg); }}
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
            {refreshBtn('m-who-refresh')}
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
          {canSubmit && !perms.createRoutine && (
            <button className="m-cta m-cta2" onClick={() => setSubmitting(true)}><Icon name="check" /> {submitLabel}</button>
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
          {refreshBtn('m-bar-refresh')}
        </header>
        <main className="main">
          {notices}
          {content}
        </main>
        {onVesselTab && perms.canReport && (
          <div className="new-task fab-row">
            {canSubmit && !perms.createRoutine && <button className="btn" onClick={() => setSubmitting(true)}>{submitLabel}</button>}
            <button className="btn primary" onClick={() => setEditing('new')}>{newTaskLabel}</button>
          </div>
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
          {refreshBtn('who-refresh')}
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
        {onVesselTab && canSubmit && !perms.createRoutine && (
          <button className="btn new-task submit-work-btn" onClick={() => setSubmitting(true)}>{submitLabel}</button>
        )}
        {onVesselTab && perms.canReport && (
          <button className={`btn primary ${canSubmit && !perms.createRoutine ? '' : 'new-task'}`} onClick={() => setEditing('new')}>{newTaskLabel}</button>
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
