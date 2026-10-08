import { requireMe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Sidebar, type NavItem } from '@/components/Sidebar';
import { Icon } from '@/components/Icon';
import { ThemeToggle } from '@/components/ThemeToggle';
import { greeting } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  const supabase = await createClient();

  // Blocked count for the sidebar badge (any level, active only).
  let q = supabase.from('task_list').select('id', { count: 'exact', head: true }).eq('status', 'blocked').eq('is_active', true);
  if (!me.isManager) q = q.eq('employee_id', me.employee.id);
  const { count: blocked } = await q;

  const items: NavItem[] = me.isManager
    ? [
        { href: '/', label: 'Dashboard', icon: 'dashboard' },
        { href: '/employees', label: 'Employees', icon: 'users' },
        { href: '/tasks', label: 'Tasks', icon: 'tasks' },
        { href: '/blocked', label: 'Blocked', icon: 'blocked', count: blocked ?? 0 },
        { href: '/history', label: 'History', icon: 'history' },
        { href: '/activity', label: 'Activity', icon: 'activity' },
        { href: '/settings', label: 'Settings', icon: 'settings' },
      ]
    : [
        { href: `/employees/${me.employee.id}`, label: 'My work', icon: 'work', match: [`/employees/${me.employee.id}`, '/tasks'] },
        { href: '/blocked', label: 'Blocked', icon: 'blocked', count: blocked ?? 0 },
        { href: '/history', label: 'History', icon: 'history' },
        { href: '/settings', label: 'Settings', icon: 'settings' },
      ];

  const role = me.isManager ? 'Manager' : me.employee.position || 'Employee';
  const initials = me.employee.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  return (
    <div className="app">
      <Sidebar items={items} />
      <main className="main">
        <header className="topbar">
          <div className="hello">{greeting()}, {me.employee.name.split(/\s+/)[0]}</div>
          <form action="/search" className="top-search" role="search">
            <label htmlFor="global-q" className="sr-only">Search tasks and employees</label>
            <Icon name="search" size={16} />
            <input id="global-q" name="q" type="search" placeholder="Search task, employee, notes" />
          </form>
          <div className="top-right">
            <ThemeToggle />
            <div className="me-chip">
              <span className="avatar" aria-hidden="true">{initials}</span>
              <span className="me-text">
                <span className="me-name">{me.employee.name}</span>
                <span className="me-role">{role}</span>
              </span>
            </div>
          </div>
        </header>
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
