export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type AppRole = 'manager' | 'employee';

export type TaskAction =
  | 'TASK_CREATED'
  | 'SUBTASK_CREATED'
  | 'TASK_ASSIGNED'
  | 'TASK_REASSIGNED'
  | 'TASK_TITLE_CHANGED'
  | 'TASK_DESCRIPTION_CHANGED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_BLOCKED'
  | 'TASK_BLOCK_REASON_CHANGED'
  | 'TASK_UNBLOCKED'
  | 'TASK_COMPLETED'
  | 'TASK_REOPENED'
  | 'TASK_CANCELLED';

export interface Employee {
  id: string;
  user_id: string | null;
  name: string;
  position: string | null;
  role: AppRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** A row of the task_list view. */
export interface Task {
  id: string;
  title: string;
  description: string | null;
  employee_id: string;
  parent_task_id: string | null;
  root_task_id: string;
  path: string[];
  status: TaskStatus;
  blocked_reason: string | null;
  blocked_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  depth: number;
  employee_name: string;
  parent_employee_id: string | null;
  completed_by_name: string | null;
  created_by_name: string | null;
  children_total: number;
  children_done: number;
  children_blocked: number;
  desc_total: number;
  desc_done: number;
  ancestor_titles: string[];
  ancestor_closed: boolean;
  is_active: boolean;
}

/** A row of the activity_feed view. */
export interface ActivityEvent {
  id: number;
  task_id: string;
  root_task_id: string;
  employee_id: string | null;
  action: TaskAction;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  performed_by: string;
  created_at: string;
  task_title: string;
  task_path: string[];
  parent_task_id: string | null;
  root_title: string;
  performed_by_name: string;
  employee_name: string | null;
}

export interface DashboardCounts {
  employees: number;
  jobs_open: number;
  jobs_not_started: number;
  jobs_in_progress: number;
  jobs_with_blocked: number;
  jobs_completed_today: number;
  tasks_open: number;
  tasks_not_started: number;
  tasks_in_progress: number;
  tasks_blocked: number;
  tasks_completed_today: number;
}

export interface EmployeeSummary {
  id: string;
  name: string;
  position: string | null;
  role: AppRole;
  active: boolean;
  jobs_open: number;
  jobs_in_progress: number;
  jobs_with_blocked: number;
  jobs_completed_today: number;
  tasks_open: number;
  tasks_blocked: number;
  tasks_completed_today: number;
  current_task_id: string | null;
  current_task_title: string | null;
}

export interface CompleteResult {
  ok: boolean;
  needs_confirmation?: boolean;
  unfinished?: number;
  items?: { id: string; title: string; status: TaskStatus }[];
}

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };
