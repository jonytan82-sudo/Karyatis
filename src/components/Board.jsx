import { useState } from 'react';
import TaskRow from './TaskRow.jsx';
import { missingDetails } from '../jobLibrary.js';

function Group({ title, items, onOpen, empty, showNote }) {
  return (
    <section className="group">
      <h3>{title} <span className="count">{items.length}</span></h3>
      {items.length ? items.map((t) => <TaskRow key={t.id} task={t} onOpen={onOpen} showNote={showNote} />) : <p className="empty">{empty}</p>}
    </section>
  );
}

export default function Board({ tasks, onOpen, onStarter, vessel, onDetails }) {
  const open = tasks.filter((t) => t.state === 'Open');
  const routine = open.filter((t) => t.type === 'Routine');
  const red = open.filter((t) => t.color === 'red');
  const amber = open.filter((t) => t.color === 'amber');
  const issues = open.filter((t) => t.type === 'Issue');
  const upcoming = routine.filter((t) => t.color === 'green' && t.daysUntilDue <= 30);
  const parts = open.filter((t) => t.partsWaiting > 0);
  const onSchedule = routine.filter((t) => t.color === 'green');
  const [focus, setFocus] = useState('');
  const BLOCKS = {
    red: ['Overdue', red, 'Nothing overdue.'],
    amber: ['Due within 10 days', amber, 'Nothing due in the next 10 days.'],
    green: ['On schedule', onSchedule, 'Nothing on schedule yet.'],
    issue: ['Open issues', issues, 'No open issues.'],
    parts: ['Waiting on parts', parts, 'Nothing waiting on parts.'],
  };
  const cell = (k, cls) => (
    <button type="button" className={`gauge-cell ${cls} ${focus === k ? 'focus' : ''}`} onClick={() => setFocus(focus === k ? '' : k)} aria-pressed={focus === k}>
      <b>{BLOCKS[k][1].length}</b><span>{BLOCKS[k][0]}</span>
    </button>
  );

  return (
    <div className="board">
      {onDetails && vessel && missingDetails(vessel).length > 0 && (
        <div className="review-note board-review">
          <span><b>Review required.</b> {missingDetails(vessel).join(', ')} {missingDetails(vessel).length === 1 ? 'is' : 'are'} not known yet, so CJM Marine cannot show which regulations apply to {vessel.name}.</span>
          <button className="btn" onClick={onDetails}>Boat details</button>
        </div>
      )}
      {onStarter && routine.length < 10 && (
        <div className="starter-card card">
          <div>
            <b>New boat? Load a starter maintenance program</b>
            <p className="hint">Pick the boat's size and what is aboard, and CJM Marine suggests routine jobs with typical intervals. You choose which to add.</p>
          </div>
          <button className="btn primary" onClick={onStarter}>Load starter program</button>
        </div>
      )}
      <div className="gauge gauge-5">
        {cell('red', 'red')}{cell('amber', 'amber')}{cell('green', 'green')}{cell('issue', 'issue')}{cell('parts', 'parts')}
      </div>
      {focus && (
        <section className="group focus-list">
          <div className="group-head">
            <h3>{BLOCKS[focus][0]} <span className="count">{BLOCKS[focus][1].length}</span></h3>
            <button className="link" onClick={() => setFocus('')}>Back to board</button>
          </div>
          <p className="hint">Each task shows its status and latest note. Open it for the full story.</p>
          {BLOCKS[focus][1].length ? BLOCKS[focus][1].map((t) => <TaskRow key={t.id} task={t} onOpen={onOpen} showNote />) : <p className="empty">{BLOCKS[focus][2]}</p>}
        </section>
      )}
      {!focus && <>
      <Group title="Overdue" items={red} onOpen={onOpen} empty="Nothing overdue." />
      <Group title="Due within 10 days" items={amber} onOpen={onOpen} empty="Nothing due in the next 10 days." />
      <Group title="Open issues" items={issues} onOpen={onOpen} empty="No open issues. Log a problem with New task." />
      {parts.length > 0 && <Group title="Waiting on parts" items={parts} onOpen={onOpen} empty="" showNote />}
      <Group title="Coming up in the next 30 days" items={upcoming} onOpen={onOpen} empty="Nothing else scheduled this month." />
      </>}
    </div>
  );
}
