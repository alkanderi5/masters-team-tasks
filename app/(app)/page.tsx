import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireMe } from '@/lib/auth';
import { getBlockedTasks, getDashboardCounts, getEmployeeSummaries } from '@/lib/queries';
import { formatDuration, formatLongDay, formatShort } from '@/lib/format';
import { SectionHead, StatusIcon, Empty, pathText } from '@/components/ui';
import { AddTaskButton } from '@/components/TaskControls';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const me = await requireMe();
  if (!me.isManager) redirect(`/employees/${me.employee.id}`);

  const [c, people, blocked] = await Promise.all([getDashboardCounts(), getEmployeeSummaries(), getBlockedTasks()]);
  const options = people.map((p) => ({ id: p.id, name: p.name }));

  return (
    <>
      <div className="head">
        <div>
          <div className="mono small muted" style={{ marginBottom: 6 }}>{formatLongDay()}</div>
          <h1>Dashboard</h1>
        </div>
        <AddTaskButton employees={options} />
      </div>

      <SectionHead
        title="Jobs · management workload"
        right={<span className="small muted">Large number = main jobs · small line = all tasks at every level</span>}
      />
      <div className="kpis">
        <Link href="/employees" className="card kpi">
          <div className="kpi-label"><span className="kpi-ic ac-blue"><Icon name="users" /></span>Employees</div>
          <div className="num">{c.employees}</div>
          <div className="foot">Active</div>
        </Link>
        <Link href="/tasks?scope=jobs" className="card kpi">
          <div className="kpi-label"><span className="kpi-ic ac-purple"><Icon name="jobs" /></span>Open jobs</div>
          <div className="num">{c.jobs_open}</div>
          <div className="foot">{c.tasks_open} tasks · {c.jobs_not_started} jobs not started</div>
        </Link>
        <Link href="/tasks?scope=jobs&status=in_progress" className="card kpi">
          <div className="kpi-label"><span className="kpi-ic ac-orange"><Icon name="progress" /></span>In progress</div>
          <div className="num">{c.jobs_in_progress}</div>
          <div className="foot">{c.tasks_in_progress} tasks</div>
        </Link>
        <Link href="/blocked" className="card kpi blocked">
          <div className="kpi-label"><span className="kpi-ic ac-red"><Icon name="blocked" /></span>Jobs with blocked work</div>
          <div className="num">{c.jobs_with_blocked}</div>
          <div className="foot">{c.tasks_blocked} blocked task{c.tasks_blocked === 1 ? '' : 's'}, any level</div>
        </Link>
        <Link href="/history?range=today" className="card kpi">
          <div className="kpi-label"><span className="kpi-ic ac-green"><Icon name="done" /></span>Completed today</div>
          <div className="num">{c.jobs_completed_today}</div>
          <div className="foot">{c.tasks_completed_today} tasks</div>
        </Link>
      </div>

      <div className="cols">
        <section style={{ flex: '999 1 560px', minWidth: 0 }}>
          <SectionHead title="Team" right={<Link href="/settings">Manage team</Link>} />
          {people.length === 0 ? (
            <div className="card"><Empty>No employees yet. Add them in Settings.</Empty></div>
          ) : (
            <div className="emp-grid">
              {people.map((p) => (
                <Link key={p.id} href={`/employees/${p.id}`} className="card emp-card">
                  <div className="top">
                    <span className="name">{p.name}</span>
                    <span className="small muted">{p.position || (p.role === 'manager' ? 'Manager' : '')}</span>
                  </div>
                  <div className="emp-stats">
                    <div><div className="n">{p.jobs_open}</div><div className="l">Open jobs</div></div>
                    <div><div className="n" style={{ color: 'var(--ip-text)' }}>{p.jobs_in_progress}</div><div className="l">In prog.</div></div>
                    <div>
                      <div className="n" style={{ color: p.jobs_with_blocked ? 'var(--bl-text)' : 'var(--faint)' }}>{p.jobs_with_blocked}</div>
                      <div className="l">Blocked</div>
                    </div>
                    <div><div className="n" style={{ color: 'var(--dn-text)' }}>{p.jobs_completed_today}</div><div className="l">Done today</div></div>
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                    Tasks: {p.tasks_open} open · {p.tasks_blocked} blocked · {p.tasks_completed_today} done today
                  </div>
                  <div className="now">
                    <span className="muted">Now:</span> {p.current_task_title ?? '—'}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section style={{ flex: '1 1 320px', minWidth: 0 }}>
          <SectionHead title="Blocked right now" tone="bl" right={<Link href="/blocked">View all</Link>} />
          <div className="card">
            {blocked.length === 0 && <Empty>Nothing is blocked.</Empty>}
            {blocked.slice(0, 6).map((t) => (
              <Link key={t.id} href={`/tasks/${t.id}`} className="list-row" style={{ alignItems: 'flex-start' }}>
                <span style={{ marginTop: 3 }}><StatusIcon status="blocked" /></span>
                <div className="grow">
                  <div className="title" style={{ fontSize: 14 }}>{t.title}</div>
                  <div className="meta">{t.employee_name}{pathText(t) ? ` · ${pathText(t)}` : ''}</div>
                  <div className="reason">{t.blocked_reason}</div>
                  <div className="meta mono">Blocked {formatShort(t.blocked_at)} · {formatDuration(t.blocked_at)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
