import Link from 'next/link';
import { requireManager } from '@/lib/auth';
import { getActivity, listEmployees } from '@/lib/queries';
import { addDays, isDateKey, isUuid, localDayStartISO } from '@/lib/format';
import { ActivityByDay } from '@/components/Activity';

export const metadata = { title: 'Activity' };

type SP = Record<string, string | undefined>;
const PAGE = 50;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireManager();
  const sp = await searchParams;
  const employeeId = isUuid(sp.employee) ? sp.employee : undefined;
  const from = isDateKey(sp.from) ? sp.from : undefined;
  const to = isDateKey(sp.to) ? sp.to : undefined;
  const before = sp.before && /^\d+$/.test(sp.before) ? Number(sp.before) : undefined;

  const [events, employees] = await Promise.all([
    getActivity({
      employeeId,
      before,
      limit: PAGE,
      from: from ? localDayStartISO(from) : undefined,
      to: to ? localDayStartISO(addDays(to, 1)) : undefined,
    }),
    listEmployees({ includeInactive: true }),
  ]);

  const next = new URLSearchParams();
  if (employeeId) next.set('employee', employeeId);
  if (from) next.set('from', from);
  if (to) next.set('to', to);
  if (events.length === PAGE) next.set('before', String(events[events.length - 1].id));

  return (
    <>
      <div className="head">
        <div>
          <h1>Activity</h1>
          <div className="sub">Meaningful events across the team, newest first. Nothing here can be edited.</div>
        </div>
      </div>

      <form className="filters" method="get">
        <div className="field">
          <label htmlFor="a-emp">Employee</label>
          <select id="a-emp" name="employee" className="select" defaultValue={employeeId ?? ''}>
            <option value="">Whole team</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="a-from">From</label>
          <input id="a-from" name="from" type="date" className="input" defaultValue={from} />
        </div>
        <div className="field">
          <label htmlFor="a-to">To</label>
          <input id="a-to" name="to" type="date" className="input" defaultValue={to} />
        </div>
        <button className="btn" type="submit">Apply</button>
        {(employeeId || from || to || before) && <Link className="btn ghost" href="/activity">Reset</Link>}
      </form>

      {events.length === 0 && <div className="card"><div className="empty">No activity in this period.</div></div>}
      <div style={{ maxWidth: 900 }}>
        <ActivityByDay events={events} />
        {events.length === PAGE && (
          <div style={{ marginTop: 16 }}>
            <Link className="btn" href={`/activity?${next.toString()}`}>Older activity →</Link>
          </div>
        )}
      </div>
    </>
  );
}
