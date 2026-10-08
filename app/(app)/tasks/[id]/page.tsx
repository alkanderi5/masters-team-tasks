import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMe } from '@/lib/auth';
import { getSubtree, getTaskActivity, listEmployees } from '@/lib/queries';
import { formatDateTime, formatDuration, isUuid } from '@/lib/format';
import type { Task } from '@/lib/types';
import { Breadcrumbs, Empty, Progress, SectionHead, StatusBadge, StatusIcon, taskCrumbs } from '@/components/ui';
import { TaskRow } from '@/components/TaskRow';
import { ActivityItem } from '@/components/Activity';
import { AddSubtaskForm, JobDoneButton, ManagerTaskActions, StatusControl } from '@/components/TaskControls';

export const metadata = { title: 'Task' };

const OPEN = new Set(['not_started', 'in_progress', 'blocked']);

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const me = await requireMe();

  const [subtree, activity, employees] = await Promise.all([
    getSubtree(id),
    getTaskActivity(id, false),
    me.isManager ? listEmployees() : Promise.resolve([]),
  ]);
  const task = subtree.find((t) => t.id === id);
  if (!task) notFound();

  const children = subtree.filter((t) => t.parent_task_id === id);
  const unfinished = subtree.filter((t) => t.id !== id && OPEN.has(t.status)).length;
  const closed = task.status === 'done' || task.status === 'cancelled';
  const owner = task.employee_id === me.employee.id;
  const canWork = (me.isManager || owner) && task.is_active;
  const options = employees.map((e) => ({ id: e.id, name: e.name }));
  if (me.isManager && !options.some((o) => o.id === task.employee_id)) {
    options.unshift({ id: task.employee_id, name: task.employee_name });
  }
  const descOpen = task.desc_total - task.desc_done;

  return (
    <>
      <Breadcrumbs items={taskCrumbs(task, { employeeLink: me.isManager || owner })} />

      <div className="head" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="row-wrap" style={{ gap: 12 }}>
            <h1>{task.title}</h1>
            <StatusBadge status={task.status} />
          </div>
          {task.description && (
            <p style={{ marginTop: 8, fontSize: 14, color: 'var(--text-2)', maxWidth: 680, whiteSpace: 'pre-line' }}>
              {task.description}
            </p>
          )}
        </div>
        {me.isManager && !task.ancestor_closed && (
          <ManagerTaskActions
            taskId={task.id}
            title={task.title}
            description={task.description}
            employeeId={task.employee_id}
            employees={options}
            closed={closed}
          />
        )}
      </div>

      {task.ancestor_closed && (
        <div className="notice">
          A parent task is {closed ? 'closed' : 'completed or cancelled'}, so this task is out of active work.
          {me.isManager ? ' Reopen the parent to bring it back.' : ''}
        </div>
      )}

      {task.status === 'blocked' && (
        <div className="block-note">
          <div>
            <span className="k">Blocked · since {formatDateTime(task.blocked_at)} · {formatDuration(task.blocked_at)}</span>
            {task.blocked_reason}
          </div>
        </div>
      )}

      {canWork && (
        <div className="task-actions">
          <StatusControl taskId={task.id} status={task.status} blockedReason={task.blocked_reason} />
          <div className="pin-bottom">
            <JobDoneButton taskId={task.id} title={task.title} unfinished={unfinished} />
          </div>
        </div>
      )}

      {closed ? (
        <ClosedView task={task} subtree={subtree} activity={activity} />
      ) : (
        <div className="cols">
          <section className="col-main" id="subtasks">
            <div>
              <SectionHead
                title={`Subtasks · ${children.length}`}
                right={<Progress done={task.children_done} total={task.children_total} />}
              />
              <div className="card">
                {children.length === 0 && !canWork && <Empty>No subtasks.</Empty>}
                {children.map((c) => (
                  <TaskRow key={c.id} task={c} context="child" showOwner={c.employee_id !== task.employee_id} />
                ))}
                {canWork && (
                  <AddSubtaskForm
                    parentId={task.id}
                    defaultEmployeeId={task.employee_id}
                    employees={me.isManager ? options : undefined}
                  />
                )}
              </div>
              {descOpen > 0 && task.desc_total !== task.children_total && (
                <p className="small muted" style={{ marginTop: 8 }}>
                  {task.desc_done} of {task.desc_total} tasks done across all levels. Progress above counts direct subtasks only.
                </p>
              )}
            </div>
          </section>

          <aside className="col-side">
            <div className="card pad">
              <h2 className="sec" style={{ marginBottom: 12 }}>Details</h2>
              <dl className="kv">
                <dt>Assigned to</dt>
                <dd>{task.employee_name}</dd>
                <dt>Created</dt>
                <dd className="mono small">{formatDateTime(task.created_at)}{task.created_by_name ? ` · ${task.created_by_name}` : ''}</dd>
                <dt>Started</dt>
                <dd className="mono small">{formatDateTime(task.started_at)}</dd>
                <dt>Open for</dt>
                <dd className="mono small">{formatDuration(task.created_at)}</dd>
              </dl>
            </div>
            <div className="card pad">
              <SectionHead title="Activity" />
              {activity.length === 0 && <div className="muted small">No activity yet.</div>}
              {activity.slice(0, 15).map((e) => (
                <ActivityItem key={e.id} e={e} compact />
              ))}
              {activity.length > 15 && (
                <p className="small muted" style={{ paddingTop: 8 }}>
                  Showing latest 15 of {activity.length} events.
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Completed / cancelled job: metadata, preserved tree, lifecycle     */
/* ---------------------------------------------------------------- */

function ClosedView({ task, subtree, activity }: { task: Task; subtree: Task[]; activity: Awaited<ReturnType<typeof getTaskActivity>> }) {
  const byParent = new Map<string, Task[]>();
  for (const t of subtree) {
    if (t.id === task.id || !t.parent_task_id) continue;
    const list = byParent.get(t.parent_task_id) ?? [];
    list.push(t);
    byParent.set(t.parent_task_id, list);
  }
  const lifecycle = [...activity].reverse(); // oldest first

  return (
    <>
      <div className="card meta-grid">
        <div><div className="k">Created</div><div className="v mono small">{formatDateTime(task.created_at)}</div></div>
        <div><div className="k">Started</div><div className="v mono small">{formatDateTime(task.started_at)}</div></div>
        {task.status === 'done' ? (
          <>
            <div><div className="k">Completed</div><div className="v mono small">{formatDateTime(task.completed_at)}</div></div>
            <div><div className="k">Duration</div><div className="v mono small">{formatDuration(task.created_at, task.completed_at)}</div></div>
            <div><div className="k">Completed by</div><div className="v">{task.completed_by_name}</div></div>
          </>
        ) : (
          <div><div className="k">Cancelled</div><div className="v mono small">{formatDateTime(task.cancelled_at)}</div></div>
        )}
        <div><div className="k">Assigned to</div><div className="v">{task.employee_name}</div></div>
        <div><div className="k">Subtasks</div><div className="v mono small">{task.desc_done} / {task.desc_total} done</div></div>
      </div>

      <div className="cols">
        <section style={{ flex: '1 1 340px', minWidth: 0 }} id="subtasks">
          <SectionHead title="Task tree" />
          <div className="card" style={{ padding: '8px 0' }}>
            <TreeNode t={task} byParent={byParent} level={0} />
          </div>
        </section>
        <section style={{ flex: '999 1 460px', minWidth: 0 }}>
          <SectionHead title="Lifecycle" />
          <div className="card pad" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {lifecycle.length === 0 && <div className="muted small" style={{ padding: '12px 0' }}>No events.</div>}
            {lifecycle.map((e) => (
              <ActivityItem key={e.id} e={e} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function TreeNode({ t, byParent, level }: { t: Task; byParent: Map<string, Task[]>; level: number }) {
  const kids = byParent.get(t.id) ?? [];
  const unfinished = t.status !== 'done' && t.status !== 'cancelled';
  return (
    <>
      <Link
        href={`/tasks/${t.id}`}
        className="tree-node"
        style={{ paddingLeft: 18 + level * 24, fontWeight: level === 0 ? 600 : level === 1 ? 500 : 400 }}
      >
        <StatusIcon status={t.status} />
        <span style={{ textDecoration: t.status === 'cancelled' ? 'line-through' : undefined }}>{t.title}</span>
        {unfinished && <span className="unfinished">unfinished when parent closed</span>}
      </Link>
      {kids.map((k) => (
        <TreeNode key={k.id} t={k} byParent={byParent} level={level + 1} />
      ))}
    </>
  );
}
