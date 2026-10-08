-- =====================================================================
-- Team Tasks — read views, dashboard functions, RLS and grants
-- Views use security_invoker so Row Level Security still applies.
-- =====================================================================

-- ---------------------------------------------------------------------
-- task_state: lean per-task state used for counting.
-- is_active = unfinished AND no done/cancelled ancestor.
-- ---------------------------------------------------------------------
create view public.task_state with (security_invoker = true) as
select
  t.id, t.root_task_id, t.parent_task_id, t.employee_id, t.status,
  t.started_at, t.blocked_at, t.completed_at, t.title,
  p.employee_id as parent_employee_id,
  (t.parent_task_id is null) as is_root,
  -- An "entry point" is where a person's work starts: a main job, or a
  -- subtask delegated to someone other than the parent's owner.
  (t.parent_task_id is null or p.employee_id <> t.employee_id) as is_entry,
  exists (
    select 1 from public.tasks a
    where a.id = any (t.path) and a.id <> t.id and a.status in ('done', 'cancelled')
  ) as ancestor_closed
from public.tasks t
left join public.tasks p on p.id = t.parent_task_id;

-- ---------------------------------------------------------------------
-- task_list: everything a task row on screen needs.
-- ---------------------------------------------------------------------
create view public.task_list with (security_invoker = true) as
select
  t.id, t.title, t.description, t.employee_id, t.parent_task_id, t.root_task_id, t.path,
  t.status, t.blocked_reason, t.blocked_at, t.started_at, t.completed_at, t.completed_by,
  t.cancelled_at, t.cancelled_by, t.created_by, t.created_at, t.updated_at,
  cardinality(t.path)                      as depth,
  e.name                                   as employee_name,
  p.employee_id                            as parent_employee_id,
  cb.name                                  as completed_by_name,
  cr.name                                  as created_by_name,
  coalesce(ch.total, 0)::int               as children_total,
  coalesce(ch.done, 0)::int                as children_done,
  coalesce(ch.blocked, 0)::int             as children_blocked,
  coalesce(ds.total, 0)::int               as desc_total,
  coalesce(ds.done, 0)::int                as desc_done,
  coalesce(anc.titles, '{}')               as ancestor_titles,
  coalesce(anc.closed, false)              as ancestor_closed,
  (t.status in ('not_started', 'in_progress', 'blocked') and not coalesce(anc.closed, false)) as is_active
from public.tasks t
join public.employees e        on e.id = t.employee_id
left join public.tasks p       on p.id = t.parent_task_id
left join public.employees cb  on cb.id = t.completed_by
left join public.employees cr  on cr.id = t.created_by
left join lateral (
  select count(*) filter (where c.status <> 'cancelled') as total,
         count(*) filter (where c.status = 'done')       as done,
         count(*) filter (where c.status = 'blocked')    as blocked
  from public.tasks c where c.parent_task_id = t.id
) ch on true
left join lateral (
  select count(*) filter (where d.status <> 'cancelled') as total,
         count(*) filter (where d.status = 'done')       as done
  from public.tasks d where d.path @> array[t.id] and d.id <> t.id
) ds on true
left join lateral (
  select array_agg(a.title order by u.ord)                       as titles,
         bool_or(a.status in ('done', 'cancelled'))              as closed
  from unnest(t.path) with ordinality as u(id, ord)
  join public.tasks a on a.id = u.id
  where a.id <> t.id
) anc on true;

-- ---------------------------------------------------------------------
-- activity_feed: history events with the names needed to read them.
-- ---------------------------------------------------------------------
create view public.activity_feed with (security_invoker = true) as
select
  h.id, h.task_id, h.root_task_id, h.employee_id, h.action, h.old_value, h.new_value,
  h.note, h.metadata, h.performed_by, h.created_at,
  t.title       as task_title,
  t.path        as task_path,
  t.parent_task_id,
  r.title       as root_title,
  pb.name       as performed_by_name,
  ow.name       as employee_name
from public.task_history h
join public.tasks t          on t.id = h.task_id
join public.tasks r          on r.id = h.root_task_id
join public.employees pb     on pb.id = h.performed_by
left join public.employees ow on ow.id = h.employee_id;

-- ---------------------------------------------------------------------
-- Dashboard KPIs. Jobs = main (root) tasks: management workload.
-- Tasks = every level: execution workload. Blocked counts any level.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_counts()
returns jsonb language sql stable security invoker set search_path = public as $$
  with s as (
    select *, (status in ('not_started','in_progress','blocked') and not ancestor_closed) as act
    from public.task_state
  ), today as (select public.local_day_start() as d)
  select jsonb_build_object(
    'employees',              (select count(*) from public.employees where active),
    'jobs_open',              count(*) filter (where is_root and act),
    'jobs_not_started',       count(*) filter (where is_root and act and status = 'not_started'),
    'jobs_in_progress',       count(*) filter (where is_root and act and status = 'in_progress'),
    'jobs_with_blocked',      (select count(distinct root_task_id) from s where act and status = 'blocked'),
    'jobs_completed_today',   count(*) filter (where is_root and status = 'done' and completed_at >= (select d from today)),
    'tasks_open',             count(*) filter (where act),
    'tasks_not_started',      count(*) filter (where act and status = 'not_started'),
    'tasks_in_progress',      count(*) filter (where act and status = 'in_progress'),
    'tasks_blocked',          count(*) filter (where act and status = 'blocked'),
    'tasks_completed_today',  count(*) filter (where status = 'done' and completed_at >= (select d from today))
  )
  from s
$$;

-- Per-employee summary for the dashboard cards.
create or replace function public.employee_summaries()
returns table (
  id uuid, name text, "position" text, role public.app_role, active boolean,
  jobs_open int, jobs_in_progress int, jobs_with_blocked int, jobs_completed_today int,
  tasks_open int, tasks_blocked int, tasks_completed_today int,
  current_task_id uuid, current_task_title text
) language sql stable security invoker set search_path = public as $$
  with s as (
    select *, (status in ('not_started','in_progress','blocked') and not ancestor_closed) as act
    from public.task_state
  ), d as (select public.local_day_start() as day_start)
  select
    e.id, e.name, e.position, e.role, e.active,
    (select count(*) from s where s.employee_id = e.id and s.is_entry and s.act)::int,
    (select count(*) from s where s.employee_id = e.id and s.is_entry and s.act and s.status = 'in_progress')::int,
    (select count(distinct x.id) from s x
       where x.employee_id = e.id and x.is_entry and x.act
         and exists (select 1 from s b join public.tasks bt on bt.id = b.id
                      where b.act and b.status = 'blocked' and bt.path @> array[x.id]))::int,
    (select count(*) from s where s.employee_id = e.id and s.is_entry and s.status = 'done'
       and s.completed_at >= (select day_start from d))::int,
    (select count(*) from s where s.employee_id = e.id and s.act)::int,
    (select count(*) from s where s.employee_id = e.id and s.act and s.status = 'blocked')::int,
    (select count(*) from s where s.employee_id = e.id and s.status = 'done'
       and s.completed_at >= (select day_start from d))::int,
    cur.id, cur.title
  from public.employees e
  left join lateral (
    select s.id, s.title from s
    where s.employee_id = e.id and s.act and s.status = 'in_progress'
    order by s.started_at desc nulls last limit 1
  ) cur on true
  where e.active
  order by e.name
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.employees    enable row level security;
alter table public.tasks        enable row level security;
alter table public.task_history enable row level security;

create policy employees_read on public.employees
  for select to authenticated
  using (public.current_employee_id() is not null or user_id = auth.uid());

create policy tasks_read on public.tasks
  for select to authenticated
  using (public.is_manager() or root_task_id in (select public.my_root_ids()));

create policy task_history_read on public.task_history
  for select to authenticated
  using (public.is_manager() or root_task_id in (select public.my_root_ids()));

-- No insert/update/delete policies: all writes go through functions.
revoke insert, update, delete, truncate on public.employees, public.tasks, public.task_history
  from anon, authenticated;
revoke all on public.employees, public.tasks, public.task_history from anon;
revoke all on public.task_state, public.task_list, public.activity_feed from anon;
grant select on public.employees, public.tasks, public.task_history to authenticated;
grant select on public.task_state, public.task_list, public.activity_feed to authenticated;

-- ---------------------------------------------------------------------
-- Function grants: internal helpers are not callable from the API.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.app_timezone(),
  public.local_day_start(timestamptz),
  public.current_employee_id(),
  public.is_manager(),
  public.my_root_ids(),
  public.needs_bootstrap(),
  public.bootstrap_first_manager(text),
  public.create_employee(text, text, public.app_role, uuid),
  public.update_employee(uuid, text, text, public.app_role, boolean),
  public.link_employee_user(uuid, uuid),
  public.create_task(text, text, uuid, uuid),
  public.update_task_details(uuid, text, text),
  public.reassign_task(uuid, uuid, boolean),
  public.set_task_status(uuid, public.task_status, text),
  public.complete_task(uuid, boolean),
  public.reopen_task(uuid, text),
  public.cancel_task(uuid, text),
  public.dashboard_counts(),
  public.employee_summaries()
to authenticated;

-- Employees are never deleted either; deactivate instead.
create or replace function public.employees_no_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'Employees are never deleted. Deactivate them instead.';
end $$;

create trigger employees_no_delete
before delete on public.employees
for each row execute function public.employees_no_delete();
