import 'server-only';
import { createClient } from './supabase/server';
import type { ActivityEvent, DashboardCounts, Employee, EmployeeSummary, Task, TaskStatus } from './types';
import { ilikePattern } from './format';

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/* ---------------------------------------------------------------- */
/* Employees                                                         */
/* ---------------------------------------------------------------- */

export async function listEmployees(opts: { includeInactive?: boolean } = {}): Promise<Employee[]> {
  const sb = await createClient();
  let q = sb.from('employees').select('*').order('name');
  if (!opts.includeInactive) q = q.eq('active', true);
  return must(await q) as Employee[];
}

export async function getEmployee(id: string): Promise<Employee | null> {
  const sb = await createClient();
  const { data } = await sb.from('employees').select('*').eq('id', id).maybeSingle();
  return (data as Employee) ?? null;
}

export async function getEmployeeSummaries(): Promise<EmployeeSummary[]> {
  const sb = await createClient();
  return must(await sb.rpc('employee_summaries')) as EmployeeSummary[];
}

export async function getDashboardCounts(): Promise<DashboardCounts> {
  const sb = await createClient();
  return must(await sb.rpc('dashboard_counts')) as DashboardCounts;
}

/* ---------------------------------------------------------------- */
/* Tasks                                                             */
/* ---------------------------------------------------------------- */

export async function getTask(id: string): Promise<Task | null> {
  const sb = await createClient();
  const { data } = await sb.from('task_list').select('*').eq('id', id).maybeSingle();
  return (data as Task) ?? null;
}

/** The task and everything below it, ordered by depth then creation. */
export async function getSubtree(id: string): Promise<Task[]> {
  const sb = await createClient();
  const rows = must(
    await sb.from('task_list').select('*').contains('path', [id]).order('depth').order('created_at'),
  ) as Task[];
  return rows;
}

/** Work that starts with this employee: main jobs + subtasks delegated to them. */
export async function getEntryTasks(
  employeeId: string,
  opts: { active?: boolean; status?: TaskStatus; limit?: number; completedDesc?: boolean },
): Promise<Task[]> {
  const sb = await createClient();
  let q = sb
    .from('task_list')
    .select('*')
    .eq('employee_id', employeeId)
    .or(`parent_task_id.is.null,parent_employee_id.neq.${employeeId}`);
  if (opts.active !== undefined) q = q.eq('is_active', opts.active);
  if (opts.status) q = q.eq('status', opts.status);
  q = opts.completedDesc ? q.order('completed_at', { ascending: false }) : q.order('created_at', { ascending: true });
  if (opts.limit) q = q.limit(opts.limit);
  return must(await q) as Task[];
}

export async function getBlockedTasks(employeeId?: string): Promise<Task[]> {
  const sb = await createClient();
  let q = sb
    .from('task_list')
    .select('*')
    .eq('status', 'blocked')
    .eq('is_active', true)
    .order('blocked_at', { ascending: true });
  if (employeeId) q = q.eq('employee_id', employeeId);
  return must(await q) as Task[];
}

export async function getActiveTasks(f: {
  employeeId?: string;
  status?: TaskStatus;
  createdFrom?: string;
  createdTo?: string;
  q?: string;
  rootsOnly?: boolean;
}): Promise<Task[]> {
  const sb = await createClient();
  let q = sb.from('task_list').select('*').eq('is_active', true);
  if (f.employeeId) q = q.eq('employee_id', f.employeeId);
  if (f.status) q = q.eq('status', f.status);
  if (f.createdFrom) q = q.gte('created_at', f.createdFrom);
  if (f.createdTo) q = q.lt('created_at', f.createdTo);
  if (f.q) q = q.ilike('title', ilikePattern(f.q));
  if (f.rootsOnly) q = q.is('parent_task_id', null);
  q = q.order('created_at', { ascending: false }).limit(300);
  return must(await q) as Task[];
}

export async function getCompletedTasks(f: {
  employeeId?: string;
  from?: string;
  to?: string;
  q?: string;
  includeSubtasks?: boolean;
}): Promise<Task[]> {
  const sb = await createClient();
  let q = sb.from('task_list').select('*').eq('status', 'done');
  if (f.employeeId) q = q.eq('employee_id', f.employeeId);
  if (!f.includeSubtasks) {
    q = f.employeeId
      ? q.or(`parent_task_id.is.null,parent_employee_id.neq.${f.employeeId}`)
      : q.is('parent_task_id', null);
  }
  if (f.from) q = q.gte('completed_at', f.from);
  if (f.to) q = q.lt('completed_at', f.to);
  if (f.q) q = q.ilike('title', ilikePattern(f.q));
  q = q.order('completed_at', { ascending: false }).limit(300);
  return must(await q) as Task[];
}

export async function searchAll(term: string): Promise<{ tasks: Task[]; employees: Employee[] }> {
  const sb = await createClient();
  const pattern = ilikePattern(term);
  const [tasks, employees] = await Promise.all([
    sb.from('task_list').select('*').ilike('title', pattern).order('updated_at', { ascending: false }).limit(40),
    sb.from('employees').select('*').ilike('name', pattern).order('name').limit(20),
  ]);
  return { tasks: must(tasks) as Task[], employees: must(employees) as Employee[] };
}

/* ---------------------------------------------------------------- */
/* Activity                                                          */
/* ---------------------------------------------------------------- */

export async function getTaskActivity(taskId: string, ascending = false): Promise<ActivityEvent[]> {
  const sb = await createClient();
  return must(
    await sb
      .from('activity_feed')
      .select('*')
      .contains('task_path', [taskId])
      .order('id', { ascending })
      .limit(500),
  ) as ActivityEvent[];
}

export async function getActivity(f: {
  employeeId?: string;
  from?: string;
  to?: string;
  before?: number;
  limit?: number;
}): Promise<ActivityEvent[]> {
  const sb = await createClient();
  let q = sb.from('activity_feed').select('*');
  if (f.employeeId) q = q.or(`performed_by.eq.${f.employeeId},employee_id.eq.${f.employeeId}`);
  if (f.from) q = q.gte('created_at', f.from);
  if (f.to) q = q.lt('created_at', f.to);
  if (f.before) q = q.lt('id', f.before);
  q = q.order('id', { ascending: false }).limit(f.limit ?? 50);
  return must(await q) as ActivityEvent[];
}
