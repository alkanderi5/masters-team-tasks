import Link from 'next/link';
import { requireManager } from '@/lib/auth';
import { getEmployeeSummaries } from '@/lib/queries';
import { Empty } from '@/components/ui';

export const metadata = { title: 'Employees' };

export default async function EmployeesPage() {
  await requireManager();
  const people = await getEmployeeSummaries();

  return (
    <>
      <div className="head">
        <div>
          <h1>Employees</h1>
          <div className="sub">Open any employee to see their active work, blocked work and history.</div>
        </div>
        <Link href="/settings" className="btn">Manage team</Link>
      </div>
      <div className="card tbl-wrap">
        {people.length === 0 ? (
          <Empty>No active employees. Add them in Settings.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Open jobs</th>
                <th>In progress</th>
                <th>Blocked tasks</th>
                <th>Done today</th>
                <th>Working on</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/employees/${p.id}`} style={{ fontWeight: 500 }}>{p.name}</Link></td>
                  <td className="muted">{p.position || (p.role === 'manager' ? 'Manager' : '—')}</td>
                  <td className="num">{p.jobs_open} <span className="muted">({p.tasks_open} tasks)</span></td>
                  <td className="num">{p.jobs_in_progress}</td>
                  <td className="num" style={{ color: p.tasks_blocked ? 'var(--bl-text)' : undefined }}>{p.tasks_blocked}</td>
                  <td className="num">{p.jobs_completed_today}</td>
                  <td>
                    {p.current_task_id ? <Link href={`/tasks/${p.current_task_id}`}>{p.current_task_title}</Link> : <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
