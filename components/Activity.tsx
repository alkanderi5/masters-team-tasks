import Link from 'next/link';
import type { ActivityEvent } from '@/lib/types';
import { formatDate, formatSecondsDuration, formatShort, formatTime, localDateKey } from '@/lib/format';

function Quote({ children }: { children: React.ReactNode }) {
  return <>“{children}”</>;
}

/** Plain-language sentence for one history event. */
export function describe(e: ActivityEvent, linkTask = true): { text: React.ReactNode; note?: React.ReactNode; tone?: 'bl' } {
  const task = linkTask ? <Link href={`/tasks/${e.task_id}`}>{e.task_title}</Link> : <Quote>{e.task_title}</Quote>;
  const m = e.metadata || {};
  switch (e.action) {
    case 'TASK_CREATED':
      return { text: <>created {task}</> };
    case 'SUBTASK_CREATED':
      return { text: <>added subtask {task}{m.parent_title ? <> under <Quote>{String(m.parent_title)}</Quote></> : null}</> };
    case 'TASK_ASSIGNED':
      return { text: <>assigned {task} to <b>{e.new_value}</b></> };
    case 'TASK_REASSIGNED':
      return { text: <>reassigned {task}: {e.old_value} → <b>{e.new_value}</b></> };
    case 'TASK_TITLE_CHANGED':
      return { text: <>renamed <Quote>{e.old_value}</Quote> to {task}</> };
    case 'TASK_DESCRIPTION_CHANGED':
      return { text: <>edited the description of {task}</> };
    case 'TASK_STATUS_CHANGED':
      return { text: <>changed {task}: {e.old_value} → {e.new_value}</> };
    case 'TASK_BLOCKED':
      return { text: <>changed {task}: {e.old_value} → Blocked</>, note: <>Reason: {e.note}</>, tone: 'bl' };
    case 'TASK_BLOCK_REASON_CHANGED':
      return { text: <>updated why {task} is blocked</>, note: <>Reason: {e.new_value}</>, tone: 'bl' };
    case 'TASK_UNBLOCKED': {
      const secs = typeof m.blocked_for_seconds === 'number' ? m.blocked_for_seconds : null;
      return {
        text: <>changed {task}: Blocked → {e.new_value}</>,
        note: secs !== null ? <>Was blocked for {formatSecondsDuration(secs)}</> : undefined,
      };
    }
    case 'TASK_COMPLETED':
      return {
        text: <>✓ Job Done: {task}</>,
        note: m.forced ? <>Completed with {String(m.unfinished_subtasks)} unfinished subtask(s)</> : undefined,
        tone: m.forced ? 'bl' : undefined,
      };
    case 'TASK_REOPENED':
      return { text: <>reopened {task}: {e.old_value} → {e.new_value}</>, note: e.note ?? undefined };
    case 'TASK_CANCELLED':
      return { text: <>cancelled {task}</>, note: e.note ? <>Note: {e.note}</> : undefined };
    default:
      return { text: <>{String(e.action)} {task}</> };
  }
}

export function ActivityItem({
  e,
  showContext,
  compact,
  dateStyle = 'short',
}: {
  e: ActivityEvent;
  showContext?: boolean;
  compact?: boolean;
  dateStyle?: 'short' | 'time';
}) {
  const d = describe(e);
  const when = dateStyle === 'time' ? formatTime(e.created_at) : formatShort(e.created_at);
  return (
    <div className={`ev${compact ? ' compact' : ''}`}>
      <span className="when">{when}</span>
      <div className="what">
        <div>
          <b>{e.performed_by_name}</b> {d.text}
        </div>
        {showContext && e.root_task_id !== e.task_id && <div className="ctx">in {e.root_title}</div>}
        {d.note && <div className={`note${d.tone === 'bl' ? ' bl' : ''}`}>{d.note}</div>}
      </div>
    </div>
  );
}

/** Events grouped under day headings (business timezone). */
export function ActivityByDay({ events, showContext = true }: { events: ActivityEvent[]; showContext?: boolean }) {
  const groups: { key: string; label: string; items: ActivityEvent[] }[] = [];
  const today = localDateKey();
  for (const e of events) {
    const key = localDateKey(e.created_at);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: key === today ? 'Today' : formatDate(e.created_at), items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }
  return (
    <>
      {groups.map((g) => (
        <section key={g.key}>
          <div className="day-head">{g.label}</div>
          <div className="card pad" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {g.items.map((e) => (
              <ActivityItem key={e.id} e={e} showContext={showContext} dateStyle="time" />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
