import { dueText, fmtDate } from '../util.js';
import BasisChip from './BasisChip.jsx';

export default function TaskRow({ task, onOpen, showNote }) {
  return (
    <button className={`row stripe-${task.color}`} onClick={() => onOpen(task.id)}>
      <span className="row-main">
        <span className="row-title">
          {task.title}
          {task.type === 'Issue' && <span className="tag">Issue</span>}
          <BasisChip basis={task.basis} authority={task.authority} />
          {task.statusLabel && <span className={`ws-tag ${task.partsWaiting ? 'ws-parts' : `ws-${task.workStatus}`}`}>{task.statusLabel}</span>}
        </span>
        <span className="row-meta">
          {[task.system, task.assignedToName && `Assigned to ${task.assignedToName}`].filter(Boolean).join(', ')}
        </span>
        {showNote && task.latestNote && (
          <span className="row-note">“{task.latestNote.text}”{task.latestNote.by && ` ${task.latestNote.by}`}{task.latestNote.at && `, ${fmtDate(task.latestNote.at.slice(0, 10))}`}</span>
        )}
      </span>
      <span className="row-due">
        <span className={`due-${task.color}`}>{dueText(task)}</span>
        {task.dueDate && <span className="row-date">{fmtDate(task.dueDate)}{task.dueTime && `, ${task.dueTime}`}</span>}
      </span>
    </button>
  );
}
