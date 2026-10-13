import TaskRow from './TaskRow.jsx';

function Group({ title, items, onOpen, empty }) {
  return (
    <section className="group">
      <h3>{title} <span className="count">{items.length}</span></h3>
      {items.length ? items.map((t) => <TaskRow key={t.id} task={t} onOpen={onOpen} />) : <p className="empty">{empty}</p>}
    </section>
  );
}

export default function Board({ tasks, onOpen }) {
  const open = tasks.filter((t) => t.state === 'Open');
  const routine = open.filter((t) => t.type === 'Routine');
  const red = open.filter((t) => t.color === 'red');
  const amber = open.filter((t) => t.color === 'amber');
  const issues = open.filter((t) => t.type === 'Issue');
  const upcoming = routine.filter((t) => t.color === 'green' && t.daysUntilDue <= 30);

  return (
    <div className="board">
      <div className="gauge">
        <div className="gauge-cell red"><b>{red.length}</b><span>Overdue</span></div>
        <div className="gauge-cell amber"><b>{amber.length}</b><span>Due within 10 days</span></div>
        <div className="gauge-cell green"><b>{routine.filter((t) => t.color === 'green').length}</b><span>On schedule</span></div>
        <div className="gauge-cell issue"><b>{issues.length}</b><span>Open issues</span></div>
      </div>
      <Group title="Overdue" items={red} onOpen={onOpen} empty="Nothing overdue." />
      <Group title="Due within 10 days" items={amber} onOpen={onOpen} empty="Nothing due in the next 10 days." />
      <Group title="Open issues" items={issues} onOpen={onOpen} empty="No open issues. Log a problem with New task." />
      <Group title="Coming up in the next 30 days" items={upcoming} onOpen={onOpen} empty="Nothing else scheduled this month." />
    </div>
  );
}
