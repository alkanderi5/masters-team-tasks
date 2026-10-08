import Link from 'next/link';
import type { Task } from '@/lib/types';
import { formatShort, formatDuration } from '@/lib/format';
import { Progress, StatusIcon, pathText } from './ui';

/**
 * One task in a list. `context` controls the secondary line:
 *  - 'workspace': status + dates
 *  - 'path': where it sits in the tree (+ owner)
 *  - 'child': direct subtask of the page's task
 */
export function TaskRow({
  task: t,
  context = 'workspace',
  showOwner,
}: {
  task: Task;
  context?: 'workspace' | 'path' | 'child';
  showOwner?: boolean;
}) {
  const closed = t.status === 'done' || t.status === 'cancelled';
  const where = pathText(t);
  let meta: string;
  if (context === 'path') {
    meta = [showOwner ? t.employee_name : null, where || 'Main task'].filter(Boolean).join(' · ');
  } else if (context === 'child') {
    meta = [
      showOwner ? t.employee_name : null,
      t.status === 'done' ? `Done ${formatShort(t.completed_at)}` : null,
      t.status === 'cancelled' ? 'Cancelled' : null,
      t.children_blocked > 0 ? `${t.children_blocked} blocked inside` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  } else {
    meta =
      t.status === 'not_started'
        ? `Not started · assigned ${formatShort(t.created_at)}${t.created_by_name ? ` by ${t.created_by_name}` : ''}`
        : t.status === 'in_progress'
          ? `In progress · started ${formatShort(t.started_at)}`
          : t.status === 'done'
            ? `Completed ${formatShort(t.completed_at)}`
            : '';
    if (where) meta = `${where}${meta ? ' · ' + meta : ''}`;
  }

  return (
    <Link href={`/tasks/${t.id}`} className={`list-row${closed ? ' dim' : ''}${t.status === 'cancelled' ? ' struck' : ''}`}>
      <StatusIcon status={t.status} />
      <div className="grow">
        <div className="title">{t.title}</div>
        {meta && <div className="meta">{meta}</div>}
        {t.status === 'blocked' && t.blocked_reason && (
          <>
            <div className="reason">{t.blocked_reason}</div>
            <div className="meta mono">
              Blocked since {formatShort(t.blocked_at)} · {formatDuration(t.blocked_at)}
            </div>
          </>
        )}
      </div>
      <Progress done={t.children_done} total={t.children_total} small />
      <span className="chev" aria-hidden="true">›</span>
    </Link>
  );
}
