import Link from 'next/link';
import { requireManager } from '@/lib/auth';
import { getActiveTasks, listEmployees } from '@/lib/queries';
import { addDays, isDateKey, isUuid, localDayStartISO } from '@/lib/format';
import type { TaskStatus } from '@/lib/types';
import { Empty } from '@/components/ui';
import { TaskRow } from '@/components/TaskRow';
import { AddTaskButton } from '@/components/TaskControls';

export const metadata = { title: 'Tasks' };

type SP = Record<string, string | undefined>;
const STATUSES: TaskStatus[] = ['not_started', 'in_progress', 'blocked'];

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireManager();
  const sp = await searchParams;
  const employeeId = isUuid(sp.employee) ? sp.employee : undefined;
  const status = STATUSES.includes(sp.status as TaskStatus) ? (sp.status as TaskStatus) : undefined;
  const from = isDateKey(sp.from) ? sp.from : undefined;
  const to = isDateKey(sp.to) ? sp.to : undefined;
  const q = (sp.q ?? '').trim().slice(0, 100) || undefined;
  const jobsOnly = sp.scope === 'jobs';

  const [tasks, employees] = await Promise.all([
    getActiveTasks({
      employeeId,
      status,
      q,
      rootsOnly: jobsOnly,
      createdFrom: from ? localDayStartISO(from) : undefined,
      createdTo: to ? localDayStartISO(addDays(to, 1)) : undefined,
    }),
    listEmployees(),
  ]);

  const link = (patch: SP) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return s ? `/tasks?${s}` : '/tasks';
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Tasks</h1>
          <div className="sub">All active work at every level. Completed work is in History.</div>
        </div>
        <AddTaskButton employees={employees.map((e) => ({ id: e.id, name: e.name }))} />
      </div>

      <form className="filters" method="get">
        {jobsOnly && <input type="hidden" name="scope" value="jobs" />}
        <div className="field grow">
          <label htmlFor="f-q">Search title</label>
          <input id="f-q" name="q" className="input" type="search" defaultValue={q} />
        </div>
        <div className="field">
          <label htmlFor="f-emp">Employee</label>
          <select id="f-emp" name="employee" className="select" defaultValue={employeeId ?? ''}>
            <option value="">Everyone</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-st">Status</label>
          <select id="f-st" name="status" className="select" defaultValue={status ?? ''}>
            <option value="">Any open status</option>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-from">Created from</label>
          <input id="f-from" name="from" type="date" className="input" defaultValue={from} />
        </div>
        <div className="field">
          <label htmlFor="f-to">to</label>
          <input id="f-to" name="to" type="date" className="input" defaultValue={to} />
        </div>
        <button className="btn" type="submit">Apply</button>
      </form>

      <div className="chips">
        <Link href={link({ scope: undefined })} className={`chip${!jobsOnly ? ' on' : ''}`}>All levels</Link>
        <Link href={link({ scope: 'jobs' })} className={`chip${jobsOnly ? ' on' : ''}`}>Main jobs only</Link>
        <span className="small muted">{tasks.length} task{tasks.length === 1 ? '' : 's'}{tasks.length === 300 ? ' (first 300)' : ''}</span>
      </div>

      <div className="card">
        {tasks.length === 0 && <Empty>No matching active tasks.</Empty>}
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} context="path" showOwner />
        ))}
      </div>
    </>
  );
}
