import Link from 'next/link';
import { requireMe } from '@/lib/auth';
import { getBlockedTasks, listEmployees } from '@/lib/queries';
import { formatDateTime, formatDuration, isUuid } from '@/lib/format';
import type { Task } from '@/lib/types';
import { StatusIcon } from '@/components/ui';
import { BlockedResume } from './BlockedResume';

export const metadata = { title: 'Blocked' };

export default async function BlockedPage({ searchParams }: { searchParams: Promise<{ employee?: string }> }) {
  const me = await requireMe();
  const sp = await searchParams;
  const employeeId = me.isManager ? (isUuid(sp.employee) ? sp.employee : undefined) : me.employee.id;

  const [tasks, employees] = await Promise.all([
    getBlockedTasks(employeeId),
    me.isManager ? listEmployees() : Promise.resolve([]),
  ]);

  // Group by employee, keeping longest-blocked first.
  const groups: { id: string; name: string; items: Task[] }[] = [];
  for (const t of tasks) {
    let g = groups.find((x) => x.id === t.employee_id);
    if (!g) {
      g = { id: t.employee_id, name: t.employee_name, items: [] };
      groups.push(g);
    }
    g.items.push(t);
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Blocked work</h1>
          <div className="sub">What is stopping work right now, who owns it, and why. Longest-blocked first.</div>
        </div>
        {me.isManager && (
          <form method="get" className="row-wrap">
            <label htmlFor="b-emp" className="sr-only">Filter by employee</label>
            <select id="b-emp" name="employee" className="select" style={{ width: 'auto' }} defaultValue={employeeId ?? ''}>
              <option value="">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <button className="btn" type="submit">Filter</button>
          </form>
        )}
      </div>

      {groups.length === 0 && <div className="card"><div className="empty">Nothing is blocked right now.</div></div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 980 }}>
        {groups.map((g) => (
          <section key={g.id}>
            <div className="row-wrap" style={{ marginBottom: 10, alignItems: 'baseline' }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>
                {me.isManager ? <Link href={`/employees/${g.id}`} style={{ color: 'inherit' }}>{g.name}</Link> : g.name}
              </h2>
              <span className="mono small" style={{ color: 'var(--bl-text)' }}>{g.items.length} blocked</span>
            </div>
            <div className="card warn">
              {g.items.map((t) => (
                <div key={t.id} className="list-row" style={{ alignItems: 'flex-start', gap: 16 }}>
                  <span style={{ marginTop: 4 }}><StatusIcon status="blocked" /></span>
                  <div className="grow" style={{ flexBasis: 360 }}>
                    <div className="meta" style={{ marginTop: 0 }}>{t.ancestor_titles.length ? t.ancestor_titles.join(' › ') : 'Main task'}</div>
                    <div className="title" style={{ fontSize: 16, marginTop: 3 }}>{t.title}</div>
                    <div className="block-note" style={{ margin: '10px 0 0' }}>
                      <div>
                        <span className="k">Reason</span>
                        {t.blocked_reason}
                      </div>
                    </div>
                    <div className="meta mono" style={{ marginTop: 10 }}>
                      Blocked since {formatDateTime(t.blocked_at)} · <span style={{ color: 'var(--bl-text)' }}>{formatDuration(t.blocked_at)}</span>
                    </div>
                  </div>
                  <div className="row-wrap" style={{ alignItems: 'flex-start' }}>
                    <Link className="btn" href={`/tasks/${t.id}`}>Open task</Link>
                    <BlockedResume taskId={t.id} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
