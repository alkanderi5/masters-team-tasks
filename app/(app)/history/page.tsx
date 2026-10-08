import Link from 'next/link';
import { requireMe } from '@/lib/auth';
import { getCompletedTasks, getEmployee, listEmployees } from '@/lib/queries';
import { addDays, formatDuration, formatMonth, formatShort, isDateKey, isUuid, localDateKey, localDayStartISO } from '@/lib/format';
import type { Task } from '@/lib/types';
import { StatusIcon } from '@/components/ui';

export const metadata = { title: 'History' };

type SP = Record<string, string | undefined>;
const RANGES = ['today', 'week', 'month', 'last_month', 'all'] as const;
type Range = (typeof RANGES)[number];

/** [fromKey, toKeyExclusive] in business-local dates. */
function rangeKeys(range: Range): [string | undefined, string | undefined] {
  const today = localDateKey();
  const [y, m] = today.split('-').map(Number);
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  switch (range) {
    case 'today':
      return [today, addDays(today, 1)];
    case 'week': {
      const dow = new Date(today + 'T12:00:00Z').getUTCDay(); // 0 = Sunday (week starts Sunday)
      return [addDays(today, -dow), addDays(today, 1)];
    }
    case 'month':
      return [monthStart, addDays(today, 1)];
    case 'last_month': {
      const prev = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
      return [prev, monthStart];
    }
    default:
      return [undefined, undefined];
  }
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireMe();
  const sp = await searchParams;

  const employeeId = me.isManager ? (isUuid(sp.employee) ? sp.employee : undefined) : me.employee.id;
  const custom = isDateKey(sp.from) || isDateKey(sp.to);
  const range: Range | 'custom' = custom ? 'custom' : RANGES.includes(sp.range as Range) ? (sp.range as Range) : 'month';
  const [fromKey, toKeyExcl] = range === 'custom'
    ? [isDateKey(sp.from) ? sp.from : undefined, isDateKey(sp.to) ? addDays(sp.to!, 1) : undefined]
    : rangeKeys(range);
  const q = (sp.q ?? '').trim().slice(0, 100) || undefined;
  const includeSubtasks = sp.all === '1';

  const [tasks, employees, emp] = await Promise.all([
    getCompletedTasks({
      employeeId,
      q,
      includeSubtasks,
      from: fromKey ? localDayStartISO(fromKey) : undefined,
      to: toKeyExcl ? localDayStartISO(toKeyExcl) : undefined,
    }),
    me.isManager ? listEmployees({ includeInactive: true }) : Promise.resolve([]),
    employeeId ? getEmployee(employeeId) : Promise.resolve(null),
  ]);

  // Group by month of completion.
  const groups: { label: string; items: Task[] }[] = [];
  for (const t of tasks) {
    const label = formatMonth(t.completed_at!);
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) {
      g = { label, items: [] };
      groups.push(g);
    }
    g.items.push(t);
  }

  const link = (patch: SP) => {
    const p = new URLSearchParams();
    const merged: SP = { ...sp, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return s ? `/history?${s}` : '/history';
  };
  const chip = (r: Range, label: string) => (
    <Link href={link({ range: r, from: undefined, to: undefined })} className={`chip${range === r ? ' on' : ''}`}>{label}</Link>
  );

  return (
    <>
      <div className="head">
        <div>
          <h1>History{emp ? ` — ${emp.name}` : ''}</h1>
          <div className="sub">
            Completed {includeSubtasks ? 'tasks at every level' : 'jobs'}. Open any job for its full task tree and lifecycle.
          </div>
        </div>
      </div>

      <form className="filters" method="get">
        <div className="field grow">
          <label htmlFor="h-q">Search completed work</label>
          <input id="h-q" name="q" type="search" className="input" defaultValue={q} placeholder="Task title…" />
        </div>
        {me.isManager && (
          <div className="field">
            <label htmlFor="h-emp">Employee</label>
            <select id="h-emp" name="employee" className="select" defaultValue={employeeId ?? ''}>
              <option value="">Whole team</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}{e.active ? '' : ' (inactive)'}</option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="h-from">Completed from</label>
          <input id="h-from" name="from" type="date" className="input" defaultValue={fromKey} />
        </div>
        <div className="field">
          <label htmlFor="h-to">to</label>
          <input id="h-to" name="to" type="date" className="input" defaultValue={toKeyExcl ? addDays(toKeyExcl, -1) : undefined} />
        </div>
        {includeSubtasks && <input type="hidden" name="all" value="1" />}
        <button className="btn" type="submit">Apply</button>
      </form>

      <div className="chips">
        {chip('today', 'Today')}
        {chip('week', 'This week')}
        {chip('month', 'This month')}
        {chip('last_month', 'Last month')}
        {chip('all', 'All time')}
        <Link href={link({ all: includeSubtasks ? undefined : '1' })} className={`chip${includeSubtasks ? ' on' : ''}`}>
          {includeSubtasks ? '✓ ' : ''}Include completed subtasks
        </Link>
      </div>

      {groups.length === 0 && <div className="card"><div className="empty">Nothing completed in this period.</div></div>}

      {groups.map((g) => (
        <section key={g.label} style={{ marginBottom: 24 }}>
          <div className="sec-head">
            <h2 className="sec">{g.label}</h2>
            <span className="mono small muted">{g.items.length} completed</span>
          </div>
          <div className="card tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Job</th>
                  {!employeeId && <th>Assigned to</th>}
                  <th>Created</th>
                  <th>Completed</th>
                  <th>Duration</th>
                  <th>Completed by</th>
                  <th>Subtasks</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {g.items.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', fontWeight: 500 }}>
                        <StatusIcon status="done" />
                        <span>
                          {t.title}
                          {t.ancestor_titles.length > 0 && (
                            <span className="small muted" style={{ display: 'block', fontWeight: 400 }}>
                              {t.ancestor_titles.join(' › ')}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    {!employeeId && <td>{t.employee_name}</td>}
                    <td className="num">{formatShort(t.created_at)}</td>
                    <td className="num">{formatShort(t.completed_at)}</td>
                    <td className="num">{formatDuration(t.created_at, t.completed_at)}</td>
                    <td>{t.completed_by_name}</td>
                    <td className="num">{t.desc_total ? `${t.desc_done} / ${t.desc_total}` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link href={`/tasks/${t.id}`} style={{ whiteSpace: 'nowrap', fontSize: 13 }}>View full history →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {tasks.length === 300 && <p className="small muted">Showing the 300 most recent. Narrow the dates to see more.</p>}
    </>
  );
}
