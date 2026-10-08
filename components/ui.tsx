import Link from 'next/link';
import type { Task, TaskStatus } from '@/lib/types';
import { STATUS_LABEL, pct } from '@/lib/format';

export function StatusIcon({ status }: { status: TaskStatus }) {
  return (
    <span className={`s s-${status}`} role="img" aria-label={STATUS_LABEL[status]}>
      {status === 'blocked' ? '!' : status === 'done' ? '✓' : null}
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`badge b-${status}`}>
      {status === 'done' ? '✓ Completed' : STATUS_LABEL[status]}
    </span>
  );
}

export function Progress({ done, total, small }: { done: number; total: number; small?: boolean }) {
  if (total === 0) return null;
  const p = pct(done, total);
  return (
    <div className="prog" title={`${done} of ${total} completed`}>
      <span className="mono small" style={{ color: 'var(--text-2)' }}>
        {done} / {total}
        {!small && ` · ${p}%`}
      </span>
      <div className={`bar${small ? ' sm' : ''}`} aria-hidden="true">
        <span style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((c, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span className="sep">/</span>}
          {c.href && i < items.length - 1 ? (
            <Link href={c.href}>{c.label}</Link>
          ) : (
            <span className={i === items.length - 1 ? 'here' : undefined}>{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Crumbs for a task: Employee / ancestors… / task */
export function taskCrumbs(t: Task, opts: { includeSelf?: boolean; employeeLink?: boolean } = {}): Crumb[] {
  const items: Crumb[] = [
    { label: t.employee_name, href: opts.employeeLink === false ? undefined : `/employees/${t.employee_id}` },
  ];
  t.ancestor_titles.forEach((title, i) => items.push({ label: title, href: `/tasks/${t.path[i]}` }));
  if (opts.includeSelf !== false) items.push({ label: t.title });
  return items;
}

/** "Wednesday Tournament › Prepare Tables" for list rows. */
export function pathText(t: Task): string {
  return t.ancestor_titles.join(' › ');
}

export function SectionHead({ title, right, tone }: { title: string; right?: React.ReactNode; tone?: 'bl' | 'dn' }) {
  const color = tone === 'bl' ? 'var(--bl-text)' : tone === 'dn' ? 'var(--dn-text)' : undefined;
  return (
    <div className="sec-head">
      <h2 className="sec" style={{ color }}>{title}</h2>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
