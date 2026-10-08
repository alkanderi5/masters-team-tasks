-- =====================================================================
-- Team Tasks — functions
-- Every write goes through one of these functions. Each one checks
-- permission, locks the task row, updates state and appends history in
-- a single transaction. The browser cannot write to tables directly.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------
create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees where user_id = auth.uid() and active
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employees
    where user_id = auth.uid() and active and role = 'manager'
  )
$$;

-- Roots of every task tree the current employee takes part in.
-- SECURITY DEFINER so the tasks policy can use it without recursing.
create or replace function public.my_root_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select root_task_id from public.tasks
   where employee_id = public.current_employee_id()
  union
  select root_task_id from public.task_history
   where performed_by = public.current_employee_id()
$$;

-- Internal: who is calling. Raises if not an active employee.
create or replace function public._actor()
returns public.employees language plpgsql stable security definer set search_path = public as $$
declare v public.employees;
begin
  select * into v from public.employees where user_id = auth.uid() and active;
  if not found then
    raise exception 'Not authorised: no active employee account';
  end if;
  return v;
end $$;

-- Internal: append one history event.
create or replace function public._log(
  p_task public.tasks,
  p_action public.task_action,
  p_actor uuid,
  p_old text default null,
  p_new text default null,
  p_note text default null,
  p_meta jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.task_history
    (task_id, root_task_id, employee_id, action, old_value, new_value, note, metadata, performed_by)
  values
    (p_task.id, p_task.root_task_id, p_task.employee_id, p_action, p_old, p_new, p_note,
     coalesce(p_meta, '{}'::jsonb), p_actor)
$$;

-- Internal: true when a done/cancelled ancestor has closed this task's branch.
create or replace function public._ancestor_closed(p_task public.tasks)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tasks a
    where a.id = any (p_task.path) and a.id <> p_task.id
      and a.status in ('done', 'cancelled')
  )
$$;

create or replace function public._status_label(p public.task_status)
returns text language sql immutable as $$
  select case p
    when 'not_started' then 'Not started'
    when 'in_progress' then 'In progress'
    when 'blocked'     then 'Blocked'
    when 'done'        then 'Done'
    when 'cancelled'   then 'Cancelled'
  end
$$;

-- Internal: load + lock a task and check the caller may act on it.
create or replace function public._lock_task(p_task_id uuid, p_actor public.employees, p_need_manager boolean)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare v public.tasks;
begin
  select * into v from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found';
  end if;
  if p_need_manager and p_actor.role <> 'manager' then
    raise exception 'Only a manager can do this';
  end if;
  if p_actor.role <> 'manager' and v.employee_id <> p_actor.id then
    raise exception 'You can only change tasks assigned to you';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- First-run setup: the very first signed-in user becomes a manager.
-- Does nothing once any manager exists.
-- ---------------------------------------------------------------------
create or replace function public.bootstrap_first_manager(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  perform pg_advisory_xact_lock(hashtext('bootstrap_first_manager'));
  if exists (select 1 from public.employees where role = 'manager') then
    raise exception 'Setup is already complete';
  end if;
  insert into public.employees (user_id, name, role)
  values (auth.uid(), btrim(p_name), 'manager')
  on conflict (user_id) do update set role = 'manager', active = true
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.needs_bootstrap()
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.employees where role = 'manager')
$$;

-- ---------------------------------------------------------------------
-- Employees (manager only). Login accounts are created by the server
-- with the service key, then linked here through p_user_id.
-- ---------------------------------------------------------------------
create or replace function public.create_employee(
  p_name text, p_position text, p_role public.app_role, p_user_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare a public.employees; v_id uuid;
begin
  a := public._actor();
  if a.role <> 'manager' then raise exception 'Only a manager can do this'; end if;
  insert into public.employees (name, position, role, user_id)
  values (btrim(p_name), nullif(btrim(coalesce(p_position, '')), ''), coalesce(p_role, 'employee'), p_user_id)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.update_employee(
  p_id uuid, p_name text, p_position text, p_role public.app_role, p_active boolean
) returns void language plpgsql security definer set search_path = public as $$
declare a public.employees;
begin
  a := public._actor();
  if a.role <> 'manager' then raise exception 'Only a manager can do this'; end if;
  if p_id = a.id and (p_active = false or p_role <> 'manager') then
    raise exception 'You cannot deactivate or demote your own account';
  end if;
  update public.employees
     set name = btrim(p_name),
         position = nullif(btrim(coalesce(p_position, '')), ''),
         role = p_role,
         active = p_active
   where id = p_id;
  if not found then raise exception 'Employee not found'; end if;
end $$;

create or replace function public.link_employee_user(p_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.employees;
begin
  a := public._actor();
  if a.role <> 'manager' then raise exception 'Only a manager can do this'; end if;
  update public.employees set user_id = p_user_id where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- Create a task or subtask
-- ---------------------------------------------------------------------
create or replace function public.create_task(
  p_title text,
  p_description text default null,
  p_employee_id uuid default null,
  p_parent_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  a public.employees;
  v_parent public.tasks;
  v_emp public.employees;
  v_task public.tasks;
begin
  a := public._actor();

  if p_parent_id is null then
    if a.role <> 'manager' then
      raise exception 'Only a manager can create main tasks';
    end if;
    if p_employee_id is null then
      raise exception 'Choose who the task is assigned to';
    end if;
  else
    select * into v_parent from public.tasks where id = p_parent_id for update;
    if not found then raise exception 'Parent task not found'; end if;
    if v_parent.status in ('done', 'cancelled') or public._ancestor_closed(v_parent) then
      raise exception 'Reopen the parent task before adding subtasks';
    end if;
    if a.role <> 'manager' then
      if v_parent.employee_id <> a.id then
        raise exception 'You can only add subtasks to your own tasks';
      end if;
      if p_employee_id is not null and p_employee_id <> a.id then
        raise exception 'Only a manager can assign work to someone else';
      end if;
    end if;
  end if;

  select * into v_emp from public.employees
   where id = coalesce(p_employee_id, v_parent.employee_id);
  if not found or not v_emp.active then
    raise exception 'Choose an active employee';
  end if;

  insert into public.tasks (title, description, employee_id, parent_task_id, created_by)
  values (btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), v_emp.id, p_parent_id, a.id)
  returning * into v_task;

  if p_parent_id is null then
    perform public._log(v_task, 'TASK_CREATED', a.id, null, v_task.title);
  else
    perform public._log(v_task, 'SUBTASK_CREATED', a.id, null, v_task.title, null,
      jsonb_build_object('parent_id', v_parent.id, 'parent_title', v_parent.title));
  end if;

  if p_parent_id is null or v_emp.id <> v_parent.employee_id then
    perform public._log(v_task, 'TASK_ASSIGNED', a.id, null, v_emp.name, null,
      jsonb_build_object('employee_id', v_emp.id));
  end if;

  return v_task.id;
end $$;

-- ---------------------------------------------------------------------
-- Edit title / description (manager)
-- ---------------------------------------------------------------------
create or replace function public.update_task_details(
  p_task_id uuid, p_title text, p_description text
) returns void language plpgsql security definer set search_path = public as $$
declare a public.employees; v public.tasks; v_new_title text; v_new_desc text;
begin
  a := public._actor();
  v := public._lock_task(p_task_id, a, true);
  v_new_title := btrim(p_title);
  v_new_desc  := nullif(btrim(coalesce(p_description, '')), '');

  if v_new_title is distinct from v.title then
    update public.tasks set title = v_new_title where id = v.id;
    perform public._log(v, 'TASK_TITLE_CHANGED', a.id, v.title, v_new_title);
  end if;
  if v_new_desc is distinct from v.description then
    update public.tasks set description = v_new_desc where id = v.id;
    perform public._log(v, 'TASK_DESCRIPTION_CHANGED', a.id, v.description, v_new_desc);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Reassign (manager). Unfinished subtasks that belonged to the same
-- person move with the task.
-- ---------------------------------------------------------------------
create or replace function public.reassign_task(
  p_task_id uuid, p_employee_id uuid, p_include_subtasks boolean default true
) returns void language plpgsql security definer set search_path = public as $$
declare
  a public.employees; v public.tasks; v_old public.employees; v_new public.employees; c public.tasks;
begin
  a := public._actor();
  v := public._lock_task(p_task_id, a, true);
  select * into v_new from public.employees where id = p_employee_id;
  if not found or not v_new.active then raise exception 'Choose an active employee'; end if;
  if v_new.id = v.employee_id then return; end if;
  select * into v_old from public.employees where id = v.employee_id;

  update public.tasks set employee_id = v_new.id where id = v.id returning * into v;
  perform public._log(v, 'TASK_REASSIGNED', a.id, v_old.name, v_new.name, null,
    jsonb_build_object('from_employee_id', v_old.id, 'to_employee_id', v_new.id));

  if p_include_subtasks then
    for c in
      select * from public.tasks
       where path @> array[v.id] and id <> v.id
         and employee_id = v_old.id
         and status in ('not_started', 'in_progress', 'blocked')
       order by cardinality(path)
       for update
    loop
      update public.tasks set employee_id = v_new.id where id = c.id returning * into c;
      perform public._log(c, 'TASK_REASSIGNED', a.id, v_old.name, v_new.name, null,
        jsonb_build_object('from_employee_id', v_old.id, 'to_employee_id', v_new.id, 'via_parent', v.id));
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Change status between Not started / In progress / Blocked.
-- Done uses complete_task; Cancelled uses cancel_task.
-- ---------------------------------------------------------------------
create or replace function public.set_task_status(
  p_task_id uuid, p_status public.task_status, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  a public.employees; v public.tasks; v_reason text; v_old public.task_status;
begin
  a := public._actor();
  v := public._lock_task(p_task_id, a, false);
  v_old := v.status;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  if p_status not in ('not_started', 'in_progress', 'blocked') then
    raise exception 'Use Job Done or Cancel for that';
  end if;
  if v.status in ('done', 'cancelled') then
    raise exception 'This task is closed. A manager can reopen it.';
  end if;
  if public._ancestor_closed(v) then
    raise exception 'A parent task is closed. Reopen it first.';
  end if;

  -- Same status: only a changed block reason is meaningful.
  if p_status = v.status then
    if p_status = 'blocked' and v_reason is not null and v_reason <> v.blocked_reason then
      update public.tasks set blocked_reason = v_reason where id = v.id;
      perform public._log(v, 'TASK_BLOCK_REASON_CHANGED', a.id, v.blocked_reason, v_reason, v_reason);
    end if;
    return;
  end if;

  if p_status = 'blocked' then
    if v_reason is null then
      raise exception 'Enter the reason this task is blocked';
    end if;
    update public.tasks
       set status = 'blocked', blocked_reason = v_reason, blocked_at = now()
     where id = v.id returning * into v;
    perform public._log(v, 'TASK_BLOCKED', a.id,
      public._status_label(v_old), 'Blocked', v_reason,
      jsonb_build_object('from_status', v_old));
    return;
  end if;

  update public.tasks
     set status = p_status,
         blocked_reason = null,
         blocked_at = null,
         started_at = case when p_status = 'in_progress' then coalesce(started_at, now()) else started_at end
   where id = v.id;

  if v_old = 'blocked' then
    perform public._log(v, 'TASK_UNBLOCKED', a.id, 'Blocked', public._status_label(p_status), null,
      jsonb_build_object('previous_reason', v.blocked_reason,
                         'blocked_for_seconds', floor(extract(epoch from now() - v.blocked_at)),
                         'to_status', p_status));
  else
    perform public._log(v, 'TASK_STATUS_CHANGED', a.id,
      public._status_label(v_old), public._status_label(p_status), null,
      jsonb_build_object('from_status', v_old, 'to_status', p_status));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Job Done. Without p_force, refuses when unfinished subtasks exist and
-- returns them so the UI can warn. Never marks children Done.
-- ---------------------------------------------------------------------
create or replace function public.complete_task(p_task_id uuid, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.employees; v public.tasks; v_count int; v_items jsonb;
begin
  a := public._actor();
  v := public._lock_task(p_task_id, a, false);

  if v.status = 'done' then raise exception 'This task is already done'; end if;
  if v.status = 'cancelled' then raise exception 'This task was cancelled. Reopen it first.'; end if;
  if public._ancestor_closed(v) then raise exception 'A parent task is closed. Reopen it first.'; end if;

  select count(*),
         coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'status', d.status)
                    order by cardinality(d.path), d.created_at)
                  filter (where d.rn <= 10), '[]'::jsonb)
    into v_count, v_items
    from (
      select t.*, row_number() over (order by cardinality(t.path), t.created_at) rn
        from public.tasks t
       where t.path @> array[v.id] and t.id <> v.id
         and t.status in ('not_started', 'in_progress', 'blocked')
    ) d;

  if v_count > 0 and not coalesce(p_force, false) then
    return jsonb_build_object('ok', false, 'needs_confirmation', true,
                              'unfinished', v_count, 'items', v_items);
  end if;

  update public.tasks
     set status = 'done',
         completed_at = now(),
         completed_by = a.id,
         blocked_reason = null,
         blocked_at = null
   where id = v.id;

  perform public._log(v, 'TASK_COMPLETED', a.id, public._status_label(v.status), 'Done', null,
    jsonb_build_object('from_status', v.status, 'forced', v_count > 0, 'unfinished_subtasks', v_count,
                       'blocked_reason', v.blocked_reason));

  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- Reopen a Done or Cancelled task (manager). Earlier events are kept.
-- ---------------------------------------------------------------------
create or replace function public.reopen_task(p_task_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.employees; v public.tasks; v_to public.task_status;
begin
  a := public._actor();
  v := public._lock_task(p_task_id, a, true);
  if v.status not in ('done', 'cancelled') then
    raise exception 'Only completed or cancelled tasks can be reopened';
  end if;
  if public._ancestor_closed(v) then
    raise exception 'A parent task is closed. Reopen the parent first.';
  end if;

  v_to := case when v.status = 'done' or v.started_at is not null
               then 'in_progress'::public.task_status
               else 'not_started'::public.task_status end;

  update public.tasks
     set status = v_to,
         started_at = case when v_to = 'in_progress' then coalesce(started_at, now()) else started_at end,
         completed_at = null, completed_by = null,
         cancelled_at = null, cancelled_by = null
   where id = v.id;

  perform public._log(v, 'TASK_REOPENED', a.id, public._status_label(v.status), public._status_label(v_to),
    nullif(btrim(coalesce(p_note, '')), ''),
    jsonb_build_object('previous_status', v.status,
                       'previous_completed_at', v.completed_at, 'previous_completed_by', v.completed_by,
                       'previous_cancelled_at', v.cancelled_at));
end $$;

-- ---------------------------------------------------------------------
-- Cancel a task created by mistake (manager). Nothing is deleted.
-- ---------------------------------------------------------------------
create or replace function public.cancel_task(p_task_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.employees; v public.tasks;
begin
  a := public._actor();
  v := public._lock_task(p_task_id, a, true);
  if v.status in ('done', 'cancelled') then
    raise exception 'This task is already closed';
  end if;
  update public.tasks
     set status = 'cancelled', cancelled_at = now(), cancelled_by = a.id,
         blocked_reason = null, blocked_at = null
   where id = v.id;
  perform public._log(v, 'TASK_CANCELLED', a.id, public._status_label(v.status), 'Cancelled',
    nullif(btrim(coalesce(p_note, '')), ''), jsonb_build_object('from_status', v.status));
end $$;
