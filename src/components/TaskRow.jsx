import { dueText, fmtDate } from '../util.js';

export default function TaskRow({ task, onOpen }) {
  return (
    <button className={`row stripe-${task.color}`} onClick={() => onOpen(task.id)}>
      <span className="row-main">
        <span className="row-title">
          {task.title}
          {task.type === 'Issue' && <span className="tag">Issue</span>}
        </span>
        <span className="row-meta">
          {[task.system, task.assignedToName && `Assigned to ${task.assignedToName}`].filter(Boolean).join(', ')}
        </span>
      </span>
      <span className="row-due">
        <span className={`due-${task.color}`}>{dueText(task)}</span>
        {task.dueDate && <span className="row-date">{fmtDate(task.dueDate)}{task.dueTime && `, ${task.dueTime}`}</span>}
      </span>
    </button>
  );
}
