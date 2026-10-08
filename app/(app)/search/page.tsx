import Link from 'next/link';
import { requireMe } from '@/lib/auth';
import { searchAll } from '@/lib/queries';
import { Empty, SectionHead } from '@/components/ui';
import { TaskRow } from '@/components/TaskRow';

export const metadata = { title: 'Search' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireMe();
  const q = ((await searchParams).q ?? '').trim().slice(0, 100);
  const { tasks, employees } = q ? await searchAll(q) : { tasks: [], employees: [] };
  const people = me.isManager ? employees : [];

  return (
    <>
      <div className="head">
        <div>
          <h1>Search</h1>
          <div className="sub">Tasks at any level, including completed work{me.isManager ? ', and employees' : ''}.</div>
        </div>
      </div>
      <form method="get" className="filters" role="search">
        <div className="field grow">
          <label htmlFor="s-q">Search</label>
          <input id="s-q" name="q" type="search" className="input" defaultValue={q} autoFocus />
        </div>
        <button className="btn primary" type="submit">Search</button>
      </form>

      {q && (
        <div className="cols">
          <section className="col-main">
            <div>
              <SectionHead title={`Tasks · ${tasks.length}`} />
              <div className="card">
                {tasks.length === 0 && <Empty>No tasks match “{q}”.</Empty>}
                {tasks.map((t) => (
                  <TaskRow key={t.id} task={t} context="path" showOwner />
                ))}
              </div>
            </div>
          </section>
          {me.isManager && (
            <section className="col-side">
              <div>
                <SectionHead title={`Employees · ${people.length}`} />
                <div className="card">
                  {people.length === 0 && <Empty>No employees match.</Empty>}
                  {people.map((e) => (
                    <Link key={e.id} href={`/employees/${e.id}`} className="list-row">
                      <div className="grow">
                        <div className="title">{e.name}</div>
                        <div className="meta">{e.position || e.role}{e.active ? '' : ' · inactive'}</div>
                      </div>
                      <span className="chev" aria-hidden="true">›</span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
