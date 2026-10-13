import { useMemo, useState } from 'react';
import TaskRow from './TaskRow.jsx';
import { SYSTEMS } from '../util.js';

export default function TaskList({ tasks, onOpen }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState('Open');
  const [type, setType] = useState('');
  const [system, setSystem] = useState('');

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tasks.filter((t) =>
      (!state || (state === 'Open' ? t.state === 'Open' : t.state !== 'Open')) &&
      (!type || t.type === type) &&
      (!system || t.system === system) &&
      (!s || `${t.title} ${t.description} ${t.system}`.toLowerCase().includes(s)));
  }, [tasks, q, state, type, system]);

  return (
    <div className="task-list">
      <div className="filters">
        <input type="search" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" />
        <select value={state} onChange={(e) => setState(e.target.value)} aria-label="Status">
          <option value="Open">Open</option>
          <option value="Closed">Closed</option>
          <option value="">Open and closed</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">Routine and issues</option>
          <option value="Routine">Routine</option>
          <option value="Issue">Issues</option>
        </select>
        <select value={system} onChange={(e) => setSystem(e.target.value)} aria-label="System">
          <option value="">All systems</option>
          {SYSTEMS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {list.length ? list.map((t) => <TaskRow key={t.id} task={t} onOpen={onOpen} />)
        : <p className="empty">No tasks match these filters.</p>}
    </div>
  );
}
