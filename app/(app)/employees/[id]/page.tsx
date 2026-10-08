import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireMe } from '@/lib/auth';
import { getBlockedTasks, getEmployee, getEntryTasks, getEmployeeSummaries, listEmployees } from '@/lib/queries';
import { isUuid } from '@/lib/format';
import { Breadcrumbs, Empty, SectionHead } from '@/components/ui';
import { TaskRow } from '@/components/TaskRow';
import { AddTaskButton } from '@/components/TaskControls';
import { EmployeeSwitcher } from './EmployeeSwitcher';

export const metadata = { title: 'Employee workspace' };

export default async function EmployeeWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe();
  if (!isUuid(id)) notFound();
  if (!me.isManager && id !== me.employee.id) redirect(`/employees/${me.employee.id}`);

  const emp = await getEmployee(id);
  if (!emp) notFound();

  const [active, blocked, done, summaries, everyone] = await Promise.all([
    getEntryTasks(id, { active: true }),
    getBlockedTasks(id),
    getEntryTasks(id, { status: 'done', completedDesc: true, limit: 8 }),
    me.isManager ? getEmployeeSummaries() : Promise.resolve([]),
    me.isManager ? listEmployees() : Promise.resolve([]),
  ]);
  const working = active.filter((t) => t.status !== 'blocked');
  const s = summaries.find((x) => x.id === id);
  const options = everyone.map((e) => ({ id: e.id, name: e.name }));
  const isSelf = id === me.employee.id;

  return (
    <>
      {me.isManager && <Breadcrumbs items={[{ label: 'Employees', href: '/employees' }, { label: emp.name }]} />}
      <div className="head">
        <div>
          <h1>{isSelf && !me.isManager ? 'My work' : emp.name}</h1>
          <div className="sub">
            {emp.position || (emp.role === 'manager' ? 'Manager' : 'Employee')}
            {!emp.active && ' · Deactivated'}
            {s && (
              <>
                {' · '}{s.jobs_open} open jobs · {s.jobs_in_progress} in progress ·{' '}
                <span style={{ color: s.tasks_blocked ? 'var(--bl-text)' : undefined }}>{s.tasks_blocked} blocked</span> ·{' '}
                <span style={{ color: 'var(--dn-text)' }}>{s.tasks_completed_today} tasks done today</span>
              </>
            )}
          </div>
        </div>
        <div className="row-wrap">
          {me.isManager && <EmployeeSwitcher current={id} employees={options} />}
          {me.isManager && emp.active && <AddTaskButton employees={options} defaultEmployeeId={id} />}
        </div>
      </div>

      <div className="cols">
        <div className="col-main">
          <section>
            <SectionHead title={`Active work · ${working.length}`} />
            <div className="card">
              {working.length === 0 && <Empty>No active work.</Empty>}
              {working.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </div>
          </section>

          <section>
            <SectionHead title={`Blocked · ${blocked.length}`} tone="bl" />
            <div className={`card${blocked.length ? ' warn' : ''}`}>
              {blocked.length === 0 && <Empty>Nothing blocked.</Empty>}
              {blocked.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </div>
          </section>
        </div>

        <section className="col-side">
          <div>
            <SectionHead title="Recently completed" tone="dn" right={<Link href={`/history?employee=${id}`}>Full history</Link>} />
            <div className="card">
              {done.length === 0 && <Empty>Nothing completed yet.</Empty>}
              {done.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
