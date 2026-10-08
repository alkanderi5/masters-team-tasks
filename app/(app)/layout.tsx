import { requireMe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Sidebar, type NavItem } from '@/components/Sidebar';

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
        { href: '/', label: 'Dashboard' },
        { href: '/employees', label: 'Employees' },
        { href: '/tasks', label: 'Tasks' },
        { href: '/blocked', label: 'Blocked', count: blocked ?? 0 },
        { href: '/history', label: 'History' },
        { href: '/activity', label: 'Activity' },
        { href: '/settings', label: 'Settings' },
      ]
    : [
        { href: `/employees/${me.employee.id}`, label: 'My work', match: [`/employees/${me.employee.id}`, '/tasks'] },
        { href: '/blocked', label: 'Blocked', count: blocked ?? 0 },
        { href: '/history', label: 'History' },
        { href: '/settings', label: 'Settings' },
      ];

  return (
    <div className="app">
      <Sidebar items={items} userLine={`${me.employee.name} · ${me.isManager ? 'Manager' : me.employee.position || 'Employee'}`} />
      <main className="main">
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
