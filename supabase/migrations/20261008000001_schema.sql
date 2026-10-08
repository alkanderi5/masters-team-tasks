-- =====================================================================
-- Team Tasks — V1 schema
-- Everything is a task (self-referencing), history is append-only.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.task_status as enum (
  'not_started', 'in_progress', 'blocked', 'done', 'cancelled'
);

create type public.app_role as enum ('manager', 'employee');

create type public.task_action as enum (
  'TASK_CREATED',
  'SUBTASK_CREATED',
  'TASK_ASSIGNED',
  'TASK_REASSIGNED',
  'TASK_TITLE_CHANGED',
  'TASK_DESCRIPTION_CHANGED',
  'TASK_STATUS_CHANGED',
  'TASK_BLOCKED',
  'TASK_BLOCK_REASON_CHANGED',
  'TASK_UNBLOCKED',
  'TASK_COMPLETED',
  'TASK_REOPENED',
  'TASK_CANCELLED'
);

-- ---------------------------------------------------------------------
-- Business timezone. "Completed today" uses this, not UTC.
-- Change the value here if the business moves.
-- ---------------------------------------------------------------------
create or replace function public.app_timezone()
returns text language sql immutable as $$ select 'Asia/Riyadh'::text $$;

create or replace function public.local_day_start(p_at timestamptz default now())
returns timestamptz language sql stable as $$
  select (date_trunc('day', p_at at time zone public.app_timezone()))
         at time zone public.app_timezone()
$$;

-- ---------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------
create table public.employees (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users (id) on delete set null,
  name        text not null check (length(btrim(name)) between 1 and 80),
  position    text check (position is null or length(position) <= 80),
  role        public.app_role not null default 'employee',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index employees_active_idx on public.employees (active, name);

-- ---------------------------------------------------------------------
-- tasks — current state of every task at every depth
-- ---------------------------------------------------------------------
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (length(btrim(title)) between 1 and 200),
  description     text check (description is null or length(description) <= 4000),
  employee_id     uuid not null references public.employees (id) on delete restrict,
  parent_task_id  uuid references public.tasks (id) on delete restrict,
  root_task_id    uuid not null references public.tasks (id) on delete restrict,
  path            uuid[] not null,              -- ancestors + self, root first
  status          public.task_status not null default 'not_started',
  blocked_reason  text check (blocked_reason is null or length(blocked_reason) <= 1000),
  blocked_at      timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  completed_by    uuid references public.employees (id) on delete restrict,
  cancelled_at    timestamptz,
  cancelled_by    uuid references public.employees (id) on delete restrict,
  created_by      uuid not null references public.employees (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint tasks_not_own_parent check (parent_task_id is distinct from id),
  constraint tasks_blocked_state check (
    (status = 'blocked') = (blocked_reason is not null and blocked_at is not null)
  ),
  constraint tasks_done_state check (
    (status = 'done') = (completed_at is not null and completed_by is not null)
  ),
  constraint tasks_cancelled_state check (
    (status = 'cancelled') = (cancelled_at is not null and cancelled_by is not null)
  )
);

create index tasks_employee_status_idx on public.tasks (employee_id, status);
create index tasks_parent_idx          on public.tasks (parent_task_id);
create index tasks_root_idx            on public.tasks (root_task_id);
create index tasks_path_gin            on public.tasks using gin (path);
create index tasks_blocked_idx         on public.tasks (blocked_at) where status = 'blocked';
create index tasks_completed_idx       on public.tasks (completed_at) where status = 'done';
create index tasks_title_trgm          on public.tasks using gin (title extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- task_history — append-only record of meaningful business events
-- ---------------------------------------------------------------------
create table public.task_history (
  id            bigint generated always as identity primary key,
  task_id       uuid not null references public.tasks (id) on delete restrict,
  root_task_id  uuid not null references public.tasks (id) on delete restrict,
  employee_id   uuid references public.employees (id) on delete restrict, -- owner at that moment
  action        public.task_action not null,
  old_value     text,
  new_value     text,
  note          text,
  metadata      jsonb not null default '{}'::jsonb,
  performed_by  uuid not null references public.employees (id) on delete restrict,
  created_at    timestamptz not null default now()
);

create index task_history_task_idx      on public.task_history (task_id, id);
create index task_history_root_idx      on public.task_history (root_task_id, id);
create index task_history_employee_idx  on public.task_history (employee_id, created_at desc);
create index task_history_performer_idx on public.task_history (performed_by, created_at desc);
create index task_history_created_idx   on public.task_history (created_at desc);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- Fill path/root from the parent. Parent is fixed at creation, so a task
-- can never become its own ancestor (cycles are impossible).
create or replace function public.tasks_before_insert()
returns trigger language plpgsql as $$
declare
  v_parent public.tasks%rowtype;
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  if new.parent_task_id is null then
    new.path := array[new.id];
    new.root_task_id := new.id;
  else
    select * into v_parent from public.tasks where id = new.parent_task_id;
    if not found then
      raise exception 'Parent task not found';
    end if;
    if new.id = any (v_parent.path) then
      raise exception 'A task cannot be placed inside itself';
    end if;
    new.path := v_parent.path || new.id;
    new.root_task_id := v_parent.root_task_id;
  end if;

  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;

create trigger tasks_before_insert
before insert on public.tasks
for each row execute function public.tasks_before_insert();

create or replace function public.tasks_before_update()
returns trigger language plpgsql as $$
begin
  if new.parent_task_id is distinct from old.parent_task_id
     or new.root_task_id is distinct from old.root_task_id
     or new.path is distinct from old.path
     or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'Task structure and creation details cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger tasks_before_update
before update on public.tasks
for each row execute function public.tasks_before_update();

-- Tasks are never deleted.
create or replace function public.tasks_no_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'Tasks are never deleted. Cancel the task instead.';
end $$;

create trigger tasks_no_delete
before delete on public.tasks
for each row execute function public.tasks_no_delete();

-- History is append-only.
create or replace function public.task_history_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'task_history is append-only';
end $$;

create trigger task_history_no_update
before update or delete on public.task_history
for each row execute function public.task_history_append_only();

create trigger task_history_no_truncate
before truncate on public.task_history
for each statement execute function public.task_history_append_only();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger employees_touch
before update on public.employees
for each row execute function public.touch_updated_at();
